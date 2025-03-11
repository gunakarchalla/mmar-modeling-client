import { singleton } from 'aurelia';
import { AttributeInstance, ClassInstance, PortInstance, RelationclassInstance, SceneInstance } from '../../../../mmar-global-data-structure';
import { InstanceUtility } from './instance_utility';
import { MetaUtility } from './meta_utility';
import { GraphicContext } from 'resources/graphic_context';
import { GlobalDefinition } from 'resources/global_definitions';
import { EventAggregator } from 'aurelia';


@singleton()
export class VizrepUpdateChecker {

  constructor(
    private instanceUtility: InstanceUtility,
    private metaUtility: MetaUtility,
    private gc: GraphicContext,
    private globalObjectInstance: GlobalDefinition,
    private eventAggregator: EventAggregator
  ) { 
    //event listener for the vizrep update
    this.eventAggregator.subscribe('checkForVizRepUpdate', async payload => { await this.checkForVisualizationUpdate(); });

  }

  async checkForVizRepUpdate(attributeInstance: AttributeInstance) {
    this.gc.current_instance_object = undefined;
    this.gc.resetInstance();

    let objectInstance: ClassInstance | PortInstance | RelationclassInstance | SceneInstance = null;
    let geometryAsString = "";
    //retrieve instance where attributeInstance belongs to
    
    let classInstance: ClassInstance;
    let relationclassInstances: RelationclassInstance[];
    let relationclassInstance: RelationclassInstance;

    // check if the attribute instance belongs to a class instance or a relationclass instance
    if (attributeInstance.assigned_uuid_class_instance) {
      relationclassInstances = await this.instanceUtility.getAllRelationClassInstances();

      // find the relationcalss instance where the attribute instance belongs to
      relationclassInstance = relationclassInstances.find(relationclassInstance => relationclassInstance.uuid == attributeInstance.assigned_uuid_class_instance);

      // if the relationclass instance is not found, the attribute instance belongs to a class instance
      if (!relationclassInstance) {
        classInstance = await this.instanceUtility.getClassInstance(attributeInstance.assigned_uuid_class_instance);
      }

      // set the object instance to the class instance if
      objectInstance = relationclassInstance ? relationclassInstance : classInstance;
      if (objectInstance) {
        //set the globalObjectInstance.current_class_instance to the object instance
        //this is important for the vizrep update. The vizrep update needs to know the current class instance for relationclass instances and class instances
        this.globalObjectInstance.current_class_instance = objectInstance;
      } 
      
      // get the meta class or relation
      let metaClass = relationclassInstance ? await this.metaUtility.getMetaRelationclass(relationclassInstance.uuid_relationclass) : await this.metaUtility.getMetaClass(classInstance.uuid_class);
      // set the current instance object to the object instance of the graphic context
      this.gc.current_instance_object = objectInstance;
      
      // set the geometry string
      const geometry = metaClass.geometry;
      geometryAsString = geometry.toString();
      
    }
    //if it was not a class instance or relationclass instance, check if it is a port instance
    else if (attributeInstance.assigned_uuid_port_instance) {
      objectInstance = await this.instanceUtility.getPortInstance(attributeInstance.assigned_uuid_port_instance);
      geometryAsString = (await this.metaUtility.getMetaPort(objectInstance.uuid_port)).geometry.toString();
    }
    //if it was not a port instance, check if it is a scene instance
    else if (attributeInstance.assigned_uuid_scene_instance) {
      objectInstance = await this.instanceUtility.getSceneInstance(attributeInstance.assigned_uuid_scene_instance);
      geometryAsString = (await this.metaUtility.getSceneTypeByUUID(objectInstance.uuid_scene_type)).geometry.toString();
    }

    // get the meta attribute name
    const metaAttributeUUID = attributeInstance.uuid_attribute;
    const metaAttributeName = (await this.metaUtility.getMetaAttribute(metaAttributeUUID)).name;

    // check if the meta attribute is referenced in the geometry attribute
    // we only update the vizrep if the meta attribute is referenced in the geometry attribute 
    // If the meta attribute is referenced in the geometry attribute, the geometry attribute has to be updated
    if ((geometryAsString.includes(metaAttributeName) || geometryAsString.includes(metaAttributeUUID))) {

      // get all custom_variables
      const customVariables = objectInstance.custom_variables;

      // for each custom_variable (key) in the customVariables object, check if it the value user_locked is true, if not, store it in an array to be updated
      // this is necessary because we only want to update the custom variables that are not user_locked 
      // -> e.g., if we shift the position of a text, we don't want to update the position of the text again to the original position
      const customVariablesToUpdate = [];
      for (const key in customVariables) {
        if (customVariables[key].user_locked === false) {
          customVariablesToUpdate.push(key);
        }
      }

      // remove the custom variable from the object instance if not user_locked
      // the custom_variables will then be updated in the vizrep update
      for (const key of customVariablesToUpdate) {
        delete objectInstance.custom_variables[key];
      }

      // run the vizrep function and call the update vizrep function to update the vizrep
      await this.gc.runVizRepFunction(geometryAsString);
      await this.gc.updateVizRep(objectInstance);
    }
  }

  
    /**
     * Checks for visualization updates.
     */
    async checkForVisualizationUpdate() {
      //get all attributeInstances that are assigned to the current sceneInstance, its classInstances, relationclassInstances and portInstances
      const sceneInstance = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneInstance;
      let attributeInstances: AttributeInstance[] = sceneInstance.attribute_instances;

      attributeInstances = [...attributeInstances, ...(await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance))];

      //-----------------------------------------
      // this would be more performant but with the risk that some changes are not detected
      //----------------------------------------

      //filter the attributeInstances to make sure that there is always only one attributeIstance with the same uuid_class_instance, uuid_port_instance and uuid_scene_instance
      // attributeInstances = attributeInstances.filter((attributeInstance, index, self) =>
      //     index === self.findIndex((t) => (
      //         t.assigned_uuid_class_instance === attributeInstance.assigned_uuid_class_instance &&
      //         t.assigned_uuid_port_instance === attributeInstance.assigned_uuid_port_instance &&
      //         t.assigned_uuid_scene_instance === attributeInstance.assigned_uuid_scene_instance
      //     ))
      // );


      //for each attribute run the checkForVizRepUpdate function
      //not ideal, since some class_instances might be checked multiple times
      for (const attributeInstance of attributeInstances) {
          if (attributeInstance.assigned_uuid_class_instance) {
              await this.checkForVizRepUpdate(attributeInstance);
          }
      }
  }
}
