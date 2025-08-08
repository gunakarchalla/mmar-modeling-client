import { InstanceUtility } from './services/instance_utility';
import * as THREE from "three"
import { GlobalStateObject } from './global_state_object';
import { singleton } from 'aurelia';
import { GlobalDefinition } from './global_definitions';
import { GraphicContext } from './graphic_context';
import { ClassInstance, AttributeInstance, UUID, RelationclassInstance, PortInstance, RoleInstance } from "../../../mmar-global-data-structure";
import { GlobalSelectedObject } from "./global_selected_object";
import { Logger } from './services/logger';
import { FetchHelper } from './services/fetchHelper';


@singleton()
export class DeletionHandler {



    constructor(
        private globalObjectInstance: GlobalDefinition,
        private globalStateObject: GlobalStateObject,
        private gc: GraphicContext,
        private globalSelectedObject: GlobalSelectedObject,
        private instanceUtility: InstanceUtility,
        private logger: Logger,
        private fetchHelper: FetchHelper
    ) { }

    async onPressDelete() {
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

        let index;
        let index2;
        if (this.globalObjectInstance.current_class_instance) {
            index = sceneInstance.class_instances.findIndex(instance => instance.uuid == this.globalObjectInstance.current_class_instance.uuid);
            index2 = sceneInstance.relationclasses_instances.findIndex(instance => instance.uuid == this.globalObjectInstance.current_class_instance.uuid);
        }
        if (index >= 0) {
            await this.deleteClassInstance(this.globalObjectInstance.current_class_instance, index);
        }
        else if (index2 >= 0) {
            await this.deleteRelationclassInstance(this.globalObjectInstance.current_class_instance, index2);
        }
        this.globalStateObject.setState(0);
    }


