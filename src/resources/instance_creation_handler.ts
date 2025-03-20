import * as THREE from "three"
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { GlobalStateObject } from './global_state_object';
import { GlobalDefinition } from './global_definitions';
import { GraphicContext } from './graphic_context';
import { ClassInstance, Attribute, AttributeInstance, UUID, Class, Relationclass, RelationclassInstance, SceneInstance, PortInstance, RoleInstance, AttributeType, Role } from "../../../mmar-global-data-structure";
import { MetaUtility } from "./services/meta_utility";
import { InstanceUtility } from "./services/instance_utility";
import { GlobalClassObject } from "./global_class_object";
import { GlobalRelationclassObject } from './global_relationclass_object';
import { singleton } from "aurelia";
import { Logger } from "./services/logger";

@singleton()
export class InstanceCreationHandler {



    constructor(
        private globalObjectInstance: GlobalDefinition,
        private globalClassObject: GlobalClassObject,
        private globalRelationclassObject: GlobalRelationclassObject,
        private globalStateObject: GlobalStateObject,
        private metaUtility: MetaUtility,
        private instanceUtility: InstanceUtility,
        private gc: GraphicContext,
        private logger: Logger

    ) { }


    //create_uuid
    create_UUID() {
        let dt = new Date().getTime();
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (dt + Math.random() * 16) % 16 | 0;
            dt = Math.floor(dt / 16);
            return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    }


    //-------------------------------------------------
    // attribute_instance
    //-------------------------------------------------
    //createAttributeInstance(class_instance: ClassInstance, uuid_attribute: Attribute, value: any, table: boolean) {
    async createAttributeInstance(attribute: Attribute, assigned_uuid_scene_instance: string, assigned_uuid_class_instance: string, instance_value: string, assigned_uuid_port_instance?: string, is_propagated?: boolean, uuid_reference_attribute?: string, table_attributes?: AttributeInstance[], table_attribute_reference?: string, role_from?: RoleInstance) {
        const uuid = this.create_UUID();

        let class_instance: ClassInstance = null;
        let scene_instance: SceneInstance = null;
        let port_instance: PortInstance = null;
        let table_attribute_instance: AttributeInstance = null;

        //if assigned_uuid_class_instance is not null then get the class instance
        if (assigned_uuid_class_instance) {
            class_instance = await this.instanceUtility.getClassInstance(assigned_uuid_class_instance);
        }
        else if (assigned_uuid_scene_instance) {
            scene_instance = await this.instanceUtility.getSceneInstance(assigned_uuid_scene_instance);
        }
        else if (assigned_uuid_port_instance) {
            port_instance = await this.instanceUtility.getPortInstance(assigned_uuid_port_instance);
        }


        const attribute_instance: AttributeInstance = new AttributeInstance(
            uuid,
            attribute.uuid,
            assigned_uuid_scene_instance,
            assigned_uuid_class_instance,
            instance_value,
            assigned_uuid_port_instance,
            is_propagated,
            uuid_reference_attribute,
            table_attributes,
            table_attribute_reference,
            role_from
        );

        //push to log file
        this.logger.log('Attribute Instance ' + attribute_instance.value + ' created', 'done');


        //if instance is a instance for a table, create the first row of tabel attribute instances
        if (attribute.attribute_type.has_table_attribute != null) {
            let attribute_type = attribute.attribute_type;
            let has_table_attribute = attribute_type.has_table_attribute;

            for (const column of has_table_attribute) {
                let newAttributeInstance: AttributeInstance = new AttributeInstance(
                    this.create_UUID(),
                    column.attribute.uuid,
                    null,
                    null,
                    //get attribute type default value
                    attribute.default_value ? attribute.default_value : "not defined",
                    null,
                    null,
                    null,
                    null,
                    column.attribute.uuid,
                    role_from
                );
                newAttributeInstance.table_row = 0;
                attribute_instance.table_attributes.push(newAttributeInstance);
            };
        }

        // if instance is a cell in the table
        if (table_attribute_reference != null) {

        }

        //if attached to class_instance
        if (assigned_uuid_class_instance) {
            // add attribute_instance to class_instance
            const attribute_instances = class_instance.attribute_instance;
            attribute_instances.push(attribute_instance);
        }

        if (assigned_uuid_scene_instance) {
            // add attribute_instance to scene_instance
            const attribute_instances: AttributeInstance[] = scene_instance.attribute_instances;
            attribute_instances.push(attribute_instance);
        }

        if (assigned_uuid_port_instance) {
            // add attribute_instance to port_instance
            const attribute_instances = port_instance.attribute_instances;
            attribute_instances.push(attribute_instance);
        }

        // add attribute_instance to global.attribute_instance 
        this.globalObjectInstance.attribute_instances.push(attribute_instance);
        attribute_instance.name = attribute.name;

        return attribute_instance;
    }

