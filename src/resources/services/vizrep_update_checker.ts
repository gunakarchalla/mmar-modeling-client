import { singleton } from 'aurelia';
import { AttributeInstance, ClassInstance, PortInstance, RelationclassInstance, SceneInstance } from '../../../../mmar-global-data-structure';
import { InstanceUtility } from './instance_utility';
import { MetaUtility } from './meta_utility';
import { GraphicContext } from 'resources/graphic_context';



@singleton()
export class VizrepUpdateChecker {

  constructor(
    private instanceUtility: InstanceUtility,
    private metaUtility: MetaUtility,
    private gc: GraphicContext
  ){}

  async checkForVizRepUpdate(attributeInstance: AttributeInstance) {
    this.gc.current_instance_object = undefined;

    let objectInstance: ClassInstance | PortInstance | RelationclassInstance | SceneInstance = null;
    let geometryAsString = "";
    //retrieve instance where attributeInstance belongs to
    
    if (attributeInstance.assigned_uuid_class_instance) {
      objectInstance = await this.instanceUtility.getClassInstance(attributeInstance.assigned_uuid_class_instance);
      let metaClass = await this.metaUtility.getMetaClass(objectInstance.uuid_class);
      if (!metaClass) {
        metaClass = await this.metaUtility.getMetaRelationclass(objectInstance.uuid_class);
      }
      const geometry = metaClass.geometry;
      geometryAsString = geometry.toString();
      //if empty check meta relationclass
      if (geometryAsString == "") {
        geometryAsString = (await this.metaUtility.getMetaRelationclass(objectInstance.uuid_class)).geometry.toString();
      }
    }
    else if (attributeInstance.assigned_uuid_port_instance) {
      objectInstance = await this.instanceUtility.getPortInstance(attributeInstance.assigned_uuid_port_instance);
      geometryAsString = (await this.metaUtility.getMetaPort(objectInstance.uuid_port)).geometry.toString();

    }
    else if (attributeInstance.assigned_uuid_scene_instance) {
      objectInstance = await this.instanceUtility.getSceneInstance(attributeInstance.assigned_uuid_scene_instance);
      geometryAsString = (await this.metaUtility.getSceneTypeByUUID(objectInstance.uuid_scene_type)).geometry.toString();
    }

    const metaAttributeUUID = attributeInstance.uuid_attribute;
    const metaAttributeName = (await this.metaUtility.getMetaAttribute(metaAttributeUUID)).name;

    if (geometryAsString.includes(metaAttributeName) || geometryAsString.includes(metaAttributeUUID)) {
      // If the meta attribute is referenced in the geometry attribute, the geometry attribute has to be updated

     // get all custom_variables
      const customVariables = objectInstance.custom_variables;

      // for each custom_variable (key) in the customVariables object, check if it is the value user_locked is true, if not, store it in an array to be updated
      const customVariablesToUpdate = [];
      for (const key in customVariables) {
        if (customVariables[key].user_locked === false) {
          customVariablesToUpdate.push(key);
        }
      }

      // remove the custom variable from the object instance
      for (const key of customVariablesToUpdate) {
        delete objectInstance.custom_variables[key];
      }

      await this.gc.runVizRepFunction(geometryAsString);
      await this.gc.updateVizRep(objectInstance);
    }
  }


}