    async deleteClassInstance(classInstance: ClassInstance, index: number) {

        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        //delete connected relationclassInstances
        await this.deleteConnectedRelationclassInstances(classInstance, undefined);

        //delete connected portInstances
        await this.deleteConnectedPortInstances(classInstance);

        sceneInstance.class_instances.splice(index, 1);
        const object: THREE.Object3D = this.globalObjectInstance.scene.getObjectByProperty('uuid', classInstance.uuid);

        await this.gc.deleteObject(object as unknown as THREE.Mesh);

        //push to log file
        this.logger.log('Class Instance ' + classInstance.name + ' deleted', 'done');

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
            const indexOfObject = bendpointsonly.findIndex((linePoint: { UUID: UUID, Point: THREE.Vector3 }) => {
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
                    this.logger.log(`Bendpoint with uuid ${classInstance.uuid} deleted from DB`, 'info');
                }
                else {
                    await this.fetchHelper.classesInstancesAllDELETE2(classInstance.uuid);
                    this.logger.log(`ClassInstance with uuid ${classInstance.uuid} deleted from DB`, 'info');
                }
            } catch (error) {
                this.logger.log(`Error deleting ClassInstance with uuid ${classInstance.uuid}: ${error}`, "error");
            }
        }
        this.globalObjectInstance.doSceneInstancePatch = true;
    }

    async deleteRelationclassInstance(_relationclassInstance: ClassInstance, index: number) {
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const relationclassInstance = _relationclassInstance as RelationclassInstance;
        let role_from_instance;
        let role_to_instance;

        //find role_from_instance in gc.role_instances
        const role_from_instance_index = this.globalObjectInstance.role_instances.findIndex(role => role.uuid == relationclassInstance.role_instance_from.uuid);
        if (role_from_instance_index != -1) {
            role_from_instance = this.globalObjectInstance.role_instances[role_from_instance_index];

            //delete role_from_instance in gc.role_instances
            this.globalObjectInstance.role_instances.splice(role_from_instance_index, 1);
            //push to log file
            this.logger.log('Role Instance ' + role_from_instance.uuid + ' deleted', 'done');
        }


        //find role_to_instance in gc.role_instances
        let role_to_instance_index;
        if (relationclassInstance.role_instance_to) {
            role_to_instance_index = this.globalObjectInstance.role_instances.findIndex(role => role.uuid == relationclassInstance.role_instance_to.uuid);
        }
        if (role_to_instance_index != -1 && role_to_instance_index != undefined) {
            role_to_instance = this.globalObjectInstance.role_instances[role_to_instance_index];

            //delete role_to_instance in gc.role_instances
            this.globalObjectInstance.role_instances.splice(role_to_instance_index, 1);
            //push to log file
            this.logger.log('Role Instance ' + role_to_instance.uuid + ' deleted', 'done');
        }

        sceneInstance.relationclasses_instances.splice(index, 1);

        const object: THREE.Object3D = this.globalObjectInstance.scene.getObjectByProperty('uuid', relationclassInstance.uuid);

        //push to log file
        this.logger.log('Relationclass Instance ' + object.name + ' deleted from THREE scene', 'done');


        await this.gc.deleteObject(object as unknown as THREE.Mesh);
        //remove active state line
        this.globalStateObject.activeStateLine = undefined;

        //delete all bendpoints
        let listToDelete: { UUID: UUID, Point: THREE.Vector3 }[] = relationclassInstance.line_points as { UUID: UUID, Point: THREE.Vector3 }[];

        //cut first and last element
        listToDelete = listToDelete.slice(1, listToDelete.length - 1);

        for (const bendpoint of listToDelete) {
            await this.deleteBendpoint(bendpoint.UUID, relationclassInstance);
        }

        //remove from gc.updateLinesArray
        const lineIndex = this.globalObjectInstance.updateLinesArray.findIndex(line => line.uuid == relationclassInstance.uuid);
        this.globalObjectInstance.updateLinesArray.splice(lineIndex, 1);

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
                this.logger.log(`RelationclassInstance with uuid ${relationclassInstance.uuid} deleted from DB`, 'info');
            } catch (error) {
                this.logger.log(`Error deleting RelationclassInstance with uuid ${relationclassInstance.uuid}: ${error}`, "error");
            }
        }
        // !!! the api deletion strategy is not bullet proof. Thus, we patch the local sceneInstance again
        this.globalObjectInstance.doSceneInstancePatch = true;

    }

    async deleteAttributeInstance(attributeInstance: AttributeInstance) {
        const index = this.globalObjectInstance.attribute_instances.findIndex(instance => instance.uuid == attributeInstance.uuid);
        const instance: AttributeInstance[] = this.globalObjectInstance.attribute_instances.splice(index, 1);

        //push to log file
        this.logger.log('Attribute Instance ' + instance[0].name + ' deleted', 'done');
    }

    async deleteBendpoint(bendpointUUID: UUID, relationclassInstance: RelationclassInstance, relationsOnly?: boolean) {
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const linePoints: { UUID: UUID, Point: THREE.Vector3 }[] = relationclassInstance.line_points as { UUID: UUID, Point: THREE.Vector3 }[];

        //find linePoint in line_points array and delete it
        const linePoint = linePoints.find((linePoint) => {
            return linePoint.UUID === bendpointUUID;
        });
        const index = linePoints.indexOf(linePoint);
        relationclassInstance.line_points.splice(index, 1);


        //remove bendpoint classInstance if not specified otherwise
        if (!relationsOnly) {
            const ClassInstance = sceneInstance.class_instances.find(classInstance => classInstance.uuid == bendpointUUID);
            const classInstanceIndex = sceneInstance.class_instances.findIndex(classInstance => classInstance.uuid == bendpointUUID);
            //let sceneInstanceIndex = sceneInstance.class_instances.findIndex(classInstance => classInstance.uuid == bendpointUUID);
            await this.deleteClassInstance(ClassInstance, classInstanceIndex);
        }
    }

    async deleteConnectedRelationclassInstances(relationclassInstance: ClassInstance, portInstance: PortInstance) {
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const relationclassInstances: RelationclassInstance[] = sceneInstance.relationclasses_instances;
        const roleInstances: RoleInstance[] = this.globalObjectInstance.role_instances;

        //if classInstance
        if (relationclassInstance) {

            //find roles connected to classInstance
            const roleInstancesConnectedToClassInstance = roleInstances.filter(roleInstance => roleInstance.uuid_has_reference_class_instance == relationclassInstance.uuid);

            //find relationclassInstances connected to roleInstances for each roleInstance
            for (const roleInstances of roleInstancesConnectedToClassInstance) {
                const relationclassInstancesConnectedToRoleInstances = relationclassInstances.filter(relationclassInstance =>
                    (relationclassInstance.role_instance_from.uuid == roleInstances.uuid || relationclassInstance.role_instance_to.uuid == roleInstances.uuid));

                //delete relationclassInstances
                for (const relationclassInstance of relationclassInstancesConnectedToRoleInstances) {
                    const relationclassInstanceIndex = relationclassInstances.findIndex(instance => instance.uuid == relationclassInstance.uuid);
                    //let sceneInstanceIndex = sceneInstance.relationclasses_instances.findIndex(instance => instance.uuid == relationclassInstance.uuid);
                    await this.deleteRelationclassInstance(relationclassInstance, relationclassInstanceIndex);
                }

            }

        }

        //if portInstance
        if (portInstance) {
            //find roles connected to portInstance
            const roleInstancesConnectedToPortInstance = roleInstances.filter(roleInstance => roleInstance.uuid_has_reference_port_instance == portInstance.uuid);

            //find relationclassInstances connected to roleInstances for each roleInstance
            for (const roleInstances of roleInstancesConnectedToPortInstance) {
                const relationclassInstancesConnectedToRoleInstances = relationclassInstances.filter(relationclassInstance =>
                    (relationclassInstance.role_instance_from.uuid == roleInstances.uuid || relationclassInstance.role_instance_to.uuid == roleInstances.uuid));

                //delete relationclassInstances
                for (const relationclassInstance of relationclassInstancesConnectedToRoleInstances) {
                    const relationclassInstanceIndex = relationclassInstances.findIndex(instance => instance.uuid == relationclassInstance.uuid);
                    //let sceneInstanceIndex = sceneInstance.relationclasses_instances.findIndex(instance => instance.uuid == relationclassInstance.uuid);
                    await this.deleteRelationclassInstance(relationclassInstance, relationclassInstanceIndex);
                }

            }
        }
    }

    async deleteConnectedPortInstances(classInstance: ClassInstance) {
        const portInstances = classInstance.port_instance;

        //delete connected relationclassInstances
        for (const portInstance of portInstances) {
            await this.deleteConnectedRelationclassInstances(undefined, portInstance);

            //push to log file
            this.logger.log('Port Instance ' + portInstance.uuid + ' deleted', 'done');
        }
    }
}
