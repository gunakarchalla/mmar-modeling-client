// @vitest-environment jsdom
//
// The toolbar's Undo/Redo controls: greyed out until the active scene has something to
// step through, wired to the history service, and labelled with the recorded step. The
// history STORE is real (the buttons' whole job is to reflect it); the service and the
// engine barrel are mocked (the real barrel builds a WebGLRenderer at module scope).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  engine: { isInitialized: true },
  deletionHandler: { onPressDelete: vi.fn() },
  globalObject: { threeDimensional: false, autoSave: true, selectedTab: -1 },
  globalStateObject: { setState: vi.fn() },
  logger: { log: vi.fn() },
  historyService: { undo: vi.fn(async () => undefined), redo: vi.fn(async () => undefined) },
  sharedDocService: { forTab: vi.fn(() => null) },
}));

vi.mock("@/engine", () => ({
  engine: mocks.engine,
  deletionHandler: mocks.deletionHandler,
  globalObject: mocks.globalObject,
  globalStateObject: mocks.globalStateObject,
}));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));
vi.mock("@/resources/services/persistency-handler", () => ({ persistencyHandler: {} }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));

import Toolbar from "./Toolbar";
import { useHistoryStore } from "@/resources/store/historyStore";

const SCENE = "scene-1";

// The project has no jest-dom matchers, so button state is read off the element.
const undoRedo = (label: "undo" | "redo") => screen.getByLabelText(label) as HTMLButtonElement;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useHistoryStore.getState().reset();
});

function openSceneWithSteps(...labels: string[]) {
  const store = useHistoryStore.getState();
  store.init(SCENE, "v0");
  store.setActiveScene(SCENE);
  labels.forEach((label, index) =>
    store.push(SCENE, { scene: `v${index + 1}`, label, touched: [`${index}`] }),
  );
}

describe("Toolbar undo/redo", () => {
  it("greys both buttons out when no scene is open", () => {
    render(<Toolbar />);
    expect(undoRedo("undo").disabled).toBe(true);
    expect(undoRedo("redo").disabled).toBe(true);
  });

  it("keeps them greyed out on a freshly opened scene with no steps yet", () => {
    openSceneWithSteps();
    render(<Toolbar />);
    expect(undoRedo("undo").disabled).toBe(true);
    expect(undoRedo("redo").disabled).toBe(true);
  });

  it("enables undo once a step has been recorded", () => {
    openSceneWithSteps("create A");
    render(<Toolbar />);
    expect(undoRedo("undo").disabled).toBe(false);
    expect(undoRedo("redo").disabled).toBe(true);
  });

  it("enables redo once the pointer has stepped back", () => {
    openSceneWithSteps("create A");
    useHistoryStore.getState().setIndex(SCENE, 0);
    render(<Toolbar />);
    expect(undoRedo("undo").disabled).toBe(true);
    expect(undoRedo("redo").disabled).toBe(false);
  });

  it("calls the history service on click", () => {
    openSceneWithSteps("create A", "move A");
    useHistoryStore.getState().setIndex(SCENE, 1);
    render(<Toolbar />);

    fireEvent.click(undoRedo("undo"));
    expect(mocks.historyService.undo).toHaveBeenCalledTimes(1);

    fireEvent.click(undoRedo("redo"));
    expect(mocks.historyService.redo).toHaveBeenCalledTimes(1);
  });

  it("names the step and its chord in the tooltip", async () => {
    openSceneWithSteps("create A");
    render(<Toolbar />);

    fireEvent.mouseOver(undoRedo("undo"));
    // jsdom reports a non-Macintosh user agent, so the Ctrl chord is the one advertised.
    expect((await screen.findByRole("tooltip")).textContent).toBe("undo create A (Ctrl+Z)");
  });

  it("follows the active scene when tabs are switched", () => {
    openSceneWithSteps("create A");
    useHistoryStore.getState().init("scene-2", "other-v0");
    useHistoryStore.getState().setActiveScene("scene-2");

    render(<Toolbar />);
    expect(undoRedo("undo").disabled).toBe(true);
  });
});
