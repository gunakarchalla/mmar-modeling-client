// @vitest-environment jsdom
//
// P8 component tests for the reference-attribute dialog: it loads its context off the
// `openReferenceDialog` bus channel, offers only the instances the attribute type's
// Role allows, and sets / unsets the reference role instance.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AttributeInstance, ClassInstance, RoleInstance } from "@gds";
import { NAME_ATTRIBUTE_UUID } from "@/constants";

const mocks = vi.hoisted(() => ({
  globalObject: {
    role_instances: [] as any[],
    current_class_instance: undefined as any,
    current_port_instance: undefined as any,
  } as any,
  instanceCreationHandler: { createRoleInstance: vi.fn() },
  // Typed `Promise<any>` so `mockResolvedValue(<gds instance>)` type-checks — an
  // inferred `async () => []` would fix the mock's return type to `never[]`.
  instanceUtility: {
    getClassInstance: vi.fn(async (): Promise<any> => undefined),
    getPortInstance: vi.fn(async (): Promise<any> => undefined),
    getSceneInstance: vi.fn(async (): Promise<any> => undefined),
    getAllClassInstances: vi.fn(async (): Promise<any[]> => []),
    getAllRelationClassInstances: vi.fn(async (): Promise<any[]> => []),
    getAllPortInstances: vi.fn(async (): Promise<any[]> => []),
    getAllSceneInstancesFromLocal: vi.fn(async (): Promise<any[]> => []),
  },
  metaUtility: {
    getMetaClass: vi.fn(async (): Promise<any> => undefined),
    getMetaPort: vi.fn(async (): Promise<any> => undefined),
    getMetaAttribute: vi.fn(async (): Promise<any> => undefined),
  },
  expressionUtility: { attrvalByInst: vi.fn(async (): Promise<any> => "Referenced Task") },
  // P12: hybrid-algorithms-service imports the @/engine/global-definition LEAF directly,
  // so it bypasses the `@/engine` barrel mock and drags in a real WebGLRenderer at module
  // scope — this whole file fails to load without the mock below. (Same lesson as P9's
  // persistency-handler, P10's shared-doc-service and P11's renderers.)
  hybridAlgorithmsService: { checkHybridAlgorithms: vi.fn(async () => undefined) },
}));

vi.mock("@/engine/hybrid-algorithms/hybrid-algorithms-service", () => ({
  hybridAlgorithmsService: mocks.hybridAlgorithmsService,
}));
vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  instanceCreationHandler: mocks.instanceCreationHandler,
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/services/expression-utility", () => ({ expressionUtility: mocks.expressionUtility }));

import ReferenceAttributeDialog from "./ReferenceAttributeDialog";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { useLogStore } from "@/resources/store/logStore";

const ROLE_UUID = "role-1";
const ALLOWED_CLASS_UUID = "class-allowed";

/** A meta class whose reference attribute carries a Role allowing ALLOWED_CLASS_UUID. */
function metaClassWithReferenceAttribute() {
  return {
    uuid: "class-1",
    attributes: [
      {
        uuid: "attr-ref",
        name: "Sub-Process Reference",
        attribute_type: {
          uuid: "at-ref",
          role: {
            uuid: ROLE_UUID,
            class_references: [{ uuid: ALLOWED_CLASS_UUID }],
            relationclass_references: [],
            port_references: [],
            scenetype_references: [],
          },
        },
      },
    ],
  };
}

function referenceAttributeInstance(overrides: Record<string, unknown> = {}): AttributeInstance {
  return AttributeInstance.fromJS({
    uuid: "ai-ref",
    uuid_attribute: "attr-ref",
    name: "Sub-Process Reference",
    value: "...",
    table_attributes: [],
    ...overrides,
  }) as AttributeInstance;
}

/** A class instance that the Role allows, named through the "Name" meta attribute. */
function allowedClassInstance(): ClassInstance {
  return ClassInstance.fromJS({
    uuid: "ci-target",
    uuid_class: ALLOWED_CLASS_UUID,
    name: "Sub-Process",
    attribute_instance: [
      { uuid: "ai-name", uuid_attribute: NAME_ATTRIBUTE_UUID, value: "Referenced Task", table_attributes: [] },
    ],
  }) as ClassInstance;
}

