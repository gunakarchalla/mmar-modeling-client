import { DeletionHandler } from './deletion_handler';
import { RayHelper } from './ray_helper';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { GlobalRelationclassObject } from './global_relationclass_object';
import { GlobalClassObject } from './global_class_object';
import { GlobalStateObject } from './global_state_object';
import { GlobalDefinition } from 'resources/global_definitions';
import { singleton } from 'aurelia';

import * as THREE from 'three';
import { GlobalSelectedObject } from './global_selected_object';
import { ClassInstance, PortInstance, RelationclassInstance, RoleInstance, Relationclass, Class } from '../../../mmar-global-data-structure';

import { EventAggregator } from 'aurelia';
import { MetaUtility } from './services/meta_utility';
import { InstanceUtility } from './services/instance_utility';
import { GraphicContext } from './graphic_context';

import { InstanceCreationHandler } from './instance_creation_handler';
import { ConsistencyChecker } from './consistency_checker';
import { Logger } from './services/logger';
import { ExpressionUtility } from './expression_utility';
import { SimulationUtility } from './services/simulation_utility';

@singleton()
export class InteractionHandler {


  private objects: THREE.Mesh[];
  private intersects: THREE.Intersection[];
  private intersect: THREE.Intersection;

  //get programState
  private programState: string;

  //check variable
  private allowed = true;
  private dragging: boolean;

  // left == 0, right == 2
  private clickedButton: number;

  constructor(
    private globalObjectInstance: GlobalDefinition,
    private globalStateObject: GlobalStateObject,
    private globalClassObject: GlobalClassObject,
    private globalRelationclassObject: GlobalRelationclassObject,
    private globalSelectedObject: GlobalSelectedObject,
    public instanceCreationHandler: InstanceCreationHandler,
    private consistencyChecker: ConsistencyChecker,
    private gc: GraphicContext,
    private rayHelper: RayHelper,
    private eventAggregator: EventAggregator,
    private metaUtility: MetaUtility,
    private instanceUtility: InstanceUtility,
    private logger: Logger,
    private deletionHandler: DeletionHandler,
    private expression: ExpressionUtility,
    private simulationUtility: SimulationUtility
  ) { }





  //function that is called on mouse click

  // ------------------------------------
  // check sequence diagram in the wiki of mm-ar: https://github.com/MM-AR/mmar/wiki/InteractionHandler
  // ------------------------------------
  async onDocumentMouseDown(event: MouseEvent) {

    this.clickedButton = event.button;
    this.dragging = this.globalObjectInstance.transformControls.dragging;
    this.programState = this.globalStateObject.getState();

    //set the raycaster
    this.globalObjectInstance.raycaster = this.rayHelper.shootRay(event);

    //if state === ViewMode
    if (this.programState === this.globalStateObject.stateNames[1]) {
      await this.onViewMode();
    }

    //if state === SelectionMode
    if (this.programState === this.globalStateObject.stateNames[0] && !this.dragging) {
      this.onSelectionMode();
    }
    else if (this.programState === this.globalStateObject.stateNames[0] && this.dragging) {
      this.logger.log('dragging', 'info');
    }
    //if state === DrawingMode
    else if (this.programState === this.globalStateObject.stateNames[2]) {
      await this.onDrawingMode();
    }
    //if state === DrawingModeRelationClass
    else if (this.programState === this.globalStateObject.stateNames[3]) {
      await this.onDrawingModeRelationclass();
    }
    //if state === SimulationMode
    else if (this.programState === this.globalStateObject.stateNames[4]) {
      await this.onSimulationMode();
    }
  }

