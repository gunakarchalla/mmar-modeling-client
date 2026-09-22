// @vitest-environment jsdom
//
// P8 component tests for the attribute window and its dialogs. The plan's §9 P8
// verification list drives them: editing a string attribute updates the
// AttributeInstance + publishes `checkForVizRepUpdateByAttributeInstance`; table
// add-row; reference set/unset.
//
// `@/engine` and the services are mocked (the real barrel builds a WebGLRenderer at
// module scope); gds fixtures are REAL via `X.fromJS`. uiStore / selectionStore /
// eventBus are the real singletons.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AttributeInstance, ClassInstance, SceneInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: 0,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
    role_instances: [] as any[],
    current_class_instance: undefined as any,
    current_port_instance: undefined as any,
  } as any,
  globalSelectedObject: { getObject: vi.fn(), object: undefined as any },
  instanceCreationHandler: { createAttributeInstance: vi.fn(), createRoleInstance: vi.fn() },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getAllPortInstancesOfTabContext: vi.fn(async () => []),
    getClassInstance: vi.fn(),
    getPortInstance: vi.fn(async () => undefined),
    // Typed `Promise<any>` so `mockResolvedValue(<gds instance>)` type-checks — an
    // inferred `async () => undefined` fixes the mock's return type to `undefined`.
    getSceneInstance: vi.fn(async (): Promise<any> => undefined),
    getAllClassInstances: vi.fn(async () => []),
    getAllRelationClassInstances: vi.fn(async () => []),
    getAllPortInstances: vi.fn(async () => []),
    getAllSceneInstancesFromLocal: vi.fn(async () => []),
  },
  metaUtility: {
    getMetaAttribute: vi.fn(),
    getMetaAttributeWithSequence: vi.fn(),
    getMetaClass: vi.fn(async () => undefined),
    getMetaPort: vi.fn(async () => undefined),
    Files: new Map(),
    setFile: vi.fn(async () => undefined),
    deleteFileByUUID: vi.fn(),
  },
  expressionUtility: { attrvalByInst: vi.fn(async () => "Referenced Task") },
  backendService: {
    deleteFileByUUID: vi.fn(async () => undefined),
    getFileByUUID: vi.fn(async () => undefined),
    postFile: vi.fn(async () => ({ uuid: "file-1" })),
    patchFileByUUID: vi.fn(async () => ({ uuid: "file-1" })),
  },
  fileUtility: { FiletoDataUrl: vi.fn(async () => "data:image/png;base64,AAA") },
  // P10: attributeModel imports shared-doc-service, which imports the REAL
  // @/engine/global-definition (bypassing the mocked barrel) -> WebGLRenderer at
  // module scope. Mock the service; forTab() -> null keeps the non-shared branch.
  sharedDocService: { forTab: vi.fn(() => null) },
  // The undo/redo history service imports the @/engine/global-definition LEAF (a
  // WebGLRenderer at module scope), so it bypasses the `@/engine` barrel mock and has
  // to be mocked in its own right — same lesson as persistency-handler (P9),
  // shared-doc-service (P10) and hybrid-algorithms-service (P12).
  historyService: {
    record: vi.fn(),
    recordAfterTransformSync: vi.fn(async () => undefined),
    initScene: vi.fn(),
    setActiveScene: vi.fn(),
    dropScene: vi.fn(),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    reset: vi.fn(),
  },
}));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));

// P12: hybrid-algorithms-service imports the @/engine/global-definition LEAF directly,
// so it bypasses the `@/engine` barrel mock below and drags in a real WebGLRenderer at
// module scope — this whole file fails to load without this mock. (Same lesson as P9's
// persistency-handler, P10's shared-doc-service and P11's renderers.)
vi.mock("@/engine/hybrid-algorithms/hybrid-algorithms-service", () => ({
  hybridAlgorithmsService: { checkHybridAlgorithms: vi.fn(async () => undefined) },
}));
// Modules that reach the engine's global-definition LEAF (rather than the `@/engine`
// barrel below) need it mocked in its own right: importing it for real constructs a
// WebGLRenderer at module scope, which needs a DOM.
vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  globalSelectedObject: mocks.globalSelectedObject,
  instanceCreationHandler: mocks.instanceCreationHandler,
}));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
// The change publisher resolves the shared session through this back-reference.
mocks.globalObject.sharedDocServiceRef = mocks.sharedDocService;
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/services/expression-utility", () => ({ expressionUtility: mocks.expressionUtility }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
vi.mock("@/resources/services/file-utility", () => ({ fileUtility: mocks.fileUtility }));

