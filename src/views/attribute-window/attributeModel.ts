import type {
  Attribute,
  AttributeInstance,
  ClassInstance,
  PortInstance,
  RelationclassInstance,
  SceneInstance,
} from "@gds";
import { globalObject, globalSelectedObject } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { historyService } from "@/resources/services/history-service";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";
import { publishLocalChange, markActiveSceneDirty } from "@/resources/collaboration/local-change-publisher";
import { FILE_ATTRIBUTE_TYPE_UUID } from "@/constants";

/**
 * The data half of the attribute window, as plain async functions so the grouping and
 * the field-change pipeline are unit-testable without rendering.
 *
 * `AttributeWindow.tsx` owns the React state and the event wiring; this module answers
 * "which attributes, in what order, in which group" and "what happens when one is
 * edited".
 */

/** An attribute instance plus everything the window needs from its meta attribute. */
export interface EnhancedAttributeInstance {
  attributeInstance: AttributeInstance;
  sequence: number;
  uiType: string;
  metaAttribute: Attribute;
  facets: string[];
}

/** Everything `AttributeWindow` renders for one selected instance. */
export interface AttributeGroups {
  currentClassInstance: ClassInstance | null;
  currentPortInstance: PortInstance | null;
  currentRelationclassInstance: RelationclassInstance | null;
  /**
   * The open tab's SceneInstance — set ONLY when the selection resolves to no model
   * element, so the window falls back to the scene's own attributes. Never set at the
   * same time as one of the three above.
   */
  currentSceneInstance: SceneInstance | null;
  /** `attributeInstancesNoTable` — plain fields (text / dropdown / slider / upload). */
  plain: EnhancedAttributeInstance[];
  /** `attributeInstanceTable` — attributes whose type has table columns. */
  table: EnhancedAttributeInstance[];
  /** `attributeInstancesReferenceAttribute` — attributes whose type carries a Role. */
  reference: EnhancedAttributeInstance[];
  /** `attributeInstancesUuidsOfFileType` — uuids of the attribute instances of type File. */
  fileTypeUuids: string[];
}

/** The `reset()` state: no scene open, nothing to show. */
export function emptyAttributeGroups(): AttributeGroups {
  return {
    currentClassInstance: null,
    currentPortInstance: null,
    currentRelationclassInstance: null,
    currentSceneInstance: null,
    plain: [],
    table: [],
    reference: [],
    fileTypeUuids: [],
  };
}

/**
 * The uuids of those
 * attribute instances whose META attribute is of the File attribute type.
 */
async function getFileTypeAttributeInstanceUuids(
  attributeInstances: AttributeInstance[],
): Promise<string[]> {
  const uuids: string[] = [];
  for (const attributeInstance of attributeInstances) {
    // looping through all attribute instances and checking if the attribute type is
    // file through uuid of File Attribute Type
    const metaAttribute = await metaUtility.getMetaAttribute(attributeInstance.uuid_attribute);
    if (metaAttribute?.attribute_type.uuid == FILE_ATTRIBUTE_TYPE_UUID) {
      // if the attribute instance is not already in the array, push it
      if (!uuids.includes(attributeInstance.uuid)) {
        uuids.push(attributeInstance.uuid);
      }
    }
  }
  return uuids;
}

/**
 * Resolves the selected THREE object back to its class / port / relationclass instance,
 * enriches every attribute instance with its meta attribute (sequence, ui_component,
 * facets), sorts by sequence and splits the result into the three groups the window
 * renders.
 *
 * SCENE FALLBACK: when the selection resolves to no model element, the OPEN SCENE
 * INSTANCE's own attributes are shown instead. The rest of the function needs no special
 * case for them — an attribute instance parented by a scene resolves its meta attribute
 * through `assigned_uuid_scene_instance` -> `uuid_scene_type` below.
 *
 * The fallback is keyed on "no element resolved" rather than on "no selected object"
 * because `globalSelectedObject` starts out holding an empty `THREE.Mesh` (truthy, but
 * matching no instance) and keeps a stale mesh after the object behind it is deleted.
 *
 * Returns the `reset()` state when no scene is open.
 */