  /**
   * Handles the interaction logic for "Selection Mode" in the application.
   * 
   * This method is triggered when the user clicks on the "canvas" in "Selection Mode".
   * It determines the type of interaction (translate, scale, or rotate) based on the mouse button clicked,
   * detects intersections with objects in the scene, and attaches the transform controls to the selected object.
   * Additionally, it updates the global state and publishes events for updating the attribute GUI.
   *
   *
   * @remarks
   * - Left-click (button 0) sets the transform controls to "translate" mode.
   * - Right-click (button 2) sets the transform controls to "scale" mode.
   * - Middle-click (button 1) sets the transform controls to "rotate" mode (only in 3D mode).
   * - If an object is intersected, it is selected, and its attributes are prepared for display in the GUI.
   * - If no object is intersected, the selection is cleared, and the state is reset to "View Mode".
   */
  async onSelectionMode() {
    if (this.clickedButton == 0) {
      this.globalObjectInstance.transformControls.setMode('translate');
    } else if (this.clickedButton == 2) {
      this.globalObjectInstance.transformControls.setMode('scale');
    } else if (this.clickedButton == 1 && this.globalObjectInstance.threeDimensional) {
      this.globalObjectInstance.transformControls.setMode('rotate');
    }

    //objects to intersect with this raycaster 
    this.objects = this.globalObjectInstance.dragObjects;
    //array with objects, that intersect with the ray (only plane)
    this.intersects = this.globalObjectInstance.raycaster.intersectObjects(this.objects, false); //false to only test on parent object

    if (this.intersects.length > 0) {
      this.intersect = this.intersects[0];
      this.globalSelectedObject.setObject(this.intersect.object as THREE.Mesh);

      this.globalObjectInstance.transformControls.attach(this.intersect.object);

      //restrict scale to x-axis --> we must handle the relative scale on the y-axis in onTransformControlsPropertyChange()
      if (this.globalObjectInstance.transformControls.mode == 'scale') {
        // this.globalObjectInstance.transformControls.showY = this.globalObjectInstance.transformControls.mode != 'scale';
      }



      // here we get the attribute instances of the object to add it to the gui
      const entries: object = {};
      const instance_uuid = this.intersect.object.uuid;
      const class_instance: ClassInstance = await this.instanceUtility.getClassInstance(instance_uuid);
      this.globalObjectInstance.current_class_instance = class_instance;

      const port_instance: PortInstance = await this.instanceUtility.getPortInstance(instance_uuid);
      this.globalObjectInstance.current_port_instance = port_instance;

      //check if it is a relationclassinstance
      if (this.globalObjectInstance.current_class_instance == undefined) {
        //set relationclass to current current_class_instance
        const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
        this.globalObjectInstance.current_class_instance = sceneInstance.relationclasses_instances.find((relationclassInstance) => relationclassInstance.uuid == instance_uuid);

        if (this.globalObjectInstance.current_class_instance) {
          this.logger.log("clicked on relationclass_instance", "info");
          this.globalStateObject.activeStateLine = this.intersect.object as any;
        }
      }

      this.eventAggregator.publish('removeAttributeGui', { update: true });
      // add eventAggregator for attribute gui -> set small timeout to wait for the removeAttributeGui event which updates also the texts
      setTimeout(() => { this.eventAggregator.publish('updateAttributeGui', { update: true }) }, 10);

    }
    else {
      this.globalSelectedObject.removeObject();
      if (this.intersects.length == 0) {
        this.globalStateObject.setState(1);
        this.programState = this.globalStateObject.getState();
      }
      if (this.clickedButton == 2) {
        //default state
        this.globalStateObject.setState(1)
      }

      //remove attribute gui
      this.eventAggregator.publish('removeAttributeGui', { remove: true });
    }
    this.globalObjectInstance.render = true;
  }

/**
   * Handles the transition to "View Mode" in the application.
   * 
   * This method detaches objects from the transform controls, sets up the objects
   * to be intersected by the raycaster, and checks if any objects are intersected.
   * If an object is intersected, the application switches to "Selection Mode".
   * Otherwise, a log message is displayed prompting the user to select an object.
   * 
   * @remarks
   * - The `transformControls` are detached to ensure no objects are being manipulated.
   * - The `raycaster` is used to detect intersections with draggable objects.
   * - The global state is updated based on whether an object is intersected.
   */
  async onViewMode() {
    //detach objects from transformcontrols
    this.globalObjectInstance.transformControls.detach()
    //objects to intersect with this raycaster (check if click on Object)
    this.objects = this.globalObjectInstance.dragObjects;
    //array with objects, that intersect with the ray (only plane)
    this.intersects = this.globalObjectInstance.raycaster.intersectObjects(this.objects);

    //if an object was intersected: change to SelectionMode
    if (this.intersects.length > 0) {
      this.globalStateObject.setState(0);
      this.programState = this.globalStateObject.getState();
    }
    else {
      //show dialog box
      this.logger.log("Please select an object", "info");
    }
  }