function openDialogWith(attributeInstance: AttributeInstance) {
  useUiStore.setState({
    dialogs: { ...useUiStore.getState().dialogs, referenceAttribute: true },
    dialogPayloads: { referenceAttribute: { attributeInstance } },
  });
  eventBus.publish("openReferenceDialog", { attributeInstance });
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  Object.assign(mocks.globalObject, {
    role_instances: [],
    current_class_instance: { uuid: "ci-1", uuid_class: "class-1" },
    current_port_instance: undefined,
  });
  mocks.metaUtility.getMetaClass.mockResolvedValue(metaClassWithReferenceAttribute());
  mocks.metaUtility.getMetaPort.mockResolvedValue(undefined);
  mocks.metaUtility.getMetaAttribute.mockResolvedValue(undefined);
  mocks.instanceUtility.getAllClassInstances.mockResolvedValue([]);
  mocks.instanceUtility.getAllRelationClassInstances.mockResolvedValue([]);
  mocks.instanceUtility.getAllPortInstances.mockResolvedValue([]);
  mocks.instanceUtility.getAllSceneInstancesFromLocal.mockResolvedValue([]);
  mocks.expressionUtility.attrvalByInst.mockResolvedValue("Referenced Task");
  useLogStore.setState({ snackbar: { open: false, message: "", severity: "info" } });
  useUiStore.setState({
    dialogs: Object.fromEntries(
      Object.keys(useUiStore.getState().dialogs).map((n) => [n, false]),
    ) as never,
    dialogPayloads: {},
  });
});