    //-------------------------------------------------
    // bendpoint_instance
    //-------------------------------------------------
    async createBendpointInstance(x: number, y: number, z: number, geometry: Function, bendPointClassUUID: string) {

        //we round the position
        x = Math.round(x * 10) / 10;
        y = Math.round(y * 10) / 10;
        z = Math.round(z * 10) / 10;

        const bendpoint_class_instance: ClassInstance = await this.createClassInstance(
            this.create_UUID(),
            x,
            y,
            z,
            bendPointClassUUID,
            'class'
        );

        //geometry of bendpoint_class
        const stringFunction = geometry;

        //parse the string function from the metamodel to a js function
        const metaFunction = await this.metaUtility.parseMetaFunction(stringFunction.toString());

        //reset gc instance
        this.gc.resetInstance();

        //we store the metafunction in the class_instance. With that we can recalculate the objects if necessary
        bendpoint_class_instance.geometry = metaFunction;

        await this.gc.runVizRepFunction(metaFunction);
        await this.gc.drawVizRep(new THREE.Vector3(x, y, z), bendpoint_class_instance);
        this.globalObjectInstance.render = true;

        return bendpoint_class_instance;

    }

    //-------------------------------------------------
    // create_class_instance
    //-------------------------------------------------

    async createClassInstance(uuid: UUID, x: number, y: number, z: number, classUUID: string, type?: string) {

        //create uuid and class_instance
        let class_instance: ClassInstance;

        //get the metaclass for the classInstance to create
        //we must distinguish between class and relationclass
        let metaclass: Class;
        if (type == 'class' || type == 'bendpoint') {
            metaclass = await this.metaUtility.getMetaClass(classUUID) as Class;
        }
        else if (type == 'relation') {
            metaclass = await this.metaUtility.getMetaRelationclass(classUUID) as Relationclass;
        }

        //------------------------------------
        // if instance is for class: create class Instance with values from classObject
        //------------------------------------
        if (type == 'class') {
            this.logger.log(`create instance of ClassInstance for class: ${classUUID}`, 'info')
            class_instance = new ClassInstance(
                uuid,
                classUUID
            );
            class_instance.name = metaclass.name + '_' + uuid;
            class_instance.coordinates_2d = { x, y, z };

            //push to log file
            this.logger.log(`Class Instance ${class_instance.uuid} created`, 'done');
        }

        //------------------------------------
        // if instance is for a bendpoint: create class Instance with values from classObject
        //------------------------------------
        if (type == 'bendpoint') {
            this.logger.log(`create instance of ClassInstance for a bendpoint`, 'info')
            const uuid_is_bendpoint_for_relationclass = this.globalStateObject.activeStateLine;
            class_instance = new ClassInstance(
                uuid,
                this.globalClassObject.getSelectedClass() + '_' + uuid,
                metaclass.uuid
            );

            class_instance.coordinates_2d = { x, y, z };
            class_instance.uuid_relationclass_bendpoint = uuid_is_bendpoint_for_relationclass.uuid

            //push to log file
            this.logger.log(`Bendpoint with UUID ${class_instance.uuid} created`, 'done');
        }

        //add class_instance to scene_instance
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const class_instances = sceneInstance.class_instances;
        class_instances.push(class_instance);
        sceneInstance.class_instances = class_instances;

        this.logger.log(`Class Instance ${class_instance.uuid} added to scene_instance ${sceneInstance.uuid}`, 'done');

        //set current class_instance in global object
        this.globalObjectInstance.current_class_instance = class_instance;

        //for each attribute in metamodel for this class create an instance of the attribute
        for (const attribute of metaclass.attributes) {

            //if no table attribute...
            if (attribute.attribute_type.has_table_attribute.length == 0) {
                //call function to instantiate attribute and add to class_instance
                this.createAttributeInstance(
                    attribute,
                    null,
                    class_instance.uuid,
                    // if there is a default value in the attribute type, we evaluate the expression in the attribute type
                    attribute.default_value ? attribute.default_value : "not defined",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                );
            }
            else {
                this.createAttributeInstance(
                    attribute,
                    null,
                    class_instance.uuid,
                    "",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                );

            }
        };

        //for ports in metamodel for this class create an instance of the port
        for (const port of metaclass.ports) {
            //call function to instantiate port and add to class_instance
            let portInstance = await this.createPortInstance(
                this.create_UUID(),
                port.uuid,
                class_instance,
                null);
        };

        this.globalObjectInstance.current_port_instance = null;




        //return instance
        return class_instance;

    }

