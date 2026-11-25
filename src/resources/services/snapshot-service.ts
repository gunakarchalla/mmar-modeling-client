import { SceneInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { eventBus } from "./event-bus";

/**
 * Two independent snapshot mechanisms:
 *   - the whole engine state around a scene open, so a failed open can be rolled back
 *     rather than leaving a half-built tab behind, and
 *   - a deep clone per SceneInstance, which is what a rejected save or a discarded
 *     import reverts to.
 *
 * Clones go through gds's own `SceneInstance.fromJS`, never the app's `plainToInstance`:
 * the app and gds each bundle their own class-transformer, and the `@Type` metadata that
 * revives nested class, relation and attribute instances is registered only in gds's
 * copy — so the app's version would produce a SceneInstance whose children are plain
 * objects, breaking every `instanceof` check downstream.
 */
type SceneOpenStateSnapshot = {
  selectedTab: number;
  tabContext: typeof globalObject.tabContext;
  scene: any;
  dragObjects: any[];
  attributeInstances: any[];
  roleInstances: any[];
  relationObjects: any[];
  currentClassInstance: any;
  currentPortInstance: any;
  currentMetaPort: any;
};

export class SnapshotService {
  private sceneOpenSnapshot: SceneOpenStateSnapshot | null = null;
  private sceneInstanceSnapshots = new Map<string, SceneInstance>();

  private globalObjectInstance = globalObject;
  private eventAggregator = eventBus;

  // --- Scene-open state snapshot ---

  createSceneOpenSnapshot() {
    this.sceneOpenSnapshot = {
      selectedTab: this.globalObjectInstance.selectedTab,
      tabContext: [...this.globalObjectInstance.tabContext],
      scene: this.globalObjectInstance.scene,
      dragObjects: [...this.globalObjectInstance.dragObjects],
      attributeInstances: [...this.globalObjectInstance.attribute_instances],
      roleInstances: [...this.globalObjectInstance.role_instances],
      relationObjects: [...this.globalObjectInstance.relationObjects],
      currentClassInstance: this.globalObjectInstance.current_class_instance,
      currentPortInstance: this.globalObjectInstance.current_port_instance,
      currentMetaPort: this.globalObjectInstance.current_meta_port,
    };
  }

  clearSceneOpenSnapshot() {
    this.sceneOpenSnapshot = null;
  }

  rollbackSceneOpen() {
    if (!this.sceneOpenSnapshot) {
      return;
    }

    this.globalObjectInstance.selectedTab = this.sceneOpenSnapshot.selectedTab;
    this.globalObjectInstance.tabContext = this.sceneOpenSnapshot.tabContext;
    this.globalObjectInstance.scene = this.sceneOpenSnapshot.scene;
    this.globalObjectInstance.dragObjects = this.sceneOpenSnapshot.dragObjects;
    this.globalObjectInstance.attribute_instances = this.sceneOpenSnapshot.attributeInstances;
    this.globalObjectInstance.role_instances = this.sceneOpenSnapshot.roleInstances;
    this.globalObjectInstance.relationObjects = this.sceneOpenSnapshot.relationObjects;
    this.globalObjectInstance.current_class_instance = this.sceneOpenSnapshot.currentClassInstance;
    this.globalObjectInstance.current_port_instance = this.sceneOpenSnapshot.currentPortInstance;
    this.globalObjectInstance.current_meta_port = this.sceneOpenSnapshot.currentMetaPort;

    this.eventAggregator.publish("tabChanged");

    this.sceneOpenSnapshot = null;
  }

  // --- SceneInstance snapshots ---

  setSceneInstanceSnapshot(sceneInstance: SceneInstance) {
    this.sceneInstanceSnapshots.set(sceneInstance.uuid, this.deepCloneSceneInstance(sceneInstance));
  }

  /**
   * Whether a baseline already exists for this scene. SceneGroup uses it to snapshot a
   * scene the first time it is opened WITHOUT clobbering the baseline on a later re-open
   * (the baseline must stay the last *persisted* state — persistency-handler is what
   * refreshes it, on every successful save).
   */
  hasSceneInstanceSnapshot(uuid: string): boolean {
    return this.sceneInstanceSnapshots.has(uuid);
  }

  restoreSceneInstanceToCurrentTab(): SceneInstance | null {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    if (!tabContext?.sceneInstance) {
      return null;
    }

    const snapshot = this.sceneInstanceSnapshots.get(tabContext.sceneInstance.uuid);
    if (!snapshot) {
      return null;
    }

    // Nothing that was selected survives the rebuild below, so let go of it FIRST:
    // three.js logs "TransformControls: The attached 3D object must be a part of the
    // scene graph" on every frame for as long as the gizmo stays attached to a mesh
    // that has been removed, and the selection box helper would keep measuring it.
    this.globalObjectInstance.transformControls?.detach();
    globalSelectedObject.removeObject();

    // Remove all 3D objects from the Three.js scene and clear tracking arrays
    // so the canvas reflects the restored state after importInstances() re-draws it.
    const threeScene = tabContext.threeScene;
    if (threeScene) {
      for (const obj of tabContext.contextDragObjects) {
        threeScene.remove(obj);
      }
    }
    tabContext.contextDragObjects.length = 0;
    this.globalObjectInstance.attribute_instances.length = 0;
    this.globalObjectInstance.role_instances.length = 0;
    this.globalObjectInstance.relationObjects.length = 0;

    tabContext.sceneInstance = this.deepCloneSceneInstance(snapshot);
    return tabContext.sceneInstance;
  }

  /**
   * Drop every snapshot (logout — see `services/session-reset`). Both maps hold full
   * deep clones of SceneInstances the previous user opened, which is exactly the data a
   * new user must not be able to reach; `restoreSceneInstanceToCurrentTab` would
   * otherwise still find one keyed by uuid.
   */
  clear() {
    this.sceneOpenSnapshot = null;
    this.sceneInstanceSnapshots.clear();
  }

  private deepCloneSceneInstance(sceneInstance: SceneInstance): SceneInstance {
    const plain: object = JSON.parse(JSON.stringify(sceneInstance));
    // Use gds fromJS (gds's own class-transformer copy) so nested class/relation/
    // attribute instances are revived — the app's plainToInstance would not (see
    // the file header). This keeps `instanceof` working on the restored graph.
    return SceneInstance.fromJS(plain) as SceneInstance;
  }
}

// Module singleton — one shared instance.
export const snapshotService = new SnapshotService();
