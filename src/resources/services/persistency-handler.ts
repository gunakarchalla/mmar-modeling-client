import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { Class, Relationclass, SceneInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalStateObject } from "@/engine/global-state-object";
import { GraphicContext, graphicContext } from "@/engine/graphic-context";
import { instanceCreationHandler } from "@/engine/instance-creation-handler";
import { describeError } from "@/resources/util/describe-error";
import { metaUtility } from "./meta-utility";
import { instanceUtility } from "./instance-utility";
import { snapshotService } from "./snapshot-service";
import { backendService } from "./backend-service";
import { eventBus } from "./event-bus";
import { runExclusive } from "./draw-lock";
import { logger } from "./logger";
import { NOT_ALLOWED_MESSAGE } from "./metamodel-constraints";

/** Shown when the server refuses the save because the user may only read the scene. */
const NOT_AUTHORIZED_MESSAGE = "You don't have enough authorization to edit this scene instance.";

/**
 * Whether a refused save was refused by the rule engine rather than by the access
 * check. Both answer 403, and the response body carries nothing but a message, so the
 * message is what tells them apart: every rule refusal is phrased "The rule error was
 * fired for the ..." (`Instance_attributes.rules.ts`, `Instance_commons.rules.ts`), and
 * the regex rule's own wording is matched as well so a reworded prefix still lands.
 */
function violatesMetamodelRule(serverMessage: string): boolean {
  return /rule error was fired|does not match the regex/i.test(serverMessage);
}

/**
 * Turns a stored SceneInstance into a drawn scene, and back.
 *
 * `importInstances()` is the load path: it registers the scene's attribute, role and
 * port instances on the engine, then draws every class instance (running its vizRep, or
 * a URDF-supplied mesh where the robotics algorithms left one) and every relation.
 * Both draw passes are idempotent — an instance already in `dragObjects` is skipped —
 * which is what lets them double as the "a peer added something" handler for the two
 * remote-add channels subscribed in the constructor.
 *
 * `persistSceneInstanceToDB()` is the save path, a single PATCH that upserts the scene.
 * A 403 means read-only access to a shared scene: the local edit is rolled back to the
 * last snapshot and the scene re-imported, so the canvas shows the server's state rather
 * than a change that was refused.
 *
 * `saveToTextfile` / `saveAllOpenModelInstancesToTextfile` are the JSON export paths.
 */
export class PersistencyHandler {
  private globalObjectInstance = globalObject;
  private globalStateObject = globalStateObject;
  private gc = graphicContext;
  private metaUtility = metaUtility;
  private instanceUtility = instanceUtility;
  private snapshotService = snapshotService;
  private logger = logger;
  private eventAggregator = eventBus;

  constructor() {
    // Draw what a peer just added. The draw passes read the ACTIVE tab, so the tab the
    // update belongs to is selected for the duration and restored afterwards — the user
    // may well be looking at a different tab. Handlers are never async: the bus does not
    // await them, so a rejection would go unhandled.
    this.eventAggregator.subscribe("remoteClassInstanceAdded", ({ tabIndex }) => {
      this.drawForTab(tabIndex, () => this.checkIfClassinstanceInScene(), "remoteClassInstanceAdded");
    });
    this.eventAggregator.subscribe("remoteRelationInstanceAdded", ({ tabIndex }) => {
      this.drawForTab(tabIndex, () => this.checkIfRelationclassinstanceInScene(), "remoteRelationInstanceAdded");
    });
  }

  /**
   * Run a draw pass against `tabIndex` and restore the previously selected tab.
   *
   * The whole thing goes through the draw lock, tab swap included: a draw pass and a
   * click the user makes while it runs would otherwise interleave over the shared
   * graphic context, and the tab swap would move the ground under the click's feet.
   * Handed over with `void` — a caller waiting on the lane from inside it would deadlock.
   */
  private drawForTab(tabIndex: number, draw: () => Promise<void>, channel: string): void {
    void runExclusive(async () => {
      const savedTab = this.globalObjectInstance.selectedTab;
      // The draw passes BORROW current_class_instance to tell the vizRep pipeline which
      // instance they are drawing, and leave it pointing at the last one they drew. That
      // field is also what a Delete keypress deletes (deletion-handler.onPressDelete), so
      // a peer's addition landing here must hand back whatever the local user had.
      const savedClassInstance = this.globalObjectInstance.current_class_instance;
      this.globalObjectInstance.selectedTab = tabIndex;
      try {
        await draw();
      } finally {
        this.globalObjectInstance.selectedTab = savedTab;
        this.globalObjectInstance.current_class_instance = savedClassInstance;
      }
    }).catch((error) => this.logger.log(`${channel} failed: ${describeError(error)}`, "error"));
  }

