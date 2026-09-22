import * as THREE from "three";
import { ClassInstance, AttributeInstance, UUID, RelationclassInstance, PortInstance, RoleInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalStateObject } from "@/engine/global-state-object";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { graphicContext } from "@/engine/graphic-context";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { backendService } from "@/resources/services/backend-service";
import { eventBus } from "@/resources/services/event-bus";
import { publishLocalChange } from "@/resources/collaboration/local-change-publisher";

/**
 * Deletes instances and everything that hangs off them.
 *
 * `onPressDelete` is the Delete-key entry point; it works out whether the selection is
 * a class or a relation instance and starts the cascade. The two delete methods recurse
 * into each other — deleting a class takes its connected relations and ports with it,
 * deleting a relation takes its bendpoints (which are themselves class instances) — so
 * the single undo step is recorded at the top, in `onPressDelete`.
 *
 * Each deletion removes the instance from the gds scene, from the THREE scene, from the
 * database (when auto-save is on), and announces it to peers and to the rest of the app.
 *
 * Every removal from a gds collection goes through `removeInstance`, by uuid, at the
 * moment of the removal. An index taken before the cascade cannot be trusted: the
 * cascade splices the very arrays it would index into (deleting a relation takes its
 * bendpoints, which are class instances, out of `class_instances`), so a stale index
 * removed a bystander and left the instance the user deleted behind. That instance was
 * already gone from the database, so the next auto-save PATCH asked the server to
 * re-create it — and re-creating an instance whose roles the database has already
 * cascaded away is the 500 that surfaced as "SceneInstance save failed".
 */export class DeletionHandler {
  private globalObjectInstance = globalObject;
  private globalStateObject = globalStateObject;
  private gc = graphicContext;
  private globalSelectedObject = globalSelectedObject;
  private instanceUtility = instanceUtility;
  private logger = logger;
  private fetchHelper = backendService;
  private eventAggregator = eventBus;

  /**
   * Delete what the user has SELECTED, and nothing when nothing is selected.
   *
   * The selection comes from `globalSelectedObject` — the thing with the red box drawn
   * around it. It used to come from `globalObject.current_class_instance`, which answers
   * a different question: that field is the vizRep pipeline's "which instance am I
   * drawing" scratch variable, so it names whatever was drawn or picked most recently
   * and stays pointing there. Delete therefore fired with nothing selected — on the box
   * just dropped in drawing mode, on an element a collaborator's change had redrawn, on
   * the object the user had deselected by clicking empty canvas.
   */
  async onPressDelete() {
    const selectedInstance = this.globalSelectedObject.getSelectedInstance();
    if (!selectedInstance) {
      this.logger.log("nothing is selected, delete skipped", "info");
      return;
    }

    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;

    const index = sceneInstance.class_instances.findIndex((instance) => instance.uuid == selectedInstance.uuid);
    const index2 = sceneInstance.relationclasses_instances.findIndex((instance) => instance.uuid == selectedInstance.uuid);

    // Neither list holds it: a selected PORT (deleted with its class, never on its own),
    // or an instance already gone from the scene. Nothing to delete, so no undo step.
    if (index < 0 && index2 < 0) {
      this.logger.log(`selected instance ${selectedInstance.uuid} is not a deletable element of the scene, delete skipped`, "info");
      return;
    }

    // The indices only decide WHICH of the two deletes to run; neither method splices
    // by the index it is handed (see removeInstance).
    if (index >= 0) {
      await this.deleteClassInstance(selectedInstance as ClassInstance, index);
    } else {
      await this.deleteRelationclassInstance(selectedInstance as RelationclassInstance, index2);
    }

    // One undo step for the whole delete, cascade included. Recording here rather than
    // inside deleteClassInstance/deleteRelationclassInstance is deliberate: those two
    // recurse into each other (a class takes its relations, a relation takes its
    // bendpoints), so per-call recording would turn one keypress into a pile of steps.
    this.eventAggregator.publish("historyRecord", { label: "delete" });

    this.globalStateObject.setState(0);
  }

  /**
   * @param _index - Ignored. The position is re-derived at removal time, because the
   * cascade below splices `class_instances` before we get to it.
   */
  async deleteClassInstance(classInstance: ClassInstance, _index?: number) {
    if (!classInstance) return;
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    //delete connected relationclassInstances
    await this.deleteConnectedRelationclassInstances(classInstance);

    //delete connected portInstances
    await this.deleteConnectedPortInstances(classInstance);

    // Nothing was removed: this instance is already gone from the scene, so it has
    // already been deleted once and must not be deleted from the database a second
    // time — that DELETE would take a re-created instance of the same uuid with it.
    if (!this.removeInstance(sceneInstance.class_instances, classInstance.uuid)) {
      this.logger.log(`ClassInstance ${classInstance.uuid} is no longer in the scene, delete skipped`, "close");
      return;
    }

    // Propagate deletion to peers before removing from the THREE scene.
    publishLocalChange({ type: "remove_class_instance", classInstanceUuid: classInstance.uuid });

    const object = this.globalObjectInstance.scene.getObjectByProperty("uuid", classInstance.uuid);

    await this.gc.deleteObject(object as unknown as THREE.Mesh);

    //push to log file
    this.logger.log("Class Instance " + classInstance.name + " deleted", "done");

    this.globalSelectedObject.removeSelectionBoxHelper();
    this.globalSelectedObject.removeObject();

    let classInstanceIsBendpoint = false;
    //if the classInstance is a single bendpoint only we have to remove it from all relationclassInstances
    //we search trough all relationclassInstances and check if the classInstance is a single bendpoint
    for (const relationclassInstance of sceneInstance.relationclasses_instances) {
      // only bendpoints without first and last object
      let bendpointsonly = relationclassInstance.line_points;
      bendpointsonly = bendpointsonly.slice(1, bendpointsonly.length - 1);

      //find if the deleted classinstance exists as bendpoint in the relationclassInstance
      const indexOfObject = (bendpointsonly as { UUID: UUID; Point: THREE.Vector3 }[]).findIndex((linePoint) => {
        return linePoint.UUID == classInstance.uuid;
      });

      if (indexOfObject != -1) {
        relationclassInstance.line_points.splice(indexOfObject + 1, 1);
        classInstanceIsBendpoint = true;
      }
    }

    //delete all attributes of the classInstance
    for (const attributeInstance of classInstance.attribute_instance) {
      await this.deleteAttributeInstance(attributeInstance);
    }

    // delete classInstance from DB if autoSave is enabled
    // if bendpoint, call deleteBendpoint instead
    if (this.globalObjectInstance.autoSave) {
      try {
        if (classInstanceIsBendpoint) {
          await this.fetchHelper.bendpointInstanceDELETE(classInstance.uuid);
          this.logger.log(`Bendpoint with uuid ${classInstance.uuid} deleted from DB`, "info");
        } else {
          await this.fetchHelper.classesInstancesAllDELETE2(classInstance.uuid);
          this.logger.log(`ClassInstance with uuid ${classInstance.uuid} deleted from DB`, "info");
        }
      } catch (error) {
        this.logger.log(`Error deleting ClassInstance with uuid ${classInstance.uuid}: ${error}`, "error");
      }
    }
    this.globalObjectInstance.doSceneInstancePatch = true;

    this.announceDeletion(sceneInstance.uuid, "class", classInstance.uuid);
  }

  /**
   * @param _index - Ignored, see `deleteClassInstance`.
   */
  async deleteRelationclassInstance(_relationclassInstance: ClassInstance, _index?: number) {
    if (!_relationclassInstance) return;
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const relationclassInstance = _relationclassInstance as RelationclassInstance;
    let role_from_instance;
    let role_to_instance;

    //find role_from_instance in gc.role_instances
    const role_from_instance_index = relationclassInstance.role_instance_from
      ? this.globalObjectInstance.role_instances.findIndex((role) => role.uuid == relationclassInstance.role_instance_from.uuid)
      : -1;
    if (role_from_instance_index != -1) {
      role_from_instance = this.globalObjectInstance.role_instances[role_from_instance_index];

      //delete role_from_instance in gc.role_instances
      this.globalObjectInstance.role_instances.splice(role_from_instance_index, 1);
      //push to log file
      this.logger.log("Role Instance " + role_from_instance.uuid + " deleted", "done");
    }

    //find role_to_instance in gc.role_instances
    let role_to_instance_index;
    if (relationclassInstance.role_instance_to) {
      role_to_instance_index = this.globalObjectInstance.role_instances.findIndex((role) => role.uuid == relationclassInstance.role_instance_to.uuid);
    }
    if (role_to_instance_index != -1 && role_to_instance_index != undefined) {
      role_to_instance = this.globalObjectInstance.role_instances[role_to_instance_index];

      //delete role_to_instance in gc.role_instances
      this.globalObjectInstance.role_instances.splice(role_to_instance_index, 1);
      //push to log file
      this.logger.log("Role Instance " + role_to_instance.uuid + " deleted", "done");
    }

    // Already gone (an earlier step of the same cascade took it): stop before the
    // database delete, exactly as deleteClassInstance does.
    if (!this.removeInstance(sceneInstance.relationclasses_instances, relationclassInstance.uuid)) {
      this.logger.log(`RelationclassInstance ${relationclassInstance.uuid} is no longer in the scene, delete skipped`, "close");
      return;
    }

    // Propagate deletion to peers.
    publishLocalChange({ type: "remove_relation_class_instance", relationClassInstanceUuid: relationclassInstance.uuid });

    const object = this.globalObjectInstance.scene.getObjectByProperty("uuid", relationclassInstance.uuid);

    //push to log file
    this.logger.log("Relationclass Instance " + (object?.name ?? relationclassInstance.name) + " deleted from THREE scene", "done");

    await this.gc.deleteObject(object as unknown as THREE.Mesh);
    //remove active state line
    this.globalStateObject.activeStateLine = undefined;

    //delete all bendpoints
    let listToDelete: { UUID: UUID; Point: THREE.Vector3 }[] = relationclassInstance.line_points as { UUID: UUID; Point: THREE.Vector3 }[];

    //cut first and last element
    listToDelete = listToDelete.slice(1, listToDelete.length - 1);

    for (const bendpoint of listToDelete) {
      await this.deleteBendpoint(bendpoint.UUID, relationclassInstance);
    }

    //remove from gc.updateLinesArray
    const lineIndex = this.globalObjectInstance.updateLinesArray.findIndex((line) => line.uuid == relationclassInstance.uuid);
    // splice(-1, 1) would drop the LAST line instead of none.
    if (lineIndex != -1) {
      this.globalObjectInstance.updateLinesArray.splice(lineIndex, 1);
    }

    //this.globalStateObject.setState(0);
    this.globalSelectedObject.removeObject();
    this.globalSelectedObject.removeSelectionBoxHelper();

    //delete all relationattributes of the classInstance
    for (const attributeInstance of relationclassInstance.attribute_instance) {
      await this.deleteAttributeInstance(attributeInstance);
    }

    // delete relationclassInstance from DB if autoSave is enabled
    if (this.globalObjectInstance.autoSave) {
      try {
        await this.fetchHelper.relationClassesInstancesAllDELETE2(relationclassInstance.uuid);
        this.logger.log(`RelationclassInstance with uuid ${relationclassInstance.uuid} deleted from DB`, "info");
      } catch (error) {
        this.logger.log(`Error deleting RelationclassInstance with uuid ${relationclassInstance.uuid}: ${error}`, "error");
      }
    }
    // !!! the api deletion strategy is not bullet proof. Thus, we patch the local sceneInstance again
    this.globalObjectInstance.doSceneInstancePatch = true;

    this.announceDeletion(sceneInstance.uuid, "relation", relationclassInstance.uuid);
  }

  /**
   * Tell the rest of the app (the SimulationWindow, for one) that the open scene lost
   * an instance. Consumers should debounce: one cascade fires this many times.
   */
  private announceDeletion(sceneInstanceUuid: string, kind: "class" | "relation", instanceUuid: string): void {
    this.eventAggregator.publish("sceneInstanceMutated", { sceneInstanceUuid, action: "deleted", kind, instanceUuid });
  }

  async deleteAttributeInstance(attributeInstance: AttributeInstance) {
    const index = this.globalObjectInstance.attribute_instances.findIndex((instance) => instance.uuid == attributeInstance.uuid);
    // Not in the flat list (an attribute of a port, or one already removed): splicing
    // at -1 would delete an unrelated attribute and then read name off nothing.
    if (index == -1) {
      this.logger.log(`Attribute Instance ${attributeInstance.uuid} not in the global list, nothing to remove`, "close");
      return;
    }
    const instance: AttributeInstance[] = this.globalObjectInstance.attribute_instances.splice(index, 1);

    //push to log file
    this.logger.log("Attribute Instance " + instance[0].name + " deleted", "done");
  }

  async deleteBendpoint(bendpointUUID: UUID, relationclassInstance: RelationclassInstance, relationsOnly?: boolean) {
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const linePoints: { UUID: UUID; Point: THREE.Vector3 }[] = relationclassInstance.line_points as { UUID: UUID; Point: THREE.Vector3 }[];

    //find linePoint in line_points array and delete it
    const index = linePoints.findIndex((linePoint) => linePoint.UUID === bendpointUUID);
    // splice(-1, 1) would drop the line's END POINT instead, detaching the relation
    // from the object it points at.
    if (index != -1) {
      relationclassInstance.line_points.splice(index, 1);
    }

    //remove bendpoint classInstance if not specified otherwise
    if (!relationsOnly) {
      const bendpointClassInstance = sceneInstance.class_instances.find((classInstance) => classInstance.uuid == bendpointUUID);
      // A bendpoint that is no longer a class instance of the scene has nothing left to
      // delete. Calling deleteClassInstance(undefined) threw on its port_instance.
      if (!bendpointClassInstance) {
        this.logger.log(`Bendpoint ${bendpointUUID} has no class instance in the scene, nothing to remove`, "close");
        return;
      }
      await this.deleteClassInstance(bendpointClassInstance);
    }
  }

  /**
   * Delete every relation attached to a class instance or to a port instance. The
   * caller passes whichever one it has; relations are found through the role instances
   * that reference it.
   */
  async deleteConnectedRelationclassInstances(classInstance?: ClassInstance, portInstance?: PortInstance) {
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const relationclassInstances: RelationclassInstance[] = sceneInstance.relationclasses_instances;
    const roleInstances: RoleInstance[] = this.globalObjectInstance.role_instances;

    const connectedRoles = roleInstances.filter((roleInstance) =>
      classInstance
        ? roleInstance.uuid_has_reference_class_instance == classInstance.uuid
        : portInstance
          ? roleInstance.uuid_has_reference_port_instance == portInstance.uuid
          : false,
    );

    for (const role of connectedRoles) {
      // A relation being drawn has no "to" role yet, and reading .uuid off it threw.
      const connectedRelations = relationclassInstances.filter(
        (relationclassInstance) =>
          relationclassInstance.role_instance_from?.uuid == role.uuid || relationclassInstance.role_instance_to?.uuid == role.uuid,
      );
      // Snapshot: deleteRelationclassInstance splices the array this list came from,
      // and it skips anything an earlier iteration already removed.
      for (const relationclassInstance of [...connectedRelations]) {
        await this.deleteRelationclassInstance(relationclassInstance);
      }
    }
  }

  /**
   * Remove the instance with `uuid` from a gds collection, found at the moment of the
   * removal rather than at an index taken earlier. Returns whether anything was
   * removed, which is how the callers tell "deleted" from "was already gone" — the
   * distinction that keeps the scene and the database in step.
   */
  private removeInstance(collection: { uuid: UUID }[], uuid: UUID): boolean {
    const index = collection.findIndex((instance) => instance.uuid == uuid);
    if (index == -1) return false;
    collection.splice(index, 1);
    return true;
  }

  async deleteConnectedPortInstances(classInstance: ClassInstance) {
    const portInstances = classInstance.port_instance;

    //delete connected relationclassInstances
    for (const portInstance of portInstances) {
      await this.deleteConnectedRelationclassInstances(undefined, portInstance);

      //push to log file
      this.logger.log("Port Instance " + portInstance.uuid + " deleted", "done");
    }
  }
}

// Module singleton — one shared instance.
export const deletionHandler = new DeletionHandler();
