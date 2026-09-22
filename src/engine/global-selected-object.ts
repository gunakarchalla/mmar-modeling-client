import * as THREE from "three";
import type { ClassInstance, PortInstance, RelationclassInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";

/** The gds instance behind a selected mesh — a relation is a ClassInstance subtype. */
export type SelectedInstance = ClassInstance | RelationclassInstance | PortInstance;

/**
 * The selection: what the user has picked, the red box helper drawn around it, and the
 * gds instance behind it. Selection state is set here and nowhere else, so there is one
 * answer rather than several that drift apart.
 *
 * `getSelectedInstance()` is the authority on what is selected, and commands that act on
 * the selection ask it — `deletionHandler.onPressDelete` above all. Note that
 * `globalObject.current_class_instance` answers a different question: it is the vizRep
 * pipeline's "which instance am I drawing right now" scratch variable, written by every
 * draw path and left pointing at whatever was drawn last.
 *
 * Selecting also publishes the selection over the active tab's awareness so collaborators
 * can draw a presence box around the same object (`RemoteSelectionRenderer` draws it). On
 * a tab with no shared session the guard in `publishSelection` makes that a no-op.
 */
export class GlobalSelectedObject {
  public object: THREE.Mesh = new THREE.Mesh();

  /** The instance `object` stands for; null whenever nothing is selected. */
  private instance: SelectedInstance | null = null;

  private globalObjectInstance = globalObject;

  /**
   * The selected instance, or null when nothing is selected — including during the gap
   * between the mesh being picked and the instance behind it being resolved (the lookup
   * is async). Null is the safe answer there: a command that fires in that window does
   * nothing rather than acting on the previous selection.
   */
  getSelectedInstance(): SelectedInstance | null {
    return this.instance;
  }

  /**
   * Name the instance the picked mesh stands for. Called once `onSelectionMode` has
   * resolved it, which is necessarily after `setObject`.
   */
  setSelectedInstance(instance: SelectedInstance | null) {
    this.instance = instance ?? null;
  }

  getObject() {
    // Only refresh the box helper when something is actually selected: after
    // `removeObject()` (clicking empty space, say) both `this.object` and the boxHelper
    // are undefined, and a rebuild that reads the selection would otherwise dereference
    // them.
    if (this.object && this.globalObjectInstance.boxHelper) {
      this.updateSelectionBoxHelper(this.object);
    }
    return this.object;
  }

  setObject(object: THREE.Mesh) {
    // Clears the previous instance too: the new one is resolved asynchronously and
    // recorded by `setSelectedInstance`, and until it arrives nothing is selected.
    this.removeObject();
    if (this.globalObjectInstance.boxHelper != undefined) {
      this.object = object;
      this.updateSelectionBoxHelper(object);
    } else {
      this.object = object;
      this.initSelectionBoxHelper(object);
    }
    // Broadcast the selection so collaborators see a box around the same object.
    this.publishSelection(object?.uuid ?? null);
  }

  removeObject() {
    this.object = undefined as unknown as THREE.Mesh;
    this.instance = null;
    // The engine's "instance in context" pointers describe the selection while one
    // exists, so they must not outlive it: every caller of this method means nothing is
    // selected now, and a pointer left behind would be read as a stale selection.
    this.globalObjectInstance.current_class_instance = undefined as unknown as ClassInstance;
    this.globalObjectInstance.current_port_instance = undefined as unknown as PortInstance;
    this.removeSelectionBoxHelper();
    // Tell collaborators we no longer have anything selected.
    this.publishSelection(null);
  }

  /**
   * Publish the locally-selected instance UUID over the active tab's shared-session
   * awareness so other clients can render a presence box (RemoteSelectionRenderer
   * consumes this field). A no-op when the active tab is not shared.
   */
  private publishSelection(uuid: string | null) {
    const sharedDocService = this.globalObjectInstance.sharedDocServiceRef;
    if (!sharedDocService) return;
    const session = sharedDocService.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;
    session.awareness.setLocalStateField("selection", { uuid });
  }

  initSelectionBoxHelper(object: THREE.Mesh) {
    this.globalObjectInstance.boxHelper = new THREE.BoxHelper(object, "red");
    this.globalObjectInstance.scene.add(this.globalObjectInstance.boxHelper);
    this.updateSelectionBoxHelper(object);
  }
  updateSelectionBoxHelper(object: THREE.Mesh) {
    // `setFromObject` already calls `update()` internally, and `update()` is the
    // expensive half: it walks the object and every child to rebuild the bounding box.
    // Calling both did that walk twice — on every frame of a gizmo drag, since
    // `onTransformControlsPropertyChange` refreshes the box on each 'change' event.
    this.globalObjectInstance.boxHelper.setFromObject(object);
  }
  removeSelectionBoxHelper() {
    // Remove the box from whatever scene actually holds it — NOT from
    // `globalObject.scene`. A path that swaps `globalObject.scene` before clearing the
    // selection leaves the box in the previous scene; `scene.remove()` would then miss
    // it, strand it there, and null out the only reference to it — leaving a red box
    // that can never be cleared.
    this.globalObjectInstance.boxHelper?.removeFromParent();
    this.globalObjectInstance.boxHelper = undefined as unknown as THREE.BoxHelper;
  }
}

// Module singleton — one shared instance.
export const globalSelectedObject = new GlobalSelectedObject();
