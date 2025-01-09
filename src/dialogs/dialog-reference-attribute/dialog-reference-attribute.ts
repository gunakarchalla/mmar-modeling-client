import { HybridAlgorithmsService } from './../../resources/services/hybrid_algorithms_service';
import { StatechangeAlgorithms } from './../../resources/hybridAlgorithms/statechange_algorithms';
import { generateUUID } from 'three/src/math/MathUtils';
import { InstanceUtility } from 'resources/services/instance_utility';
import { GlobalDefinition } from "resources/global_definitions";
import { InstanceCreationHandler } from "resources/instance_creation_handler";
import { MetaUtility } from "resources/services/meta_utility";
import { AttributeInstance, Attribute, AttributeType, UUID, Class, Role, Port, SceneInstance, ClassReference, RelationClassReference, PortReference, SceneTypeReference, ClassInstance, PortInstance, RelationclassInstance, RoleInstance } from "../../../../mmar-global-data-structure";
import { EventAggregator } from "aurelia";
import { Logger } from 'resources/services/logger';
import { ExpressionUtility } from 'resources/expression_utility';

export class DialogReferenceAttribute {

    attributeInstance: AttributeInstance = null;
    referenceRoleInstance: RoleInstance = null;


    //Metainformation necessary for the view
    //gives the context
    private currentClass: Class;
    private currentPort: Port;
    private currentAttribute: Attribute;
    private currentAttributeType: AttributeType;
    private currentAttributeTypeRole: Role;

    // array for all instances in sceneTree
    private sceneInstances: SceneInstance[] = [];
    private classInstances: ClassInstance[] = [];
    private relationclassInstances: RelationclassInstance[] = [];
    private portInstances: PortInstance[] = [];

    //selectedSceneInstance from View
    private selectedSceneInstanceObject: {} = null;
    private selectedClassInstanceObject: {} = null;
    private selectedRelationclassInstanceObject: {} = null;
    private selectedPortInstanceObject: {} = null;

    // attributes for allowed classInstances, relationclassInstances, portInstances, sceneInstances
    private allowedClassInstances: { classInstance: ClassInstance, parentRole: Role }[] = [];
    private allowedRelationclassInstances: { relaionclassInstance: RelationclassInstance, parentRole: Role }[] = [];
    private allowedPortInstances: { portInstance: PortInstance, parentRole: Role }[] = [];
    private allowedSceneInstances: { sceneInstance: SceneInstance, parentRole: Role }[] = [];

    constructor(
        private golbalObjectInstance: GlobalDefinition,
        private metaUtility: MetaUtility,
        private instanceCreationHandler: InstanceCreationHandler,
        private InstanceUtility: InstanceUtility,
        private logger: Logger,
        private statechangeAlgorithms: StatechangeAlgorithms,
        private globalObjectInstance: GlobalDefinition,
        private instanceUtility: InstanceUtility,
        private hybridAlgorithmsService: HybridAlgorithmsService,
        private eventAggregator: EventAggregator,
        private expressionUtility: ExpressionUtility
    ) {

    }

    async attached() {
        this.eventAggregator.subscribe('openReferenceDialog', async payload => { await this.load(payload) });
    }

    async load(message) {
        await this.reset();
        this.attributeInstance = message.attributeInstance;
        await this.setMetaInformation();
        await this.setAllowedInstances();
    }

