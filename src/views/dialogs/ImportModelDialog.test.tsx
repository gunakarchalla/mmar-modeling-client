// @vitest-environment jsdom
//
// P9 component tests for the import-model dialog, centred on the round-trip the plan
// asks for: JSON produced by persistency-handler.saveToTextfile (which is just
// JSON.stringify(sceneInstance)) imports back into a fully revived gds SceneInstance
// on globalObject.importSceneInstances, and 'updateSceneGroup' fires so SceneGroup
// folds it into the tree.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { SceneInstance, ClassInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: { importSceneInstances: [] as any[] } as any,
}));

vi.mock("@/engine", () => ({ globalObject: mocks.globalObject }));

import ImportModelDialog from "./ImportModelDialog";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore, DialogName } from "@/resources/store/uiStore";
import { useLogStore } from "@/resources/store/logStore";

const SCENE_UUID = "11111111-1111-4111-8111-111111111111";
const CLASS_UUID = "33333333-3333-4333-8333-333333333333";

/** A scene with one class instance — built the P4-safe way (plain json -> fromJS). */
function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: SCENE_UUID,
    uuid_scene_type: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "Exported scene",
    description: "exported",
    attribute_instances: [],
    class_instances: [
      {
        uuid: CLASS_UUID,
        uuid_class: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        uuid_scene_instance: SCENE_UUID,
        name: "Class A",
        attribute_instance: [],
        port_instance: [],
      },
    ],
    relationclasses_instances: [],
  }) as SceneInstance;
}

/**
 * The exact bytes persistency-handler.saveToTextfile writes to disk, wrapped as the
 * File the user would then pick — this is what makes the assertion a true round-trip
 * rather than a fixture reimport.
 */
function exportedFile(sceneInstance: SceneInstance, name = "Exported scene.json"): File {
  return new File([JSON.stringify(sceneInstance)], name, { type: "application/json" });
}

function closeAllDialogs() {
  const names = Object.keys(useUiStore.getState().dialogs) as DialogName[];
  names.forEach((name) => useUiStore.getState().closeDialog(name));
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  closeAllDialogs();
  mocks.globalObject.importSceneInstances = [];
});

/** Renders, opens and picks `files` in the hidden input. The input is queried off
 * document.body, not the render container: MUI's Dialog renders into a portal. */
async function openWithFiles(files: File[]) {
  render(<ImportModelDialog />);
  useUiStore.getState().openDialog("importModel");

  await screen.findByText("Upload some Models:");
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
  return input;
}

describe("ImportModelDialog", () => {
  it("renders nothing until the uiStore flag opens it", () => {
    render(<ImportModelDialog />);
    expect(screen.queryByText("Upload some Models:")).toBeNull();
  });

  it("round-trips an exported SceneInstance JSON back into a revived gds instance", async () => {
    const original = makeScene();
    await openWithFiles([exportedFile(original)]);

    fireEvent.click(await screen.findByRole("button", { name: "Load local" }));

    await waitFor(() => expect(mocks.globalObject.importSceneInstances).toHaveLength(1));

    const imported = mocks.globalObject.importSceneInstances[0] as SceneInstance;
    expect(imported.uuid).toBe(original.uuid);
    expect(imported.name).toBe("Exported scene");
    expect(imported.class_instances).toHaveLength(1);
    expect(imported.class_instances[0].uuid).toBe(CLASS_UUID);

    // The whole point of the gds fromJS rule (P3): a plainToInstance import would
    // leave class_instances as plain Objects and break every instanceof downstream.
    expect(imported).toBeInstanceOf(SceneInstance);
    expect(imported.class_instances[0]).toBeInstanceOf(ClassInstance);

    // and the re-serialised import matches what was exported
    expect(JSON.stringify(imported)).toBe(JSON.stringify(original));
  });

  it("publishes updateSceneGroup once the instances are pushed, and closes", async () => {
    const updateSceneGroup = vi.fn();
    const sub = eventBus.subscribe("updateSceneGroup", updateSceneGroup);

    await openWithFiles([exportedFile(makeScene())]);
    fireEvent.click(await screen.findByRole("button", { name: "Load local" }));

    await waitFor(() => expect(updateSceneGroup).toHaveBeenCalledTimes(1));
    // the old client published on a 1s timer and could fire BEFORE the reads finished;
    // the awaited reads mean the instance is already there when the event lands.
    expect(mocks.globalObject.importSceneInstances).toHaveLength(1);
    await waitFor(() => expect(useUiStore.getState().dialogs.importModel).toBe(false));
    sub.dispose();
  });

  it("imports every selected file (the old shared FileReader only imported the last)", async () => {
    const sceneA = makeScene();
    const sceneB = SceneInstance.fromJS({
      ...JSON.parse(JSON.stringify(sceneA)),
      uuid: "22222222-2222-4222-8222-222222222222",
      name: "Second scene",
    }) as SceneInstance;

    await openWithFiles([exportedFile(sceneA, "a.json"), exportedFile(sceneB, "b.json")]);
    fireEvent.click(await screen.findByRole("button", { name: "Load local" }));

    await waitFor(() => expect(mocks.globalObject.importSceneInstances).toHaveLength(2));
    expect(mocks.globalObject.importSceneInstances.map((s: SceneInstance) => s.name)).toEqual([
      "Exported scene",
      "Second scene",
    ]);
  });

  it("cannot load with no file selected — the button is disabled", async () => {
    render(<ImportModelDialog />);
    useUiStore.getState().openDialog("importModel");

    const button = await screen.findByRole("button", { name: "Load local" });
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("No files selected.")).toBeTruthy();
  });

  it("logs an error instead of throwing when the file is not valid JSON", async () => {
    useLogStore.setState({ logArray: [] });
    await openWithFiles([new File(["not json at all"], "broken.json", { type: "application/json" })]);

    fireEvent.click(await screen.findByRole("button", { name: "Load local" }));

    await waitFor(() =>
      expect(useLogStore.getState().logArray.some((e) => e.status === "error")).toBe(true),
    );
    expect(mocks.globalObject.importSceneInstances).toHaveLength(0);
  });

  it("keeps the disabled 'Load to database' stub from the old template", async () => {
    render(<ImportModelDialog />);
    useUiStore.getState().openDialog("importModel");

    const button = await screen.findByRole("button", { name: "Load to database" });
    expect(button).toHaveProperty("disabled", true);
  });
});