import AttributeWindow from "./AttributeWindow";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { useLogStore } from "@/resources/store/logStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { NOT_ALLOWED_MESSAGE } from "@/resources/services/metamodel-constraints";

/** The Float attribute type's regex, as the database ships it. */
const FLOAT_REGEX = "^[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$";

const CLASS_INSTANCE_UUID = "ci-1";
const SCENE_INSTANCE_UUID = "si-1";

function metaAttribute(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "attr-1",
    name: "Name",
    sequence: 1,
    ui_component: "text",
    facets: "",
    default_value: "",
    attribute_type: { uuid: "at-string", regex_value: "^.*$", role: null, has_table_attribute: [] },
    ...overrides,
  };
}

function attributeInstanceJson(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "ai-1",
    uuid_attribute: "attr-1",
    assigned_uuid_class_instance: CLASS_INSTANCE_UUID,
    value: "hello",
    name: "Name",
    table_attributes: [],
    ...overrides,
  };
}

/**
 * Nothing selected, with the open scene instance carrying `attributeInstances` of its
 * own — the scene-fallback path. Returns the revived scene instance.
 */
function selectNothingWithSceneAttributes(attributeInstances: Record<string, unknown>[]): SceneInstance {
  const sceneInstance = SceneInstance.fromJS({
    uuid: SCENE_INSTANCE_UUID,
    uuid_scene_type: "st-1",
    name: "my model",
    class_instances: [],
    relationclasses_instances: [],
    attribute_instances: attributeInstances,
  }) as SceneInstance;
  mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
  mocks.instanceUtility.getClassInstance.mockResolvedValue(undefined);
  mocks.instanceUtility.getSceneInstance.mockResolvedValue(sceneInstance);
  return sceneInstance;
}

function sceneAttributeInstanceJson(overrides: Record<string, unknown> = {}) {
  return attributeInstanceJson({
    uuid: "ai-scene",
    assigned_uuid_class_instance: undefined,
    assigned_uuid_scene_instance: SCENE_INSTANCE_UUID,
    ...overrides,
  });
}

/** Select a class instance carrying `attributeInstances` and return the revived instance. */
function selectClassInstanceWith(attributeInstances: Record<string, unknown>[]): ClassInstance {
  const sceneInstance = SceneInstance.fromJS({
    uuid: "si-1",
    uuid_scene_type: "st-1",
    class_instances: [
      { uuid: CLASS_INSTANCE_UUID, uuid_class: "class-1", name: "Task", attribute_instance: attributeInstances },
    ],
    relationclasses_instances: [],
  }) as SceneInstance;
  const classInstance = sceneInstance.class_instances[0];
  mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
  mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
  mocks.globalObject.current_class_instance = classInstance;
  return classInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mocks.globalSelectedObject.object = undefined;
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
    role_instances: [],
    current_class_instance: undefined,
    current_port_instance: undefined,
  });
  mocks.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([]);
  mocks.instanceUtility.getPortInstance.mockResolvedValue(undefined);
  mocks.instanceUtility.getSceneInstance.mockResolvedValue(undefined);
  mocks.metaUtility.getMetaAttribute.mockResolvedValue(metaAttribute());
  mocks.metaUtility.getMetaAttributeWithSequence.mockResolvedValue(metaAttribute());
  // Close EVERY dialog: an open MUI modal puts aria-hidden on the rest of the tree, so
  // a dialog leaking across tests makes getByRole blind to the window behind it.
  const closed = Object.fromEntries(
    Object.keys(useUiStore.getState().dialogs).map((name) => [name, false]),
  ) as Record<string, boolean>;
  useUiStore.setState({ dialogs: closed as never, dialogPayloads: {} });
  useSelectionStore.setState({ selectedInstanceUuid: null, selectedType: null, revision: 0 });
  useLogStore.setState({ logArray: [], snackbar: { open: false, message: "", severity: "info" } });
});