    /**
   * Handles the drawing mode interaction in the application. This method is responsible for:
   * - Determining intersections with objects in the scene using a raycaster.
   * - Creating and positioning class instances based on the selected class and intersection point.
   * - Parsing and executing visualization representation (VizRep) functions for the created class instance.
   * - Creating and attaching port objects for each port instance of the class instance.
   * - Managing the global state and rendering updates.
   *
   * @remarks
   * - The method uses raycasting to detect intersections with objects in the scene, specifically the plane object.
   * - If a valid intersection is found and a metaclass is selected, a new class instance is created and added to the scene.
   * - The method dynamically evaluates geometry and visualization functions stored in the metamodel. (vizRep)
   * - If any, for each port instance of the created class instance, a corresponding port object is created, visualized, and attached to the class object.
   * - The method also handles resetting and updating the global state and rendering flags.
   */
  async onDrawingMode() {

    //objects to intersect with this raycaster
    this.objects = [].concat(this.globalObjectInstance.dragObjects);
    this.objects.push(this.globalObjectInstance.plane);

    //array with objects, that intersect with the ray (only plane)
    this.intersects = this.globalObjectInstance.raycaster.intersectObjects(this.objects);

    //reset current storage
    this.globalObjectInstance.current_class_instance = undefined;
    this.gc.current_instance_object = undefined;

    //if at leas one intersection
    if (this.intersects.length > 0 && this.clickedButton == 0) {
      // this.intersect = this.intersects[0];
      // find this.globalObjectInstance.plane intersection
      this.intersect = this.intersects.find(intersect => intersect.object == this.globalObjectInstance.plane);

      const selectedClass = this.globalClassObject.getSelectedClassUUID();

      //for the selected class value isert object to scene and create instance
      if (selectedClass) {
        const index: number = this.globalClassObject.classUUID.indexOf(selectedClass);

        //this evaluates the dynamic functions in the vizRep 
        const geometry_string = this.parseObj(this.globalClassObject.classGeometry[index]);

        //we round the positions to 0.1

        const x = Math.round(this.intersect.point.getComponent(0) * 10) / 10;
        const y = Math.round(this.intersect.point.getComponent(1) * 10) / 10;
        const z = Math.round(this.intersect.point.getComponent(2) * 10) / 10;

        const class_instance: ClassInstance = await this.instanceCreationHandler.createClassInstance(
          this.instanceCreationHandler.create_UUID(),
          x,
          y,
          z,
          this.globalClassObject.classUUID[index],  //this is the metaclass UUID
          'class'
        );

        //this is the string that is stored in the metamodel
        //at the init we load all the strings of the according classes to the classObject
        //thus we do not have iterate over the whole metamodel again
        const stringFunction = geometry_string;

        //parse the string function from the metamodel to a js function
        const metaFunction = await this.metaUtility.parseMetaFunction(stringFunction);

        //reset gc instance
        await this.gc.resetInstance();

        //we store the metafunction in the class_instance. With that we can recalculate the objects if necessary
        //class_instance.geometry = metaFunction;

        //we call the function that is stored in the metamodel
        await this.gc.runVizRepFunction(metaFunction);
        // we call the function for drawing the information in the gc
        let classObject3D = await this.gc.drawVizRep(new THREE.Vector3(x, y, z), class_instance);
        this.globalObjectInstance.render = true;


        //------------------------------------
        //for each port_instance of the class_instance we create a port_object
        //we iterate over the port_instances of the class_instance
        for (const port_instance of class_instance.port_instance) {


          //set current port_instance in global object
          this.globalObjectInstance.current_port_instance = port_instance;

          let newGC = new GraphicContext(this.globalObjectInstance, this.globalStateObject, this.metaUtility, this.instanceUtility, this.logger, this.expression);

          //we define the gemoetry of the port_object
          const metaPort = await this.metaUtility.getMetaPort(port_instance.uuid_port);
          const geometry_string = metaPort.geometry;
          //parse the string function from the metamodel to a js function
          const metaFunctionPort = await this.metaUtility.parseMetaFunction(geometry_string.toString());

          //reset gc instance
          await newGC.resetInstance();

          //we store the metafunction in the port_instance. With that we can recalculate the objects if necessary
          //port_instance.geometry = geometry_string;     

          //we call the function that is stored in the metamodel
          await newGC.runVizRepFunction(metaFunctionPort);
          // we call the function for drawing the information in the newGC
          const portObject3D = await newGC.drawVizRepPort(new THREE.Vector3(0, 0, 0), port_instance);
          //we add the portObject to the classObject
          newGC.attachPort(portObject3D, classObject3D);
          //we set the position of the portObject according to the meta definition
          portObject3D.position.set(metaPort.coordinates_2d.x, metaPort.coordinates_2d.y, metaPort.coordinates_2d.z);

          //reset current_port_isntance
          this.globalObjectInstance.current_port_instance = undefined;
          this.globalObjectInstance.render = true;
        }


      }
    } else if (this.intersects.length > 0 && this.intersects.length >= 2 && this.clickedButton == 0) {
      //getPortIntersectPosition(intersects);
    } else {
      if (this.clickedButton == 2) {
        //default state
        this.globalStateObject.setState(1)
      }
    }
  }

