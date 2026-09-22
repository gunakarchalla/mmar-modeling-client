import * as THREE from "three";
import { ClassInstance, RelationclassInstance, SceneInstance } from "@gds";
import type { AttributeInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { deletionHandler } from "@/engine/deletion-handler";
import { coordinatesUpdater } from "@/engine/coordinates-updater";
import { persistencyHandler } from "./persistency-handler";
import { eventBus } from "./event-bus";
import { runExclusive } from "./draw-lock";
import { logger } from "./logger";
import { describeError } from "@/resources/util/describe-error";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";
import { applyLocalChangeToYDoc, type LocalChangeType } from "@/resources/collaboration/y-mapping";
import { useHistoryStore } from "@/resources/store/historyStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import {
  SCENE_FIELDS_KEY,
  assignInPlace,
  cloneScene,
  diffScene,
  isEmptyDelta,
  parseScene,
  serializeScene,
  touchedUuids,
  type InstanceChange,
  type Json,
  type SceneDelta,
  type SceneAttributeChange,
  type SceneFieldsChange,
} from "./scene-diff";

/**
 * historyService — undo/redo for the ACTIVE tab's SceneInstance.
 *
 * ## How a step is recorded
 *
 * Mutation sites do not describe what they changed; they just say "something happened"
 * (`eventBus.publish('historyRecord', …)` from the engine, a direct `record()` call from
 * the views). The service snapshots the scene and derives the changed UUIDs by diffing
 * against the previous entry. That is what makes coverage total: anything that ends up
 * in the SceneInstance — instance creation, deletion, transforms, attribute values,
 * table rows, the scene name, an import, an algorithm run — is picked up by the same
 * code, with no per-action inverse to write or to keep in sync.
 *
 * ## How a step is applied
 *
 * NOT by restoring the snapshot. Only the instances the recorded action touched are
 * moved back to their earlier state; everything else in the live scene is left alone
 * (see `scene-diff.ts` for why). The result is then pushed out through exactly the same
 * channels a normal edit uses:
 *
 *   - locally, by mutating the gds objects IN PLACE and re-driving the three.js scene
 *     through `persistencyHandler` / `deletionHandler` — the paths that already render
 *     a remotely-added instance or delete a locally-removed one;
 *   - to collaborators, by writing the equivalent `applyLocalChangeToYDoc` deltas, so an
 *     undo reaches every participant of a shared scene like any other local edit;
 *   - to the server, by flagging the scene dirty so the 5 s auto-save PATCHes it.
 *
 * ## Local changes only
 *
 * The stack must contain the user's own edits and nothing else, so remote UUIDs are
 * excluded when a step's touched set is derived (`remoteTouched`, fed by the
 * `remoteSceneInstanceChanged` channel that SharedDocService publishes from its Y.Doc
 * observers). A peer's edit still lands in the snapshots — it just never becomes part of
 * a step, so no undo of ours can revert it.
 */
export class HistoryService {
  /** True while an undo/redo is being applied: the mutations it makes are not new steps. */
  private applying = false;

  /**
   * UUIDs changed by collaborators since the last recorded step. Subtracted when a
   * step's touched set is derived, so an undo never reverts a peer's edit.
   */
  private remoteTouched = new Set<string>();

