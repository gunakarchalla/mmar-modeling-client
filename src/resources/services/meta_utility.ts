
import { singleton } from 'aurelia';
import { GlobalDefinition } from 'resources/global_definitions';
import { UUID, Class, Relationclass, Port, SceneType, Attribute } from '../../../../mmar-global-data-structure';
import { FetchHelper } from './fetchHelper';
import { plainToInstance } from 'class-transformer';

@singleton()
export class MetaUtility {


    constructor(
        private globalObjectInstance: GlobalDefinition,
        private fetchHelper: FetchHelper
    ) { }


    async getAllSceneTypesFromDB() {
        let sceneTypes: SceneType[] = [];
        await this.fetchHelper.getSceneTypes().then(async (response) => {
            // assign the fetched sceneTypes to the sceneTypes array
            sceneTypes = plainToInstance(SceneType, response.sceneTypes);
            // add empty children array to sceneTypes
            for (const sceneType of sceneTypes) {
                sceneType["children"] = [];
            }
        });
        return sceneTypes;
    }

    // Function to get current tab context scene type
    async getTabContextSceneType() {
            let tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
            let sceneType = tabContext.sceneType;
            return sceneType;
        }

    async getSceneTypeByUUID(uuid: UUID) {
            return this.globalObjectInstance.sceneTypes.find(sceneType => sceneType.uuid == uuid);
        }

    // Function to find objects of a specific type within a given object and its children
    findType(object, type, objects) {
            for(const child of object.children) {
            if (child.type === type) {
                objects.push(child);
            }
            this.findType(child, type, objects);
        };
    }

    // Function to get the meta class based on its UUID
    async getMetaClass(uuid: UUID) {
        const sceneType = await this.getTabContextSceneType();
        const class_of_uuid: Class = sceneType.classes.find(metaClass => metaClass.uuid == uuid);
        return class_of_uuid;
    }

    // Function to get the meta relation class based on its UUID
    async getMetaRelationclass(uuid: UUID) {
        const sceneType = await this.getTabContextSceneType();
        const class_of_uuid: Relationclass = sceneType.relationclasses.find(metaClass => metaClass.uuid == uuid);
        return class_of_uuid;
    }

    // Async function to get a metaPort by UUID
    async getMetaPort(uuid: UUID): Promise<Port> {

        let port_of_uuid: Port = undefined;
        let sceneType = await this.getTabContextSceneType();

        for (const metaClass of sceneType.classes) {
            // Check if class contains ports
            if (metaClass.ports) {
                // Check if class contains ports
                for (const metaPort of metaClass.ports) {
                    if (metaPort.uuid == uuid) {
                        port_of_uuid = metaPort;
                    }
                };
            }
        };

        if (!port_of_uuid) {
            // Check if sceneType contains ports
            const sceneType = await this.getTabContextSceneType();
            if (sceneType.ports) {
                for (const metaPort of sceneType.ports) {
                    if (metaPort.uuid == uuid) {
                        port_of_uuid = metaPort;
                    }
                };
            }
        }

        this.globalObjectInstance.current_meta_port = port_of_uuid;

        if (!port_of_uuid) {
            return undefined;
        } else {
            return port_of_uuid;
        }
    }

    // Function to parse a string function to a JavaScript function
    async parseMetaFunction(stringFunction: string) {
        // Define function from string
        const f = new Function('"use strict";return (' + stringFunction + ')')();
        return f;
        //return Function('"use strict";return (' + stringFunction + ')')() as Function;
    }

    //check if input is sceneType
    checkIfSceneType(toBeDetermined: any): toBeDetermined is SceneType {
        if ((toBeDetermined as SceneType).classes) {
            return true
        }
        return false
    }

    //get metaAttribute by uuid
    async getMetaAttribute(uuid: UUID) {
        let metaAttribute: Attribute = undefined;
        //search in sceneType, classes, relationclasses
        let sceneType = await this.getTabContextSceneType();
        metaAttribute = sceneType.attributes.find(attribute => attribute.uuid == uuid);
        if (!metaAttribute) {
            for (const metaClass of sceneType.classes) {
                metaAttribute = metaClass.attributes.find(attribute => attribute.uuid == uuid);
                if (metaAttribute) {
                    break;
                }
            }
        }
        if (!metaAttribute) {
            for (const metaRelationClass of sceneType.relationclasses) {
                metaAttribute = metaRelationClass.attributes.find(attribute => attribute.uuid == uuid);
                if (metaAttribute) {
                    break;
                }
            }
        }

        return metaAttribute;
    }

    // get metaAttribute by uuid from a specific class -> needed for sequence and ui-component
    async getMetaAttributeWithSequence(uuid: UUID, uuidAssignedConcept: UUID) {
        const metaClass = await this.getMetaClass(uuidAssignedConcept);
        const metaRelationClass = await this.getMetaRelationclass(uuidAssignedConcept);
        const metaPort = await this.getMetaPort(uuidAssignedConcept);
        const metaSceneType = await this.getSceneTypeByUUID(uuidAssignedConcept);

        let attribute: Attribute = undefined;
        metaClass ? attribute = metaClass.attributes.find(attribute => attribute.uuid == uuid) : undefined;
        metaRelationClass ? attribute = attribute ? attribute : metaRelationClass.attributes.find(attribute => attribute.uuid == uuid) : undefined;
        metaPort ? attribute = attribute ? attribute : metaPort.attributes.find(attribute => attribute.uuid == uuid) : undefined;
        metaSceneType ? attribute = attribute ? attribute : metaSceneType.attributes.find(attribute => attribute.uuid == uuid) : undefined;
        return attribute;
    }
}