    //-------------------------------------------------
    // create_relationclass_instance
    //-------------------------------------------------

    async createRelationclassInstance(uuid: UUID, x: number, y: number, z: number, relationclassUUID: string, type?: string) {



        //get the metaclass for the relationclass to create
        const metaclass = await this.metaUtility.getMetaRelationclass(relationclassUUID) as Relationclass;

        //------------------------------------
        // create relationclass Instance with values from relationClassObject
        //------------------------------------

        this.logger.log('create instance of RelationClass', 'info');
        const relation_metaclass = metaclass as Relationclass;

        //create uuid and class_instance
        const relationclass_instance = new RelationclassInstance(
            uuid,
            relationclassUUID,
            undefined,
            undefined
        );

        //push to log file
        this.logger.log('Relationclass Instance ' + relationclass_instance.uuid + ' created', 'done');


        relationclass_instance.uuid_relationclass_bendpoint = relation_metaclass.bendpoint;

        relationclass_instance.name = relation_metaclass.name + '_' + uuid;
        relationclass_instance.coordinates_2d = { x, y, z };

        //add relationclass_instance to scene_instance
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        const relationclass_instances: RelationclassInstance[] = sceneInstance.relationclasses_instances;
        relationclass_instances.push(relationclass_instance);
        sceneInstance.relationclasses_instances = relationclass_instances;

        this.logger.log('Relationclass Instance ' + relationclass_instance.uuid + ' added to scene_instance ' + sceneInstance.uuid, 'done');

        // add class instance to global object arra class_instances[]
        //this.globalObjectInstance.relationclass_instances.push(relationclass_instance);

        //set current class_instance in global object
        this.globalObjectInstance.current_class_instance = relationclass_instance;

        //for each attribute in metamodel for this relationclass create an instance of the attribute
        for (const attribute of relation_metaclass.attributes) {
            //call function to instantiate attribute and add to class_instance
            if (attribute.attribute_type.has_table_attribute.length == 0) {
                //call function to instantiate attribute and add to class_instance
                this.createAttributeInstance(
                    attribute,
                    null,
                    relationclass_instance.uuid,
                    attribute.default_value ? attribute.default_value : "not defined",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                );
            }
            else {
                this.createAttributeInstance(
                    attribute,
                    null,
                    relationclass_instance.uuid,
                    "",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                );
            }

        };

        //return instance
        return relationclass_instance;
    }