export async function buildAttributeGroups(): Promise<AttributeGroups> {
  const groups = emptyAttributeGroups();

  //get the sceneInstance of the open tab -> the attributes shown belong either to the
  //selected element inside it, or (nothing selected) to the sceneInstance itself
  const sceneInstance = await instanceUtility.getTabContextSceneInstance();
  if (!sceneInstance) return groups;

  //if there is a selected object, resolve it back to its instance
  const selectedObject = globalSelectedObject.getObject();
  if (selectedObject) {
    groups.currentClassInstance =
      sceneInstance.class_instances.find((class_instance) => class_instance.uuid == selectedObject.uuid) ?? null;
    const portInstances = await instanceUtility.getAllPortInstancesOfTabContext();
    groups.currentPortInstance =
      portInstances.find((port_instance) => port_instance.uuid == selectedObject.uuid) ?? null;
    groups.currentRelationclassInstance =
      sceneInstance.relationclasses_instances.find(
        (relationclass_instance) => relationclass_instance.uuid == selectedObject.uuid,
      ) ?? null;
  }

  let attributeInstances: AttributeInstance[];
  //if there is a classInstance
  if (groups.currentClassInstance) {
    attributeInstances = groups.currentClassInstance.attribute_instance;
  }
  //if there is a portInstance
  else if (groups.currentPortInstance) {
    attributeInstances = groups.currentPortInstance.attribute_instances;
  }
  //if there is a relationclassInstance
  else if (groups.currentRelationclassInstance) {
    attributeInstances = groups.currentRelationclassInstance.attribute_instance;
  }
  //nothing selected -> the attributes of the opened sceneInstance
  else {
    groups.currentSceneInstance = sceneInstance;
    attributeInstances = sceneInstance.attribute_instances ?? [];
  }

  //for sorting after sequence number
  const enhancedAttributeInstanceArray: EnhancedAttributeInstance[] = [];
  for (const attributeInstance of attributeInstances) {
    //get the uuid to which the attribute belongs to
    let uuidParent = attributeInstance.assigned_uuid_class_instance;
    if (!uuidParent) {
      uuidParent = attributeInstance.assigned_uuid_port_instance;
    }
    if (!uuidParent) {
      uuidParent = attributeInstance.assigned_uuid_scene_instance;
    }

    let metaAttribute: Attribute | undefined;

    //get instance concept of uuidParent
    if (uuidParent) {
      const classInstance = await instanceUtility.getClassInstance(uuidParent);
      const portInstance = await instanceUtility.getPortInstance(uuidParent);
      const parentSceneInstance = await instanceUtility.getSceneInstance(uuidParent);
      if (classInstance) {
        metaAttribute = await metaUtility.getMetaAttributeWithSequence(
          attributeInstance.uuid_attribute,
          classInstance.uuid_class,
        );
      }
      if (!classInstance && portInstance) {
        metaAttribute = await metaUtility.getMetaAttributeWithSequence(
          attributeInstance.uuid_attribute,
          portInstance.uuid_port,
        );
      }
      if (!classInstance && !portInstance && parentSceneInstance) {
        metaAttribute = await metaUtility.getMetaAttributeWithSequence(
          attributeInstance.uuid_attribute,
          parentSceneInstance.uuid_scene_type,
        );
      }
    }

    // Guarded: an unguarded dereference would throw for an
    // orphaned attribute instance). Skipping such a row is the closest safe
    // equivalent — a throw inside a React effect would blank the whole window.
    if (!metaAttribute) continue;

    //if sequence is not set in meta attribute, set it to 1000, otherwise set value
    const sequence = metaAttribute.sequence ?? 1000;
    const uiComponent = metaAttribute.ui_component ?? "text";

    //get enum values from regex if attribute type is enum or boolean
    let facets: string[] = [];
    let facetsString = "";
    if (metaAttribute.attribute_type.regex_value) {
      facetsString = metaAttribute.facets;
    }
    if (facetsString) {
      //split regex at | and push each value to array
      facets = facetsString.split("|");
    }

    enhancedAttributeInstanceArray.push({
      attributeInstance,
      sequence,
      uiType: uiComponent,
      metaAttribute,
      facets,
    });
  }

  //sort array after sequence number
  enhancedAttributeInstanceArray.sort((a, b) => a.sequence - b.sequence);

  for (const enhanced of enhancedAttributeInstanceArray) {
    //get meta attribute of attribute instance
    const metaAttribute = await metaUtility.getMetaAttribute(enhanced.attributeInstance.uuid_attribute);
    //check if attribute is a reference attribute -> attribute_type.role is set
    const isReferenceAttribute = metaAttribute ? metaAttribute.attribute_type.role != null : false;

    // A table is an attribute whose TYPE has columns, whether or not it holds rows: one
    // whose rows were all removed is still a table (see Instance_tables in gds).
    const isTableAttribute = (metaAttribute?.attribute_type.has_table_attribute ?? []).length > 0;

    if (isReferenceAttribute) {
      groups.reference.push(enhanced);
    } else if (isTableAttribute) {
      groups.table.push(enhanced);
    } else {
      groups.plain.push(enhanced);
    }
  }

  groups.fileTypeUuids = await getFileTypeAttributeInstanceUuids(
    enhancedAttributeInstanceArray.map((enhanced) => enhanced.attributeInstance),
  );

  return groups;
}

