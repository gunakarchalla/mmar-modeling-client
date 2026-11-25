import { AttributeInstance, ClassInstance, PortInstance, RelationclassInstance, SceneInstance, UUID } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { graphicContext } from "@/engine/graphic-context";
import { readKeys, vizRepReads, type ReadKey } from "@/engine/vizrep-reads";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { runExclusive } from "@/resources/services/draw-lock";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { enclosingTables, referenceTarget, sceneHolds } from "@/resources/util/scene-walk";

/** What an attribute's owner is: a class or relation instance, a port, or the scene. */
type InstanceKind = "class" | "port" | "scene";

/** An instance whose vizRep is re-run, with the vizRep source it is re-run with. */
interface RedrawTarget {
  instance: ClassInstance | RelationclassInstance | PortInstance | SceneInstance;
  geometry: string;
}

/**
 * Re-runs a concept's vizRep when something it drew from changes.
 *
 * The entry points are bus channels, subscribed in the constructor — which is why
 * importing this module is load-bearing:
 * - `checkForVizRepUpdate` re-evaluates every class and relation instance of the open scene;
 * - `checkForVizRepUpdateByAttributeInstance` the instances that read one attribute. A
 *   table cell counts as part of the table attribute it sits in;
 * - `checkForVizRepUpdateByRelationInstance` the instances at the two ends of a relation
 *   that was added or removed, and those that read the relations of either end;
 * - `checkForVizRepUpdateOfActiveTab` the redraws held back for the tab just shown.
 *
 * WHO reads what is recorded while each vizRep runs (see vizrep-reads): an instance is
 * redrawn when its last run read what changed, whichever instance that belongs to. An
 * instance whose vizRep has not run under tracking — none of the draw paths left it a
 * record, as for a scene type's vizRep, which nothing draws on open — falls back to the
 * old rule: it redraws when the changed attribute's NAME or uuid appears in its vizRep
 * code string. Custom variables that are not `user_locked` are dropped first so the
 * re-run recomputes them, while anything the user positioned by hand survives.
 *
 * Only the active tab is drawn into. A redraw due in a scene open in another tab is held
 * back until that tab is shown again; one for an instance no open tab holds is dropped,
 * along with what is recorded for it.
 *
 * Serialisation is the DRAW LANE (`runExclusive`), not `globalObject.readyForVizRepUpdate`
 * — that flag is only a "an update is in flight" signal for the request side, which
 * expression-utility waits on before asking for another; nothing waits on it before
 * STARTING one. It is still released in a `finally`, because leaving it set would wedge
 * every later request in a spin.
 */
export class VizrepUpdateChecker {
  private instanceUtility = instanceUtility;
  private metaUtility = metaUtility;
  private gc = graphicContext;
  private globalObjectInstance = globalObject;
  private eventAggregator = eventBus;

  /**
   * Instances whose redraw by uuid is queued on the lane and has not started yet. A
   * redraw reads the model when it starts, so one queued redraw covers every request
   * made before it starts: deleting an instance with many relations asks for its
   * neighbours once per relation.
   */
  private queuedInstanceRedraws = new Set<UUID>();

  /** Redraws held back for scenes open in a tab other than the active one, by scene uuid. */
  private heldBack = new Map<UUID, Set<UUID>>();

  constructor() {
    //event listener for the vizrep update
    //it is not ideal since we loose the synchronization between the event and the function call
    this.eventAggregator.subscribe("checkForVizRepUpdate", () => {
      void this.checkForVisualizationUpdate().catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
    });

    //event listener for the vizrep update for specific attribute instances
    this.eventAggregator.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => {
      void this.checkForVizRepUpdate(payload as AttributeInstance).catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
    });

    // a relation was added or removed: the instances it connects may draw from it
    this.eventAggregator.subscribe("checkForVizRepUpdateByRelationInstance", (payload) => {
      void this.checkForVizRepUpdateOfRelationEnds(payload).catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
    });

    // a tab was shown: catch up on what changed while it was in the background
    this.eventAggregator.subscribe("checkForVizRepUpdateOfActiveTab", () => {
      void this.checkForVizRepUpdateOfHeldBack().catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
    });

