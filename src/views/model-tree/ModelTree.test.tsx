// @vitest-environment jsdom
//
// Component tests for ModelTree: it groups the open scene's instances by metaclass
// (bendpoints excluded), labels rows by the standard Name attribute with a metaclass-name
// fallback, drives canvas selection on click, and mirrors the canvas selection back.
// `@/engine` and the utilities are mocked (the real barrel builds a WebGLRenderer at
// module scope); eventBus + the stores are the real singletons.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  interactionHandler: { selectInstanceByUuid: vi.fn(async () => undefined) },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async (): Promise<unknown> => undefined),
  },
  metaUtility: {
    // Typed `Promise<any>` so a test can resolve a scene type of a different shape.
    getTabContextSceneType: vi.fn(async (): Promise<any> => ({ relationclasses: [{ bendpoint: "BP" }] })),
  },
}));

vi.mock("@/engine", () => ({ interactionHandler: mocks.interactionHandler }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));

import ModelTree from "./ModelTree";
import { eventBus } from "@/resources/services/event-bus";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { NAME_ATTRIBUTE_UUID } from "@/constants";

const SCENE = {
  uuid: "scene-1",
  class_instances: [
    { uuid: "c1", uuid_class: "Task", name: "Task", attribute_instance: [{ uuid_attribute: NAME_ATTRIBUTE_UUID, name: "Name", value: "Review order" }] },
    { uuid: "c2", uuid_class: "Task", name: "Task", attribute_instance: [] },
    { uuid: "g1", uuid_class: "Gateway", name: "Gateway", attribute_instance: [] },
    { uuid: "bp1", uuid_class: "BP", name: "BendPoint", attribute_instance: [] },
  ],
  relationclasses_instances: [
    { uuid: "r1", name: "Sequence Flow", attribute_instance: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  useSelectionStore.getState().clearSelection();
  useTabsStore.setState({ tabs: [], selectedTab: 0 });
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(SCENE);
  mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ relationclasses: [{ bendpoint: "BP" }] });
});

/** Let any debounced rebuild run (the tree coalesces triggers over 50 ms). */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 120));
}

async function expandGroup(key: string) {
  const header = await screen.findByText(
    key === "class:Task" ? "Task" : key === "class:Gateway" ? "Gateway" : "Sequence Flow",
  );
  fireEvent.click(header);
}