    //set meta information depending on current selected object (CalssInstance or PortInstance)
    async setMetaInformation() {
        const attributeUUID: UUID = this.attributeInstance.uuid_attribute;
        if (this.golbalObjectInstance.current_class_instance) {
            this.currentClass = await this.metaUtility.getMetaClass(this.golbalObjectInstance.current_class_instance.uuid_class);
        }
        if (this.golbalObjectInstance.current_port_instance) {
            this.currentPort = await this.metaUtility.getMetaPort(this.golbalObjectInstance.current_port_instance.uuid_port);
        }
        if (this.currentClass) {
            this.currentAttribute = this.currentClass.attributes.find(attribute => attribute.uuid === attributeUUID);
        }
        if (this.currentPort) {
            this.currentAttribute = this.currentPort.attributes.find(attribute => attribute.uuid === attributeUUID);
        }

        this.currentAttributeType = this.currentAttribute.attribute_type;
        this.currentAttributeTypeRole = this.currentAttributeType.role;
        this.referenceRoleInstance = this.attributeInstance.role_instance_from;

        if (this.referenceRoleInstance) {

            // If the reference role instance has a reference class instance, then get the name of the referenced class instance.
            // If the reference role instance has a reference relation class instance, then get the name of the referenced relation class instance.
            // If the reference role instance has a reference port instance, then get the name of the referenced port instance.
            // If the reference role instance has a reference scene instance, then get the name of the referenced scene instance.
            // Otherwise, set the reference role instance name to "Reference to: ?"

            if (this.referenceRoleInstance.uuid_has_reference_class_instance != undefined) {
                const referencedClassInstance = await this.InstanceUtility.getClassInstance(this.referenceRoleInstance.uuid_has_reference_class_instance);
                if (referencedClassInstance) {
                    this.referenceRoleInstance.name = await this.expressionUtility.attrvalByInst('d6632c72-89fa-4210-9d01-18e911505608', referencedClassInstance.uuid);
                    console.log('for class: ' + this.referenceRoleInstance.name);
                }
            }
            else if (this.referenceRoleInstance.uuid_has_reference_relationclass_instance != undefined) {
                const referencedRelationclassInstance = await this.InstanceUtility.getClassInstance(this.referenceRoleInstance.uuid_has_reference_relationclass_instance);
                if (referencedRelationclassInstance) {
                    this.referenceRoleInstance.name = await this.expressionUtility.attrvalByInst('d6632c72-89fa-4210-9d01-18e911505608', referencedRelationclassInstance.uuid);
                    console.log('for relationclass: ' + this.referenceRoleInstance.name);
                }
            }
            else if (this.referenceRoleInstance.uuid_has_reference_port_instance != undefined) {
                const referencedPortInstance = await this.InstanceUtility.getPortInstance(this.referenceRoleInstance.uuid_has_reference_port_instance);
                if (referencedPortInstance) {
                    this.referenceRoleInstance.name = await this.expressionUtility.attrvalByInst('d6632c72-89fa-4210-9d01-18e911505608', referencedPortInstance.uuid);
                    console.log('for port: ' + this.referenceRoleInstance.name);
                }
            }
            else if (this.referenceRoleInstance.uuid_has_reference_scene_instance != undefined) {
                const referencedSceneInstance: SceneInstance = await this.InstanceUtility.getSceneInstance(this.referenceRoleInstance.uuid_has_reference_scene_instance);
                if (referencedSceneInstance) {
                    this.referenceRoleInstance.name = referencedSceneInstance.name;
                    console.log('for scene: ' + this.referenceRoleInstance.name);
                }
            }
            else {
                this.referenceRoleInstance.name = "Reference to: ?";
            }
        }
    }

    async setAllowedSceneInstances(sceneTypeReferences: SceneTypeReference[], parentRole: Role) {
        this.sceneInstances = await this.InstanceUtility.getAllSceneInstancesFromLocal();

        //check all sceneInstances for allowed sceneTypeReferences
        for (let sceneInstance of this.sceneInstances) {
            //for each sceneTypeReference
            for (let sceneTypeReference of sceneTypeReferences) {
                //if sceneTypeReference is allowed
                if (sceneInstance.uuid_scene_type === sceneTypeReference.uuid) {
                    this.logger.log('sceneTypeReference ${sceneTypeReference.uuid} is allowed', 'done');
                    //add sceneInstance to allowedSceneInstances
                    let toPush = { sceneInstance: sceneInstance, parentRole: parentRole };
                    this.allowedSceneInstances.push(toPush);
                }
            }
        }
    }

    async setAllowedClassInstances(classReferences: ClassReference[], parentRole: Role) {
        this.classInstances = await this.InstanceUtility.getAllClassInstances();

        //check all classInstances for allowed classReferences
        for (let classInstance of this.classInstances) {
            //for each classReference
            for (let classReference of classReferences) {
                //if classReference is allowed
                if (classInstance.uuid_class === classReference.uuid) {
                    this.logger.log('classReference ${classReference.uuid} is allowed', 'done');
                    //add classInstance to allowedClassInstances
                    let toPush = { classInstance: classInstance, parentRole: parentRole };
                    this.allowedClassInstances.push(toPush);
                }
            }
        }
    }

    async setAllowedRelationclassInstances(relationclassReferences: RelationClassReference[], parentRole: Role) {
        this.relationclassInstances = await this.InstanceUtility.getAllRelationClassInstances();

        //check all relationclassInstances for allowed relationclassReferences
        for (let relationclassInstance of this.relationclassInstances) {
            //for each relationclassReference
            for (let relationclassReference of relationclassReferences) {
                //if relationclassReference is allowed
                if (relationclassInstance.uuid_relationclass === relationclassReference.uuid) {
                    this.logger.log('relationclassReference ${relationclassReference.uuid} is allowed', 'done');
                    //add relationclassInstance to allowedRelationclassInstances
                    let toPush = { relaionclassInstance: relationclassInstance, parentRole: parentRole };
                    this.allowedRelationclassInstances.push(toPush);
                }
            }
        }
    }