  async checkIfClassinstanceInScene() {
    //get scene of tabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;

    for (const class_instance of sceneInstance.class_instances) {
      const drag_object_uuids: string[] = [];
      //create array with only uuids of all dragObjects (classes only)
      for (const object of this.globalObjectInstance.dragObjects) {
        drag_object_uuids.push(object.uuid);
      }

      //true if already in drag_objects, false if not
      const found_object_in_dragObjects = drag_object_uuids.includes(class_instance.uuid);

      //if already in scene do nothing, else call everything to draw visualization
      if (found_object_in_dragObjects) {
        this.logger.log("object already in scene: " + class_instance.uuid, "info");
      } else {
        //point to insert object
        const point = new THREE.Vector3(
          class_instance.coordinates_2d.x,
          class_instance.coordinates_2d.y,
          class_instance.coordinates_2d.z,
        );
        let classObject3D: THREE.Mesh | undefined;

        // Prefer a URDF-provided mesh where the robotics algorithms left one, and fall
        // back to the metamodel's vizRep otherwise.
        const customVizRep = (class_instance as any).urdfVizRep as
          | { format: string; data: string | ArrayBuffer; scale?: number[] }
          | undefined;

        if (customVizRep) {
          await this.gc.resetInstance();
          this.globalObjectInstance.current_class_instance = class_instance;
          this.gc.current_instance_object = class_instance;

          if (customVizRep.format === "stl") {
            await this.gc.graphic_stl(customVizRep.data as ArrayBuffer, customVizRep.scale);
          } else {
            await this.gc.graphic_gltf(customVizRep.data, 0, 0, 0, customVizRep.scale);
          }

          // we call the function for drawing the information in the gc
          classObject3D = await this.gc.drawVizRep(point, class_instance);
          this.globalObjectInstance.render = true;
          await this.gc.resetInstance();
        }

        if (!classObject3D) {
          //get parent metaClass of the instance from the metamodel
          const meta_class: Class | undefined = await this.metaUtility.getMetaClass(
            class_instance.uuid_class,
          );
          //parse metafunction
          const metaFunction = await this.metaUtility.parseMetaFunction(
            meta_class!.geometry as unknown as string,
          );

          //reset this.gc instance
          this.gc.resetInstance();
          //set this.globalObjectInstance.current_class_instance (we need this in other functions)
          this.globalObjectInstance.current_class_instance = class_instance;
          this.gc.current_instance_object = class_instance;

          //we set the metafunction to the "geometry" property of the class_instance
          await this.gc.runVizRepFunction(metaFunction);
          classObject3D = await this.gc.drawVizRep(point, class_instance);
          this.globalObjectInstance.render = true;
          this.gc.resetInstance();
        }

        if (!classObject3D) {
          continue;
        }

        //------------------------------------
        //for each port_instance of the class_instance we create a port_object
        for (const port_instance of class_instance.port_instance) {
          //set current port_instance in global object
          this.globalObjectInstance.current_port_instance = port_instance;

          //store position from port_instance
          const oldPosition = new THREE.Vector3(
            port_instance.coordinates_2d.x,
            port_instance.coordinates_2d.y,
            port_instance.coordinates_2d.z,
          );

          const newGC = new GraphicContext();

          //we define the geometry of the port_object
          const metaPort = await this.metaUtility.getMetaPort(port_instance.uuid_port);
          const geometry_string = metaPort!.geometry;
          //parse the string function from the metamodel to a js function
          const metaFunctionPort = await this.metaUtility.parseMetaFunction(
            geometry_string.toString(),
          );

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

          //reset current_port_instance
          this.globalObjectInstance.current_port_instance = undefined as any;
          this.globalObjectInstance.render = true;
        }
      }
    }
  }