describe("ModelTree", () => {
  it("groups instances by metaclass and excludes bendpoints", async () => {
    render(<ModelTree />);

    // class groups + the relation group, but no BendPoint group
    expect(await screen.findByText("Task")).toBeTruthy();
    expect(screen.getByText("Gateway")).toBeTruthy();
    expect(screen.getByText("Sequence Flow")).toBeTruthy();
    expect(screen.queryByText("BendPoint")).toBeNull();

    // 2 Tasks + 1 Gateway + 1 relation; the bendpoint is not counted
    expect(screen.getByText(/4 objects/)).toBeTruthy();
  });

  it("labels a row by its Name attribute, falling back to the metaclass name", async () => {
    render(<ModelTree />);
    await expandGroup("class:Task");

    expect(await screen.findByText("Review order")).toBeTruthy();
    // c2 has no Name attribute -> falls back to "Task"
    const rows = screen.getAllByText("Task");
    // one is the group header, one is the c2 row label
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("selects the object on the canvas (with camera focus) when a row is clicked", async () => {
    render(<ModelTree />);
    await expandGroup("class:Task");

    fireEvent.click(await screen.findByText("Review order"));

    expect(mocks.interactionHandler.selectInstanceByUuid).toHaveBeenCalledWith("c1", { focusCamera: true });
  });

  it("marks the row for the current canvas selection as selected", async () => {
    render(<ModelTree />);
    await expandGroup("class:Gateway");
    await screen.findAllByText("Gateway");

    useSelectionStore.getState().setSelection("g1", "class");

    await waitFor(() => {
      const row = document.querySelector('[data-uuid="g1"]');
      expect(row?.className).toContain("Mui-selected");
    });
  });

  it("filters rows by label", async () => {
    render(<ModelTree />);
    await screen.findByText("Task");

    fireEvent.change(screen.getByPlaceholderText("Filter objects…"), {
      target: { value: "review" },
    });

    // matching group auto-expands and shows the row; the non-matching Gateway group is gone
    expect(await screen.findByText("Review order")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Gateway")).toBeNull());
  });

  it("shows an empty-state when no scene is open", async () => {
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);
    render(<ModelTree />);

    expect(await screen.findByText("Open a scene to see its objects here.")).toBeTruthy();
  });

  it("groups by metaclass, named from the scene type, whatever name an instance carries", async () => {
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({
      classes: [{ uuid: "Task", name: "User Task" }],
      relationclasses: [{ bendpoint: "BP" }],
    });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue({
      ...SCENE,
      // Created before the metaclass was renamed: still carries the old name.
      class_instances: [...SCENE.class_instances, { uuid: "c3", uuid_class: "Task", name: "Task (old)", attribute_instance: [] }],
    });
    render(<ModelTree />);

    expect(await screen.findByText("User Task")).toBeTruthy();
    expect(screen.queryByText("Task (old)")).toBeNull();
    // One group of three: Review order, c2 and c3.
    expect(document.querySelector('[data-group="class:Task"]')?.textContent).toContain("3");
  });

  it("does not ask for the scene while no tab is open", async () => {
    useTabsStore.setState({ tabs: [], selectedTab: -1 });
    render(<ModelTree />);
    await settle();

    expect(screen.getByText("Open a scene to see its objects here.")).toBeTruthy();
    expect(mocks.instanceUtility.getTabContextSceneInstance).not.toHaveBeenCalled();
  });

  it("rebuilds for a collaborator's edit to the active tab and for a rename, but not for selection or drags", async () => {
    render(<ModelTree />);
    await screen.findByText("Task");
    await settle();
    const calls = () => mocks.instanceUtility.getTabContextSceneInstance.mock.calls.length;
    const before = calls();

    eventBus.publish("removeAttributeGui");
    eventBus.publish("historyRecord", { label: "translate" });
    eventBus.publish("remoteSceneInstanceChanged", { tabIndex: 3, instanceUuids: ["x"] });
    // Another attribute, and an attribute merely CALLED "Name" but not the standard one.
    eventBus.publish("checkForVizRepUpdateByAttributeInstance", { uuid_attribute: "description", name: "Description" } as never);
    eventBus.publish("checkForVizRepUpdateByAttributeInstance", { uuid_attribute: "other-name", name: "Name" } as never);
    await settle();
    expect(calls()).toBe(before);

    eventBus.publish("remoteSceneInstanceChanged", { tabIndex: 0, instanceUuids: ["c1"] });
    await waitFor(() => expect(calls()).toBe(before + 1));

    eventBus.publish("checkForVizRepUpdateByAttributeInstance", { uuid_attribute: NAME_ATTRIBUTE_UUID, name: "Name" } as never);
    await waitFor(() => expect(calls()).toBe(before + 2));
  });

  it("does no work while hidden, and catches up when shown", async () => {
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);
    const { rerender } = render(<ModelTree active={false} />);
    eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: "scene-1" });
    await settle();
    expect(mocks.instanceUtility.getTabContextSceneInstance).not.toHaveBeenCalled();

    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(SCENE);
    rerender(<ModelTree active />);

    expect(await screen.findByText("Task")).toBeTruthy();
  });

  it("rebuilds when a sceneInstanceMutated event fires", async () => {
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);
    render(<ModelTree />);
    await screen.findByText("Open a scene to see its objects here.");

    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(SCENE);
    eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: "scene-1" });

    expect(await screen.findByText("Task")).toBeTruthy();
  });
});
