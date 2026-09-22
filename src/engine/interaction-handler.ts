import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { ClassInstance, PortInstance, RelationclassInstance, RoleInstance, Relationclass, Class } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalStateObject } from "@/engine/global-state-object";
import { globalClassObject } from "@/engine/global-class-object";
import { globalRelationclassObject } from "@/engine/global-relationclass-object";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { rayHelper } from "@/engine/ray-helper";
import { GraphicContext, graphicContext } from "@/engine/graphic-context";
import { instanceCreationHandler } from "@/engine/instance-creation-handler";
import { consistencyChecker } from "@/engine/consistency-checker";
import { deletionHandler } from "@/engine/deletion-handler";
import { metaUtility } from "@/resources/services/meta-utility";
import { instanceUtility } from "@/resources/services/instance-utility";
import { simulationUtility } from "@/resources/services/simulation-utility";
import { logger } from "@/resources/services/logger";
import { eventBus } from "@/resources/services/event-bus";
import { useSelectionStore, type SelectionType } from "@/resources/store/selectionStore";
import { publishLocalChange } from "@/resources/collaboration/local-change-publisher";
import { runExclusive } from "@/resources/services/draw-lock";

/**
 * The canvas interaction state machine. `onDocumentMouseDown` is the renderer's
 * `pointerdown` listener and dispatches to one handler per mode:
 *
 *   0 SelectionMode            pick an object, attach the transform gizmo, show its
 *                              attributes (left = translate, right = scale,
 *                              middle = rotate in 3D)
 *   1 ViewMode                 camera only; clicking an object switches to selection
 *   2 DrawingMode              drop an instance of the selected palette class
 *   3 DrawingModeRelationClass draw a relation: the first click sets the from-end,
 *                              clicks on empty space add bendpoints, the click on a
 *                              second object closes it; right-click abandons it
 *   4 SimulationMode           run the clicked button object's simulation expression
 *
 * See https://github.com/MM-AR/mmar/wiki/InteractionHandler for the sequence diagram.
 *
 * The engine's `current_class_instance` / `current_port_instance` stay the source of
 * truth for what is selected; `selectionStore` is a one-way mirror for React, kept in
 * step alongside the `updateAttributeGui` / `removeAttributeGui` bus channels.
 */export class InteractionHandler {
  private objects!: THREE.Mesh[];
  private intersects!: THREE.Intersection[];
  private intersect!: THREE.Intersection;

  //get programState
  private programState!: string;

  //check variable
  private allowed = true;
  private dragging!: boolean;

  // left == 0, right == 2
  private clickedButton!: number;

  private globalObjectInstance = globalObject;
  private globalStateObject = globalStateObject;
  private globalClassObject = globalClassObject;
  private globalRelationclassObject = globalRelationclassObject;
  private globalSelectedObject = globalSelectedObject;
  private instanceCreationHandler = instanceCreationHandler;
  private consistencyChecker = consistencyChecker;
  private gc = graphicContext;
  private rayHelper = rayHelper;
  private eventAggregator = eventBus;
  private metaUtility = metaUtility;
  private instanceUtility = instanceUtility;
  private logger = logger;
  private deletionHandler = deletionHandler;
  private simulationUtility = simulationUtility;

  //function that is called on mouse click
  // ------------------------------------
  // check sequence diagram in the wiki of mm-ar: https://github.com/MM-AR/mmar/wiki/InteractionHandler
  // ------------------------------------
  /**
   * Runs one click's worth of work, and only one at a time.
   *
   * The modes below draw, and drawing runs on shared single-slot state (see draw-lock).
   * A peer's change arrives out of a websocket callback and starts a draw pass of its
   * own, so without the lane it lands in the middle of this one — which is how a relation
   * a collaborator finished used to break the relation the local user was still drawing.
   * The per-click fields this class parks on `this` are inside the lane too, so a second
   * click cannot overwrite them while the first is still being served.
   */
  async onDocumentMouseDown(event: MouseEvent) {
    await runExclusive(() => this.dispatchMouseDown(event));
  }

  private async dispatchMouseDown(event: MouseEvent) {
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
      // Awaited like every other mode, so the whole click stays inside the lane: this one
      // resolves and publishes the selection, which the draw passes also write.
      await this.onSelectionMode();
    } else if (this.programState === this.globalStateObject.stateNames[0] && this.dragging) {
      this.logger.log("dragging", "info");
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
   * Handles the interaction logic for "Selection Mode" (translate / scale / rotate
   * depending on mouse button), attaches the transform controls to the picked object,
   * resolves the picked instance (class / relationclass / port), and drives the
   * attribute GUI + selectionStore. Clears the selection when nothing is picked.
   */
  async onSelectionMode() {
    if (this.clickedButton == 0) {
      this.globalObjectInstance.transformControls.setMode("translate");
    } else if (this.clickedButton == 2) {
      this.globalObjectInstance.transformControls.setMode("scale");
    } else if (this.clickedButton == 1 && this.globalObjectInstance.threeDimensional) {
      this.globalObjectInstance.transformControls.setMode("rotate");
    }

    //objects to intersect with this raycaster
    this.objects = this.globalObjectInstance.dragObjects;
    //array with objects, that intersect with the ray (only plane)
    this.intersects = this.globalObjectInstance.raycaster.intersectObjects(this.objects, false); //false to only test on parent object

    if (this.intersects.length > 0) {
      this.intersect = this.intersects[0];
      await this.selectObject(this.intersect.object as THREE.Mesh);
    } else {
      this.globalSelectedObject.removeObject();
      if (this.intersects.length == 0) {
        this.globalStateObject.setState(1);
        this.programState = this.globalStateObject.getState();
      }
      if (this.clickedButton == 2) {
        //default state
        this.globalStateObject.setState(1);
      }

      // clear the reactive selection store
      useSelectionStore.getState().clearSelection();

      //remove attribute gui
      this.eventAggregator.publish("removeAttributeGui");
    }
    this.globalObjectInstance.render = true;
  }

  /**
   * Select one object: attach the transform gizmo, resolve the picked instance
   * (class / relationclass / port), drive `current_class_instance` /
   * `current_port_instance` + `selectionStore`, and refresh the attribute GUI.
   *
   * Shared by canvas picking (`onSelectionMode`, passing the raycast hit) and by
   * `selectInstanceByUuid` (the model-tree panel, passing the object it looked up).
   */
  private async selectObject(object: THREE.Mesh) {
    this.globalSelectedObject.setObject(object);
    this.globalObjectInstance.transformControls.attach(object);

    // here we get the attribute instances of the object to add it to the gui
    const instance_uuid = object.uuid;
    const class_instance = await this.instanceUtility.getClassInstance(instance_uuid);
    this.globalObjectInstance.current_class_instance = class_instance as ClassInstance;

    const port_instance = await this.instanceUtility.getPortInstance(instance_uuid);
    this.globalObjectInstance.current_port_instance = port_instance as PortInstance;

    //check if it is a relationclassinstance
    if (this.globalObjectInstance.current_class_instance == undefined) {
      //set relationclass to current current_class_instance
      const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
      this.globalObjectInstance.current_class_instance = sceneInstance.relationclasses_instances.find((relationclassInstance) => relationclassInstance.uuid == instance_uuid) as ClassInstance;

      if (this.globalObjectInstance.current_class_instance) {
        this.logger.log("clicked on relationclass_instance", "info");
        this.globalStateObject.activeStateLine = object as unknown as Line2;
      }
    }

    // Record THE selection — the one commands like Delete act on. Set here, once the
    // mesh's instance has actually been resolved, rather than inferred later from the
    // engine's draw-pipeline pointers.
    const selectedInstance =
      (class_instance as ClassInstance | undefined) ??
      (this.globalObjectInstance.current_class_instance as RelationclassInstance | undefined) ??
      (port_instance as PortInstance | undefined) ??
      null;
    this.globalSelectedObject.setSelectedInstance(selectedInstance);

    // Drive the reactive selection store (engine -> store) alongside the bus.
    let selType: SelectionType = null;
    if (class_instance) selType = "class";
    else if (this.globalObjectInstance.current_class_instance) selType = "relationclass";
    else if (port_instance) selType = "port";
    useSelectionStore.getState().setSelection(instance_uuid, selType);

    this.eventAggregator.publish("removeAttributeGui");
    // add eventAggregator for attribute gui -> set small timeout to wait for the removeAttributeGui event which updates also the texts
    setTimeout(() => {
      this.eventAggregator.publish("updateAttributeGui");
    }, 10);
  }

  /**
   * Select a scene object by its instance UUID, as if the user had clicked it on the
   * canvas — used by the model-tree panel to drive selection from a list. Puts the
   * canvas in SelectionMode first (entering a mode clears the current selection, so it
   * has to happen before the new object is set), then runs the same `selectObject`
   * routine a canvas pick does, and optionally pans the camera to the object.
   *
   * Runs in the same lane as a click (see `onDocumentMouseDown`): it writes the selection
   * pointers a click or a peer's draw pass may be writing at the same time.
   *
   * A no-op (logged) when nothing in the active tab is drawn for that UUID.
   */
  async selectInstanceByUuid(uuid: string, opts?: { focusCamera?: boolean }): Promise<void> {
    await runExclusive(async () => {
      // Looked up inside the lane, so a draw or delete queued ahead of this has landed.
      const object = this.globalObjectInstance.dragObjects.find((candidate) => candidate.uuid === uuid);
      if (!object) {
        this.logger.log(`selectInstanceByUuid: no drawn object for instance ${uuid}`, "info");
        return;
      }

      if (this.globalStateObject.getState() !== this.globalStateObject.stateNames[0]) {
        this.globalStateObject.setState(0);
      }
      this.globalObjectInstance.transformControls.setMode("translate");

      await this.selectObject(object);

      if (opts?.focusCamera) this.focusCameraOnObject(object);

      this.globalObjectInstance.render = true;
    });
  }

  /**
   * Pan the active camera so `object` sits at the centre of the view. Pan only — the
   * zoom / distance is left untouched. Works for both the 2D orthographic and the 3D
   * perspective camera because it only shifts the camera and the orbit target by the
   * same vector. Uses the object's world bounding-box centre so it also works for
   * relation `Line2`s, whose own `position` stays at the origin.
   */
  private focusCameraOnObject(object: THREE.Object3D): void {
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) return;

    const controls = this.globalObjectInstance.orbitControls;
    const camera = this.globalObjectInstance.camera;
    const offset = camera.position.clone().sub(controls.target);
    controls.target.copy(center);
    camera.position.copy(center).add(offset);
    controls.update();
  }

  /**
   * Transition to "View Mode": detach the transform controls, and if the click hit a
   * draggable object switch to "Selection Mode".
   */
  async onViewMode() {
    //detach objects from transformcontrols
    this.globalObjectInstance.transformControls.detach();
    //objects to intersect with this raycaster (check if click on Object)
    this.objects = this.globalObjectInstance.dragObjects;
    //array with objects, that intersect with the ray (only plane)
    this.intersects = this.globalObjectInstance.raycaster.intersectObjects(this.objects);

    //if an object was intersected: change to SelectionMode
    if (this.intersects.length > 0) {
      this.globalStateObject.setState(0);
      this.programState = this.globalStateObject.getState();
    } else {
      //show dialog box
      this.logger.log("Please select an object", "info");
    }
  }

  /**
   * Drawing mode: raycast the plane, create a class instance at the rounded pick
   * point, evaluate + draw its vizRep, then create/draw/attach a port object for each
   * of its port instances. Sets the auto-save + shared-mode patch flags afterwards.
   */
  async onDrawingMode() {
    //objects to intersect with this raycaster
    this.objects = ([] as THREE.Mesh[]).concat(this.globalObjectInstance.dragObjects);
    this.objects.push(this.globalObjectInstance.plane);

    //array with objects, that intersect with the ray (only plane)
    this.intersects = this.globalObjectInstance.raycaster.intersectObjects(this.objects);

    //reset current storage
    this.globalObjectInstance.current_class_instance = undefined as unknown as ClassInstance;
    this.gc.current_instance_object = undefined as unknown as typeof this.gc.current_instance_object;

    //if at leas one intersection
    if (this.intersects.length > 0 && this.clickedButton == 0) {
      // this.intersect = this.intersects[0];
      // find this.globalObjectInstance.plane intersection
      this.intersect = this.intersects.find((intersect) => intersect.object == this.globalObjectInstance.plane)!;

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
          this.globalClassObject.classUUID[index], //this is the metaclass UUID
          "class",
        );

        //this is the string that is stored in the metamodel
        //at the init we load all the strings of the according classes to the classObject
        //thus we do not have iterate over the whole metamodel again
        const stringFunction = geometry_string;

        //parse the string function from the metamodel to a js function
        const metaFunction = await this.metaUtility.parseMetaFunction(stringFunction);

        //reset gc instance
        await this.gc.resetInstance();

        //we call the function that is stored in the metamodel
        await this.gc.runVizRepFunction(metaFunction);
        // we call the function for drawing the information in the gc
        const classObject3D = await this.gc.drawVizRep(new THREE.Vector3(x, y, z), class_instance);
        this.globalObjectInstance.render = true;

        //------------------------------------
        //for each port_instance of the class_instance we create a port_object
        //we iterate over the port_instances of the class_instance
        for (const port_instance of class_instance.port_instance) {
          //set current port_instance in global object
          this.globalObjectInstance.current_port_instance = port_instance;

          const newGC = new GraphicContext();

          //we define the gemoetry of the port_object
          const metaPort = (await this.metaUtility.getMetaPort(port_instance.uuid_port))!;
          const port_geometry_string = metaPort.geometry;
          //parse the string function from the metamodel to a js function
          const metaFunctionPort = await this.metaUtility.parseMetaFunction(port_geometry_string.toString());

          //reset gc instance
          await newGC.resetInstance();

          //we call the function that is stored in the metamodel
          await newGC.runVizRepFunction(metaFunctionPort);
          // we call the function for drawing the information in the newGC
          const portObject3D = await newGC.drawVizRepPort(new THREE.Vector3(0, 0, 0), port_instance);
          //we add the portObject to the classObject
          newGC.attachPort(portObject3D, classObject3D);
          //we set the position of the portObject according to the meta definition
          portObject3D.position.set(metaPort.coordinates_2d!.x, metaPort.coordinates_2d!.y, metaPort.coordinates_2d!.z);

          //reset current_port_isntance
          this.globalObjectInstance.current_port_instance = undefined as unknown as PortInstance;
          this.globalObjectInstance.render = true;
        }

        this.markSceneDirty();

        // Propagate the new class instance to all peers. This runs AFTER every port /
        // attribute creation await, so peers receive a fully populated instance.
        publishLocalChange({ type: "add_class_instance", classInstance: class_instance });

        // Undo step for the drop. Same place as the Y.Doc publish and for the same
        // reason: every port + attribute of the new instance exists by now, so the
        // snapshot is of a finished instance rather than a half-built one.
        this.eventAggregator.publish("historyRecord", { label: `create ${class_instance.name}` });
      }
    }
    else {
      if (this.clickedButton == 2) {
        //default state
        this.globalStateObject.setState(1);
      }
    }
  }

  /**
   * Drawing mode for relation classes: click 1 creates the relation + its `role_from`
   * and starts the active line; clicks on the plane add bendpoints; the click on a
   * second element finalizes the relation + its `role_to`. Right-click resets or
   * deletes the in-creation relation. Start/end points are consistency-checked.
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

    let x!: number, y!: number, z!: number;
    if (this.intersects.length > 0 && this.clickedButton == 0) {
      this.intersect = this.intersects[0];

      x = Math.round(this.intersect.point.getComponent(0) * 10) / 10;
      y = Math.round(this.intersect.point.getComponent(1) * 10) / 10;
      z = Math.round(this.intersect.point.getComponent(2) * 10) / 10;
    }

    //------------------------------------
    //if at least one intersection
    //------------------------------------
    if (this.intersects.length > 0 && 0 <= this.globalObjectInstance.relationObjects.length && this.globalObjectInstance.relationObjects.length <= 1 && !this.globalStateObject.activeStateLine && this.clickedButton == 0) {
      // set variable to false to make sure that there is no update during the creation of a relationclassinstance if autoSave is enabled
      if (this.globalObjectInstance.autoSave) {
        this.globalObjectInstance.doSceneInstancePatch = false;
      }

      //reset gc instance
      await this.gc.resetInstance();

      //------------------------------------
      //check if relation is allowed for role_from
      //------------------------------------

      const { classInstance: intersect_class_instance, portInstance: intersect_port_instance } = await this.resolveIntersectedEndpoint();
      const relationclass = await this.findMetaRelationclass(index);

      //exactly one of the two endpoint kinds is set
      this.allowed = this.consistencyChecker.checkStartPoint(relationclass!, intersect_class_instance, intersect_port_instance);
      if (this.allowed == false) {
        this.logger.log("action is not allowed --> no relationclass created", "close");
        return;
      }

      //------------------------------------
      //create instance of relation object in class_instance
      //------------------------------------

      const relationclass_instance: RelationclassInstance = await this.instanceCreationHandler.createRelationclassInstance(this.instanceCreationHandler.create_UUID(), x, y, z, this.globalRelationclassObject.relationClassUUID[index], "relation");

      //put to relationClassObject
      this.globalRelationclassObject.relationclassInstanceInCreation = relationclass_instance;

      //this is the from Object if we create a relationclass_instance. We need that for the role_instance (from)
      const fromObject: THREE.Mesh = this.intersect.object as unknown as THREE.Mesh;

      const uuid_relationclass: string = relationclass!.uuid;

      //------------------------------------
      //create role_instance --> role_from
      //------------------------------------
      const role_from: RoleInstance = await this.instanceCreationHandler.createRoleInstance(
        this.instanceCreationHandler.create_UUID(), //uuid of the role
        intersect_class_instance!, //this is the uuid of the reference_class_instance -->fromObject
        intersect_port_instance!, //this would be the port
        "from", //from or to role
        uuid_relationclass, //uuid of the meta relationclass
        //relationclass_instance.uuid,                                                        //uuid of the relationclass_instance
        "role_from for metaobject: " + relationclass_instance.uuid, //name of the instance
      );

      //role_from.uuid_reference_relationclass_instance = relationclass_instance.uuid;
      relationclass_instance.role_instance_from = role_from;
      this.logger.log("created role_instance_from", "close");

      //we call the function that is stored in the metamodel
      await this.gc.runVizRepFunction(metaFunction);
      // we call the function for drawing the information in the gc
      // The draw hands the line back directly. It becomes the ACTIVE line — the one the
      // rest of this gesture (bendpoints, the closing click) works on — and only a draw
      // started by THIS user's click may claim that role, which is why the line travels
      // as a return value rather than through globalStateObject.
      const line: Line2 = await this.gc.drawVizRep_rel();
      this.globalStateObject.setActiveStateLine(line);
      this.globalObjectInstance.render = true;

      this.globalObjectInstance.dragObjects.unshift(line as unknown as THREE.Mesh);
      this.globalObjectInstance.scene.add(line);

      line.userData.relObj.push(this.intersect.object);
      line.userData.relObj.push(this.globalObjectInstance.mousePointer3d);

      // add first point object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, fromObject);

      // add second point object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, this.globalObjectInstance.mousePointer3d);
    }
    //----------------------
    //if click on plane
    //-----------------------
    else if (this.intersects.length == 0 && this.globalStateObject.activeStateLine && this.clickedButton == 0) {
      // set variable to false to make sure that there is no update during the creation of a relationclassinstance if autoSave is enabled
      if (this.globalObjectInstance.autoSave) {
        this.globalObjectInstance.doSceneInstancePatch = false;
      }

      const newPos = this.globalObjectInstance.mousePointer3d.position.clone();

      //we create an instance of the BendPoint_Class
      const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
      let relationclass_instance: RelationclassInstance = sceneInstance.relationclasses_instances.find((relationclass_instance) => relationclass_instance.uuid == this.globalStateObject.activeStateLine!.uuid) as RelationclassInstance;

      //get metaclass from parent class_instance
      const relationclass: Relationclass = (await this.metaUtility.getMetaRelationclass(relationclass_instance.uuid_relationclass))!;

      const bendpoint_class: Class = (await this.metaUtility.getMetaClass(relationclass.bendpoint))!;
      const bendpoint_instance: ClassInstance = await this.instanceCreationHandler.createBendpointInstance(newPos.x, newPos.y, newPos.z, bendpoint_class.geometry, bendpoint_class.uuid);
      const bendpoint_instance_object: THREE.Mesh = this.globalObjectInstance.dragObjects.find((object) => object.uuid == bendpoint_instance.uuid)!;

      const bendpoint = this.instanceCreationHandler.addLinePoint(this.globalStateObject.activeStateLine!, newPos, bendpoint_instance_object);
      this.logger.log("added point to line", "info");

      //---------------------------------------------------------------------------------------------------------------

      // add second point object to array
      //search in relationclass_instances for instance of relation with the given uuid
      relationclass_instance = sceneInstance.relationclasses_instances.find((element) => element.uuid == this.globalStateObject.activeStateLine!.uuid)!;

      //remove last point (mousePointer3d) and store it
      relationclass_instance.line_points.pop();

      //add new bendpoint object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, bendpoint!);

      // add last point to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, this.globalObjectInstance.mousePointer3d);
      this.logger.log("added point object xyz to class_instance.line_points", "info");

      //bug fix -> unclear why this was here
      // bendpoint_instance.uuid_relationclass_bendpoint = relationclass_instance.uuid;
      this.logger.log("added relationclass_instance_uuid " + relationclass_instance.uuid + " to bendpoint_instance", "info");

      // Propagate the bendpoint to peers as a regular class instance. A bendpoint is a
      // plain ClassInstance stored in scene.class_instances, and the finished relation's
      // line_points reference it by UUID. It is sent here (at bendpoint-creation time)
      // rather than at relation finalize so each bendpoint is rendered on remote peers
      // before the relation that references it arrives — mirroring the load order
      // (class instances before relations) in PersistencyHandler.importInstances and
      // avoiding a missing-object crash in Animator.setPos.
      publishLocalChange({ type: "add_class_instance", classInstance: bendpoint_instance });
    }
    //----------------------
    //if click on element
    //----------------------
    else if (this.intersects.length > 0 && 0 <= this.globalObjectInstance.relationObjects.length && this.globalObjectInstance.relationObjects.length <= 1 && this.globalStateObject.activeStateLine && this.clickedButton == 0) {
      //------------------------------------
      //check if relation is allowed for role_to

      const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
      const { classInstance: intersect_class_instance, portInstance: intersect_port_instance } = await this.resolveIntersectedEndpoint();
      const relationclass = await this.findMetaRelationclass(index);

      //exactly one of the two endpoint kinds is set
      this.allowed = this.consistencyChecker.checkEndPoint(relationclass!, intersect_class_instance, intersect_port_instance);
      if (this.allowed == false) {
        this.logger.log("action is not allowed --> no relationclass created", "close");
        return;
      }

      this.instanceCreationHandler.addLastLinePoint(this.globalStateObject.activeStateLine, this.intersect.object);

      //---------------------------
      //search in class_instances for instance of relation with the given uuid
      const relationclass_instance: RelationclassInstance = sceneInstance.relationclasses_instances.find((element) => element.uuid == this.globalStateObject.activeStateLine!.uuid)!;
      //remove last point (mousePointer3d)
      relationclass_instance.line_points.pop();

      //add last point object to array
      this.instanceCreationHandler.addPointToClassInstance(relationclass_instance, this.intersect.object);
      this.logger.log("added last point object to class_instance.line_points", "info");

      //reset active_additional
      //we set a timeout, to let the animate function finish its job
      setTimeout(() => {
        delete this.globalStateObject.activeStateLine;
      }, 100);

      //this is the from Object if we create a relationclass_instance. We need that for the role_instance (from)
      const uuid_relationclass: string = relationclass!.uuid;

      //------------------------------------
      //create role_instance --> role_to
      //------------------------------------
      const role_to: RoleInstance = await this.instanceCreationHandler.createRoleInstance(
        this.instanceCreationHandler.create_UUID(), //uuid of the role
        intersect_class_instance!, //this is the uuid of the reference_class_instance -->fromObject
        intersect_port_instance!,
        "to", //from or to role
        uuid_relationclass, //uuid of the meta relationclass
        "role_from for metaobject: " + relationclass_instance.uuid, //name of the instance
      );

      //role_to.uuid_reference_relationclass_instance = relationclass_instance.uuid;
      relationclass_instance.role_instance_to = role_to;

      this.markSceneDirty();

      // Propagate the fully-formed relation class instance (both roles set) to peers.
      publishLocalChange({ type: "add_relation_class_instance", relationClassInstance: relationclass_instance });

      // ONE undo step for the whole line, bendpoints included. The bendpoints created
      // while drawing are intermediate states of this single action, so they are not
      // recorded as they happen — the relation is only real once both roles are set,
      // and abandoning the draw (right-click) unwinds back to the last recorded step.
      this.eventAggregator.publish("historyRecord", { label: `create ${relationclass_instance.name}` });
    }
    //if right click and there is no relationclass_instance in creation reset state to view mode
    else if (this.clickedButton == 2 && !this.globalStateObject.activeStateLine) {
      //default state
      this.globalStateObject.setState(1);
    }
    //if right click and there is a relationclass_instance in creation
    else if (this.clickedButton == 2 && this.globalStateObject.activeStateLine && this.globalRelationclassObject.relationclassInstanceInCreation) {
      //delete relationclassinstance
      const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
      const index = sceneInstance.relationclasses_instances.findIndex((relationclassInstance) => relationclassInstance.uuid == this.globalRelationclassObject.relationclassInstanceInCreation.uuid);
      await this.deletionHandler.deleteRelationclassInstance(sceneInstance.relationclasses_instances[index], index);
      this.globalRelationclassObject.relationclassInstanceInCreation = undefined as unknown as RelationclassInstance;
      this.globalStateObject.setState(3);
    }
  }

  /**
   * Simulation mode: raycast the button objects; on a left click run the button's
   * simulation code string against its parent instance.
   */
  async onSimulationMode() {
    this.objects = this.globalObjectInstance.buttonObjects;
    this.intersects = await this.globalObjectInstance.raycaster.intersectObjects(this.objects, false); //false to only test on parent object
    if (this.intersects.length > 0 && this.clickedButton == 0) {
      this.intersect = this.intersects[0];
      const object: THREE.Mesh = this.intersect.object as unknown as THREE.Mesh;
      const simulationCode: string = object.userData.expression;
      const parentInstance = await this.instanceUtility.getAnyInstance(object.parent!.uuid);
      if (parentInstance) {
        this.simulationUtility.runSimulationFunction(simulationCode, parentInstance as any);
      }
    }
  }

  // -------------------------------------------------
  // helpers
  // -------------------------------------------------

  /**
   * The class OR port instance the last raycast hit — exactly one of them is set,
   * because a relation end may be anchored on either.
   */
  private async resolveIntersectedEndpoint(): Promise<{ classInstance?: ClassInstance; portInstance?: PortInstance }> {
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const classInstance = sceneInstance.class_instances.find((candidate) => candidate.uuid == this.intersect.object.uuid);
    if (classInstance) return { classInstance };

    const allPorts = await this.instanceUtility.getAllPortInstancesOfTabContext();
    return { portInstance: allPorts.find((portInstance) => portInstance.uuid == this.intersect.object.uuid) };
  }

  /** The meta relationclass behind the palette entry at `index` of the open scene type. */
  private async findMetaRelationclass(index: number): Promise<Relationclass | undefined> {
    const sceneType = (await this.metaUtility.getTabContextSceneType())!;
    return sceneType.relationclasses.find((relationclass) => relationclass.uuid == this.globalRelationclassObject.relationClassUUID[index]);
  }

  /**
   * Queue the open scene for the next auto-save tick after a structural change. A
   * shared tab additionally needs the local-origin flag, which is what the shared
   * auto-save branch keys off.
   */
  private markSceneDirty(): void {
    if (!this.globalObjectInstance.autoSave) return;
    this.globalObjectInstance.doSceneInstancePatch = true;
    if (this.globalObjectInstance.currentTabAccess) {
      this.globalObjectInstance.doSceneInstancePatchLocal = true;
    }
  }

  parseObj(obj: string) {
    const ret: string = Function('"use strict";return (' + obj + ")")();
    return ret;
  }
}

// Module singleton — one shared instance.
export const interactionHandler = new InteractionHandler();