    async setAllowedPortInstances(portReferences: PortReference[], parentRole: Role) {
        this.portInstances = await this.InstanceUtility.getAllPortInstances();

        //check all portInstances for allowed portReferences
        for (let portInstance of this.portInstances) {
            //for each portReference
            for (let portReference of portReferences) {
                //if portReference is allowed
                if (portInstance.uuid_port === portReference.uuid) {
                    this.logger.log('portReference ${portReference.uuid} is allowed', 'done');
                    //add portInstance to allowedPortInstances
                    let toPush = { portInstance: portInstance, parentRole: parentRole };
                    this.allowedPortInstances.push(toPush);
                }
            }
        }
    }

    async setAllowedInstances() {
        //for currentAttributeTypeRole
        let role: Role = this.currentAttributeTypeRole;
        let sceneTypeReferences: SceneTypeReference[] = role.scenetype_references;
        let classReferences: ClassReference[] = role.class_references;
        let relationclassReferences: RelationClassReference[] = role.relationclass_references;
        let portReferences: PortReference[] = role.port_references;

        await this.setAllowedSceneInstances(sceneTypeReferences, role);
        await this.setAllowedClassInstances(classReferences, role);
        await this.setAllowedRelationclassInstances(relationclassReferences, role);
        await this.setAllowedPortInstances(portReferences, role);
    }
    async deleteReferenceRoleInstance() {
        const copyToLog = this.attributeInstance.role_instance_from;
        this.attributeInstance.role_instance_from = null;

        //find role in globalObjectInstance.roleInstances and delete it
        this.golbalObjectInstance.role_instances = this.golbalObjectInstance.role_instances.filter(roleInstance => roleInstance.uuid !== this.referenceRoleInstance.uuid);

        this.setMetaInformation();

        //delete attributeInstance value
        this.attributeInstance.value = '...';


        //push to log file
        this.logger.log('RoleInstance Instance ' + copyToLog.uuid + ' deleted', 'done');
    }

    async addReferenceRoleInstance(referencedInstance, parentrole: Role, instanceType: string) {

        // create the role instance
        const roleInstanceFrom = await this.instanceCreationHandler.createRoleInstance(
            generateUUID(),
            null,
            null,
            'attribute_reference',
            null,
            'name_placeholder',
            parentrole.uuid
        );

        // add the reference based on instanceType
        const referencedInstanceUUID = referencedInstance.uuid;
        if (instanceType === 'sceneInstance') {
            roleInstanceFrom.uuid_has_reference_scene_instance = referencedInstanceUUID;
        }
        else if (instanceType === 'classInstance') {
            roleInstanceFrom.uuid_has_reference_class_instance = referencedInstanceUUID;
        }
        else if (instanceType === 'relationclassInstance') {
            roleInstanceFrom.uuid_has_reference_relationclass_instance = referencedInstanceUUID;
        }
        else if (instanceType === 'portInstance') {
            roleInstanceFrom.uuid_has_reference_port_instance = referencedInstanceUUID;
        }

        // add reference...
        this.attributeInstance.role_instance_from = roleInstanceFrom;

        //refresh metadata
        await this.setMetaInformation();

        // set attributeInstance value to the role_instance_from.name
        this.attributeInstance.value = this.referenceRoleInstance.name;

        //run hybrid algorithm for Statechange -> reference
        await this.hybridAlgorithmsService.checkHybridAlgorithms(this.attributeInstance);
    }

    async onSceneInstanceSelect() {
        //console.log(this.selectedSceneInstanceObject);
    }

    async onClassInstanceSelect() {
        //console.log(this.selectedClassInstanceObject);
    }

    async onRelationclassInstanceSelect() {
        //console.log(this.selectedRelationclassInstanceObject);
    }

    async onPortInstanceSelect() {
        //console.log(this.selectedPortInstanceObject);
    }

    async close() {
        console.log('close');
    }

    getClassInstanceName(classInstance: ClassInstance) {
        //anonymous async function
        return classInstance.attribute_instance.find(attribute => attribute.uuid_attribute === 'd6632c72-89fa-4210-9d01-18e911505608').value;
    }

    //reset all variables for new load
    async reset() {
        this.attributeInstance = null;
        this.referenceRoleInstance = null;


        //Metainformation necessary for the view
        //gives the context
        this.currentClass = null;
        this.currentPort = null;
        this.currentAttribute = null;
        this.currentAttributeType = null;
        this.currentAttributeTypeRole = null;

        // array for all instances in sceneTree
        this.sceneInstances = [];
        this.classInstances = [];
        this.relationclassInstances = [];
        this.portInstances = [];


        // attributes for allowed classInstances, relationclassInstances, portInstances, sceneInstances
        this.allowedClassInstances = [];
        this.allowedRelationclassInstances = [];
        this.allowedPortInstances = [];
        this.allowedSceneInstances = [];
    }

}