    addPointToClassInstance(relationclass_instance: RelationclassInstance, object: THREE.Object3D) {
        const worldPosition: THREE.Vector3 = new THREE.Vector3();
        object.getWorldPosition(worldPosition);
        const linePoint = {
            UUID: object.uuid,
            Point: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z }
        }
        relationclass_instance.line_points.push(linePoint);
    }



    //-------------------------------------------------
    // create_line_instances
    //-------------------------------------------------
    addLinePoint(line: Line2 | null, point: THREE.Vector3, object: THREE.Mesh) {

        let bendpoint: THREE.Mesh;
        if (line) {
            // create Bendpoint and insert to scene
            this.logger.log('create Bendpoint', 'info');

            bendpoint = object;
            line.userData.relObj.pop();
            line.userData.relObj.push(bendpoint);
            line.userData.relObj.push(this.globalObjectInstance.mousePointer3d);

            // set additional State information
            // this ensures, that we know the actual Object (line) for next bendpoint
            this.globalStateObject.setActiveStateLine(line);
        }

        return bendpoint;
    }



    // finish line and connect to 2. object
    addLastLinePoint(line: Line2, lastObject: THREE.Object3D) {

        const lineGeometry = line.geometry;
        const linePointArray = lineGeometry.attributes.position.array;
        const point = lastObject.position;

        // if line is direct between two objects, add bendpoint  (not active at the moment) 
        if (linePointArray[3] === linePointArray[6]) {
            // direct connection between two objects
        }


        // this is the point (Objects) position
        line.userData.relObj.pop()
        line.userData.relObj.push(lastObject);
    }

    //-------------------------------------------------
    // port_instance
    //-------------------------------------------------
    async createPortInstance(uuid: UUID, metaPortUUID: UUID, class_instance: ClassInstance, scene_instance: SceneInstance) {

        let class_instance_uuid = undefined;
        let scene_instance_uuid = undefined;

        if (class_instance) {
            class_instance_uuid = class_instance.uuid;
        }

        if (scene_instance) {
            scene_instance_uuid = scene_instance.uuid;
        }

        const port_instance = new PortInstance(
            uuid,
            metaPortUUID,
            class_instance_uuid,
            scene_instance_uuid,
            []
        );

        this.globalObjectInstance.current_port_instance = port_instance;
        class_instance.port_instance.push(port_instance);

        //push to log file
        this.logger.log('Port Instance ' + port_instance.name + ' created', 'done');

        // get metaPort
        let meta_port = await this.metaUtility.getMetaPort(port_instance.uuid_port);

        //for each attribute in metamodel for this port create an instance of the attribute
        for (const attribute of meta_port.attributes) {
            //if no table attribute...
            if (attribute.attribute_type.has_table_attribute.length == 0) {
                //call function to instantiate attribute and add to port_instance
                this.createAttributeInstance(
                    attribute,
                    null,
                    null,
                    // if there is a default value in the attribute type, we evaluate the expression in the attribute type
                    attribute.default_value ? attribute.default_value : "not defined",
                    port_instance.uuid,
                    null,
                    null,
                    null,
                    null,
                    null
                );
            }
            else {
                this.createAttributeInstance(
                    attribute,
                    null,
                    null,
                    "",
                    port_instance.uuid,
                    null,
                    null,
                    null,
                    null,
                    null
                );
            }
        };

        return port_instance;

    }


    //-------------------------------------------------
    // role_instance
    //-------------------------------------------------
    async createRoleInstance(
        role_instance_uuid: UUID,
        uuid_has_reference_class_instance: ClassInstance,
        uuid_has_reference_port_instance: PortInstance,
        from_or_to: string,
        uuid_relationclass: UUID,
        role_instance_name?: string,
        reference_attribute_role?: UUID) {


        let selectedRelationClassUUID: string = null;
        let selectedRelationClass: Relationclass = null;
        let role_from = null;
        let role_to = null;
        //only do that if assigned to classInstance or PortInstance
        if (from_or_to == "from" || from_or_to == "to") {
            selectedRelationClassUUID = this.globalRelationclassObject.getSelectedRelationClassUUID();
            selectedRelationClass = await this.metaUtility.getMetaRelationclass(selectedRelationClassUUID);
            //for relationclasses we need to get the role from the relationclass
            role_from = selectedRelationClass.role_from;
            role_to = selectedRelationClass.role_to;
        }

        let uuid_meta_role = null;

        if (from_or_to == "from") {
            uuid_meta_role = role_from.uuid;
        } else if (from_or_to == "to") {
            uuid_meta_role = role_to.uuid;
            // if the roleInstance belongs to a reference attribute we need to get the role from the constructor --> 
        } else if (from_or_to == "attribute_reference") {
            uuid_meta_role = reference_attribute_role;
        }

        let class_instance_uuid: UUID;
        let port_instance_uuid: UUID;

        if (uuid_has_reference_class_instance) {
            class_instance_uuid = uuid_has_reference_class_instance.uuid;
        }

        if (uuid_has_reference_port_instance) {
            port_instance_uuid = uuid_has_reference_port_instance.uuid;
        }

        const role_instance: RoleInstance = new RoleInstance(
            role_instance_uuid,
            uuid_meta_role,
            uuid_relationclass,     // will be deleted
            null,                   // will be deleted
            class_instance_uuid,
            port_instance_uuid,
            null,
            null,
            null
        );

        //push to log file
        this.logger.log('Role Instance ' + role_instance.uuid + ' created', 'done');

        // add role instance to global object array role_instances[]
        this.globalObjectInstance.role_instances.push(role_instance);
        this.logger.log('Role Instance ' + role_instance.uuid + ' added to globalObject.role_instances', 'done');

        //return role_instance
        return role_instance;
    }


}