    /**
   * Handles the interaction logic for creating and managing relation classes in drawing mode.
   * This method is triggered when the user interacts with the canvas in drawing mode, and it
   * processes clicks to create, modify, or finalize relation class instances and their associated
   * roles and bendpoints.
   *
   * The method performs the following actions based on the user's interaction:
   * - Detects intersections with objects in the scene using a raycaster.
   * - checks if it is allowed to create a relation class instance and or ...
   *    - Creates relation class instances and their associated roles (`role_from`),
   *    - Adds bendpoints to relation class instances when clicking on the plane,
   *    - Finalizes relation class instances when clicking on an element.
   * - Resets the state or deletes relation class instances on right-click.
   */
  async onDrawingModeRelationclass() {
    //objects to intersect with this raycaster
    this.objects = this.globalObjectInstance.dragObjects;
    //array with objects, that intersect with the ray (dragObjects)
    this.intersects = await this.globalObjectInstance.raycaster.intersectObjects(this.objects, false); //false to only test on parent object

    //if left click
    //index of relationclass dropdown
    const selectedRelationclass = this.globalRelationclassObject.getSelectedRelationClass();
    const index: number = this.globalRelationclassObject.relationClassNames.indexOf(selectedRelationclass);

    //this is the string that is stored in the metamodel
    //at the init we load all the strings of the according classes to the classObject
    //thus we do not have iterate over the whole metamodel again
    const metaGeometry = this.globalRelationclassObject.relationClassGeometry[index];
    const stringFunction = metaGeometry;
    //parse the string function from the metamodel to a js function
    const metaFunction = await this.metaUtility.parseMetaFunction(stringFunction);


    let x: number, y: number, z: number;
    if (this.intersects.length > 0 && this.clickedButton == 0) {

      this.intersect = this.intersects[0];

      x = Math.round(this.intersect.point.getComponent(0) * 10) / 10;
      y = Math.round(this.intersect.point.getComponent(1) * 10) / 10;
      z = Math.round(this.intersect.point.getComponent(2) * 10) / 10;

    }

    //------------------------------------
    //if at least one intersection
    //------------------------------------
    if (this.intersects.length > 0
      && 0 <= this.globalObjectInstance.relationObjects.length
      && this.globalObjectInstance.relationObjects.length <= 1
      && !this.globalStateObject.activeStateLine
      && this.clickedButton == 0
    ) {
      //reset gc instance
      await this.gc.resetInstance();

      //------------------------------------
      //check if relation is allowed for role_from
      //------------------------------------

      let intersect_port_instance: PortInstance;

      //we check if there is a class
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      const intersect_class_instance: ClassInstance = sceneInstance.class_instances.find(classInstance => classInstance.uuid == this.intersect.object.uuid);
      //if there is no class, we check if there is a port
      if (!intersect_class_instance) {
        const allPorts = await this.instanceUtility.getAllPortInstancesOfTabContext();
        intersect_port_instance = allPorts.find(portInstance => portInstance.uuid == this.intersect.object.uuid);
      }

      //we search for the meta relationclass
      const sceneType = await this.metaUtility.getTabContextSceneType();
      const relationclass = sceneType.relationclasses.find(
        relationclass => relationclass.uuid == this.globalRelationclassObject.relationClassUUID[index])

      //one of both should be undefined
      this.allowed = this.consistencyChecker.checkStartPoint(relationclass, intersect_class_instance, intersect_port_instance);
      if (this.allowed == false) {
        this.logger.log('action is not allowed --> no relationclass created', 'close')
        return;
      }

      //------------------------------------
      //create instance of relation object in class_instance
      //------------------------------------

      const relationclass_instance: RelationclassInstance = await this.instanceCreationHandler.createRelationclassInstance(
        this.instanceCreationHandler.create_UUID(),
        x,
        y,
        z,
        this.globalRelationclassObject.relationClassUUID[index],
        'relation'
      );

      //put to relationClassObject
      this.globalRelationclassObject.relationclassInstanceInCreation = relationclass_instance;

      //this is the from Object if we create a relationclass_instance. We need that for the role_instance (from)
      const fromObject: THREE.Mesh = this.intersect.object as unknown as THREE.Mesh

      const uuid_relationclass: string = relationclass.uuid;

      //------------------------------------
      //create role_instance --> role_from
      //------------------------------------
      const role_from: RoleInstance = await this.instanceCreationHandler.createRoleInstance(
        this.instanceCreationHandler.create_UUID(),                                         //uuid of the role
        intersect_class_instance,                                                           //this is the uuid of the reference_class_instance -->fromObject
        intersect_port_instance,                                                            //this would be the port
        "from",                                                                             //from or to role
        uuid_relationclass,                                                                 //uuid of the meta relationclass
        //relationclass_instance.uuid,                                                        //uuid of the relationclass_instance
        "role_from for metaobject: " + relationclass_instance.uuid                          //name of the instance
      );

      //role_from.uuid_reference_relationclass_instance = relationclass_instance.uuid;
      relationclass_instance.role_instance_from = role_from;
      this.logger.log('created role_instance_from', 'close');

      //we store the metafunction in the class_instance. With that we can recalculate the objects if necessary
      //relationclass_instance.geometry = metaFunction;

      //we call the function that is stored in the metamodel
      await this.gc.runVizRepFunction(metaFunction);
      // we call the function for drawing the information in the gc
      await this.gc.drawVizRep_rel();
      this.globalObjectInstance.render = true;


      this.globalObjectInstance.dragObjects.unshift(this.globalStateObject.activeStateLine);
      this.globalObjectInstance.scene.add(this.globalStateObject.activeStateLine);

      this.globalStateObject.activeStateLine.userData.relObj.push(this.intersect.object)
      this.globalStateObject.activeStateLine.userData.relObj.push(this.globalObjectInstance.mousePointer3d);

      // add first point object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, fromObject);

      // add second point object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, this.globalObjectInstance.mousePointer3d);

    }
    //----------------------
    //if click on plane
    //-----------------------
    else if (this.intersects.length == 0 && this.globalStateObject.activeStateLine && this.clickedButton == 0) {
      const newPos = this.globalObjectInstance.mousePointer3d.position.clone();

      //we create an instance of the BendPoint_Class
      const current_line: Line2 = this.globalStateObject.activeStateLine;
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      let relationclass_instance: RelationclassInstance = sceneInstance.relationclasses_instances.find(relationclass_instance => relationclass_instance.uuid == current_line.uuid) as RelationclassInstance;

      //get metaclass from parent class_instance
      const relationclass: Relationclass = await this.metaUtility.getMetaRelationclass(relationclass_instance.uuid_relationclass)

      const bendpoint_class: Class = await this.metaUtility.getMetaClass(relationclass.bendpoint);
      const bendpoint_instance: ClassInstance = await this.instanceCreationHandler.createBendpointInstance(newPos.x, newPos.y, newPos.z, bendpoint_class.geometry, bendpoint_class.uuid);
      const bendpoint_instance_object: THREE.Mesh = this.globalObjectInstance.dragObjects.find(object => object.uuid == bendpoint_instance.uuid);

      const bendpoint = this.instanceCreationHandler.addLinePoint(this.globalStateObject.activeStateLine, newPos, bendpoint_instance_object);
      this.logger.log('added point to line', 'info');

      //---------------------------------------------------------------------------------------------------------------

      // add second point object to array
      //search in relationclass_instances for instance of relation with the given uuid
      relationclass_instance = sceneInstance.relationclasses_instances.find(element => element.uuid == this.globalStateObject.activeStateLine.uuid);

      //remove last point (mousePointer3d) and store it
      relationclass_instance.line_points.pop();

      //add new bendpoint object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, bendpoint);

      // add last point to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, this.globalObjectInstance.mousePointer3d);
      this.logger.log('added point object xyz to class_instance.line_points', 'info');

      //bug fix -> unclear why this was here
      // bendpoint_instance.uuid_relationclass_bendpoint = relationclass_instance.uuid;
      this.logger.log('added relationclass_instance_uuid ' + relationclass_instance.uuid + ' to bendpoint_instance', 'info');


    }
    //----------------------
    //if click on element
    //----------------------
    else if (this.intersects.length > 0 && 0 <= this.globalObjectInstance.relationObjects.length && this.globalObjectInstance.relationObjects.length <= 1 && this.globalStateObject.activeStateLine && this.clickedButton == 0) {

      //------------------------------------
      //check if relation is allowed for role_to

      let intersect_port_instance: PortInstance;
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();

      //we check if there is a class
      const intersect_class_instance: ClassInstance = sceneInstance.class_instances.find(classInstance => classInstance.uuid == this.intersect.object.uuid);
      //if there is no class, we check if there is a port
      if (!intersect_class_instance) {
        const allPorts = await this.instanceUtility.getAllPortInstancesOfTabContext();
        intersect_port_instance = allPorts.find(portInstance => portInstance.uuid == this.intersect.object.uuid);
      }

      //we search for the meta relationclass
      const sceneType = await this.metaUtility.getTabContextSceneType();
      const relationclass = sceneType.relationclasses.find(
        relationclass => relationclass.uuid == this.globalRelationclassObject.relationClassUUID[index])

      //one of both should be undefined
      this.allowed = this.consistencyChecker.checkEndPoint(relationclass, intersect_class_instance, intersect_port_instance);
      if (this.allowed == false) {
        this.logger.log('action is not allowed --> no relationclass created', 'close')
        return;
      }


      this.instanceCreationHandler.addLastLinePoint(this.globalStateObject.activeStateLine, this.intersect.object);

      //---------------------------
      //search in class_instances for instance of relation with the given uuid
      const relationclass_instance: RelationclassInstance = sceneInstance.relationclasses_instances.find(element => element.uuid == this.globalStateObject.activeStateLine.uuid);
      //remove last point (mousePointer3d)
      relationclass_instance.line_points.pop();

      //add last point object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, this.intersect.object);
      this.logger.log('added last point object to class_instance.line_points', 'info');

      //reset active_additional
      //we set a timeout, to let the animate function finish its job
      setTimeout(() => {
        delete this.globalStateObject.activeStateLine;
      }, 100);


      //this is the from Object if we create a relationclass_instance. We need that for the role_instance (from)
      const toObject: THREE.Mesh = this.intersect.object as unknown as THREE.Mesh
      const uuid_relationclass: string = relationclass.uuid;

      //------------------------------------
      //create role_instance --> role_to
      //------------------------------------
      const role_to: RoleInstance = await this.instanceCreationHandler.createRoleInstance(
        this.instanceCreationHandler.create_UUID(),                                          //uuid of the role
        intersect_class_instance,                                          //this is the uuid of the reference_class_instance -->fromObject
        intersect_port_instance,
        "to",                                                 //from or to role
        uuid_relationclass,                                     //uuid of the meta relationclass
        "role_from for metaobject: " + relationclass_instance.uuid      //name of the instance
      );

      //role_to.uuid_reference_relationclass_instance = relationclass_instance.uuid;
      relationclass_instance.role_instance_to = role_to;

    }
    //if right click and there is no relationclass_instance in creation reset state to view mode
    else if (this.clickedButton == 2 && !this.globalStateObject.activeStateLine) {
      //default state
      this.globalStateObject.setState(1)
    }
    //if right click and there is a relationclass_instance in creation
    else if (this.clickedButton == 2 && this.globalStateObject.activeStateLine && this.globalRelationclassObject.relationclassInstanceInCreation) {
      //delete relationclassinstance
      let sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      let index = sceneInstance.relationclasses_instances.findIndex(relationclassInstance => relationclassInstance.uuid == this.globalRelationclassObject.relationclassInstanceInCreation.uuid);
      this.deletionHandler.deleteRelationclassInstance(sceneInstance.relationclasses_instances[index], index);
      this.globalRelationclassObject.relationclassInstanceInCreation = undefined;
      this.globalStateObject.setState(3)
    }
  }

