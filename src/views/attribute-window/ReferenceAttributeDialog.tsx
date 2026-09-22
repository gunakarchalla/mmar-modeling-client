import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import type {
  AttributeInstance,
  ClassInstance,
  PortInstance,
  RelationclassInstance,
  Role,
  RoleInstance,
  SceneInstance,
} from "@gds";
import { globalObject, instanceCreationHandler } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { expressionUtility } from "@/resources/services/expression-utility";
import { loadAllSceneInstances } from "@/resources/services/scene-tree-service";
import { eventBus, type OpenReferenceDialogPayload } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";
import { NAME_ATTRIBUTE_UUID } from "@/constants";

/**
 * Lets the user point a reference attribute at another instance — a scene, class,
 * relation class or port — constrained to what the attribute type's Role allows.
 *
 * ONE dialog is shared by every reference button in the attribute window: the clicked
 * attribute arrives as context on the `openReferenceDialog` channel, while uiStore's
 * `referenceAttribute` flag controls visibility.
 *
 * Choosing a target creates the role instance that records the reference and writes its
 * name into the attribute's value, then runs the hybrid algorithms — which is what makes
 * a Statechange Reference adopt the mesh of what it now points at.
 */
interface AllowedScene {
  sceneInstance: SceneInstance;
  parentRole: Role;
}
interface AllowedClass {
  classInstance: ClassInstance;
  parentRole: Role;
}
interface AllowedRelationclass {
  relationclassInstance: RelationclassInstance;
  parentRole: Role;
}
interface AllowedPort {
  portInstance: PortInstance;
  parentRole: Role;
}

/** Same shape as the bus channel's payload (uiStore carries it too, for reopening). */
type Payload = OpenReferenceDialogPayload;

interface ReferenceAttributeDialogProps {
  /** Ask the attribute window to rebuild after the reference changed. */
  onChanged?: () => void;
}

