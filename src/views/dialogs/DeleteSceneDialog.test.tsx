// @vitest-environment jsdom
//
// P9 component tests for the delete-scene dialog. It has no scene picker: the tree's
// Delete context-menu item hands it the scene as a `{ sceneInstance }` payload and the
// dialog is a plain confirmation for that scene, which then DELETEs through
// backend-service, removes that one node from the tree and publishes 'updateSceneGroup'.
//
// backend-service is mocked; uiStore + eventBus are the real singletons. `@/engine` is
// mocked because the dialog reaches globalObject.sceneTree through scene-tree-service's
// removeSceneInstanceFromTree, and the real barrel builds a WebGLRenderer at module
// scope. The mock is a plain object so the tree assertions read the real mutation.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  backendService: { sceneInstancesAllDELETE2: vi.fn(async (): Promise<unknown> => ({})) },
  closeTab: vi.fn(async (): Promise<void> => {}),
  globalObject: { sceneTree: [], importSceneInstances: [] } as {
    sceneTree: { uuid: string; children?: { uuid: string; name?: string }[] }[];
    importSceneInstances: { uuid: string }[];
  },
}));

vi.mock("@/engine", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
// tabActions.closeTab drives the real engine/collaboration singletons, which aren't
// mounted here — mock it and assert the dialog calls it with the open tab's index.
vi.mock("@/views/layout/tabActions", () => ({ closeTab: mocks.closeTab }));

import DeleteSceneDialog from "./DeleteSceneDialog";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore, DialogName } from "@/resources/store/uiStore";
import { useTabsStore, TabInfo } from "@/resources/store/tabsStore";

const SCENE_A = "scene-a-uuid";

/** P8's trap: uiStore dialog flags are module-global and leak across tests — and so
 * are the payloads, one of which is now what decides whether the dialog opens at all. */
function closeAllDialogs() {
  const names = Object.keys(useUiStore.getState().dialogs) as DialogName[];
  names.forEach((name) => useUiStore.getState().closeDialog(name));
  useUiStore.setState({ dialogPayloads: {} });
}

/** Reset the tab bar to a known set of open tabs. */
function setOpenTabs(tabs: TabInfo[]) {
  useTabsStore.setState({ tabs, selectedTab: tabs.length ? 0 : -1 });
}

/** globalObject is a module-level singleton here too — rebuild the tree per test. */
function setTree() {
  mocks.globalObject.sceneTree = [
    {
      uuid: "scene-type-1",
      children: [
        { uuid: SCENE_A, name: "Scene A" },
        { uuid: "scene-b-uuid", name: "Scene B" },
      ],
    },
    // A second type with its children never expanded — removal must tolerate it.
    { uuid: "scene-type-2" },
  ];
  mocks.globalObject.importSceneInstances = [];
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  closeAllDialogs();
  setOpenTabs([]);
  setTree();
});

describe("DeleteSceneDialog", () => {
  it("renders nothing until the uiStore flag opens it", () => {
    render(<DeleteSceneDialog />);
    expect(screen.queryByText(/cannot be undone/)).toBeNull();
  });

  it("stays shut when opened with no scene, rather than confirming nothing", async () => {
    render(<DeleteSceneDialog />);
    useUiStore.getState().openDialog("deleteScene");

    // There is no picker to fall back to, so an unpayloaded open is a caller bug: the
    // dialog renders nothing and the mistake goes to the log instead of the user.
    await waitFor(() => expect(screen.queryByText(/cannot be undone/)).toBeNull());
    expect(mocks.backendService.sceneInstancesAllDELETE2).not.toHaveBeenCalled();
  });

  /** The payload shape SceneGroup's Delete menu item sends. */
  const SCENE = { uuid: SCENE_A, name: "Scene A" };

  function openConfirm() {
    render(<DeleteSceneDialog />);
    useUiStore.getState().openDialog("deleteScene", { sceneInstance: SCENE });
  }

  it("asks about the passed scene by name instead of showing a picker", async () => {
    openConfirm();

    expect(await screen.findByText(/Scene A/)).toBeTruthy();
    // The picker is the thing this mode exists to avoid — the user already chose the
    // scene by right-clicking it, and filling that dropdown hydrates the whole database.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
  });

  it("deletes the passed scene without any selection step", async () => {
    const updateSceneGroup = vi.fn();
    const sub = eventBus.subscribe("updateSceneGroup", updateSceneGroup);
    openConfirm();

    fireEvent.click(await screen.findByRole("button", { name: "Delete SceneInstance" }));

    await waitFor(() =>
      expect(mocks.backendService.sceneInstancesAllDELETE2).toHaveBeenCalledWith(SCENE_A),
    );
    await waitFor(() => expect(updateSceneGroup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useUiStore.getState().dialogs.deleteScene).toBe(false));
    sub.dispose();
  });

  it("removes just the deleted node instead of rebuilding the tree", async () => {
    // The regression this guards: the dialog used to ask SceneGroup for a full
    // initTree() rebuild, which refetched every metamodel file and SceneType to drop one
    // instance it already had the uuid of — and wiped the tree's local-only nodes on the
    // way through. The never-expanded second type still having no `children` at all is
    // what shows nothing was rebuilt: initTree gives every type a fresh empty array.
    openConfirm();

    fireEvent.click(await screen.findByRole("button", { name: "Delete SceneInstance" }));

    await waitFor(() =>
      expect(mocks.globalObject.sceneTree[0].children?.map((c) => c.uuid)).toEqual([
        "scene-b-uuid",
      ]),
    );
    expect(mocks.globalObject.sceneTree[1].children).toBeUndefined();
  });

  it("leaves the tree alone when the delete is rejected", async () => {
    mocks.backendService.sceneInstancesAllDELETE2.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    openConfirm();

    fireEvent.click(await screen.findByRole("button", { name: "Delete SceneInstance" }));

    expect(await screen.findByText(/don't have enough authorization/)).toBeTruthy();
    expect(mocks.globalObject.sceneTree[0].children?.map((c) => c.uuid)).toEqual([
      SCENE_A,
      "scene-b-uuid",
    ]);
  });

  it("closes the deleted scene's open tab", async () => {
    setOpenTabs([{ uuid: SCENE_A, name: "Scene A", isShared: false }]);
    openConfirm();

    fireEvent.click(await screen.findByRole("button", { name: "Delete SceneInstance" }));

    await waitFor(() => expect(mocks.closeTab).toHaveBeenCalledWith(0));
  });

  it("Cancel closes without deleting", async () => {
    openConfirm();

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(useUiStore.getState().dialogs.deleteScene).toBe(false));
    expect(mocks.backendService.sceneInstancesAllDELETE2).not.toHaveBeenCalled();
  });

  it("stays open and reports a rejected delete instead of closing as if it worked", async () => {
    // 403: no delete access on a shared scene. Closing here would leave the user
    // watching the scene reappear in the tree with no explanation.
    mocks.backendService.sceneInstancesAllDELETE2.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    openConfirm();

    fireEvent.click(await screen.findByRole("button", { name: "Delete SceneInstance" }));

    expect(await screen.findByText(/don't have enough authorization/)).toBeTruthy();
    expect(useUiStore.getState().dialogs.deleteScene).toBe(true);
  });
});