  constructor() {
    // Engine modules must not import this service (it reaches back into the engine, and
    // the composition root in engine/index.ts fixes their construction order), so they
    // announce steps over the bus instead. Handlers are never async: the bus does not
    // await them.
    eventBus.subscribe("historyRecord", (payload) => {
      if (payload?.afterTransformSync) {
        void this.recordAfterTransformSync(payload.label, payload).catch((error) =>
          logger.log(`History record failed: ${describeError(error)}`, "error"),
        );
        return;
      }
      this.record(payload.label, payload);
    });

    // Y.Doc observers report which instances a peer changed; those are not our steps.
    eventBus.subscribe("remoteSceneInstanceChanged", ({ instanceUuids }) => {
      for (const uuid of instanceUuids) this.remoteTouched.add(uuid);
    });

    // A reconnect swaps the tab's SceneInstance for freshly fetched server state, which
    // may have moved on without us. Every stored step refers to the object graph that
    // was just discarded, so the history restarts from the new state rather than
    // offering undos into a scene that no longer exists.
    eventBus.subscribe("sharedSceneReconnected", ({ tabIndex }) => {
      const sceneInstance = globalObject.tabContext[tabIndex]?.sceneInstance;
      if (!sceneInstance) return;
      this.initScene(sceneInstance);
      logger.log(`Undo history restarted for ${sceneInstance.name} after reconnect`, "info");
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Give a freshly opened scene its history floor (the as-opened state). */
  initScene(sceneInstance: SceneInstance | undefined | null): void {
    if (!sceneInstance?.uuid) return;
    this.remoteTouched.clear();
    useHistoryStore.getState().init(sceneInstance.uuid, serializeScene(sceneInstance));
    // Opening a scene selects its tab, so the controls follow it — but a reconnect can
    // re-init a BACKGROUND tab, and that must not steal the selection.
    if (this.activeScene()?.uuid === sceneInstance.uuid) this.setActiveScene(sceneInstance);
  }

  /** Point the undo/redo controls at the scene of the newly selected tab. */
  setActiveScene(sceneInstance: SceneInstance | undefined | null): void {
    useHistoryStore.getState().setActiveScene(sceneInstance?.uuid ?? null);
  }

  /** Forget a closed tab's history. */
  dropScene(sceneUuid: string | undefined | null): void {
    if (!sceneUuid) return;
    useHistoryStore.getState().drop(sceneUuid);
  }

  /** Drop everything (logout, full refresh). */
  reset(): void {
    this.remoteTouched.clear();
    useHistoryStore.getState().reset();
  }

  // -----------------------------------------------------------------------
  // Recording
  // -----------------------------------------------------------------------

  /**
   * Record a step for the active tab's scene. A no-op when nothing actually changed,
   * so a site may call it defensively. `coalesceKey` merges a run of edits to the same
   * thing (a slider being dragged, a cascade of deletions) into ONE undo step.
   */
  record(label: string, options?: { coalesceKey?: string | null }): void {
    if (this.applying) return;

    const scene = this.activeScene();
    if (!scene?.uuid) return;

    const store = useHistoryStore.getState();
    const history = store.histories[scene.uuid];
    if (!history) return;

    const snapshot = serializeScene(scene);
    const previous = history.entries[history.index];
    if (previous.scene === snapshot) return;

    // Derive what this step owns, then drop anything a peer changed in the meantime —
    // their edits stay in the snapshot but must never be replayed by our undo.
    const touched = touchedUuids(parseScene(previous.scene), parseScene(snapshot)).filter(
      (uuid) => !this.remoteTouched.has(uuid),
    );
    this.remoteTouched.clear();
    if (touched.length === 0) return;

    store.push(scene.uuid, {
      scene: snapshot,
      label,
      touched,
      coalesceKey: options?.coalesceKey ?? null,
    });
  }

  /**
   * Record a transform step. Object drags are written onto the gds instances by the
   * animator's `coordinatesUpdater` pass on a LATER frame, so a plain `record()` fired
   * from the mouse-up handler would snapshot the pre-drag coordinates. Running those
   * writes here first makes the snapshot current; the animator's own call then finds
   * nothing left to do (each updater compares before it writes).
   */
  async recordAfterTransformSync(label: string, options?: { coalesceKey?: string | null }): Promise<void> {
    if (this.applying) return;
    if (!this.activeScene()) return;

    await coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();
    await coordinatesUpdater.updateRotationOnClassAndPortInstance();
    await coordinatesUpdater.updateScaleOnClassAndPortInstance();
    this.record(label, options);
  }

  // -----------------------------------------------------------------------
  // Undo / redo
  // -----------------------------------------------------------------------

  /** Step the active scene one entry back. No-op at the floor of the stack. */
  async undo(): Promise<void> {
    await this.travel(-1);
  }

  /** Step the active scene one entry forward. No-op at the tip of the stack. */
  async redo(): Promise<void> {
    await this.travel(1);
  }

  /**
   * Move one step through the active scene's history. `delta` is -1 for undo, +1 for
   * redo. The step BEING reverted (undo) or re-applied (redo) is what names the
   * instances to replay: for an undo that is the entry we are leaving, for a redo the
   * entry we are moving onto.
   */
  private async travel(delta: -1 | 1): Promise<void> {
    // On the draw lane: replaying a step redraws through the shared graphic context, so
    // it must not interleave with a click or with a peer's arriving change (see
    // draw-lock). `applying` still guards re-entry — it is what stops the replay from
    // being recorded as new history — but it is a flag, not a queue.
    return runExclusive(() => this.travelExclusive(delta));
  }

  private async travelExclusive(delta: -1 | 1): Promise<void> {
    if (this.applying) return;

    const scene = this.activeScene();
    if (!scene?.uuid) return;

    const store = useHistoryStore.getState();
    const history = store.histories[scene.uuid];
    if (!history) return;

    const nextIndex = history.index + delta;
    if (nextIndex < 0 || nextIndex >= history.entries.length) return;

    const step = history.entries[delta < 0 ? history.index : nextIndex];
    const target = parseScene(history.entries[nextIndex].scene);
    const restrict = step.touched ? new Set(step.touched) : undefined;
    const sceneDelta = diffScene(cloneScene(scene), target, restrict);

    this.applying = true;
    try {
      if (!isEmptyDelta(sceneDelta)) {
        await this.applyDelta(scene, sceneDelta);
      }
      useHistoryStore.getState().setIndex(scene.uuid, nextIndex);
      // The reverted state is now the local truth and has to reach the server: without
      // this the next auto-save would PATCH the un-done state straight back.
      this.markDirty();
      logger.log(`${delta < 0 ? "Undo" : "Redo"}${step.label ? `: ${step.label}` : ""}`, "info");
    } catch (error) {
      logger.log(`${delta < 0 ? "Undo" : "Redo"} failed: ${describeError(error)}`, "error");
    } finally {
      this.applying = false;
      // Whatever the step did, it happened while `applying` suppressed recording; the
      // engine may still have pending remote UUIDs from before, which are now stale.
      this.remoteTouched.clear();
    }
  }

  // -----------------------------------------------------------------------
  // Applying a delta
  // -----------------------------------------------------------------------

  private async applyDelta(scene: SceneInstance, delta: SceneDelta): Promise<void> {
    // Relations first, then the classes they hang off: deleting a class cascades into
    // its relations, so removing the relations up front keeps the cascade a no-op and
    // the array indices honest.
    for (const removal of delta.removed.filter((entry) => entry.kind === "relation")) {
      await this.removeRelationInstance(scene, removal.uuid);
    }
    for (const removal of delta.removed.filter((entry) => entry.kind === "class")) {
      await this.removeClassInstance(scene, removal.uuid);
    }

    for (const change of delta.changed) {
      this.applyInstanceChange(scene, change);
    }

    // Classes before relations, and both before rendering: a relation's line points
    // reference bendpoint class instances by uuid, which must already be in the scene
    // (the same ordering `persistencyHandler.importInstances` relies on).
    const addedClasses = delta.added.filter((entry) => entry.kind === "class");
    const addedRelations = delta.added.filter((entry) => entry.kind === "relation");

    for (const addition of addedClasses) this.reinsertClassInstance(scene, addition.instance);
    if (addedClasses.length > 0) await persistencyHandler.checkIfClassinstanceInScene();

    for (const addition of addedRelations) this.reinsertRelationInstance(scene, addition.instance);
    if (addedRelations.length > 0) await persistencyHandler.checkIfRelationclassinstanceInScene();

    if (delta.sceneFields) this.applySceneFields(scene, delta.sceneFields);

    globalObject.render = true;
    // Attribute values / names changed in place: the attribute window only re-reads the
    // selected instance whenever the revision moves.
    useSelectionStore.getState().bump();
    eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: scene.uuid });
  }

  // --- removals ---

  private async removeClassInstance(scene: SceneInstance, uuid: string): Promise<void> {
    // Re-read the index every time: an earlier removal in this same delta may have
    // cascaded into this instance (a relation takes its bendpoints with it).
    const index = scene.class_instances.findIndex((instance) => instance.uuid === uuid);
    if (index === -1) return;
    await deletionHandler.deleteClassInstance(scene.class_instances[index], index);
  }

  private async removeRelationInstance(scene: SceneInstance, uuid: string): Promise<void> {
    const index = scene.relationclasses_instances.findIndex((instance) => instance.uuid === uuid);
    if (index === -1) return;
    await deletionHandler.deleteRelationclassInstance(scene.relationclasses_instances[index], index);
  }

  // --- additions ---

  private reinsertClassInstance(scene: SceneInstance, json: Json): void {
    if (scene.class_instances.some((instance) => instance.uuid === json["uuid"])) return;
    // gds `fromJS` (gds's own class-transformer copy) is what revives the nested
    // attribute/port instances; the app's plainToInstance would leave them plain and
    // break the `instanceof` checks the expression utility makes.
    const instance = ClassInstance.fromJS(json) as unknown as ClassInstance;
    scene.class_instances.push(instance);
    this.registerAttributeInstances(instance.attribute_instance);
    for (const port of instance.port_instance ?? []) {
      this.registerAttributeInstances(port.attribute_instances);
    }
    this.broadcast({ type: "add_class_instance", classInstance: instance });
  }

  private reinsertRelationInstance(scene: SceneInstance, json: Json): void {
    if (scene.relationclasses_instances.some((instance) => instance.uuid === json["uuid"])) return;
    const instance = RelationclassInstance.fromJS(json) as unknown as RelationclassInstance;
    scene.relationclasses_instances.push(instance);
    this.registerAttributeInstances(instance.attribute_instance);
    // Roles live in a flat engine array; the deletion handler resolves connected
    // relations through it, so a restored relation has to be findable there again.
    for (const role of [instance.role_instance_from, instance.role_instance_to]) {
      if (role && !globalObject.role_instances.some((existing) => existing.uuid === role.uuid)) {
        globalObject.role_instances.push(role);
      }
    }
    this.broadcast({ type: "add_relation_class_instance", relationClassInstance: instance });
  }

  private registerAttributeInstances(attributeInstances: AttributeInstance[] | undefined): void {
    for (const attributeInstance of attributeInstances ?? []) {
      if (!globalObject.attribute_instances.some((entry) => entry.uuid === attributeInstance.uuid)) {
        globalObject.attribute_instances.push(attributeInstance);
      }
    }
  }

  // --- in-place changes ---

  private applyInstanceChange(scene: SceneInstance, change: InstanceChange): void {
    const instance =
      change.kind === "class"
        ? scene.class_instances.find((entry) => entry.uuid === change.uuid)
        : scene.relationclasses_instances.find((entry) => entry.uuid === change.uuid);
    if (!instance) return;

    assignInPlace(instance, change.target);
    this.applyTransformToScene(change.uuid, change.target);
    for (const port of (change.target["port_instance"] as Json[] | undefined) ?? []) {
      const portUuid = port?.["uuid"];
      if (typeof portUuid === "string") this.applyTransformToScene(portUuid, port);
    }

    if (change.coordinates) {
      this.broadcast({ type: "coordinates", classInstanceUuid: change.uuid, ...change.coordinates });
    }
    if (change.rotation) {
      this.broadcast({ type: "rotation", classInstanceUuid: change.uuid, ...change.rotation });
    }
    for (const key of change.customVariableKeys) {
      const customVariables = (change.target["custom_variables"] ?? {}) as Json;
      this.broadcast({
        type: "custom_variable",
        classInstanceUuid: change.uuid,
        key,
        value: customVariables[key],
      });
    }
    for (const attribute of change.attributes) {
      this.broadcast(
        change.kind === "class"
          ? {
              type: "attribute_value",
              classInstanceUuid: change.uuid,
              attributeUuid: attribute.uuid,
              value: attribute.value,
            }
          : {
              type: "relation_attribute_value",
              relationClassInstanceUuid: change.uuid,
              attributeUuid: attribute.uuid,
              value: attribute.value,
            },
      );
      // The vizRep of an instance can be driven by its attribute values, so a reverted
      // value has to re-run it (the same channel a remote value change publishes).
      const attributeInstance = globalObject.attribute_instances.find(
        (entry) => entry.uuid === attribute.uuid,
      );
      if (attributeInstance) {
        eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);
      }
    }
  }