export default function ReferenceAttributeDialog({ onChanged }: ReferenceAttributeDialogProps) {
  const open = useUiStore((s) => s.dialogs.referenceAttribute);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [attributeInstance, setAttributeInstance] = useState<AttributeInstance | null>(null);
  const [referenceRoleInstance, setReferenceRoleInstance] = useState<RoleInstance | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [allowedSceneInstances, setAllowedSceneInstances] = useState<AllowedScene[]>([]);
  const [allowedClassInstances, setAllowedClassInstances] = useState<AllowedClass[]>([]);
  const [allowedRelationclassInstances, setAllowedRelationclassInstances] = useState<AllowedRelationclass[]>([]);
  const [allowedPortInstances, setAllowedPortInstances] = useState<AllowedPort[]>([]);

  const [selectedSceneUuid, setSelectedSceneUuid] = useState("");
  const [selectedClassUuid, setSelectedClassUuid] = useState("");
  const [selectedRelationclassUuid, setSelectedRelationclassUuid] = useState("");
  const [selectedPortUuid, setSelectedPortUuid] = useState("");

  //reset all variables for new load
  const reset = useCallback(() => {
    setAttributeInstance(null);
    setReferenceRoleInstance(null);
    setAllowedSceneInstances([]);
    setAllowedClassInstances([]);
    setAllowedRelationclassInstances([]);
    setAllowedPortInstances([]);
    setSelectedSceneUuid("");
    setSelectedClassUuid("");
    setSelectedRelationclassUuid("");
    setSelectedPortUuid("");
  }, []);

  const load = useCallback(
    async (payload: Payload) => {
      setIsLoading(true);
      reset();

      // A reference may point at an instance in ANY scene, and the scene tree is lazy
      // now (scene-tree-service) — it only holds the SceneTypes the user expanded. The
      // collectAllowed* helpers below, and resolveReferenceName, walk
      // getAllSceneInstancesFromLocal, so without this the pickers would silently omit
      // whole scenes and an existing reference would render as its raw fallback name.
      await loadAllSceneInstances();

      const instance = payload.attributeInstance;
      setAttributeInstance(instance);

      const role = await resolveAttributeRole(instance);
      const roleInstance = instance.role_instance_from ?? null;
      if (roleInstance) {
        roleInstance.name = await resolveReferenceName(roleInstance);
      }
      setReferenceRoleInstance(roleInstance);

      if (role) {
        setAllowedSceneInstances(await collectAllowedSceneInstances(role));
        setAllowedClassInstances(await collectAllowedClassInstances(role));
        setAllowedRelationclassInstances(await collectAllowedRelationclassInstances(role));
        setAllowedPortInstances(await collectAllowedPortInstances(role));
      }
      setIsLoading(false);
    },
    [reset],
  );

  useEffect(() => {
    const sub = eventBus.subscribe("openReferenceDialog", (payload) => {
      void load(payload).catch((err) => {
        setIsLoading(false);
        logger.log("reference dialog failed to load: " + describeError(err), "error");
      });
    });
    return () => sub.dispose();
  }, [load]);

  // dialog-reference-attribute.ts:221
  async function deleteReferenceRoleInstance() {
    if (!attributeInstance || !referenceRoleInstance) return;
    const copyToLog = attributeInstance.role_instance_from;
    attributeInstance.role_instance_from = null as unknown as RoleInstance;

    //find role in globalObjectInstance.role_instances and delete it
    globalObject.role_instances = globalObject.role_instances.filter(
      (roleInstance) => roleInstance.uuid !== referenceRoleInstance.uuid,
    );

    setReferenceRoleInstance(null);

    //delete attributeInstance value
    attributeInstance.value = "...";

    //push to log file
    logger.log("RoleInstance Instance " + copyToLog.uuid + " deleted", "done");
    onChanged?.();
  }

  // dialog-reference-attribute.ts:238
  async function addReferenceRoleInstance(
    referencedInstance: { uuid: string } | undefined,
    parentRole: Role | undefined,
    instanceType: "sceneInstance" | "classInstance" | "relationclassInstance" | "portInstance",
  ) {
    if (!attributeInstance || !referencedInstance || !parentRole) return;

    // create the role instance
    const roleInstanceFrom = await instanceCreationHandler.createRoleInstance(
      uuidv4(),
      null as unknown as ClassInstance,
      null as unknown as PortInstance,
      "attribute_reference",
      null as unknown as string,
      "name_placeholder",
      parentRole.uuid,
    );

    // add the reference based on instanceType
    const referencedInstanceUUID = referencedInstance.uuid;
    if (instanceType === "sceneInstance") {
      roleInstanceFrom.uuid_has_reference_scene_instance = referencedInstanceUUID;
    } else if (instanceType === "classInstance") {
      roleInstanceFrom.uuid_has_reference_class_instance = referencedInstanceUUID;
    } else if (instanceType === "relationclassInstance") {
      roleInstanceFrom.uuid_has_reference_relationclass_instance = referencedInstanceUUID;
    } else if (instanceType === "portInstance") {
      roleInstanceFrom.uuid_has_reference_port_instance = referencedInstanceUUID;
    }

    // add reference...
    attributeInstance.role_instance_from = roleInstanceFrom;

    //refresh metadata
    roleInstanceFrom.name = await resolveReferenceName(roleInstanceFrom);
    setReferenceRoleInstance(roleInstanceFrom);

    // set attributeInstance value to the role_instance_from.name
    attributeInstance.value = roleInstanceFrom.name;

    // A Statechange Reference adopts the mesh of whatever it now points at.
    await hybridAlgorithmsService.checkHybridAlgorithms(attributeInstance);

    onChanged?.();
  }

  function close() {
    closeDialog("referenceAttribute");
  }

  const showGroup = (length: number) => !isLoading && length > 0 && !referenceRoleInstance;

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Reference Attribute: {attributeInstance?.name ?? ""}</DialogTitle>
      <DialogContent sx={{ minHeight: 500 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {referenceRoleInstance && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                sx={{ flex: 1 }}
                size="small"
                label={attributeInstance?.name ?? ""}
                value={referenceRoleInstance.name ?? ""}
                disabled
              />
              <Button variant="outlined" onClick={() => void deleteReferenceRoleInstance()}>
                delete
              </Button>
            </Box>
          )}

          {showGroup(allowedSceneInstances.length) && (
            <AllowedGroup
              label="Select Referenced SceneInstance"
              value={selectedSceneUuid}
              onChange={setSelectedSceneUuid}
              options={allowedSceneInstances.map((o) => ({
                uuid: o.sceneInstance.uuid,
                label: `${o.sceneInstance.name} | ${o.sceneInstance.uuid}`,
              }))}
              onAdd={() => {
                const picked = allowedSceneInstances.find((o) => o.sceneInstance.uuid === selectedSceneUuid);
                void addReferenceRoleInstance(picked?.sceneInstance, picked?.parentRole, "sceneInstance");
              }}
            />
          )}

          {showGroup(allowedClassInstances.length) && (
            <AllowedGroup
              label="Select Referenced ClassInstance"
              value={selectedClassUuid}
              onChange={setSelectedClassUuid}
              options={allowedClassInstances.map((o) => ({
                uuid: o.classInstance.uuid,
                label: `${getClassInstanceName(o.classInstance)} | ${o.classInstance.uuid}`,
              }))}
              onAdd={() => {
                const picked = allowedClassInstances.find((o) => o.classInstance.uuid === selectedClassUuid);
                void addReferenceRoleInstance(picked?.classInstance, picked?.parentRole, "classInstance");
              }}
            />
          )}

          {showGroup(allowedRelationclassInstances.length) && (
            <AllowedGroup
              label="Select Referenced RelationclassInstance"
              value={selectedRelationclassUuid}
              onChange={setSelectedRelationclassUuid}
              options={allowedRelationclassInstances.map((o) => ({
                uuid: o.relationclassInstance.uuid,
                label: `${o.relationclassInstance.name} | ${o.relationclassInstance.uuid}`,
              }))}
              onAdd={() => {
                const picked = allowedRelationclassInstances.find(
                  (o) => o.relationclassInstance.uuid === selectedRelationclassUuid,
                );
                void addReferenceRoleInstance(
                  picked?.relationclassInstance,
                  picked?.parentRole,
                  "relationclassInstance",
                );
              }}
            />
          )}

          {showGroup(allowedPortInstances.length) && (
            <AllowedGroup
              label="Select Referenced PortInstance"
              value={selectedPortUuid}
              onChange={setSelectedPortUuid}
              options={allowedPortInstances.map((o) => ({
                uuid: o.portInstance.uuid,
                label: `${o.portInstance.name} | ${o.portInstance.uuid}`,
              }))}
              onAdd={() => {
                const picked = allowedPortInstances.find((o) => o.portInstance.uuid === selectedPortUuid);
                void addReferenceRoleInstance(picked?.portInstance, picked?.parentRole, "portInstance");
              }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** One "pick an instance, then add it" row. */
function AllowedGroup({
  label,
  value,
  onChange,
  options,
  onAdd,
}: {
  label: string;
  value: string;
  onChange: (uuid: string) => void;
  options: { uuid: string; label: string }[];
  onAdd: () => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <FormControl sx={{ flex: 1 }} required size="small">
        <InputLabel id={`ref-${label}`}>{label}</InputLabel>
        <Select
          labelId={`ref-${label}`}
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <MenuItem key={option.uuid} value={option.uuid}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button variant="outlined" onClick={onAdd} disabled={!value}>
        add
      </Button>
    </Box>
  );
}

// dialog-reference-attribute.ts:299 — the display name of a referenced class instance.
function getClassInstanceName(classInstance: ClassInstance): string {
  return standardNameAttribute(classInstance)?.value || "Unknown";
}

/** The instance's standard Name attribute (`NAME_ATTRIBUTE_UUID`), if its class uses it. */
function standardNameAttribute(classInstance: ClassInstance): AttributeInstance | undefined {
  return classInstance.attribute_instance.find((attribute) => attribute.uuid_attribute === NAME_ATTRIBUTE_UUID);
}

/**
 * Every metamodel names its elements through the standard Name attribute
 * (`NAME_ATTRIBUTE_UUID`), so an element without it has no name to show a reference by.
 * That is a fault of the metamodel, reported to the user rather than papered over.
 * `metaName` is the element's class, relationclass or port (its instance's `name`).
 */
function reportMissingStandardName(kind: "class" | "relationclass" | "port", metaName: string | undefined): void {
  logger.log(
    `The ${kind} "${metaName ?? "?"}" does not use the standard Name attribute, so its instances have no name to show.`,
    "error",
  );
}

/** The referenced instance's standard Name, or "" — reported — when its class lacks the attribute. */
async function referencedName(
  instanceUuid: string,
  kind: "class" | "relationclass" | "port",
  metaName: string | undefined,
): Promise<string> {
  const name = await expressionUtility.attrvalByInst(NAME_ATTRIBUTE_UUID, instanceUuid);
  if (name !== undefined) return name;
  reportMissingStandardName(kind, metaName);
  return "";
}

/**
 * Which Role does this reference
 * attribute's attribute type carry? Resolved from the currently selected class or
 * port instance, with one fallback: a reference
 * attribute of the open SCENE INSTANCE (shown when nothing is selected) belongs to
 * neither, and `current_class_instance` may still hold the last selected element, which
 * does not carry this attribute either. metaUtility searches the scene type first, so it
 * covers both — without it the pickers stay empty because no Role is found.
 */
async function resolveAttributeRole(attributeInstance: AttributeInstance): Promise<Role | undefined> {
  const attributeUUID = attributeInstance.uuid_attribute;
  const currentClass = globalObject.current_class_instance
    ? await metaUtility.getMetaClass(globalObject.current_class_instance.uuid_class)
    : undefined;
  const currentPort = globalObject.current_port_instance
    ? await metaUtility.getMetaPort(globalObject.current_port_instance.uuid_port)
    : undefined;

  let currentAttribute = currentClass?.attributes.find((attribute) => attribute.uuid === attributeUUID);
  if (currentPort) {
    currentAttribute = currentPort.attributes.find((attribute) => attribute.uuid === attributeUUID) ?? currentAttribute;
  }
  if (!currentAttribute) {
    currentAttribute = await metaUtility.getMetaAttribute(attributeUUID);
  }
  return currentAttribute?.attribute_type?.role;
}

/**
 * The naming half of `setMetaInformation()`: resolve the referenced instance's display
 * name through the standard Name attribute, or the scene instance's own name. A
 * reference whose target is no longer loaded keeps the name it was saved with.
 */
async function resolveReferenceName(roleInstance: RoleInstance): Promise<string> {
  // If the reference role instance has a reference class instance, then get the name of
  // the referenced class instance (likewise for relationclass / port / scene).
  if (roleInstance.uuid_has_reference_class_instance != undefined) {
    const referenced = await instanceUtility.getClassInstance(roleInstance.uuid_has_reference_class_instance);
    if (referenced) {
      return await referencedName(referenced.uuid, "class", referenced.name);
    }
  } else if (roleInstance.uuid_has_reference_relationclass_instance != undefined) {
    const referenced = await instanceUtility.getClassInstance(
      roleInstance.uuid_has_reference_relationclass_instance,
    );
    if (referenced) {
      return await referencedName(referenced.uuid, "relationclass", referenced.name);
    }
  } else if (roleInstance.uuid_has_reference_port_instance != undefined) {
    const referenced = await instanceUtility.getPortInstance(roleInstance.uuid_has_reference_port_instance);
    if (referenced) {
      return await referencedName(referenced.uuid, "port", referenced.name);
    }
  } else if (roleInstance.uuid_has_reference_scene_instance != undefined) {
    const referenced = await instanceUtility.getSceneInstance(roleInstance.uuid_has_reference_scene_instance);
    if (referenced) {
      return referenced.name;
    }
  } else {
    return "Reference to: ?";
  }
  return roleInstance.name;
}

// The four setAllowed*Instances methods: keep only the instances whose meta concept is
// listed in the Role's *_references.
async function collectAllowedSceneInstances(role: Role): Promise<AllowedScene[]> {
  const sceneInstances = await instanceUtility.getAllSceneInstancesFromLocal();
  const allowed: AllowedScene[] = [];
  for (const sceneInstance of sceneInstances) {
    for (const sceneTypeReference of role.scenetype_references ?? []) {
      if (sceneInstance.uuid_scene_type === sceneTypeReference.uuid) {
        logger.log(`sceneTypeReference ${sceneTypeReference.uuid} is allowed`, "done");
        allowed.push({ sceneInstance, parentRole: role });
      }
    }
  }
  return allowed;
}

async function collectAllowedClassInstances(role: Role): Promise<AllowedClass[]> {
  const classInstances = await instanceUtility.getAllClassInstances();
  const allowed: AllowedClass[] = [];
  for (const classInstance of classInstances) {
    for (const classReference of role.class_references ?? []) {
      if (classInstance.uuid_class === classReference.uuid) {
        logger.log(`classReference ${classReference.uuid} is allowed`, "done");
        allowed.push({ classInstance, parentRole: role });
      }
    }
  }
  // The picker labels them by their standard Name: report each class that lacks it, once.
  const unnamedClasses = new Set(
    allowed.filter((entry) => !standardNameAttribute(entry.classInstance)).map((entry) => entry.classInstance.name),
  );
  for (const className of unnamedClasses) reportMissingStandardName("class", className);
  return allowed;
}

async function collectAllowedRelationclassInstances(role: Role): Promise<AllowedRelationclass[]> {
  const relationclassInstances = await instanceUtility.getAllRelationClassInstances();
  const allowed: AllowedRelationclass[] = [];
  for (const relationclassInstance of relationclassInstances) {
    for (const relationclassReference of role.relationclass_references ?? []) {
      if (relationclassInstance.uuid_relationclass === relationclassReference.uuid) {
        logger.log(`relationclassReference ${relationclassReference.uuid} is allowed`, "done");
        allowed.push({ relationclassInstance, parentRole: role });
      }
    }
  }
  return allowed;
}

async function collectAllowedPortInstances(role: Role): Promise<AllowedPort[]> {
  const portInstances = await instanceUtility.getAllPortInstances();
  const allowed: AllowedPort[] = [];
  for (const portInstance of portInstances) {
    for (const portReference of role.port_references ?? []) {
      if (portInstance.uuid_port === portReference.uuid) {
        logger.log(`portReference ${portReference.uuid} is allowed`, "done");
        allowed.push({ portInstance, parentRole: role });
      }
    }
  }
  return allowed;
}
