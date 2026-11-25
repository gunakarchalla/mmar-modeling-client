import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import * as THREE from "three";
import { RelationclassInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalStateObject } from "@/engine/global-state-object";
import { rayHelper } from "@/engine/ray-helper";
import { mechanismUtility } from "@/resources/services/mechanism-utility";
import { coordinatesUpdater } from "@/engine/coordinates-updater";
import { remoteSelectionRenderer } from "@/resources/collaboration/remote-selection-renderer";
import { remoteCursorRenderer } from "@/resources/collaboration/remote-cursor-renderer";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";

/**
 * The render loop, driven by the renderer's animation loop.
 *
 * `animate()` renders a frame whenever something asked for one (`globalObject.render`),
 * then does the per-frame bookkeeping the scene needs: run the mechanism code strings,
 * keep remote collaborators' selection boxes and cursors attached to what they follow,
 * re-route every relation line, and write moved / rotated / resized objects back onto
 * the gds instances through the coordinates updater.
 *
 * Position, rotation and scale of every draggable object are snapshotted into flat
 * number arrays each frame and compared with the previous frame's, so the expensive
 * write-back passes only run when something actually moved.
 *
 * `setPos` is the line maths: it re-routes a relation through its bendpoints, trims
 * both ends back to the surface of the objects they point at, orients the end meshes
 * (arrow heads, diamonds) along the line, and hands the result to
 * `calculateMiddlePoint` so a middle label sits at the line's halfway point.
 */export class Animator {
  private globalObjectInstance = globalObject;
  private globalStateObject = globalStateObject;
  private rayHelper = rayHelper;
  private mechanismUtility = mechanismUtility;
  private coordinatesUpdater = coordinatesUpdater;
  private remoteSelectionRenderer = remoteSelectionRenderer;
  private remoteCursorRenderer = remoteCursorRenderer;
  private logger = logger;

  /**
   * Per-frame lookup tables for the line-routing pass, built once in `animate()` and
   * cleared again as soon as the pass is done.
   *
   * `setPos` needs, for every line, the meshes its end points and bend points name by
   * uuid and the relation instance behind the line. Resolving those by walking the
   * scene / scanning the instance list per line made the pass O(lines x scene nodes) —
   * with 80 lines over a 700-node scene that is >100k node visits every frame of a
   * drag, and it was the single largest cost in the loop. One traversal per frame,
   * shared by every line, makes it O(lines + scene nodes).
   *
   * Rebuilt each frame rather than cached across frames because objects are added and
   * removed by drawing, deletion and incoming peer updates, and a stale index would
   * route a line to a mesh that is no longer in the scene.
   */
  private frameMeshIndex: Map<string, THREE.Mesh> | null = null;
  private frameRelationIndex: Map<string, RelationclassInstance> | null = null;

  async animate() {
    if (this.globalObjectInstance.camera == this.globalObjectInstance.ARCamera) {
      this.globalObjectInstance.renderer.render(this.globalObjectInstance.scene, this.globalObjectInstance.camera);
      //hook to check mechanisms
      if (this.globalObjectInstance.runMechanism) {
        await this.mechanismUtility.executeAllMechanisms();
        this.globalObjectInstance.runMechanism = false;
      }
      this.globalObjectInstance.render = false;
    }

    if (this.globalObjectInstance.render) {
      this.globalObjectInstance.render = false;
      // Keep collaborators' selection boxes glued to the objects they move, and their
      // labels at a constant on-screen size as the local camera moves. Awareness only
      // fires when a peer acts, so neither can be driven by awareness alone.
      this.remoteSelectionRenderer.refreshBoxes();
      this.remoteCursorRenderer.refreshCursors();
      this.globalObjectInstance.renderer.render(this.globalObjectInstance.scene, this.globalObjectInstance.camera);

      if (this.globalObjectInstance.runMechanism) {
        await this.mechanismUtility.executeAllMechanisms();
        this.globalObjectInstance.runMechanism = false;
      }

      ////////////////////////////////////////
      //if normal camera is active
      ////////////////////////////////////////

      if (this.globalObjectInstance.camera == this.globalObjectInstance.normalCamera && this.globalObjectInstance.tabContext.length > 0) {
        //create array with the position of all objects
        const tempAllPositions: number[] = [];

        //create array with the rotations of all objects
        const tempAllRotations: number[] = [];

        //create array with the scales of all objects
        const tempAllScales: number[] = [];

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

          const scale = element.scale;
          tempAllScales.push(scale.x);
          tempAllScales.push(scale.y);
          tempAllScales.push(scale.z);

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
        if (
          (this.arraysMatch(tempAllPositions, this.globalObjectInstance.allPositions) == false ||
            this.globalStateObject.activeStateLine ||
            this.globalObjectInstance.objectScaled) &&
          this.globalObjectInstance.camera == this.globalObjectInstance.normalCamera
        ) {
          // Resolve every uuid the pass will look up once, up front, instead of once per
          // line (see frameMeshIndex). Cleared straight after so nothing outside the
          // pass can read a stale index.
          this.buildFrameIndexes();
          try {
            for (const element of this.globalObjectInstance.updateLinesArray) {
              if (element.userData.relObj.length > 1) {
                await this.setPos(element);
                //activate rendering
                this.globalObjectInstance.render = true;
              }
            }
          } finally {
            this.clearFrameIndexes();
          }
          //update all positions for class_instances and port_instances
          await this.coordinatesUpdater.updateCoordinates2DonClassAndPortInstance();
        }

        // Rotations (quaternion components) and scales live in a small numeric range
        // (≈ -1..1), so the coarse 0.09 position tolerance would miss real changes.
        // Use a tight tolerance so gradual rotations/scales are detected and propagated.
        if (this.arraysMatch(tempAllRotations, this.globalObjectInstance.allRotations, 1e-4) == false) {
          await this.coordinatesUpdater.updateRotationOnClassAndPortInstance();
        }

        if (this.arraysMatch(tempAllScales, this.globalObjectInstance.allScales, 1e-4) == false) {
          await this.coordinatesUpdater.updateScaleOnClassAndPortInstance();
        }

        this.globalObjectInstance.allPositions = tempAllPositions;
        this.globalObjectInstance.allRotations = tempAllRotations;
        this.globalObjectInstance.allScales = tempAllScales;

        //reset objectScaled property
        this.globalObjectInstance.objectScaled = false;
      }

      //update for orbit controls
      if (this.globalObjectInstance.camera == this.globalObjectInstance.normalCamera) this.globalObjectInstance.orbitControls.update();
    }

  }

  /**
   * Index every mesh in the scene by uuid, and every relation instance of the open tab
   * by uuid, for the line pass about to run.
   *
   * Last-one-wins on a duplicate uuid, which is what the per-line `scene.traverse`
   * this replaces did: it assigned into the same variable on every match and so kept
   * the last node in traversal order. Duplicates are real here — a line and its end
   * meshes deliberately share the relation's uuid (see persistency-handler).
   */
  private buildFrameIndexes() {
    const meshes = new Map<string, THREE.Mesh>();
    this.globalObjectInstance.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.set(child.uuid, child);
    });
    this.frameMeshIndex = meshes;

    const relations = new Map<string, RelationclassInstance>();
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    for (const instance of (tabContext?.["sceneInstance"]?.relationclasses_instances ?? []) as RelationclassInstance[]) {
      relations.set(instance.uuid, instance);
    }
    this.frameRelationIndex = relations;
  }

  private clearFrameIndexes() {
    this.frameMeshIndex = null;
    this.frameRelationIndex = null;
  }

  /**
   * The scene mesh with this uuid. Falls back to a one-off traversal when `setPos` is
   * called outside the animate() pass that builds the index (tests do this), so the
   * method keeps working standalone.
   */
  private meshByUuid(uuid: string): THREE.Mesh | undefined {
    if (this.frameMeshIndex) return this.frameMeshIndex.get(uuid);
    let found: THREE.Mesh | undefined;
    this.globalObjectInstance.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.uuid == uuid) found = child;
    });
    return found;
  }

  //check if two arrays are the same
  //tolerance is the per-element delta below which two values are treated as equal
  //(default suits scene-unit positions; rotations/scales pass a tighter value)
  arraysMatch(arr1: number[], arr2: number[], tolerance = 0.01) {
    if (arr1.length !== arr2.length) return false;
    // Element-wise, treating a delta within the tolerance as unchanged.
    return arr1.every((value, i) => Math.abs(value - arr2[i]) <= tolerance);
  }

  //must be called for all lines in animate() loop
  async setPos(line: Line2) {
    //this is the array with the coordinates of all line points. This array must be updated
    let pos: number[] = [0];

    //get class_instance of line
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    const relationclassInstances: RelationclassInstance[] = tabContext["sceneInstance"].relationclasses_instances;
    const relationclass_instance: RelationclassInstance | undefined =
      this.frameRelationIndex?.get(line.uuid) ?? relationclassInstances.find((element) => element.uuid == line.uuid);
    //get all objects in line. We take the objects, since we can then take the positions of this objects and we don't have to search for changes (we don't store positions)
    let relObjs: any;
    if (relationclass_instance && relationclass_instance.line_points) {
      relObjs = relationclass_instance.line_points;

      //get the width of the line start and end objects
      const widthStart = line.children[0].userData.boxParameter.x;
      const widthEnd = line.children[1].userData.boxParameter.x;

      //get intersection ob line and the start and end Objects
      //we draw the lines just from this point and not from/to the position of the start/end objects
      // `obj2` stays undefined when both ends name the same uuid (a self-relation). The
      // per-node if/else-if this replaces could only ever assign one of the two for a
      // given node, so it never resolved the second end either — and the guard further
      // down turns that into a skipped line rather than a ray cast from an object to
      // itself. Keeping that shape here keeps self-relations behaving as before.
      const obj1: THREE.Mesh | undefined = this.meshByUuid(relObjs[0].UUID);
      const obj2: THREE.Mesh | undefined = relObjs[1].UUID == relObjs[0].UUID ? undefined : this.meshByUuid(relObjs[1].UUID);

      // No cast: either object is undefined when the line outlived the meshes it
      // connects, and shootRayFromObject answers undefined for that — which the guard
      // below turns into a skipped frame.
      const startObjectNearestPoint: THREE.Vector3 | undefined = this.rayHelper.shootRayFromObject(obj2, obj1);
      let endObjectNearestPoint;

      //todo sometimes error, thus try -> problem not visible for user
      try {
        const fromUuid = relObjs[relObjs.length - 2].UUID;
        const toUuid = relObjs[relObjs.length - 1].UUID;
        const fromObj: THREE.Mesh | undefined = this.meshByUuid(fromUuid);
        const toObj: THREE.Mesh | undefined = toUuid == fromUuid ? undefined : this.meshByUuid(toUuid);

        endObjectNearestPoint = this.rayHelper.shootRayFromObject(fromObj, toObj);
      } catch (error) {
        // Happens when the line's endpoint objects cannot be raycast against each other
        // (e.g. an unusual orientation). The frame is skipped rather than failed.
        this.logger.log("could not resolve the line's end point: " + describeError(error), "close");
      }

      //if we have a array for the line-pos, the start- and the end point
      if (pos && endObjectNearestPoint && startObjectNearestPoint) {
        //set pos to length of all objects * 3
        pos = [];
        let index = 0;
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
            const bendPoint = dragObjects.find((object) => object.uuid == bendPointUUID);
            if (
              bendPoint &&
              (relObjs[i].Point.x != bendPoint.position.x || relObjs[i].Point.y != bendPoint.position.y || relObjs[i].Point.z != bendPoint.position.z)
            ) {
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
          const inverseDirection = new THREE.Vector3().subVectors(from, to).normalize().multiplyScalar(widthStart / 2 + 0.05);
          const newPositionVector = startObjectNearestPoint.clone().add(inverseDirection);

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
          this.logger.log("error in startpoint orientation: " + describeError(error), "close");
        }

        // set pos of Endpoint of relation
        try {
          //calculate the direction to look at
          to = endObjectNearestPoint;
          const fromObject: THREE.Mesh = line.userData.relObj[line.userData.relObj.length - 1];

          //since there are objects that are children of other objects, we must get the worldPosition of each object first
          from = new THREE.Vector3(); //line.userData.relObj[relObjs.length - 1].position;
          fromObject.getWorldPosition(from);
          direction.subVectors(to, from);

          // inverse direction vector with the length of the start object width
          const inverseDirection = new THREE.Vector3().subVectors(to, from).normalize().multiplyScalar(widthEnd / 2 + 0.05);
          const newPositionVector = endObjectNearestPoint.clone().add(inverseDirection);

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
          this.logger.log("error in endpoint orientation: " + describeError(error), "close");
        }

        // Rebuilding the geometry means new buffers, a dispose of the old ones and a
        // re-upload to the GPU, so it only happens when the route actually came out
        // different from last frame's. The pass runs for EVERY line whenever anything
        // in the scene moves, and dragging one object leaves all the other lines
        // routed exactly where they were — those used to pay the full rebuild anyway.
        // `pos` is the finished route (the end-point trimming above writes into it), so
        // comparing it covers the end meshes as well as the bend points.
        const previousPositions: number[] | undefined = line.userData.linePositions;
        if (!previousPositions || !this.arraysMatch(pos, previousPositions, 0)) {
          const colors = [];
          for (let i = 0; i < pos.length / 3; i++) {
            colors.push(1, 1, 0);
          }

          //this is not super performant
          //set the updated line
          const geometry = new LineGeometry();
          geometry.setPositions(pos);
          geometry.setColors(colors);
          const oldGeometry = line.geometry;
          line.geometry = geometry;
          oldGeometry.dispose();
          line.computeLineDistances();

          line.userData.linePositions = pos.slice();

          //calculate the middle point of the line at each update of the line.
          //the function repositions the middle text of a line if there is any.
          await this.calculateMiddlePoint(line, pos);
        }

        // Outside the guard above: the geometry already holds world-space points, so a
        // scale on the line itself would distort it. The line is selectable like any
        // other object and so can be handed to the scale gizmo, and that leaves a scale
        // behind without changing the route — exactly the case the guard skips.
        line.scale.set(1, 1, 1);
      } else {
        // One of the two end points could not be resolved, so there is no line to draw.
        this.logger.log("line not updated: an end point of the relation could not be resolved", "close");
      }
    }
  }

  // This method calculates the middle point of a line. It is used in the setPos method to update the position of the line.
  async calculateMiddlePoint(line: Line2, pos: number[]) {
    //calculate middle point of the line
    // Step 1: Compute total length of the line
    let totalLength = 0;
    const segmentLengths: number[] = []; // Store individual segment lengths

    for (let i = 3; i < pos.length; i += 3) {
      const p1 = new THREE.Vector3(pos[i - 3], pos[i - 2], pos[i - 1]);
      const p2 = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);

      const segmentLength = p1.distanceTo(p2);
      segmentLengths.push(segmentLength);
      totalLength += segmentLength;
    }

    // Step 2: Find the segment where the half-length occurs
    const halfLength = totalLength / 2;
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
    const p1 = new THREE.Vector3(pos[targetIndex * 3], pos[targetIndex * 3 + 1], pos[targetIndex * 3 + 2]);
    const p2 = new THREE.Vector3(pos[targetIndex * 3 + 3], pos[targetIndex * 3 + 4], pos[targetIndex * 3 + 5]);

    const remainingDistance = halfLength - (accumulatedLength - segmentLengths[targetIndex]);
    const ratio = remainingDistance / segmentLengths[targetIndex]; // Ratio for interpolation

    const midPoint = new THREE.Vector3().lerpVectors(p1, p2, ratio);
    // add midPoint to userData to use it somewhere else
    line.userData.midPoint = midPoint;
  }
}

// Module singleton — one shared instance.
export const animator = new Animator();
