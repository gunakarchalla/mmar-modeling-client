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
  }

  removeObject() {
    this.object = undefined;
    this.removeSelectionBoxHelper();
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