describe("ReferenceAttributeDialog", () => {
  it("offers only the class instances the Role allows", async () => {
    const target = allowedClassInstance();
    const notAllowed = ClassInstance.fromJS({
      uuid: "ci-other",
      uuid_class: "class-other",
      name: "Other",
      attribute_instance: [],
    }) as ClassInstance;
    mocks.instanceUtility.getAllClassInstances.mockResolvedValue([target, notAllowed]);

    render(<ReferenceAttributeDialog />);
    openDialogWith(referenceAttributeInstance());

    await waitFor(() => expect(screen.getByText("Select Referenced ClassInstance")).toBeTruthy());
    fireEvent.mouseDown(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: /Referenced Task \| ci-target/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /ci-other/ })).toBeNull();
  });

  it("resolves the Role through the meta attribute for a scene-owned reference attribute", async () => {
    // Nothing selected (the attribute window is showing the open scene instance), so
    // there is no current class or port to read the Role off — metaUtility resolves it
    // from the scene type instead.
    mocks.globalObject.current_class_instance = undefined;
    mocks.metaUtility.getMetaAttribute.mockResolvedValue(metaClassWithReferenceAttribute().attributes[0]);
    mocks.instanceUtility.getAllClassInstances.mockResolvedValue([allowedClassInstance()]);

    render(<ReferenceAttributeDialog />);
    openDialogWith(referenceAttributeInstance());

    await waitFor(() => expect(screen.getByText("Select Referenced ClassInstance")).toBeTruthy());
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /Referenced Task \| ci-target/ })).toBeTruthy();
  });

  it("sets the reference: creates a role instance pointing at the picked class instance", async () => {
    const target = allowedClassInstance();
    mocks.instanceUtility.getAllClassInstances.mockResolvedValue([target]);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(target);
    mocks.instanceCreationHandler.createRoleInstance.mockImplementation(
      async (uuid: string) => RoleInstance.fromJS({ uuid, uuid_role: ROLE_UUID, name: "name_placeholder" }) as RoleInstance,
    );
    const attributeInstance = referenceAttributeInstance();

    render(<ReferenceAttributeDialog />);
    openDialogWith(attributeInstance);

    await waitFor(() => expect(screen.getByText("Select Referenced ClassInstance")).toBeTruthy());
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Referenced Task/ }));
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => expect(attributeInstance.role_instance_from).toBeTruthy());
    expect(attributeInstance.role_instance_from.uuid_has_reference_class_instance).toBe("ci-target");
    // the role instance is created for the reference (not a relation from/to)
    expect(mocks.instanceCreationHandler.createRoleInstance).toHaveBeenCalledWith(
      expect.any(String),
      null,
      null,
      "attribute_reference",
      null,
      "name_placeholder",
      ROLE_UUID,
    );
    // and the attribute value becomes the resolved reference name
    expect(attributeInstance.value).toBe("Referenced Task");

    // P12 un-stub: setting a reference must run the Statechange hybrid algorithm, which
    // is what makes a Reference instance adopt the referenced object's mesh. Dropping
    // this call leaves the reference set but the model visually unchanged.
    await waitFor(() =>
      expect(mocks.hybridAlgorithmsService.checkHybridAlgorithms).toHaveBeenCalledWith(attributeInstance),
    );
  });

  // Every metamodel names its elements through the standard Name attribute. A class that
  // does not use it is a fault of the metamodel: the user is told, and the reference is
  // left without a name rather than showing the role instance's placeholder.
  it("reports a referenced class without the standard Name attribute instead of saving a placeholder", async () => {
    const unnamed = ClassInstance.fromJS({
      uuid: "ci-target",
      uuid_class: ALLOWED_CLASS_UUID,
      name: "Sub-Process",
      attribute_instance: [{ uuid: "ai-title", uuid_attribute: "some-other-name", value: "Titled", table_attributes: [] }],
    }) as ClassInstance;
    mocks.instanceUtility.getAllClassInstances.mockResolvedValue([unnamed]);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(unnamed);
    mocks.expressionUtility.attrvalByInst.mockResolvedValue(undefined);
    mocks.instanceCreationHandler.createRoleInstance.mockImplementation(
      async (uuid: string) => RoleInstance.fromJS({ uuid, uuid_role: ROLE_UUID, name: "name_placeholder" }) as RoleInstance,
    );
    const attributeInstance = referenceAttributeInstance();

    render(<ReferenceAttributeDialog />);
    openDialogWith(attributeInstance);

    await waitFor(() => expect(screen.getByText("Select Referenced ClassInstance")).toBeTruthy());
    // Already while offering it: the picker has no name to label it by.
    expect(useLogStore.getState().snackbar).toEqual({
      open: true,
      severity: "error",
      message: 'The class "Sub-Process" does not use the standard Name attribute, so its instances have no name to show.',
    });
    useLogStore.setState({ snackbar: { open: false, message: "", severity: "info" } });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /ci-target/ }));
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => expect(attributeInstance.role_instance_from).toBeTruthy());
    expect(attributeInstance.value).toBe("");
    expect(attributeInstance.role_instance_from.name).toBe("");
    expect(useLogStore.getState().snackbar.open).toBe(true);
    expect(useLogStore.getState().snackbar.message).toContain('The class "Sub-Process" does not use the standard Name attribute');
  });

  it("unsets the reference: clears role_instance_from, drops the role instance and resets the value", async () => {
    const roleInstance = RoleInstance.fromJS({
      uuid: "ri-1",
      uuid_role: ROLE_UUID,
      name: "old name",
      uuid_has_reference_class_instance: "ci-target",
    }) as RoleInstance;
    const attributeInstance = referenceAttributeInstance({
      value: "Referenced Task",
      role_instance_from: {
        uuid: "ri-1",
        uuid_role: ROLE_UUID,
        name: "old name",
        uuid_has_reference_class_instance: "ci-target",
      },
    });
    mocks.globalObject.role_instances = [roleInstance, RoleInstance.fromJS({ uuid: "ri-keep", uuid_role: "other" })];
    mocks.instanceUtility.getClassInstance.mockResolvedValue(allowedClassInstance());

    render(<ReferenceAttributeDialog />);
    openDialogWith(attributeInstance);

    // With a reference set, the dialog shows it plus a delete button (no pickers).
    await waitFor(() => expect(screen.getByRole("button", { name: "delete" })).toBeTruthy());
    expect(screen.queryByText("Select Referenced ClassInstance")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => expect(attributeInstance.role_instance_from).toBeNull());
    expect(attributeInstance.value).toBe("...");
    expect(mocks.globalObject.role_instances.map((r: RoleInstance) => r.uuid)).toEqual(["ri-keep"]);
  });
});
