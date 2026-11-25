// @vitest-environment jsdom
//
// P10 tests for AutoSave's shared-mode UI. The 5 s save loop is left alone here (it is
// engine/timer territory); what these lock down is the REACTIVITY of `isShared`, which
// is easy to get subtly wrong in React and impossible to notice without a test:
//
// The old Aurelia template bound `disabled.bind="isShared"` to a getter, and the dirty
// checker re-evaluated it every cycle — so it tracked a session attaching AND a tab
// switch for free. A React port only re-renders on the store subscriptions it names, so
// each trigger needs its own test.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  globalObject: { selectedTab: 0, autoSave: true, doSceneInstancePatch: false, doSceneInstancePatchLocal: false } as any,
  logger: { log: vi.fn() },
  persistencyHandler: { persistSceneInstanceToDB: vi.fn(async () => undefined) },
  // Annotate the param: `vi.fn(() => ...)` infers a 0-arg signature, so the later
  // mockImplementation((i: number) => ...) fails typecheck (P8's test-typing trap —
  // vitest run stays green while `npm run typecheck` breaks).
  sharedDocService: { forTab: vi.fn((_tabIndex: number) => null as unknown) },
}));

vi.mock("@/engine", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));
vi.mock("@/resources/services/persistency-handler", () => ({ persistencyHandler: mocks.persistencyHandler }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));

import AutoSave from "./AutoSave";
import { useCollabStore } from "@/resources/store/collabStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { useUiStore } from "@/resources/store/uiStore";

const sharedTab = { status: "connected" as const, access: "edit" as const, banner: null, users: [] };

/** Mark `tabIndex` shared in BOTH places shared-doc-service keeps in lockstep. */
function markShared(tabIndex: number) {
  useCollabStore.getState().setTab(tabIndex, sharedTab);
  mocks.sharedDocService.forTab.mockImplementation((i: number) => (i === tabIndex ? ({} as unknown) : null));
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  useCollabStore.setState({ tabs: {} });
  useTabsStore.setState({ tabs: [], selectedTab: 0 });
  useUiStore.getState().setAutoSave(true);
  Object.assign(mocks.globalObject, { selectedTab: 0, autoSave: true });
  mocks.sharedDocService.forTab.mockReturnValue(null);
});

const toggle = () => screen.getByRole("switch");

describe("AutoSave", () => {
  it("leaves the toggle enabled on a non-shared tab", () => {
    render(<AutoSave />);
    expect((toggle() as HTMLInputElement).disabled).toBe(false);
  });

  it("locks the toggle once a session attaches to the active tab", () => {
    render(<AutoSave />);
    expect((toggle() as HTMLInputElement).disabled).toBe(false);

    act(() => markShared(0));

    expect((toggle() as HTMLInputElement).disabled).toBe(true);
  });

  // The regression this file exists for: subscribing only to collabStore makes the
  // switch stale on a tab switch, because collabStore does not change when the
  // selection does.
  it("unlocks the toggle when the user switches from a shared tab to a non-shared one", () => {
    act(() => markShared(0));
    render(<AutoSave />);
    expect((toggle() as HTMLInputElement).disabled).toBe(true);

    // Switch to tab 1, which has no session (what tabActions.switchToTab does).
    act(() => {
      mocks.globalObject.selectedTab = 1;
      useTabsStore.setState({ selectedTab: 1 });
    });

    expect((toggle() as HTMLInputElement).disabled).toBe(false);
  });

  it("locks the toggle again when the user switches back to the shared tab", () => {
    act(() => markShared(0));
    render(<AutoSave />);

    act(() => {
      mocks.globalObject.selectedTab = 1;
      useTabsStore.setState({ selectedTab: 1 });
    });
    expect((toggle() as HTMLInputElement).disabled).toBe(false);

    act(() => {
      mocks.globalObject.selectedTab = 0;
      useTabsStore.setState({ selectedTab: 0 });
    });
    expect((toggle() as HTMLInputElement).disabled).toBe(true);
  });

  it("unlocks the toggle when the session detaches", () => {
    act(() => markShared(0));
    render(<AutoSave />);
    expect((toggle() as HTMLInputElement).disabled).toBe(true);

    act(() => {
      useCollabStore.getState().removeTab(0);
      mocks.sharedDocService.forTab.mockReturnValue(null);
    });

    expect((toggle() as HTMLInputElement).disabled).toBe(false);
  });
});
