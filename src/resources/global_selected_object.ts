import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from './global_definitions';


@singleton()
export class GlobalSelectedObject {

  public object: THREE.Mesh = new THREE.Mesh();

  constructor(
    private globalObjectInstance: GlobalDefinition,
    ) {
  }

  getObject() {
    this.updateSelectionBoxHelper(this.object);
    return this.object;
  }

  setObject(object: THREE.Mesh) {
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
    this.object = undefined;
    this.removeSelectionBoxHelper();
    // Tell collaborators we no longer have anything selected.
    this.publishSelection(null);
  }

  /**
   * Publish the locally-selected instance UUID over the active tab's shared-session
   * awareness so other clients can render a presence box (see RemoteSelectionRenderer).
   * No-op when the active tab isn't part of a shared session.
   */
  private publishSelection(uuid: string | null) {
    const sharedDocService = this.globalObjectInstance.sharedDocServiceRef;
    if (!sharedDocService) return;
    const session = sharedDocService.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;
    session.awareness.setLocalStateField('selection', { uuid });
  }

  initSelectionBoxHelper(object: THREE.Mesh) {
    this.globalObjectInstance.boxHelper = new THREE.BoxHelper(object, 'red');
    this.globalObjectInstance.scene.add(this.globalObjectInstance.boxHelper);
    this.updateSelectionBoxHelper(object);
  }
  updateSelectionBoxHelper(object: THREE.Mesh) {
    this.globalObjectInstance.boxHelper.setFromObject(object);
    this.globalObjectInstance.boxHelper.update();
  }
  removeSelectionBoxHelper() {
    this.globalObjectInstance.scene.remove(this.globalObjectInstance.boxHelper);
    this.globalObjectInstance.boxHelper = undefined;
  }
}
