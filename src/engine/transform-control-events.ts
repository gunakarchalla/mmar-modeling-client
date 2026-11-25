import * as THREE from "three";
import { ObjectInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { instanceUtility } from "@/resources/services/instance-utility";
import { eventBus } from "@/resources/services/event-bus";
import { publishLocalChange } from "@/resources/collaboration/local-change-publisher";
import { locallyDraggedAxes, type Axis } from "@/resources/collaboration/drag-reconciler";
import type { LocalChangeType } from "@/resources/collaboration/y-mapping";

/**
 * Reacts to the transform gizmo: `onTransformControlsPropertyChange` on every frame of
 * a drag, `onTransformControlsMouseUp` once the drag ends. `sceneInitiator` registers
 * both against the TransformControls "change" / "mouseUp" events.
 *
 * Moving or rotating a LABEL (a child mesh, not the instance mesh itself) writes the
 * new pose into the label's custom variables — on the three.js object and on the gds
 * instance — and marks them `user_locked`, so a later vizRep re-run does not snap a
 * hand-placed label back to its computed position.
 *
 * Those variables are addressed BY POSITION (`Object.keys(...)[0..6]`), which is
 * load-bearing: `graphic-context.graphic_text` writes the three pos_name_x/y/z keys
 * first and rx/ry/rz/rw last, so indices 0-2 are the position variables and 3-6 the
 * rotation ones.
 */export class TransformControlsEvents {
  private globalObjectInstance = globalObject;
  private globalSelectedObject = globalSelectedObject;
  private instanceUtility = instanceUtility;
  private eventAggregator = eventBus;

  onTransformControlsPropertyChange() {
    if (this.globalSelectedObject.object) {
      this.globalSelectedObject.getObject();
      //set scale of y to scale of x -> proportional scale
      this.globalSelectedObject.object.scale.setY(this.globalSelectedObject.object.scale.x);
      // `objectScaled` forces the animator to re-route EVERY relation line next frame,
      // which is the right thing while the user is resizing or rotating (the line ends
      // are trimmed to the object's surface, so they move even though its position does
      // not) but is pure waste otherwise. three fires 'change' for far more than a drag
      // — hovering an axis, switching mode, attaching to a new object all dispatch it —
      // and each of those used to buy a full re-route of the whole scene's lines.
      if (this.globalObjectInstance.transformControls?.dragging) {
        this.globalObjectInstance.objectScaled = true;
      }
    }

    this.globalObjectInstance.render = true;
  }

  /**
   * Fired when the user releases the gizmo, i.e. once per completed drag.
   *
   * A 'mouseUp' can arrive with NOTHING attached. The listener is registered per
   * TransformControls instance (see sceneInitiator.initTransformControls), but this
   * handler resolves the controls through `globalObject` — so an event dispatched by a
   * previous instance is read against the CURRENT one, which may have no object. A
   * freshly built one also defaults to mode "scale", which is exactly the branch that
   * dereferences `object.userData`: that is the "Cannot read properties of undefined
   * (reading 'userData')" this guard closes. No object means no drag to record.
   */
  async onTransformControlsMouseUp() {
    const controls = this.globalObjectInstance.transformControls;
    const object = controls?.object as THREE.Mesh | undefined;
    const mode = controls?.mode;

    if (!controls || !object) return;

    // READ SYNCHRONOUSLY, BEFORE THE FIRST AWAIT. three's `pointerUp` dispatches this
    // event and then immediately clears `dragging` and `axis`, so by the time any
    // continuation resumes the drag looks like it never happened.
    const draggedAxes = locallyDraggedAxes(controls, object.uuid);

    if (mode == "translate") {
      const instance = await this.findOwningInstance(object);
      // Position variables (indices 0-2) of a moved label.
      this.lockCustomVariables(object, instance, 0, [object.position.x, object.position.y, object.position.z]);
      this.reassertDraggedAxes(object, instance, draggedAxes);
    }

    // In scale mode the children must be counter-scaled to keep their absolute size.
    // Children carrying a scale of their own are left alone.
    if (mode == "scale") {
      if (!object.userData.custom_variables) {
        object.userData.custom_variables = {};
      }
      object.userData.custom_variables.scale = object.scale;
      object.traverse((child: THREE.Object3D) => {
        if (child == object) return;
        const ownScale: THREE.Vector3 | undefined = child.userData?.custom_variables?.["scale"];
        if (ownScale) {
          child.scale.set(ownScale.x, ownScale.y, ownScale.z);
        } else {
          const newScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1).divide(object.scale);
          child.scale.set(newScale.x, newScale.y, newScale.z);
        }
      });
      // Refresh the selection box around the resized object.
      this.globalSelectedObject.getObject();
    }

    if (mode == "rotate") {
      const instance = await this.findOwningInstance(object);
      // Rotation variables (indices 3-6) of a rotated label.
      this.lockCustomVariables(object, instance, 3, [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w]);
    }

    // Re-route the relation lines once more now the drag is finished. The scale branch
    // above counter-scales the object's children, and a child can be a line's end point,
    // so the route can still change after the last drag frame. This used to happen by
    // accident: three sets `dragging` and `axis` right after this handler, both of which
    // dispatch 'change', and the handler for that raised this flag unconditionally.
    // `onTransformControlsPropertyChange` now only raises it for actual drag frames, so
    // the end of the drag has to say so itself.
    this.globalObjectInstance.objectScaled = true;
    this.globalObjectInstance.render = true;

    // One undo step per completed drag (mouse-up), not per frame. `afterTransformSync`
    // matters: the moved mesh is only written back onto the gds instance by the
    // animator's coordinates-updater pass on a LATER frame, so the history service has
    // to flush those writes before it snapshots — otherwise it would record the pose the
    // object had BEFORE the drag. The mode is in the label so the log reads sensibly.
    this.eventAggregator.publish("historyRecord", {
      label: mode ?? "transform",
      afterTransformSync: true,
      coalesceKey: `transform:${object?.uuid ?? ""}:${mode ?? ""}`,
    });
  }

  /**
   * The class or port instance a dragged object belongs to: the object itself when an
   * instance mesh was dragged, otherwise its parent (the case for labels and ports).
   */
  private async findOwningInstance(object: THREE.Mesh): Promise<ObjectInstance | undefined> {
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const objectInstances: ObjectInstance[] = [...sceneInstance.class_instances, ...(await this.instanceUtility.getAllPortInstancesOfTabContext())];
    return objectInstances.find((candidate) => candidate.uuid == object.uuid) ?? objectInstances.find((candidate) => candidate.uuid == object.parent!.uuid);
  }

  /**
   * Publish, once at mouse-up, the axes this drag owned.
   *
   * While the drag runs, a peer's write to an axis the local user is authoring is folded
   * onto the gds instance but deliberately not onto the mesh (see the coordinates branch
   * in y-mapping), and the animator's coordinates pass republishes our value on the next
   * frame the mesh moves. A drag held still produces no such frame, so a peer's value
   * would otherwise survive on an axis the local user was holding: our position on
   * screen, theirs in storage. One write at mouse-up closes that window.
   *
   * Only for the instance mesh itself: dragging a label writes custom variables, not
   * coordinates.
   */
  private reassertDraggedAxes(object: THREE.Mesh, instance: ObjectInstance | undefined, draggedAxes: Set<Axis>): void {
    if (!instance || object.uuid != instance.uuid || draggedAxes.size == 0) return;

    const change: LocalChangeType = { type: "coordinates", classInstanceUuid: instance.uuid };
    for (const axis of draggedAxes) {
      instance.coordinates_2d[axis] = object.position[axis];
      change[axis] = object.position[axis];
    }
    if (publishLocalChange(change)) {
      this.globalObjectInstance.doSceneInstancePatchLocal = true;
    }
  }

  /**
   * Write `values` into the custom variables starting at `firstIndex` (see the class
   * comment on the positional addressing) on both the three.js object and the owning
   * instance, and lock them against vizRep re-runs. Only applies to a child object —
   * dragging the instance mesh itself moves the instance, not one of its variables —
   * and the change is then pushed to collaborators.
   */
  private lockCustomVariables(object: THREE.Mesh, instance: ObjectInstance | undefined, firstIndex: number, values: number[]): void {
    if (!instance || object.uuid == instance.uuid || !object.userData.custom_variables) return;

    const objectVariables = object.userData.custom_variables as any;
    const instanceVariables = instance.custom_variables as any;
    const keys = Object.keys(objectVariables).slice(firstIndex, firstIndex + values.length);

    keys.forEach((key, i) => {
      objectVariables[key]["value"] = values[i];
      objectVariables[key]["user_locked"] = true;
      instanceVariables[key]["value"] = values[i];
      instanceVariables[key]["user_locked"] = true;
    });

    this.syncCustomVariablesToYDoc(instance, keys);
  }

  /**
   * Propagate the given custom-variable keys of an object instance to collaborators
   * editing the same shared scene. No-op when the scene is not shared or when we are
   * currently applying a remote update (avoids echoing it back).
   */
  private syncCustomVariablesToYDoc(instance: ObjectInstance, keys: string[]): void {
    const customVariables = instance.custom_variables as Record<string, unknown>;
    const changes = keys
      .filter((key) => key && customVariables[key] !== undefined)
      .map((key) => ({ type: "custom_variable", classInstanceUuid: instance.uuid, key, value: customVariables[key] }) as const);
    if (publishLocalChange(...changes)) {
      this.globalObjectInstance.doSceneInstancePatchLocal = true;
    }
  }
}

// Module singleton — one shared instance.
export const transformControlsEvents = new TransformControlsEvents();
