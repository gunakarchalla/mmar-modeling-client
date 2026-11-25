// @vitest-environment jsdom
//
// Component tests for CopySceneDialog. The dialog has no scene picker: it duplicates
// whatever the tree's Duplicate context-menu item handed it as a payload. The claim
// worth protecting is that it duplicates THAT scene — a regression here (duplicating a
// stale payload from the previous open) looks identical on screen.
//
// `@/engine` and every service that imports the engine's global-definition leaf are
// mocked (the leaf builds a real WebGLRenderer at module scope — the same lesson the
// SceneGroup/Delete/Share tests record); uiStore is the real singleton.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
  globalClassObject: { initClasses: vi.fn() },
  globalRelationclassObject: { initRelationClasses: vi.fn() },
  sceneInitiator: { sceneInit: vi.fn(async () => undefined) },
  hybridAlgorithmsService: { checkHybridAlgorithms: vi.fn(async () => undefined) },
  historyService: { initScene: vi.fn() },
  instanceUtility: {
    checkIfSceneInstance: vi.fn(() => true),
    createTabContextSceneInstance: vi.fn(async () => ({ isShared: false })),
  },
  persistencyHandler: { loadPersistedModel: vi.fn(async () => undefined) },
  duplicateSceneInstance: vi.fn((_source: unknown, name: string) => ({
    uuid: "si-copy",
    name,
    class_instances: [],
  })),
}));

vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  globalClassObject: mocks.globalClassObject,
  globalRelationclassObject: mocks.globalRelationclassObject,
  sceneInitiator: mocks.sceneInitiator,
}));
vi.mock("@/engine/hybrid-algorithms/hybrid-algorithms-service", () => ({
  hybridAlgorithmsService: mocks.hybridAlgorithmsService,
}));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/persistency-handler", () => ({
  persistencyHandler: mocks.persistencyHandler,
}));
vi.mock("@/views/dialogs/copySceneModel", () => ({
  duplicateSceneInstance: mocks.duplicateSceneInstance,
}));

import CopySceneDialog from "./CopySceneDialog";
import { useUiStore } from "@/resources/store/uiStore";

const SCENE = { uuid: "si-1", name: "My Scene", uuid_scene_type: "st-1" };

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  const dialogs = useUiStore.getState().dialogs;
  useUiStore.setState({
    dialogs: Object.fromEntries(Object.keys(dialogs).map((n) => [n, false])) as typeof dialogs,
    dialogPayloads: {},
  });
});

describe("CopySceneDialog", () => {
  function openPrefilled() {
    render(<CopySceneDialog />);
    useUiStore.getState().openDialog("copyScene", { sceneInstance: SCENE });
  }

  it("names the scene it will duplicate, with no picker to re-choose it", async () => {
    openPrefilled();

    expect(await screen.findByText(/Duplicating/)).toBeTruthy();
    expect(screen.getByText("My Scene")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("stays shut when opened with no scene, rather than showing an empty form", async () => {
    render(<CopySceneDialog />);
    useUiStore.getState().openDialog("copyScene");

    // There is no picker to fall back to, so an unpayloaded open is a caller bug: the
    // dialog renders nothing and the mistake goes to the log instead of the user.
    await waitFor(() => expect(screen.queryByText(/Duplicating/)).toBeNull());
    expect(mocks.duplicateSceneInstance).not.toHaveBeenCalled();
  });

  it("pre-fills the name with the ' - Copy' suffix", async () => {
    openPrefilled();

    const nameField = (await screen.findByLabelText(/Name/)) as HTMLInputElement;
    expect(nameField.value).toBe("My Scene - Copy");
  });

  it("duplicates the passed scene under the entered name", async () => {
    openPrefilled();

    const nameField = await screen.findByLabelText(/Name/);
    fireEvent.change(nameField, { target: { value: "Renamed Copy" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy SceneInstance" }));

    await waitFor(() => expect(mocks.duplicateSceneInstance).toHaveBeenCalled());
    const [source, name] = mocks.duplicateSceneInstance.mock.calls[0];
    expect((source as { uuid: string }).uuid).toBe("si-1");
    expect(name).toBe("Renamed Copy");
    await waitFor(() => expect(useUiStore.getState().dialogs.copyScene).toBe(false));
  });
});