  /**
   * Handles the simulation mode interaction by detecting intersections with objects
   * and executing the corresponding simulation function if a button is clicked.
   *
   * @async
   * @method
   * @returns {Promise<void>} Resolves when the simulation function is executed or no intersection is detected.
   *
   * @description
   * This method performs the following steps:
   * 1. Sets the objects to be intersected by the raycaster.
   * 2. Uses the raycaster to detect intersections with the specified objects.
   * 3. If an intersection is detected and the left button has been clicked (`clickedButton == 0`):
   *    - Retrieves the intersected object and its associated simulation code.
   *    - Finds the parent instance of the intersected object using its UUID.
   *    - Executes the simulation function associated with the button, passing the simulation code
   *      and the parent instance as arguments.
   *
   * @remarks
   * - The `intersectObjects` method is used with `false` to only test parent objects.
   * - The `userData.expression` property of the intersected object is expected to contain the simulation code.
   * - The `instanceUtility.getAnyInstance` method is used to retrieve the parent instance of the intersected object.
   * - The `simulationUtility.runSimulationFunction` method is responsible for executing the simulation logic.
   */
  async onSimulationMode() {
    this.objects = this.globalObjectInstance.buttonObjects;
    this.intersects = await this.globalObjectInstance.raycaster.intersectObjects(this.objects, false); //false to only test on parent object
    if (this.intersects.length > 0 && this.clickedButton == 0) {
      this.intersect = this.intersects[0];
      let object: THREE.Mesh = this.intersect.object as unknown as THREE.Mesh;
      const simulationCode: string = object.userData.expression;
      const parentInstance = await this.instanceUtility.getAnyInstance(object.parent.uuid);
      this.simulationUtility.runSimulationFunction(simulationCode, parentInstance);
    }
  }



  // //-------------------------------------------------
  // //helper functions
  // //-------------------------------------------------

  parseObj(obj: string) {
    const ret: string = Function('"use strict";return (' + obj + ')')();
    return ret;
  }


}