/**
 * Which instance owns the attribute being edited. This is read
 * these off its own component state (`this.currentClassInstance` etc.); here they are
 * passed in, because `applyFieldChange` is a free function. `AttributeGroups` is
 * assignable to this, so callers just hand over the groups they already render.
 */
export interface AttributeOwner {
  currentClassInstance: ClassInstance | null;
  currentPortInstance: PortInstance | null;
  currentRelationclassInstance: RelationclassInstance | null;
  /** Set instead of the three above for an attribute of the open scene instance. */
  currentSceneInstance: SceneInstance | null;
}

/**
 * Handles an edited attribute value: normalise it, refresh the vizrep, run any hybrid
 * algorithm it affects, propagate it to collaborators, and mark the scene dirty so the
 * auto-save loop patches it.
 *
 * The vizrep refresh is requested over the bus rather than by calling
 * vizrep-update-checker, which keeps this view out of the engine's import graph. That
 * makes it fire-and-forget, so it runs CONCURRENTLY with the hybrid-algorithms call
 * below. The hybrid algorithms that draw use their own private GraphicContext precisely
 * so that overlap is safe (see engine/hybrid-algorithms/objectspace-algorithms.ts).
 *
 * Scene-owned attributes take the same path: they broadcast as a `scene_attribute_value`
 * change and refresh the vizrep like any other, since vizrep-update-checker resolves them
 * through `assigned_uuid_scene_instance` to the scene type's geometry. Only the hybrid
 * algorithms do not apply, since they dispatch on a class or a port.
 */
export async function applyFieldChange(attributeInstance: AttributeInstance, owner: AttributeOwner): Promise<void> {
  const session = sharedDocService.forTab(globalObject.selectedTab);

  // Skip field changes that are being applied from a remote Yjs update
  if (session?.applyingRemote) return;

  //update attribute value
  // `?? ""` because the value column is nullable: an attribute instance the server sends
  // with a null value would otherwise throw the same "Cannot read properties of null
  // (reading 'toString')" on the first edit. Unchanged for every non-null value.
  attributeInstance.value = (attributeInstance.value ?? "").toString();

  eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);

  // Some attribute changes drive a hybrid algorithm (an ObjectSpace mesh swap, say).
  if (owner.currentClassInstance) {
    await hybridAlgorithmsService.checkHybridAlgorithms(null, [owner.currentClassInstance]);
  } else if (owner.currentPortInstance) {
    await hybridAlgorithmsService.checkHybridAlgorithms(null, null, [owner.currentPortInstance]);
  }

  // Propagate the new value to collaborators. Which change kind applies depends on what
  // owns the attribute; a scene's own attributes need no owner uuid, because a Y.Doc
  // holds exactly one scene.
  const value = attributeInstance.value;
  if (owner.currentClassInstance) {
    publishLocalChange({ type: "attribute_value", classInstanceUuid: owner.currentClassInstance.uuid, attributeUuid: attributeInstance.uuid, value });
  } else if (owner.currentRelationclassInstance) {
    publishLocalChange({ type: "relation_attribute_value", relationClassInstanceUuid: owner.currentRelationclassInstance.uuid, attributeUuid: attributeInstance.uuid, value });
  } else if (owner.currentSceneInstance) {
    publishLocalChange({ type: "scene_attribute_value", attributeUuid: attributeInstance.uuid, value });
  }
  markActiveSceneDirty();

  // Undo step for the edit. Keyed on the attribute instance so a slider being dragged
  // (which commits on every release) and a value re-edited straight away collapse into
  // one step, while a different field always starts a new one.
  historyService.record(`edit ${attributeInstance.name || "attribute"}`, {
    coalesceKey: `attribute:${attributeInstance.uuid}`,
  });
}