  /**
   * Move the three.js object back onto the restored pose. `coordinates_2d` / `rotation`
   * / `custom_variables.scale` are the three transform channels the engine writes on a
   * drag, so they are the three it reads back here.
   */
  private applyTransformToScene(uuid: string, json: Json): void {
    const object = globalObject.scene.getObjectByProperty("uuid", uuid) as THREE.Object3D | undefined;
    if (!object) return;

    const coordinates = json["coordinates_2d"] as { x: number; y: number; z: number } | undefined;
    if (coordinates) object.position.set(coordinates.x, coordinates.y, coordinates.z);

    const rotation = json["rotation"] as { x: number; y: number; z: number; w: number } | undefined;
    if (rotation) object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    const scale = (json["custom_variables"] as Json | undefined)?.["scale"] as
      | { x: number; y: number; z: number }
      | undefined;
    if (scale) {
      object.scale.set(scale.x, scale.y, scale.z);
      object.userData.custom_variables = { ...(object.userData.custom_variables ?? {}), scale };
    }

    // The selection box is drawn around the object's old bounds; refresh it so it does
    // not hang in mid-air over the position the object just left.
    if (globalSelectedObject.object?.uuid === uuid) globalSelectedObject.getObject();
  }

  private applySceneFields(scene: SceneInstance, fields: SceneFieldsChange): void {
    if (fields.attributes) this.applySceneAttributes(scene, fields.attributes);
    if (fields.description !== undefined) scene.description = fields.description;
    if (fields.name === undefined) return;

    scene.name = fields.name;
    // Same three places `tabActions.renameTab` keeps in lockstep: the engine's
    // SceneInstance, the scene tree node, and the reactive tab list.
    const tree = (globalObject.sceneTree ?? []) as { children?: { uuid: string; name: string }[] }[];
    for (const sceneType of tree) {
      const node = sceneType.children?.find((child) => child.uuid === scene.uuid);
      if (node) node.name = fields.name;
    }
    const tabIndex = useTabsStore.getState().tabs.findIndex((tab) => tab.uuid === scene.uuid);
    if (tabIndex !== -1) useTabsStore.getState().renameTab(tabIndex, fields.name);
    eventBus.publish("updateSceneGroup");
  }