describe("AttributeWindow", () => {
  it("shows the static attributes and the plain fields of the selected class instance", async () => {
    selectClassInstanceWith([attributeInstanceJson()]);

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    await waitFor(() => expect(screen.getByDisplayValue(CLASS_INSTANCE_UUID)).toBeTruthy());
    expect(screen.getByDisplayValue("Task")).toBeTruthy();
    expect(screen.getByText("Dynamic Attributes")).toBeTruthy();
    expect(screen.getByDisplayValue("hello")).toBeTruthy();
  });

  it("editing a string attribute updates the AttributeInstance and publishes the vizrep channel", async () => {
    const classInstance = selectClassInstanceWith([attributeInstanceJson()]);
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    const input = await screen.findByDisplayValue("hello");

    // value.bind updates on input; change.trigger (blur) commits.
    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.blur(input);
    sub.dispose();

    expect(classInstance.attribute_instance[0].value).toBe("edited");
    expect(published).toHaveLength(1);
    expect(published[0].uuid).toBe("ai-1");
    // P12 made this assertion async: applyFieldChange now `await`s the hybrid algorithms
    // before marking the scene dirty (faithful — the original awaited them there too),
    // so the flag lands a microtask after the blur rather than synchronously with it.
    await waitFor(() => expect(mocks.globalObject.doSceneInstancePatch).toBe(true));
  });

  it("commits a string attribute on Enter without waiting for blur", async () => {
    const classInstance = selectClassInstanceWith([attributeInstanceJson()]);
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    const input = await screen.findByDisplayValue("hello");

    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.keyDown(input, { key: "Enter" });
    sub.dispose();

    expect(classInstance.attribute_instance[0].value).toBe("edited");
    expect(published).toHaveLength(1);
    expect(published[0].uuid).toBe("ai-1");
    await waitFor(() => expect(mocks.globalObject.doSceneInstancePatch).toBe(true));
  });

  // The reported bug: letters typed into a Float attribute were written onto the
  // AttributeInstance, so the next autosave was answered with 403 — which alerted
  // "not authorized", rolled the scene back and left the canvas throwing vizrep /
  // transform-control / ray errors against objects that had just been removed.
  it("refuses a value that breaks the attribute type's regex, with the metamodel snackbar", async () => {
    const classInstance = selectClassInstanceWith([attributeInstanceJson({ value: "1.5" })]);
    mocks.metaUtility.getMetaAttributeWithSequence.mockResolvedValue(
      metaAttribute({ attribute_type: { uuid: "at-float", name: "Float", regex_value: FLOAT_REGEX, role: null, has_table_attribute: [] } }),
    );
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    const input = await screen.findByDisplayValue("1.5");

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    sub.dispose();

    // The refused value reaches neither the model nor the save nor the vizrep...
    expect(classInstance.attribute_instance[0].value).toBe("1.5");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
    expect(published).toHaveLength(0);
    // ...the field snaps back to the stored value...
    expect((input as HTMLInputElement).value).toBe("1.5");
    // ...and the user is told, through the same snackbar a refused relation raises.
    const snackbar = useLogStore.getState().snackbar;
    expect(snackbar.open).toBe(true);
    expect(snackbar.severity).toBe("error");
    expect(snackbar.message).toBe(NOT_ALLOWED_MESSAGE);
  });

  it("commits a value that satisfies the attribute type's regex", async () => {
    const classInstance = selectClassInstanceWith([attributeInstanceJson({ value: "1.5" })]);
    mocks.metaUtility.getMetaAttributeWithSequence.mockResolvedValue(
      metaAttribute({ attribute_type: { uuid: "at-float", name: "Float", regex_value: FLOAT_REGEX, role: null, has_table_attribute: [] } }),
    );

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    const input = await screen.findByDisplayValue("1.5");

    fireEvent.change(input, { target: { value: "-2.75e3" } });
    fireEvent.blur(input);

    expect(classInstance.attribute_instance[0].value).toBe("-2.75e3");
    expect(useLogStore.getState().snackbar.open).toBe(false);
    await waitFor(() => expect(mocks.globalObject.doSceneInstancePatch).toBe(true));
  });

  it("leaves the AttributeInstance untouched until the edit is committed", async () => {
    const classInstance = selectClassInstanceWith([attributeInstanceJson()]);

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    const input = await screen.findByDisplayValue("hello");

    // Typing alone must not reach the model: an uncommitted value would still be sent
    // by the next autosave, which is how an in-progress edit could be refused.
    fireEvent.change(input, { target: { value: "edite" } });

    expect(classInstance.attribute_instance[0].value).toBe("hello");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
  });

  it("renders a dropdown for a faceted attribute and commits the picked facet", async () => {
    const classInstance = selectClassInstanceWith([attributeInstanceJson({ value: "catching" })]);
    mocks.metaUtility.getMetaAttributeWithSequence.mockResolvedValue(
      metaAttribute({ ui_component: "Dropdown", facets: "catching|throwing" }),
    );

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    await waitFor(() => expect(screen.getByText("catching")).toBeTruthy());
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "throwing" }));

    await waitFor(() => expect(classInstance.attribute_instance[0].value).toBe("throwing"));
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("drops the element's attributes on removeAttributeGui (the old delayedReset)", async () => {
    selectClassInstanceWith([attributeInstanceJson()]);

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    await screen.findByDisplayValue("hello");

    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
    eventBus.publish("removeAttributeGui");

    await waitFor(() => expect(screen.queryByDisplayValue("hello")).toBeNull());
    expect(screen.queryByText("Dynamic Attributes")).toBeNull();
    // The deselection falls through to the open scene instance, which here has no
    // attributes of its own — only its static block is left.
    expect(screen.getByDisplayValue(SCENE_INSTANCE_UUID)).toBeTruthy();
  });

  it("renders nothing at all when no scene is open", async () => {
    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);

    const { container } = render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  // --- the scene fallback: nothing selected -> the open scene instance ---------------

  it("shows the opened scene instance's attributes when no element is selected", async () => {
    selectNothingWithSceneAttributes([sceneAttributeInstanceJson({ value: "model name" })]);

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    // static block: the scene's uuid and its name, labelled "Scene" rather than "Class"
    await waitFor(() => expect(screen.getByDisplayValue(SCENE_INSTANCE_UUID)).toBeTruthy());
    expect(screen.getByLabelText("Scene")).toBeTruthy();
    expect(screen.getByDisplayValue("my model")).toBeTruthy();
    // and its own dynamic attributes
    expect(screen.getByText("Dynamic Attributes")).toBeTruthy();
    expect(screen.getByDisplayValue("model name")).toBeTruthy();
  });

  it("edits a scene attribute and flags the scene dirty", async () => {
    const sceneInstance = selectNothingWithSceneAttributes([sceneAttributeInstanceJson({ value: "model name" })]);
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    const input = await screen.findByDisplayValue("model name");

    fireEvent.change(input, { target: { value: "renamed model" } });
    fireEvent.blur(input);
    sub.dispose();

    expect(sceneInstance.attribute_instances[0].value).toBe("renamed model");
    expect(published).toHaveLength(1);
    await waitFor(() => expect(mocks.globalObject.doSceneInstancePatch).toBe(true));
  });

  it("rebuilds on tabChanged, which is all a tab switch publishes", async () => {
    selectClassInstanceWith([attributeInstanceJson()]);

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    await screen.findByDisplayValue("hello");

    // The new tab holds another scene, and the switch cleared the selection.
    selectNothingWithSceneAttributes([sceneAttributeInstanceJson({ value: "other model" })]);
    eventBus.publish("tabChanged");

    await waitFor(() => expect(screen.getByDisplayValue("other model")).toBeTruthy());
    expect(screen.queryByDisplayValue("hello")).toBeNull();
  });

  it("opens the reference dialog with the attribute as payload", async () => {
    selectClassInstanceWith([attributeInstanceJson({ uuid: "ai-ref", name: "Sub-Process Reference" })]);
    mocks.metaUtility.getMetaAttribute.mockResolvedValue(
      metaAttribute({
        attribute_type: { uuid: "at-ref", regex_value: "^.*$", role: { uuid: "role-1" }, has_table_attribute: [] },
      }),
    );

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    await waitFor(() => expect(screen.getByText("Reference Attributes")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sub-Process Reference" }));

    expect(useUiStore.getState().dialogs.referenceAttribute).toBe(true);
    const payload = useUiStore.getState().getDialogPayload<{ attributeInstance: AttributeInstance }>(
      "referenceAttribute",
    );
    expect(payload?.attributeInstance.uuid).toBe("ai-ref");
  });

  it("opens the table dialog with the class-instance context as payload", async () => {
    const classInstance = selectClassInstanceWith([
      attributeInstanceJson({
        uuid: "ai-table",
        name: "BPMN Table",
        table_attributes: [attributeInstanceJson({ uuid: "cell-1", table_row: 0 })],
      }),
    ]);
    // A table is an attribute whose type has columns.
    mocks.metaUtility.getMetaAttribute.mockResolvedValue(
      metaAttribute({
        attribute_type: { uuid: "at-table", name: "Table", regex_value: null, role: null, has_table_attribute: [{ sequence: 1, attribute: { uuid: "attr-col" } }] },
      }),
    );

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    await waitFor(() => expect(screen.getByText("Table Attributes")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "BPMN Table" }));

    expect(useUiStore.getState().dialogs.tableAttribute).toBe(true);
    const payload = useUiStore.getState().getDialogPayload<{
      attributeInstance: AttributeInstance;
      currentClassInstance: ClassInstance;
    }>("tableAttribute");
    expect(payload?.attributeInstance.uuid).toBe("ai-table");
    expect(payload?.currentClassInstance).toBe(classInstance);
  });

  // --- the Position tab -------------------------------------------------------------

  /** Select the class instance with a mesh at (1, 2, 0) and open the Position tab. */
  async function openPositionTab() {
    selectClassInstanceWith([attributeInstanceJson()]);
    const mesh = { uuid: CLASS_INSTANCE_UUID, position: { x: 1, y: 2, z: 0 }, userData: {} };
    mocks.globalSelectedObject.getObject.mockReturnValue(mesh);
    mocks.globalSelectedObject.object = mesh;

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");
    fireEvent.click(await screen.findByRole("tab", { name: "Position" }));
    return mesh;
  }

  it("edits the selected object's position through the Position tab", async () => {
    const mesh = await openPositionTab();
    const recorded: unknown[] = [];
    const sub = eventBus.subscribe("historyRecord", (p) => recorded.push(p));

    const xField = await screen.findByLabelText("X");
    expect((xField as HTMLInputElement).value).toBe("1");

    fireEvent.change(xField, { target: { value: "5.5" } });
    fireEvent.blur(xField);
    sub.dispose();

    expect(mesh.position.x).toBe(5.5);
    expect(mocks.globalObject.render).toBe(true);
    expect(recorded).toHaveLength(1);
    expect((recorded[0] as { afterTransformSync?: boolean }).afterTransformSync).toBe(true);
  });

  it("does not move the object back when an untouched Position field loses focus", async () => {
    const mesh = await openPositionTab();
    const yField = (await screen.findByLabelText("Y")) as HTMLInputElement;
    const recorded: unknown[] = [];
    const sub = eventBus.subscribe("historyRecord", (p) => recorded.push(p));

    // The object moves while the tab is open (a gizmo drag, an undo, a collaborator)...
    mesh.position.y = 9;
    // ...and the user merely tabs through the field.
    fireEvent.focus(yField);
    fireEvent.blur(yField);
    sub.dispose();

    expect(mesh.position.y).toBe(9);
    expect(recorded).toHaveLength(0);
  });

  it("re-reads the Position fields when the object is moved elsewhere, sparing a field being typed into", async () => {
    const mesh = await openPositionTab();
    const xField = (await screen.findByLabelText("X")) as HTMLInputElement;
    fireEvent.change(xField, { target: { value: "4" } });

    mesh.position.x = 7;
    mesh.position.y = 8;
    eventBus.publish("historyRecord", { label: "translate" });

    await waitFor(() => expect(((screen.getByLabelText("Y")) as HTMLInputElement).value).toBe("8"));
    expect(xField.value).toBe("4");
  });

  it("returns to the Attributes panel when another object is selected", async () => {
    await openPositionTab();
    expect(await screen.findByLabelText("X")).toBeTruthy();

    // Nothing selected any more: the window falls back to the scene's attributes.
    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);
    mocks.globalSelectedObject.object = undefined;
    eventBus.publish("updateAttributeGui");

    await waitFor(() => expect(screen.queryByLabelText("X")).toBeNull());
  });

  it("shows the GLTF upload button for the Object 3D attribute and opens its dialog", async () => {
    selectClassInstanceWith([
      attributeInstanceJson({
        uuid: "ai-gltf",
        uuid_attribute: "b058b3b4-b523-4ffe-b08e-4f8dda2831c8",
        name: "Object 3D",
        value: "3D Object String",
      }),
    ]);

    render(<AttributeWindow />);
    eventBus.publish("updateAttributeGui");

    const button = await screen.findByRole("button", { name: "Upload 3D Object" });
    fireEvent.click(button);

    expect(useUiStore.getState().dialogs.uploadGltf).toBe(true);
  });
});