  async checkIfRelationclassinstanceInScene() {
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;

    for (const relationclass_instance of sceneInstance.relationclasses_instances) {
      this.logger.log("we check the relationclass_instance: " + relationclass_instance.uuid, "info");

      // Skip if this relation class instance is already rendered in the scene
      if (this.globalObjectInstance.dragObjects.some((o) => o.uuid === relationclass_instance.uuid)) {
        this.logger.log(
          "relationclass_instance already in scene: " + relationclass_instance.uuid,
          "info",
        );
        continue;
      }

      const metaclass: Relationclass | undefined = await this.metaUtility.getMetaRelationclass(
        relationclass_instance.uuid_class,
      );
      const linePoints: object[] = relationclass_instance.line_points;

      this.gc.current_instance_object = relationclass_instance;
      this.globalObjectInstance.current_class_instance = relationclass_instance;

      const metaFunction = await this.metaUtility.parseMetaFunction(
        metaclass!.geometry as unknown as string,
      );

      //we call the function that is stored in the metamodel
      await this.gc.runVizRepFunction(metaFunction);
      // we call the function for drawing the information in the gc
      // The line comes back from the draw call. This pass draws relations the LOCAL USER
      // did not just click into being — a peer's, or a scene being loaded — so it must
      // not touch globalStateObject.activeStateLine: that field belongs to the relation
      // the local user is drawing right now, and overwriting (then clearing) it stranded
      // a half-drawn line whenever a collaborator's relation arrived mid-gesture.
      const line: Line2 = await this.gc.drawVizRep_rel();
      this.globalObjectInstance.render = true;

      //also set the uuid for old uuid for the children
      //otherwise there is an error in the animationloop of the line
      // (the line is a Line2 while dragObjects is typed Mesh[]; the line does belong in
      // the pick list, hence the cast.)
      line.uuid = relationclass_instance.uuid;
      for (const child of line.children) {
        child.uuid = relationclass_instance.uuid;
      }

      this.globalObjectInstance.scene.add(line);

      //push each linepoint to the relObj
      for (const element of linePoints) {
        const object = this.globalObjectInstance.dragObjects.find(
          (object) => object.uuid == (element as any)["UUID"],
        );
        line.userData.relObj.push(object);
      }
      this.globalObjectInstance.dragObjects.unshift(line as unknown as THREE.Mesh);
    }
  }

  async mapClassInstancetoClass() {
    //get sceneInstance from TabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;
    const allPortInstances = await this.instanceUtility.getAllPortInstancesOfTabContext();

    for (const class_instance of sceneInstance.class_instances) {
      //-------------------------------------------------------------
      //clean instantiation of attribute_instance in array of class
      const attribute_instances = class_instance.attribute_instance;
      for (const attribute_instance of attribute_instances) {
        this.globalObjectInstance.attribute_instances.push(attribute_instance);
      }

      // push the attribute_instances of all port_instances which are attached to the class_instance
      for (const port_instance of class_instance.port_instance) {
        const port_attribute_instances = port_instance.attribute_instances;
        for (const attribute_instance of port_attribute_instances) {
          this.globalObjectInstance.attribute_instances.push(attribute_instance);
        }

        //push the port_instance to the global array
        allPortInstances.push(port_instance);
      }
    }
  }

  async mapRelationclassInstancetoClass() {
    //get sceneInstance from TabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;
    for (const relationclass_instance of sceneInstance.relationclasses_instances) {
      //clean instantiation of attribute_instance in array of relationclass
      const attribute_instances = relationclass_instance.attribute_instance;
      for (const attribute_instance of attribute_instances) {
        this.globalObjectInstance.attribute_instances.push(attribute_instance);
      }

      // push roles to global array
      this.globalObjectInstance.role_instances.push(relationclass_instance.role_instance_from);
      this.globalObjectInstance.role_instances.push(relationclass_instance.role_instance_to);
    }
  }

  async classifyRoleInstance() {
    //get sceneInstance from TabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;
    for (const role_instance of sceneInstance.role_instances) {
      // add role instance to global object array role_instances[]
      this.globalObjectInstance.role_instances.push(role_instance);
    }
  }

  async classifyPortInstance() {
    //get sceneInstance from TabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;
    for (const port_instance of sceneInstance.port_instances) {
      this.globalObjectInstance.scene.traverse(async (object3d: THREE.Object3D) => {
        if (object3d.uuid == port_instance.uuid) {
          await this.gc.setScale(object3d, port_instance);
        }
      });
    }
  }

  async mapAttributeInstancetoClass() {
    //get sceneInstance from TabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) return;
    for (const attribute_instance of sceneInstance.attribute_instances) {
      this.globalObjectInstance.attribute_instances.push(attribute_instance);
    }
  }

  async persistSceneInstanceToDB() {
    //get sceneInstance from TabContext
    const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) {
      this.logger.log("No active scene instance found to persist.", "error");
      return;
    }

    // Only persist scenes that belong to a known SceneType (an open, valid tab).
    const sceneType = await this.metaUtility.getTabContextSceneType();
    if (!sceneType) return;

