import { FetchHelper } from './services/fetchHelper';
import { singleton } from 'aurelia';
import { plainToInstance } from "class-transformer";
import * as THREE from "three";

import { GlobalDefinition } from './global_definitions';
import { GlobalStateObject } from './global_state_object';
import { GraphicContext } from './graphic_context';
import { InstanceCreationHandler } from './instance_creation_handler';
import { Class, Relationclass, PortInstance, SceneInstance } from '../../../mmar-global-data-structure';
import { MetaUtility } from './services/meta_utility';
import { InstanceUtility } from './services/instance_utility';
import { Logger } from './services/logger';
import { ExpressionUtility } from './expression_utility';

@singleton()
export class PersistencyHandler {

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private globalStateObject: GlobalStateObject,
    public instanceCreationHandler: InstanceCreationHandler,
    private gc: GraphicContext,
    private metaUtility: MetaUtility,
    private instanceUtility: InstanceUtility,
    private fetchHelper: FetchHelper,
    private logger: Logger,
    private expression: ExpressionUtility
  ) { }

  async checkIfClassinstanceInScene() {

    //get scene of tabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

    for (const class_instance of sceneInstance.class_instances) {

      const drag_object_uuids = [];
      //create array with only uuids of all dragObjects (classes only)
      for (const object of this.globalObjectInstance.dragObjects) {
        drag_object_uuids.push(object.uuid);
      };

      //true if already in drag_objects, false if not
      const found_object_in_dragObjects = drag_object_uuids.includes(class_instance.uuid);

      //if already in scene do nothing, else call everything to draw visualization
      if (found_object_in_dragObjects) {
        this.logger.log("object already in scene: " + class_instance.uuid, "info");
      } else {
        //point to insert object
        const point = new THREE.Vector3(class_instance.coordinates_2d.x, class_instance.coordinates_2d.y, class_instance.coordinates_2d.z);
        //get parent metaClass of the instance from the metamodel
        const meta_class: Class = await this.metaUtility.getMetaClass(class_instance.uuid_class);
        //parse metafunction
        const metaFunction = await this.metaUtility.parseMetaFunction(meta_class.geometry as unknown as string);

        //reset this.gc instance
        this.gc.resetInstance();

        //set this.globalObjectInstance.current_class_instance (we need this in other functions)
        this.globalObjectInstance.current_class_instance = class_instance;
        this.gc.current_instance_object = class_instance;

        //we set the metafunction to the "geometry" property of the class_instance
        //class_instance.geometry = metaFunction;

        //we call the function that is stored in the metamodel
        await this.gc.runVizRepFunction(metaFunction);
        // we call the function for drawing the information in the gc
        let classObject3D = await this.gc.drawVizRep(point, class_instance);
        this.globalObjectInstance.render = true;

        this.gc.resetInstance();

        //------------------------------------
        //for each port_instance of the class_instance we create a port_object
        //we iterate over the port_instances of the class_instance
        for (const port_instance of class_instance.port_instance) {

          //set current port_instance in global object
          this.globalObjectInstance.current_port_instance = port_instance;

          //store position from port_instance
          const oldPosition = new THREE.Vector3(port_instance.coordinates_2d.x, port_instance.coordinates_2d.y, port_instance.coordinates_2d.z);

          let newGC = new GraphicContext(this.globalObjectInstance, this.globalStateObject, this.metaUtility, this.instanceUtility, this.logger, this.expression);

          //we define the gemoetry of the port_object
          const metaPort = await this.metaUtility.getMetaPort(port_instance.uuid_port);
          const geometry_string = metaPort.geometry;
          //parse the string function from the metamodel to a js function
          const metaFunctionPort = await this.metaUtility.parseMetaFunction(geometry_string.toString());

          //reset gc instance
          await newGC.resetInstance();

          //we call the function that is stored in the metamodel
          await newGC.runVizRepFunction(metaFunctionPort);
          // we call the function for drawing the information in the newGC
          const portObject3D = await newGC.drawVizRepPort(new THREE.Vector3(0, 0, 0), port_instance);
          //we add the portObject to the classObject
          newGC.attachPort(portObject3D, classObject3D);

          //we set the position of the portObject according to the stored position in the port_instance
          portObject3D.position.set(oldPosition.x, oldPosition.y, oldPosition.z);

          //reset current_port_isntance
          this.globalObjectInstance.current_port_instance = undefined;
          this.globalObjectInstance.render = true;
        }
      }
    }
  }


  async checkIfRelationclassinstanceInScene() {
    const that = this;
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    for (const relationclass_instance of sceneInstance.relationclasses_instances) {
      this.logger.log('we check the relationclass_instance: ' + relationclass_instance.uuid, 'info');


      const metaclass: Relationclass = await that.metaUtility.getMetaRelationclass(relationclass_instance.uuid_class);
      const linePoints: object[] = relationclass_instance.line_points;

      that.gc.current_instance_object = relationclass_instance;

      const metaFunction = await that.metaUtility.parseMetaFunction(metaclass.geometry as unknown as string);

      //we call the function that is stored in the metamodel
      await this.gc.runVizRepFunction(metaFunction);
      // we call the function for drawing the information in the gc
      await this.gc.drawVizRep_rel();
      this.globalObjectInstance.render = true;

      //also set the uuid for old uuid for the children
      //otherwise there is an error in the animationloop of the line
      that.globalStateObject.activeStateLine.uuid = relationclass_instance.uuid;
      for (const child of that.globalStateObject.activeStateLine.children) {
        child.uuid = relationclass_instance.uuid;
      }

      that.globalObjectInstance.scene.add(that.globalStateObject.activeStateLine);

      //push each linepoint to the relObj
      for (const element of linePoints) {
        const object = that.globalObjectInstance.dragObjects.find(object => object.uuid == element["UUID"])
        that.globalStateObject.activeStateLine.userData.relObj.push(object)

      }
      this.globalObjectInstance.dragObjects.unshift(that.globalStateObject.activeStateLine);
    }

    this.globalStateObject.activeStateLine = undefined;
  }


  async mapClassInstancetoClass() {
    //get sceneInstance from TabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    let allPortInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();

    for (const class_instance of sceneInstance.class_instances) {

      //-------------------------------------------------------------
      //clean instantiation of attribute_instance in array of class
      //in the plainToInstance for Classes the array is not loaded properly
      const attribute_instances = class_instance.attribute_instance;
      for (const attribute_instance of attribute_instances) {
        this.globalObjectInstance.attribute_instances.push(attribute_instance);
      };

      // push the attribute_instances of all port_instances which are attached to the class_instance
      for (const port_instance of class_instance.port_instance) {
        const attribute_instances = port_instance.attribute_instances;
        for (const attribute_instance of attribute_instances) {
          this.globalObjectInstance.attribute_instances.push(attribute_instance);
        };

        //push the port_instance to the global array
        allPortInstances.push(port_instance);
      }

      //we set the array for the attributes new and we push the class_instance to the global array
      //instance.attribute_instance = new_attribute_instances;
      //sceneInstance.class_instances.push(class_instance);
    }
  }

  async mapRelationclassInstancetoClass() {
    //get sceneInstance from TabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    for (const relationclass_instance of sceneInstance.relationclasses_instances) {

      //clean instantiation of attribute_instance in array of relationclass
      //in the plainToInstance for Classes the array is not loaded properly
      const attribute_instances = relationclass_instance.attribute_instance;
      for (const attribute_instance of attribute_instances) {
        this.globalObjectInstance.attribute_instances.push(attribute_instance);
      };

      // push roles to global array
      this.globalObjectInstance.role_instances.push(relationclass_instance.role_instance_from);
      this.globalObjectInstance.role_instances.push(relationclass_instance.role_instance_to);

      //we set the array for the attributes new and we push the class_instance to the global array
      //sceneInstance.relationclasses_instances.push(relationclass_instance);
    };
  }

  async classifyRoleInstance() {
    //get sceneInstance from TabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    for (const role_instance of sceneInstance.role_instances) {

      // add role instance to global object array role_instances[]
      this.globalObjectInstance.role_instances.push(role_instance);
    };
  }

  async classifyPortInstance() {
    //get sceneInstance from TabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    for (const port_instance of sceneInstance.port_instances) {

      this.globalObjectInstance.scene.traverse(async (object3d: THREE.Mesh) => {
        if (object3d.uuid == port_instance.uuid) {
          await this.gc.setScale(object3d, port_instance)
        }
      });
    };
  }

  async mapAttributeInstancetoClass() {
    //get sceneInstance from TabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    for (const attribute_instance of sceneInstance.attribute_instances) {
      this.globalObjectInstance.attribute_instances.push(attribute_instance);
    };
  }

  async persistSceneInstanceToDB() {
    //get sceneInstance from TabContext
    let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

    //this calls the endpoint for posting a sceneInstance to the db
    //check first if post or patch
    //call the endpoint for getting the sceneInstances of the selected sceneType

    //get SceneType of the sceneInstance
    let sceneType = await this.metaUtility.getTabContextSceneType();
    if (sceneType) {
      const sceneInstances = await this.fetchHelper.sceneInstancesAllGET(sceneType.uuid);
      let foundInstance: SceneInstance;
      if (sceneInstances) {
        foundInstance = sceneInstances.find(instance => instance.uuid == sceneInstance.uuid)
      }

      if (foundInstance) {
        const patchedInstance = await this.fetchHelper.sceneInstancesPATCH(sceneInstance.uuid, sceneInstance)
        this.logger.log('SceneInstance patched', 'info');
      }
      else {
        const postedInstance = await this.fetchHelper.sceneInstancesPOST(sceneType.uuid, sceneInstance)
        this.logger.log('SceneInstance posted', 'info');
      }
    }



  }

  async loadPersistedModel(modelToLoad: SceneInstance) {

    await this.importInstances();

  }



  //function to import stored instances to the model
  async importInstances() {

    //map class_instances to class_pattern and push to this.globalObjectInstance.class_instances
    const mapClassInstancetoClass = await this.mapClassInstancetoClass();
    await this.gc.resetInstance();

    //--------------------------------------------------
    //map relationclass_instances to class_pattern and push to this.globalObjectInstance.class_instances

    const mapRelationclassInstancetoClass = await this.mapRelationclassInstancetoClass();
    await this.gc.resetInstance();

    //---------------------------------------------------------------------------------------------
    //map attribute_instances to class_pattern and push to this.globalObjectInstance.attribute_instances
    const mapAttributeInstancetoClass = await this.mapAttributeInstancetoClass();
    await this.gc.resetInstance();

    //---------------------------------------------------------------------------------------
    //for each instance in this.globalObjectInstance.class_instances check if already in scene
    const checkIfClassinstanceInScene = await this.checkIfClassinstanceInScene();
    await this.gc.resetInstance();


    //---------------------------------------------------------------------------------------
    //for each instance in this.globalObjectInstance.relationclass_instances check if already in scene
    const checkIfRelationclassinstanceInScene = await this.checkIfRelationclassinstanceInScene();
    await this.gc.resetInstance();

    //---------------------------------------------------------------
    //classify role_instances
    const classifyRoleInstance = await this.classifyRoleInstance();
    await this.gc.resetInstance();

    //-----------------------------------------------------------------------------
    //classify port instances
    const classifyPotInstance = await this.classifyPortInstance();
    await this.gc.resetInstance();
  }

  //function to save the model to a textfile
  async saveToTextfile() {
    this.logger.log('save', 'info');
    if (this.globalObjectInstance.tabContext.length > 0) {
      let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      const blob = new Blob([JSON.stringify(sceneInstance)], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);

      this.downloadURL(url, sceneInstance.name + ".json");
    }
  }

  async saveAllOpenModelInstancesToTextfile() {
    this.logger.log('save', 'info');
    if (this.globalObjectInstance.tabContext.length > 0) {
      let sceneInstances = await this.instanceUtility.getAllOpenSceneInstances();
      let json = {};
      for (const sceneInstance of sceneInstances) {
        json[sceneInstance.uuid] = sceneInstance;
      }
      const blob = new Blob([JSON.stringify(json)], { type: "json/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);

      this.downloadURL(url, "allOpenModels.json");
    }
  }

  downloadURL(url: string, fileName: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

}