  /**
   * Move the scene instance's OWN attribute values back (the fields the attribute window
   * edits while nothing is selected). Same three follow-ups a class attribute's undo
   * gets in `applyInstanceChange`: write the value in place, tell collaborators, re-run
   * the vizrep in case the scene type's geometry reads the value.
   */
  private applySceneAttributes(scene: SceneInstance, attributes: SceneAttributeChange[]): void {
    for (const attribute of attributes) {
      const attributeInstance = (scene.attribute_instances ?? []).find(
        (entry) => entry.uuid === attribute.uuid,
      );
      if (!attributeInstance) continue;
      attributeInstance.value = attribute.value;
      // A table's rows and cells, put back in place; the next save replaces the stored ones.
      if (attribute.table_attributes) {
        if (!attributeInstance.table_attributes) attributeInstance.table_attributes = [];
        assignInPlace(attributeInstance.table_attributes, attribute.table_attributes);
      }

      this.broadcast({
        type: "scene_attribute_value",
        attributeUuid: attribute.uuid,
        value: attribute.value,
      });
      eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);
    }
  }

  // -----------------------------------------------------------------------
  // Plumbing
  // -----------------------------------------------------------------------

  /** The SceneInstance of the active tab, or undefined when no tab is open. */
  private activeScene(): SceneInstance | undefined {
    return globalObject.tabContext[globalObject.selectedTab]?.sceneInstance;
  }

  /** Push one delta to the collaborators of a shared tab. A no-op when not shared. */
  private broadcast(change: LocalChangeType): void {
    const session = sharedDocService.forTab(globalObject.selectedTab);
    if (!session || session.access === "read") return;
    applyLocalChangeToYDoc(session.ydoc, change, session.localOrigin);
  }

  /** Flag the reverted scene for the next auto-save tick (shared and solo tabs differ). */
  private markDirty(): void {
    if (sharedDocService.forTab(globalObject.selectedTab)) {
      globalObject.doSceneInstancePatchLocal = true;
    } else {
      globalObject.doSceneInstancePatch = true;
    }
  }
}

// Module singleton (the DI -> module-singleton recipe). Importing this module is what
// registers its bus subscriptions, so it must be imported by the app shell even if no
// component reads from it directly.
export const historyService = new HistoryService();

export { SCENE_FIELDS_KEY };