    // A single PATCH both creates the scene on its first save and updates it on every
    // save after that: the server PATCH is an upsert, so there is no POST-on-404
    // fallback anymore (which is what produced the misleading 404 on scene creation).
    try {
      await backendService.sceneInstancesPATCH(sceneInstance.uuid, sceneInstance);
      this.snapshotService.setSceneInstanceSnapshot(sceneInstance);
      this.logger.log("SceneInstance saved", "info");
    } catch (error) {
      const patchError = error as any;
      const statusCode = Number(patchError?.status);

      // 403: the save was refused, for one of two reasons — read-only access to a
      // shared scene, or a metamodel rule the scene breaks (a value that does not match
      // its attribute type's regex is the common one). Both revert to the last snapshot
      // and re-import, so the canvas reflects the server's state rather than the
      // rejected edit; only the message differs, and both go to the snackbar rather
      // than a blocking window.alert. The full server text goes to the log window.
      if (statusCode === 403) {
        const detail = String(patchError?.message ?? "");
        this.logger.log(violatesMetamodelRule(detail) ? NOT_ALLOWED_MESSAGE : NOT_AUTHORIZED_MESSAGE, "error");
        this.logger.log(`SceneInstance save refused: ${detail}`, "close");
        this.snapshotService.restoreSceneInstanceToCurrentTab();
        await this.importInstances();
        return;
      }

      this.logger.log(
        `SceneInstance save failed: ${patchError?.message || JSON.stringify(patchError)}`,
        "error",
      );
    }
  }

  async loadPersistedModel(modelToLoad: SceneInstance) {
    await this.importInstances();

    // A scene saved before scene-type attributes were instantiated carries none, so the
    // attribute window would show an empty section for it. Adding the missing ones on
    // load is what makes a scene's own attributes appear for existing models too, and is
    // a no-op once they exist. This is the only use of the parameter — importInstances()
    // reads the active tab itself.
    await instanceCreationHandler
      .createMissingSceneAttributeInstances(modelToLoad)
      .catch((error) =>
        this.logger.log(`Scene attribute instantiation failed: ${describeError(error)}`, "error"),
      );
  }

  //function to import stored instances to the model
  async importInstances() {
    // The scene is rebuilt from stored data, so a line the user was drawing into the
    // scene being replaced no longer exists. Dropping the reference here rather than in
    // checkIfRelationclassinstanceInScene keeps the remote-add path (which shares that
    // draw pass, and runs while the user may well be mid-gesture) from clearing it.
    this.globalStateObject.activeStateLine = undefined;

    //map class_instances to class_pattern and push to globalObjectInstance.attribute_instances
    await this.mapClassInstancetoClass();
    await this.gc.resetInstance();

    //map relationclass_instances
    await this.mapRelationclassInstancetoClass();
    await this.gc.resetInstance();

    //map attribute_instances
    await this.mapAttributeInstancetoClass();
    await this.gc.resetInstance();

    //for each class instance check if already in scene
    await this.checkIfClassinstanceInScene();
    await this.gc.resetInstance();

    //for each relationclass instance check if already in scene
    await this.checkIfRelationclassinstanceInScene();
    await this.gc.resetInstance();

    //classify role_instances
    await this.classifyRoleInstance();
    await this.gc.resetInstance();

    //classify port instances
    await this.classifyPortInstance();
    await this.gc.resetInstance();
  }

  //function to save the model to a textfile
  async saveToTextfile() {
    this.logger.log("save", "info");
    if (this.globalObjectInstance.tabContext.length > 0) {
      const sceneInstance = await this.instanceUtility.getTabContextSceneInstance();
      const blob = new Blob([JSON.stringify(sceneInstance)], {
        type: "text/plain;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);

      this.downloadURL(url, sceneInstance!.name + ".json");
    }
  }

  async saveAllOpenModelInstancesToTextfile() {
    this.logger.log("save", "info");
    if (this.globalObjectInstance.tabContext.length > 0) {
      const sceneInstances = await this.instanceUtility.getAllOpenSceneInstances();
      const json: Record<string, SceneInstance> = {};
      for (const sceneInstance of sceneInstances) {
        json[sceneInstance.uuid] = sceneInstance;
      }
      const blob = new Blob([JSON.stringify(json)], { type: "json/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);

      this.downloadURL(url, "allOpenModels.json");
    }
  }

  downloadURL(url: string, fileName: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Module singleton — one shared instance.
export const persistencyHandler = new PersistencyHandler();