    // signed out: what is known belongs to the previous user's scenes
    this.eventAggregator.subscribe("login", (loggedIn) => {
      if (loggedIn) return;
      vizRepReads.clear();
      this.heldBack.clear();
      this.queuedInstanceRedraws.clear();
    });
  }

  /**
   * A concept without a vizRep function (`geometry` is nullable, and EVERY example
   * metamodel's SceneType has it null) has nothing to re-run — dereferencing it anyway
   * meant editing a scene-instance attribute threw
   * "Cannot read properties of null (reading 'toString')" before it could do anything.
   * Both the null geometry and a missing owner instance now short-circuit the update.
   */
  private geometryOf(concept: { geometry?: unknown } | undefined | null): string {
    const geometry = concept?.geometry;
    return geometry ? geometry.toString() : "";
  }

  /**
   * On the draw lane, because this re-runs a vizRep through the SHARED graphic context —
   * the same one a click, a peer's arriving change and every other vizRep update draw
   * into. `readyForVizRepUpdate` never provided that: nothing WAITS on it before
   * starting (it only gates expression-utility's request-side spin), so two updates
   * launched back to back from the same remote batch used to run at once, merge each
   * other's half-built meshes into one instance, and leave the other with the empty map
   * the first one's `resetInstance()` left behind — an instance that simply vanished
   * from the canvas, with nothing logged.
   */
  async checkForVizRepUpdate(attributeInstance: AttributeInstance) {
    return runExclusive(() => this.updateForAttribute(attributeInstance));
  }

  /**
   * Redraw the instances at the two ends of a relation that was just added or removed,
   * and every instance whose vizRep read the relations of either end. Nothing about the
   * ends themselves changed, so no attribute names them; the ends are redrawn whatever
   * their vizReps read. A relation from an instance back to itself (through a bendpoint)
   * redraws that instance once.
   */
  async checkForVizRepUpdateOfRelationEnds(relationclassInstance: RelationclassInstance) {
    const ends = new Set<UUID>();
    for (const role of [relationclassInstance.role_instance_from, relationclassInstance.role_instance_to]) {
      const end = referenceTarget(role);
      if (end) ends.add(end);
    }
    const readers = vizRepReads.readers([...ends].map(readKeys.relations));
    await Promise.all([...new Set([...ends, ...readers])].map((uuid) => this.checkForVizRepUpdateByInstance(uuid)));
  }

  /**
   * Redraw one class, relation or port instance, whatever its vizRep reads. One in a
   * scene open in another tab is held back for that tab; one no open tab holds is
   * forgotten. A request for an instance whose redraw is already queued joins that
   * redraw and returns at once.
   */
  async checkForVizRepUpdateByInstance(instanceUuid: UUID) {
    if (this.queuedInstanceRedraws.has(instanceUuid)) return;
    this.queuedInstanceRedraws.add(instanceUuid);
    return runExclusive(() => {
      this.queuedInstanceRedraws.delete(instanceUuid);
      return this.redrawOrHoldBack(instanceUuid);
    });
  }

  /**
   * Queue a redraw from inside the lane: handed over, never awaited — awaiting the lane
   * from inside it deadlocks — and logged if it fails, as nothing else would see it.
   */
  private handOverRedraw(instanceUuid: UUID) {
    void this.checkForVizRepUpdateByInstance(instanceUuid).catch((err) => logger.log("vizrep update failed: " + describeError(err), "error"));
  }

  /** Run the redraws held back for the scene of the active tab. */
  async checkForVizRepUpdateOfHeldBack() {
    const sceneInstance = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab]?.sceneInstance;
    const held = sceneInstance && this.heldBack.get(sceneInstance.uuid);
    if (!held) return;
    this.heldBack.delete(sceneInstance.uuid);
    await Promise.all([...held].map((uuid) => this.checkForVizRepUpdateByInstance(uuid)));
  }

  /**
   * Re-evaluate the whole open scene: every class and relation instance with a vizRep is
   * redrawn, whatever it reads.
   */
  async checkForVisualizationUpdate() {
    const sceneInstance = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab]?.sceneInstance;
    if (!sceneInstance) return;
    const instances = [...(sceneInstance.class_instances ?? []), ...(sceneInstance.relationclasses_instances ?? [])];
    await Promise.all(instances.map((instance) => this.checkForVizRepUpdateByInstance(instance.uuid)));
  }

  /**
   * The redraws one changed attribute causes: its owner's, if the owner read it, and
   * those of every other instance that read it — each of them on its own lane task.
   * Runs on the lane.
   */
  private async updateForAttribute(attributeInstance: AttributeInstance) {
    // A cell names only its table, never the instance owning the table, so its change
    // is a change of the table that instance owns.
    const tables = await this.tablesAround(attributeInstance);
    if (!tables) return;
    const changed = [attributeInstance, ...tables];
    const owned = tables.at(-1) ?? attributeInstance;
    const [ownerUuid, ownerKind] = owned.assigned_uuid_class_instance
      ? [owned.assigned_uuid_class_instance, "class" as const]
      : owned.assigned_uuid_port_instance
        ? [owned.assigned_uuid_port_instance, "port" as const]
        : [owned.assigned_uuid_scene_instance, "scene" as const];
    if (!ownerUuid) return;

    const readers = vizRepReads.readers(await this.readKeysOf(ownerUuid, changed));
    for (const reader of readers) {
      if (reader !== ownerUuid) this.handOverRedraw(reader);
    }

    if (vizRepReads.hasRecord(ownerUuid)) {
      if (readers.has(ownerUuid)) await this.redrawOrHoldBack(ownerUuid, ownerKind);
      return;
    }
    // No record of what the owner's vizRep reads: whether its source names the attribute.
    await this.redrawOrHoldBack(ownerUuid, ownerKind, (geometry) => this.namesAnyOf(geometry, changed));
  }

  /** The read keys under which `attributeInstances` of `ownerUuid` may have been read. */
  private async readKeysOf(ownerUuid: UUID, attributeInstances: AttributeInstance[]): Promise<ReadKey[]> {
    const keys: ReadKey[] = [];
    for (const attributeInstance of attributeInstances) {
      if (attributeInstance.uuid_attribute) keys.push(readKeys.attribute(ownerUuid, attributeInstance.uuid_attribute));
      // `attrvalByName` matches the attribute instance's own name; the meta attribute's
      // is the same unless one was renamed since the other was saved.
      const names = new Set([attributeInstance.name, (await this.metaUtility.getMetaAttribute(attributeInstance.uuid_attribute))?.name]);
      for (const name of names) if (name) keys.push(readKeys.attributeNamed(ownerUuid, name));
    }
    return keys;
  }

  /**
   * The tables `attributeInstance` sits in, innermost first; empty for an attribute that
   * is not a cell, undefined for a cell whose table is not in the open scene.
   */
  private async tablesAround(attributeInstance: AttributeInstance): Promise<AttributeInstance[] | undefined> {
    if (!attributeInstance.table_attribute_reference) return [];
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return undefined;
    return enclosingTables(attributeInstance, sceneInstance);
  }

  /** Whether `geometry` names any of these attributes' meta attributes, by name or uuid. */
  private async namesAnyOf(geometry: string, attributeInstances: AttributeInstance[]): Promise<boolean> {
    for (const attributeInstance of attributeInstances) {
      const metaAttributeUUID = attributeInstance.uuid_attribute;
      if (metaAttributeUUID && geometry.includes(metaAttributeUUID)) return true;
      const metaAttribute = await this.metaUtility.getMetaAttribute(metaAttributeUUID);
      if (metaAttribute?.name && geometry.includes(metaAttribute.name)) return true;
    }
    return false;
  }

  /**
   * Redraw `instanceUuid` if the active tab holds it and `wanted` agrees; hold the redraw
   * back if a tab in the background holds it; forget the instance if no open tab does.
   * Runs on the lane.
   */
  private async redrawOrHoldBack(instanceUuid: UUID, kind?: InstanceKind, wanted: (geometry: string) => Promise<boolean> = async () => true) {
    await this.redrawExclusive(async () => {
      const target = await this.targetOf(instanceUuid, kind);
      if (!target) {
        this.holdBack(instanceUuid);
        return undefined;
      }
      if (!target.geometry || !(await wanted(target.geometry))) return undefined;
      return target;
    });
  }

  private holdBack(instanceUuid: UUID) {
    const background = this.globalObjectInstance.tabContext.find(
      (tab, index) => index !== this.globalObjectInstance.selectedTab && tab?.sceneInstance && sceneHolds(tab.sceneInstance, instanceUuid),
    );
    if (!background) {
      vizRepReads.forget(instanceUuid);
      return;
    }
    let held = this.heldBack.get(background.sceneInstance.uuid);
    if (!held) this.heldBack.set(background.sceneInstance.uuid, (held = new Set()));
    held.add(instanceUuid);
  }

  /**
   * Borrow the "instance being drawn" pointers, re-run the vizRep `resolve` names (if
   * any), and give everything back.
   */
  private async redrawExclusive(resolve: () => Promise<RedrawTarget | undefined>) {
    //if not set yet lock the vizrep update until the current update is finished
    this.globalObjectInstance.readyForVizRepUpdate = false;

    // The pipeline learns WHICH instance it is drawing from `current_class_instance` /
    // `current_port_instance`, so the update below borrows those fields — and has to
    // give them back. `current_class_instance` is also what a Delete keypress acts on
    // (`deletionHandler.onPressDelete` reads it and nothing else, with no cross-check
    // against the actual selection), so an attribute a PEER edited used to leave the
    // local user's next Delete aimed at the peer's element — no timing coincidence
    // required, and no selection visible on screen to explain it.
    const previousClassInstance = this.globalObjectInstance.current_class_instance;
    const previousPortInstance = this.globalObjectInstance.current_port_instance;

    // All are released in `finally`, including on the early returns below: the flag
    // gates expression-utility's wait loop, so leaving it set wedges every later refresh
    // in a spin, and leaving a borrowed instance behind is the delete bug above.
    try {
      this.gc.current_instance_object = undefined as any;
      this.gc.resetInstance();

      const target = await resolve();
      if (!target) return;
      await this.rerun(target);
    } finally {
      // hand the borrowed instances back to whatever the local user had selected
      this.globalObjectInstance.current_class_instance = previousClassInstance;
      this.globalObjectInstance.current_port_instance = previousPortInstance;
      // unlock the vizrep update
      this.globalObjectInstance.readyForVizRepUpdate = true;
    }
  }

  /**
   * The instance with this uuid, with its vizRep: a class, relation or port instance of
   * the active tab, or a scene instance — only of `kind` when the caller knows it.
   * Undefined when there is no such instance.
   */
  private async targetOf(instanceUuid: UUID, kind?: InstanceKind): Promise<RedrawTarget | undefined> {
    if (!kind || kind === "class") {
      const classInstance = await this.instanceUtility.getClassInstance(instanceUuid);
      if (classInstance instanceof RelationclassInstance) {
        return { instance: classInstance, geometry: this.geometryOf(await this.metaUtility.getMetaRelationclass(classInstance.uuid_relationclass)) };
      }
      if (classInstance) {
        return { instance: classInstance, geometry: this.geometryOf(await this.metaUtility.getMetaClass(classInstance.uuid_class)) };
      }
    }
    if (!kind || kind === "port") {
      const portInstance = (await this.instanceUtility.getAllPortInstancesOfTabContext()).find((candidate) => candidate.uuid === instanceUuid);
      if (portInstance) {
        return { instance: portInstance, geometry: this.geometryOf(await this.metaUtility.getMetaPort(portInstance.uuid_port)) };
      }
    }
    if (!kind || kind === "scene") {
      const sceneInstance = await this.instanceUtility.getSceneInstance(instanceUuid);
      if (sceneInstance) {
        return { instance: sceneInstance, geometry: this.geometryOf(await this.metaUtility.getSceneTypeByUUID(sceneInstance.uuid_scene_type)) };
      }
    }
    return undefined;
  }

  /** Re-run `target`'s vizRep and swap the result in. Runs inside `redrawExclusive`. */
  private async rerun({ instance, geometry }: RedrawTarget) {
    // Point the pipeline at the instance, the way selecting it would: the expression API
    // reads the drawn instance's values through these fields, and labels write their
    // custom variables to whichever one is set. A port is drawn with no class set, so it
    // reads its own attributes; a class or relation with no port set, so a port the
    // user had selected does not collect the class's labels.
    if (instance instanceof PortInstance) {
      this.globalObjectInstance.current_class_instance = undefined as any;
      this.globalObjectInstance.current_port_instance = instance;
    } else if (instance instanceof ClassInstance) {
      this.globalObjectInstance.current_class_instance = instance;
      this.globalObjectInstance.current_port_instance = undefined as any;
      this.gc.current_instance_object = instance;
    }

    // get all custom_variables
    const customVariables = instance.custom_variables as any;

    // for each custom_variable (key) in the customVariables object, check if it the value user_locked is true, if not, store it in an array to be updated
    // this is necessary because we only want to update the custom variables that are not user_locked
    // e.g. a label the user dragged must not snap back to its computed position
    const customVariablesToUpdate: string[] = [];
    for (const key in customVariables) {
      if (customVariables[key].user_locked === false) {
        customVariablesToUpdate.push(key);
      }
    }

    // remove the custom variable from the object instance if not user_locked
    // the custom_variables will then be updated in the vizrep update
    for (const key of customVariablesToUpdate) {
      delete (instance.custom_variables as any)[key];
    }

    // run the vizrep function — tracked, so what it reads now is what counts next time —
    // and call the update vizrep function to update the vizrep
    await this.gc.runVizRepFunction(geometry, instance);
    await this.gc.updateVizRep(instance);
    // A redraw can change the outline relations end on. Nothing moved, so without
    // this they would keep ending at the old outline until the next drag.
    this.globalObjectInstance.objectScaled = true;
  }
}

// Module singleton — one shared instance.
export const vizrepUpdateChecker = new VizrepUpdateChecker();
