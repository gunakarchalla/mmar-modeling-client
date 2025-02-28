import { InstanceUtility } from 'resources/services/instance_utility';
import { GlobalStateObject } from './global_state_object';
import { GlobalDefinition } from './global_definitions';
import { singleton } from 'aurelia';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import * as THREE from 'three';
import { RayHelper } from './ray_helper';
import { RelationclassInstance } from '../../../mmar-global-data-structure';
import { MechanismUtility } from './services/mechanism_utility';
import { CoordinatesUpdater } from './services/coordinates_updater';

@singleton()
export class Animator {

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private globalStateObject: GlobalStateObject,
    private rayHelper: RayHelper,
    private instanceUtility: InstanceUtility,
    private mechanismUtility: MechanismUtility,
    private coordinatesUpdater: CoordinatesUpdater
  ) {

  }

  async animate() {
    //get tabcontext sceneInstance
    let tabContextSceneInstance;

    if (this.globalObjectInstance.tabContext.length > 0) {
      tabContextSceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    }

    if (this.globalObjectInstance.camera == this.globalObjectInstance.ARCamera) {
      this.globalObjectInstance.renderer.render(this.globalObjectInstance.scene, this.globalObjectInstance.camera);
      //hook to check mechanisms
      try {
        await this.mechanismUtility.executeMechanismOnInstance();
      } catch (error) { }
      this.globalObjectInstance.render = false;
    }

    if (this.globalObjectInstance.render) {
      this.globalObjectInstance.render = false;
      this.globalObjectInstance.renderer.render(this.globalObjectInstance.scene, this.globalObjectInstance.camera);
      try {
        await this.mechanismUtility.executeMechanismOnInstance();
      } catch (error) { }

      ////////////////////////////////////////
      //if normal camera is active
      ////////////////////////////////////////

      if (this.globalObjectInstance.camera == this.globalObjectInstance.normalCamera && this.globalObjectInstance.tabContext.length > 0) {
        //create array with the position of all objects
        const tempAllPositions: number[] = [];

        //create array with the rotations of all objects
        const tempAllRotations: number[] = [];

        //to check if something changed, we create an array with all positions and rotations of dragObject
        //this we can then compare to the globalObjectInstance.allPositions and globalObjectInstance.allRotations. If they do not match, we update the 
        //position and set the globalObjectInstance.allPositions to the new values
        for (const element of this.globalObjectInstance.dragObjects) {
          tempAllPositions.push(element.position.x);
          tempAllPositions.push(element.position.y);
          tempAllPositions.push(element.position.z);

          const quaternion = element.quaternion;
          tempAllRotations.push(quaternion.x);
          tempAllRotations.push(quaternion.y);
          tempAllRotations.push(quaternion.z);
          tempAllRotations.push(quaternion.w);

          if (element.userData.update) {
            //this is for the ports. If they have the userData.update function, update 
            element.userData.update();
          }
        }

        //check if the position of an object has changed
        //if yes, update positions
        //this is a performance optimization
        // text included
        //we look also at the state.activeStateLine to fire the function, if there is a line in the making
        if ((this.arraysMatch(tempAllPositions, this.globalObjectInstance.allPositions) == false || this.globalStateObject.activeStateLine || this.globalObjectInstance.objectScaled) && this.globalObjectInstance.camera == this.globalObjectInstance.normalCamera) {
          for (const element of this.globalObjectInstance.updateLinesArray) {
            if (element.userData.relObj.length > 1) {
              await this.setPos(element);
              //activate rendering
              this.globalObjectInstance.render = true;
            }

          }
          //update all positions for class_instances and port_instances
          await this.coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();
        }

        if (this.arraysMatch(tempAllRotations, this.globalObjectInstance.allRotations) == false) {
          await this.coordinatesUpdater.updateRotationOnClassAndPortInstance();
        }

        this.globalObjectInstance.allPositions = tempAllPositions;
        this.globalObjectInstance.allRotations = tempAllRotations;

        //reset objectScaled property
        this.globalObjectInstance.objectScaled = false;
      }

      //update for orbit controls
      if (this.globalObjectInstance.camera == this.globalObjectInstance.normalCamera)
        this.globalObjectInstance.orbitControls.update();
    }

    //marker animate function if camera == ARCamera
    if (this.globalObjectInstance.camera == this.globalObjectInstance.ARCamera) {
    }
  }


  //check if two arrays are the same
  arraysMatch(arr1: number[], arr2: number[]) {
    const array1 = arr1;
    const array2 = arr2;

    // if both empty, return true
    if (array1.length === 0 && array2.length === 0) {
      return true;
    }

    // Check if the arrays are the same length
    if (array1.length !== array2.length) {
      return false;
    }

    // Check if all items exist and are in the same order
    for (let i = 0; i < array1.length; i++) {
      if (array1[i] !== array2[i]) {
        // check if the difference is less than 0.01
        if (Math.abs(array1[i] - array2[i]) > 0.09) {
          return false;
        }
      }
    }
    // Otherwise, return true
    return true;
  }

  //must be called for all lines in animate() loop
  async setPos(line: Line2) {
    //this is the array with the coordinates of all line points. This array must be updated
    let pos: number[] = [0];

    //get class_instance of line
    let tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    let relationclassInstances: RelationclassInstance[] = tabContext['sceneInstance'].relationclasses_instances;
    const relationclass_instance: RelationclassInstance = relationclassInstances.find(element => element.uuid == line.uuid);
    //get all objects in line. We take the objects, since we can then take the positions of this objects and we don't have to search for changes (we don't store positions)
    let relObjs: any;
    if (relationclass_instance && relationclass_instance.line_points) {
      relObjs = relationclass_instance.line_points;

      //get the width of the line start and end objects
      let widthStart = line.children[0].userData.boxParameter.x;
      let widthEnd = line.children[1].userData.boxParameter.x;

      //get intersection ob line and the start and end Objects
      //we draw the lines just from this point and not from/to the position of the start/end objects
      let obj1: THREE.Mesh;
      let obj2: THREE.Mesh;
      this.globalObjectInstance.scene.traverse(child => {
        if (child instanceof THREE.Mesh && child.uuid == relObjs[0].UUID) {
          obj1 = child;
        }
        else if (child instanceof THREE.Mesh && child.uuid == relObjs[1].UUID) {
          obj2 = child;
        }
      });

      let startObjectNearestPoint: THREE.Vector3 = this.rayHelper.shootRayFromObject(obj2, obj1);
      let endObjectNearestPoint;

      //todo sometimes error, thus try -> problem not visible for user
      try {
        let fromObj: THREE.Mesh = undefined;
        let toObj: THREE.Mesh = undefined;
        this.globalObjectInstance.scene.traverse(child => {
          if (child instanceof THREE.Mesh && child.uuid == relObjs[relObjs.length - 2].UUID) {
            fromObj = child;
          }
          else if (child instanceof THREE.Mesh && child.uuid == relObjs[relObjs.length - 1].UUID) {
            toObj = child;
          }
        });

        endObjectNearestPoint = this.rayHelper.shootRayFromObject(fromObj, toObj);
      }
      //sometimes error, thus catch -> pobably when orientation of line is strange
      //not visible in client for the user
      catch { console.error('to do: fehler beheben'); }

      //if we have a array for the line-pos, the start- and the end point
      if (pos && endObjectNearestPoint && startObjectNearestPoint) {

        //set pos to length of all objects * 3
        pos = [];
        let index: number;
        index = 0;
        const dragObjects = this.globalObjectInstance.dragObjects;

        //for all elements in the array of "related objects" (all real points in line), the position is updated
        for (let i = 0; i < relObjs.length; i++) {
          //first object
          if (i == 0) {
            pos[index++] = startObjectNearestPoint.x;
            pos[index++] = startObjectNearestPoint.y;
            pos[index++] = startObjectNearestPoint.z;
          }

          //update all points exept last element. Thus relObjs.length -1
          if (i > 0 && i < relObjs.length - 1) {
            const bendPointUUID = relObjs[i].UUID;
            const bendPoint = dragObjects.find(object => object.uuid == bendPointUUID);
            if (bendPoint && (relObjs[i].Point.x != bendPoint.position.x || relObjs[i].Point.y != bendPoint.position.y || relObjs[i].Point.z != bendPoint.position.z)) {
              relObjs[i].Point.x = bendPoint.position.x;
              relObjs[i].Point.y = bendPoint.position.y;
              relObjs[i].Point.z = bendPoint.position.z;
            }
            pos[index++] = relObjs[i].Point.x;
            pos[index++] = relObjs[i].Point.y;
            pos[index++] = relObjs[i].Point.z;
          }
          //update last element (endpoint)
          if (i == relObjs.length - 1) {
            pos[index++] = endObjectNearestPoint.x;
            pos[index++] = endObjectNearestPoint.y;
            pos[index++] = endObjectNearestPoint.z;
          }
        }

        const colors = [];
        for (let i = 0; i < pos.length / 3; i++) {
          colors.push(1, 1, 0);
        }

        const geometry = new LineGeometry();
        const direction = new THREE.Vector3();
        let to: THREE.Vector3;
        let from: THREE.Vector3;

        //set pos of Startpoint of relation
        try {
          //calculate the direction to look at
          to = startObjectNearestPoint;
          from = new THREE.Vector3();
          line.userData.relObj[1].localToWorld(from);
          direction.subVectors(to, from);

          // inverse direction vector with the length of the start object width
          let inverseDirection = new THREE.Vector3().subVectors(from, to).normalize().multiplyScalar(widthStart / 2 + 0.05);
          let newPositionVector = startObjectNearestPoint.clone().add(inverseDirection);

          //override the position of the objectFrom with shift
          line.children[0].position.x = newPositionVector.x;
          line.children[0].position.y = newPositionVector.y;
          line.children[0].position.z = newPositionVector.z;

          //override the first position point of the line
          pos[0] = newPositionVector.x;
          pos[1] = newPositionVector.y;
          pos[2] = newPositionVector.z;

          // look at point ( from + direction * 2)
          //maybe we have to change that if objects orientation is wrong
          const mesh = line.children[0] as THREE.Mesh;

          const vec = from.clone().add(direction.subVectors(from, to).multiply(new THREE.Vector3(200, 201, 200)));
          //if the line is vertical, the object would be invisible otherwise
          //workarkound
          if (vec.x.toPrecision(1) == startObjectNearestPoint.x.toPrecision(1)) {
            vec.x = vec.x * 1.5;
          }
          mesh.lookAt(vec);
          //transform orientation
          mesh.rotateY(1.5707963);

        } catch (error) {
          console.error("error in startpoint orientation")
        }

        // set pos of Endpoint of relation
        try {
          //calculate the direction to look at
          to = endObjectNearestPoint;
          const fromObject: THREE.Mesh = line.userData.relObj[line.userData.relObj.length - 1]

          //since there are objects that are children of other objects, we must get the worldPosition of each object first
          from = new THREE.Vector3();//line.userData.relObj[relObjs.length - 1].position;
          fromObject.getWorldPosition(from);
          direction.subVectors(to, from);

          // inverse direction vector with the length of the start object width
          let inverseDirection = new THREE.Vector3().subVectors(to, from).normalize().multiplyScalar(widthEnd / 2 + 0.05);
          let newPositionVector = endObjectNearestPoint.clone().add(inverseDirection);

          //override the position of the objectTo with shift
          line.children[1].position.x = newPositionVector.x;
          line.children[1].position.y = newPositionVector.y;
          line.children[1].position.z = newPositionVector.z;

          //override the last position point of the line
          pos[pos.length - 3] = newPositionVector.x;
          pos[pos.length - 2] = newPositionVector.y;
          pos[pos.length - 1] = newPositionVector.z;

          const mesh = line.children[1] as THREE.Mesh;
          // look at point ( from + direction * 2)
          const vec = from.clone().add(direction.subVectors(to, from).multiply(new THREE.Vector3(1000, 1000, 1000)));
          //if the line is vertical, the object would be invisible otherwise
          //workarkound
          if (vec.x.toPrecision(1) == endObjectNearestPoint.x.toPrecision(1)) {
            vec.x = vec.x * 1.5;
          }
          mesh.lookAt(vec);
          //transform orientation
          mesh.rotateY(1.5707963);
        } catch (error) {
          console.error("error in endpoint orientation")
        }

        //this is not super performant
        //set the updated line
        geometry.setPositions(pos);
        geometry.setColors(colors);
        const oldGeometry = line.geometry;
        line.geometry = geometry;
        oldGeometry.dispose();
        line.computeLineDistances();
        line.scale.set(1, 1, 1);

        //calculate the middle point of the line at each update of the line.
        //the function repositions the middle text of a line if there is any. 
        await this.calculateMiddlePoint(line, pos);
      }
      else { console.error('(pos && endObjectNearestPoint && startObjectNearestPoint) == false') }
    }
  }

  // This method calculates the middle point of a line. It is used in the setPos method to update the position of the line.
  async calculateMiddlePoint(line: Line2, pos: number[]) {
    //calculate middle point of the line
        // Step 1: Compute total length of the line
        let totalLength = 0;
        let segmentLengths: number[] = []; // Store individual segment lengths

        for (let i = 3; i < pos.length; i += 3) {
          let p1 = new THREE.Vector3(pos[i - 3], pos[i - 2], pos[i - 1]);
          let p2 = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);

          let segmentLength = p1.distanceTo(p2);
          segmentLengths.push(segmentLength);
          totalLength += segmentLength;
        }

        // Step 2: Find the segment where the half-length occurs
        let halfLength = totalLength / 2;
        let accumulatedLength = 0;
        let targetIndex = 0;

        for (let i = 0; i < segmentLengths.length; i++) {
          accumulatedLength += segmentLengths[i];
          if (accumulatedLength >= halfLength) {
            targetIndex = i;
            break;
          }
        }

        // Step 3: Interpolate the exact halfway position
        let p1 = new THREE.Vector3(pos[targetIndex * 3], pos[targetIndex * 3 + 1], pos[targetIndex * 3 + 2]);
        let p2 = new THREE.Vector3(pos[targetIndex * 3 + 3], pos[targetIndex * 3 + 4], pos[targetIndex * 3 + 5]);

        let remainingDistance = halfLength - (accumulatedLength - segmentLengths[targetIndex]);
        let ratio = remainingDistance / segmentLengths[targetIndex]; // Ratio for interpolation

        let midPoint = new THREE.Vector3().lerpVectors(p1, p2, ratio);
        // add midPoint to userData to use it somewhere else
        line.userData.midPoint = midPoint;
  }

}
