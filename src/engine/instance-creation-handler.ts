import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { ClassInstance, Attribute, AttributeInstance, UUID, Class, Relationclass, RelationclassInstance, SceneInstance, PortInstance, RoleInstance, add_table_row, table_columns_in_order } from "@gds";
// ColumnStructure is not re-exported from the gds barrel, so it is deep-imported.
import type { ColumnStructure } from "@gds/models/meta/Metamodel_columns.structure";
import { globalObject } from "@/engine/global-definition";
import { globalClassObject } from "@/engine/global-class-object";
import { globalRelationclassObject } from "@/engine/global-relationclass-object";
import { globalStateObject } from "@/engine/global-state-object";
import { graphicContext } from "@/engine/graphic-context";
import { metaUtility } from "@/resources/services/meta-utility";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { eventBus } from "@/resources/services/event-bus";
import { publishLocalChange } from "@/resources/collaboration/local-change-publisher";

/**
 * Builds the gds instances behind everything the user draws: class instances, relation
 * class instances with their two role instances, bendpoints, port instances and the
 * attribute instances that hang off all of them.
 *
 * Attribute creation is recursive — a table attribute gets a first row of column
 * attribute instances, and a column that is itself a table recurses again.
 *
 * Creating an instance announces itself on the `sceneInstanceMutated` channel so views
 * that mirror the scene (the simulation window, for one) can refresh.
 */export class InstanceCreationHandler {
  private globalObjectInstance = globalObject;
  private globalClassObject = globalClassObject;
  private globalRelationclassObject = globalRelationclassObject;
  private globalStateObject = globalStateObject;
  private metaUtility = metaUtility;
  private instanceUtility = instanceUtility;
  private gc = graphicContext;
  private logger = logger;
  private eventAggregator = eventBus;

  //create_uuid
  create_UUID() {
    let dt = new Date().getTime();
    const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
  }

  //-------------------------------------------------
  // attribute_instance
  //-------------------------------------------------
  async createAttributeInstance(attribute: Attribute, assigned_uuid_scene_instance: string, assigned_uuid_class_instance: string, instance_value: string, assigned_uuid_port_instance?: string, is_propagated?: boolean, uuid_reference_attribute?: string, table_attributes?: AttributeInstance[], table_attribute_reference?: string, role_from?: RoleInstance) {
    const uuid = this.create_UUID();

    let class_instance: ClassInstance | null | undefined = null;
    let scene_instance: SceneInstance | null | undefined = null;
    let port_instance: PortInstance | null | undefined = null;

    //if assigned_uuid_class_instance is not null then get the class instance
    if (assigned_uuid_class_instance) {
      class_instance = await this.instanceUtility.getClassInstance(assigned_uuid_class_instance);
    } else if (assigned_uuid_scene_instance) {
      scene_instance = await this.instanceUtility.getSceneInstance(assigned_uuid_scene_instance);
    } else if (assigned_uuid_port_instance) {
      port_instance = await this.instanceUtility.getPortInstance(assigned_uuid_port_instance);
    }

    const attribute_instance: AttributeInstance = new AttributeInstance(uuid, attribute.uuid, assigned_uuid_scene_instance, assigned_uuid_class_instance, instance_value, assigned_uuid_port_instance, is_propagated, uuid_reference_attribute, table_attributes, table_attribute_reference, role_from);

    //push to log file
    this.logger.log("Attribute Instance " + attribute_instance.value + " created", "done");

    // A table starts with one row. The table rules live in gds (Instance_tables).
    if ((attribute.attribute_type.has_table_attribute ?? []).length > 0) {
      add_table_row(attribute_instance, await this.createTableRowCells(attribute));
    }

    //if attached to class_instance
    if (assigned_uuid_class_instance) {
      // add attribute_instance to class_instance
      const attribute_instances = class_instance!.attribute_instance;
      attribute_instances.push(attribute_instance);
    }

    if (assigned_uuid_scene_instance) {
      // add attribute_instance to scene_instance
      const attribute_instances: AttributeInstance[] = scene_instance!.attribute_instances;
      attribute_instances.push(attribute_instance);
    }

    if (assigned_uuid_port_instance) {
      // add attribute_instance to port_instance
      const attribute_instances = port_instance!.attribute_instances;
      attribute_instances.push(attribute_instance);
    }

    // add attribute_instance to global.attribute_instance
    this.globalObjectInstance.attribute_instances.push(attribute_instance);
    attribute_instance.name = attribute.name;

    return attribute_instance;
  }

  /**
   * A new cell for a table column: an instance of the column's attribute holding the
   * attribute's default value — or, for a column whose attribute is itself a table, a
   * nested table with its first row. It is returned unattached; gds's `add_table_row` /
   * `add_table_cell` number it and hang it on its table.
   */
  async createTableCell(column: ColumnStructure): Promise<AttributeInstance> {
    const isNestedTable = (column.attribute.attribute_type.has_table_attribute ?? []).length > 0;
    return await this.createAttributeInstance(
      column.attribute,
      null as unknown as string,
      null as unknown as string,
      isNestedTable ? "" : (column.attribute.default_value ?? ""),
    );
  }

  /** The cells of a new row of `tableAttribute`'s table: one per column, in column order. */
  async createTableRowCells(tableAttribute: Attribute): Promise<AttributeInstance[]> {
    const cells: AttributeInstance[] = [];
    for (const column of table_columns_in_order(tableAttribute.attribute_type.has_table_attribute ?? [])) {
      cells.push(await this.createTableCell(column));
    }
    return cells;
  }

  /**
   * Instantiate the attributes the SCENE TYPE declares but the scene instance has no
   * AttributeInstance for yet, and return the ones created.
   *
   * Not done by the server either: a class instance gets an
   * AttributeInstance per meta attribute the moment it is created (see
   * `createClassInstance` below), a scene instance got none — so scene-type attributes
   * ("Name", "Comment", … — every example metamodel declares some) had no data behind
   * them anywhere. The attribute window shows them now, which is what needs them to
   * exist. Called when a scene is created and when one is loaded, so models saved
   * before this change pick their attributes up as well; only what is MISSING is added,
   * so loading a scene again is a no-op.
   *
   * Only the ACTIVE tab's scene is reconciled: `createAttributeInstance` re-resolves the
   * owner through `instanceUtility.getSceneInstance`, which answers from the active tab
   * first and falls back to the scene TREE — whose nodes are separate objects merged by
   * uuid. Reconciling a background tab could therefore attach the new instances to a
   * copy nobody renders or saves.
   */
  async createMissingSceneAttributeInstances(sceneInstance: SceneInstance): Promise<AttributeInstance[]> {
    const created: AttributeInstance[] = [];
    if (!sceneInstance) return created;

    const activeSceneInstance = await this.instanceUtility.getTabContextSceneInstance();
    if (activeSceneInstance !== sceneInstance) return created;

    // A shared scene the user may only read is left untouched: the instances could never
    // be saved, and flagging the scene dirty would pop the auto-save's authorization
    // alert on nothing more than opening it. The owner's client adds them instead.
    if (this.globalObjectInstance.currentTabAccess === "read") return created;

    // With collaborators already in the session, someone else's client either created
    // these attributes already (they arrive over the Y.Doc) or will — two clients
    // instantiating the same scene-type attribute would each mint their own uuid and the
    // scene would end up holding the field twice.
    const session = this.globalObjectInstance.sharedDocServiceRef?.forTab(this.globalObjectInstance.selectedTab);
    if (session && session.awareness.getStates().size > 1) return created;

    const sceneType = await this.metaUtility.getTabContextSceneType();
    if (!sceneType) return created;

    for (const attribute of sceneType.attributes) {
      const alreadyInstantiated = sceneInstance.attribute_instances.some(
        (attribute_instance) => attribute_instance.uuid_attribute == attribute.uuid,
      );
      if (alreadyInstantiated) continue;

      // Same value rule as createClassInstance: the meta default for a plain attribute,
      // "" for a table one (its rows are added in the table dialog).
      const value =
        attribute.attribute_type.has_table_attribute.length == 0 ? attribute.default_value || "" : "";

      created.push(
        await this.createAttributeInstance(
          attribute,
          sceneInstance.uuid,
          null as any,
          value,
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
        ),
      );
    }

    if (created.length > 0) {
      this.logger.log(
        `${created.length} attribute instance(s) created for scene_instance ${sceneInstance.uuid}`,
        "done",
      );
      // Same dirty-flag rule as a newly dropped class instance (see onDrawingMode).
      if (this.globalObjectInstance.autoSave) {
        this.globalObjectInstance.doSceneInstancePatch = true;
        if (this.globalObjectInstance.currentTabAccess) {
          this.globalObjectInstance.doSceneInstancePatchLocal = true;
        }
      }
      // Hand the very same instances to any collaborator joining later, so nobody mints
      // a second set for the same scene-type attributes.
      publishLocalChange({ type: "add_scene_attribute_instances", attributeInstances: created });
      // The attribute window is showing this scene whenever nothing is selected.
      this.eventAggregator.publish("updateAttributeGui");
    }

    return created;
  }

  //-------------------------------------------------
  // bendpoint_instance
  //-------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- the geometry param is a stored code string typed `Function`; only `.toString()` is called on it
  async createBendpointInstance(x: number, y: number, z: number, geometry: Function, bendPointClassUUID: string) {
    //we round the position
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    z = Math.round(z * 10) / 10;

    const bendpoint_class_instance: ClassInstance = await this.createClassInstance(this.create_UUID(), x, y, z, bendPointClassUUID, "class");

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
    let class_instance!: ClassInstance;

    //get the metaclass for the classInstance to create
    //we must distinguish between class and relationclass
    let metaclass!: Class;
    if (type == "class" || type == "bendpoint") {
      metaclass = (await this.metaUtility.getMetaClass(classUUID)) as Class;
    } else if (type == "relation") {
      metaclass = (await this.metaUtility.getMetaRelationclass(classUUID)) as Relationclass;
    }

    //------------------------------------
    // if instance is for class: create class Instance with values from classObject
    //------------------------------------
    if (type == "class") {
      this.logger.log(`create instance of ClassInstance for class: ${classUUID}`, "info");
      class_instance = new ClassInstance(uuid, classUUID);
      class_instance.name = metaclass.name;
      class_instance.coordinates_2d = { x, y, z };

      //push to log file
      this.logger.log(`Class Instance ${class_instance.uuid} created`, "done");
    }

    //------------------------------------
    // if instance is for a bendpoint: create class Instance with values from classObject
    //------------------------------------
    if (type == "bendpoint") {
      this.logger.log(`create instance of ClassInstance for a bendpoint`, "info");
      const uuid_is_bendpoint_for_relationclass = this.globalStateObject.activeStateLine!;
      class_instance = new ClassInstance(uuid, this.globalClassObject.getSelectedClass() + "_" + uuid, metaclass.uuid);

      class_instance.coordinates_2d = { x, y, z };
      class_instance.uuid_relationclass_bendpoint = uuid_is_bendpoint_for_relationclass.uuid;

      //push to log file
      this.logger.log(`Bendpoint with UUID ${class_instance.uuid} created`, "done");
    }

    //add class_instance to scene_instance
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const class_instances = sceneInstance.class_instances;
    class_instances.push(class_instance);
    sceneInstance.class_instances = class_instances;

    this.logger.log(`Class Instance ${class_instance.uuid} added to scene_instance ${sceneInstance.uuid}`, "done");

    // Notify listeners (e.g., SimulationWindow) that the active SceneInstance has changed.
    this.eventAggregator.publish("sceneInstanceMutated", {
      sceneInstanceUuid: sceneInstance.uuid,
      action: "added",
      kind: type || "class",
      instanceUuid: class_instance.uuid,
    });

    //set current class_instance in global object
    this.globalObjectInstance.current_class_instance = class_instance;

    //for each attribute in metamodel for this class create an instance of the attribute
    for (const attribute of metaclass.attributes) {
      //if no table attribute...
      if (attribute.attribute_type.has_table_attribute.length == 0) {
        //call function to instantiate attribute and add to class_instance
        this.createAttributeInstance(
          attribute,
          null as any,
          class_instance.uuid,
          // The attribute's default value, or "" when it states none: an unset value is
          // empty, and whether that is allowed is what the attribute type's regex says.
          attribute.default_value || "",
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
        );
      } else {
        this.createAttributeInstance(attribute, null as any, class_instance.uuid, "", null as any, null as any, null as any, null as any, null as any, null as any);
      }
    }

    //for ports in metamodel for this class create an instance of the port
    for (const port of metaclass.ports) {
      //call function to instantiate port and add to class_instance
      const portInstance = await this.createPortInstance(this.create_UUID(), port.uuid, class_instance, null as any);

      portInstance.name = port.name;
    }

    this.globalObjectInstance.current_port_instance = null as any;

    //return instance
    return class_instance;
  }

  //-------------------------------------------------
  // create_relationclass_instance
  //-------------------------------------------------

  async createRelationclassInstance(uuid: UUID, x: number, y: number, z: number, relationclassUUID: string, type?: string) {
    //get the metaclass for the relationclass to create
    const metaclass = (await this.metaUtility.getMetaRelationclass(relationclassUUID)) as Relationclass;

    //------------------------------------
    // create relationclass Instance with values from relationClassObject
    //------------------------------------

    this.logger.log("create instance of RelationClass", "info");
    const relation_metaclass = metaclass as Relationclass;

    //create uuid and class_instance
    const relationclass_instance = new RelationclassInstance(uuid, relationclassUUID, undefined as any, undefined as any);

    //push to log file
    this.logger.log("Relationclass Instance " + relationclass_instance.uuid + " created", "done");

    relationclass_instance.uuid_relationclass_bendpoint = relation_metaclass.bendpoint;

    relationclass_instance.name = relation_metaclass.name;
    relationclass_instance.coordinates_2d = { x, y, z };

    //add relationclass_instance to scene_instance
    const sceneInstance = (await this.instanceUtility.getTabContextSceneInstance())!;
    const relationclass_instances: RelationclassInstance[] = sceneInstance.relationclasses_instances;
    relationclass_instances.push(relationclass_instance);
    sceneInstance.relationclasses_instances = relationclass_instances;

    this.logger.log("Relationclass Instance " + relationclass_instance.uuid + " added to scene_instance " + sceneInstance.uuid, "done");

    // Notify listeners (e.g., SimulationWindow) that the active SceneInstance has changed.
    this.eventAggregator.publish("sceneInstanceMutated", {
      sceneInstanceUuid: sceneInstance.uuid,
      action: "added",
      kind: "relation",
      instanceUuid: relationclass_instance.uuid,
    });

    //set current class_instance in global object
    this.globalObjectInstance.current_class_instance = relationclass_instance;

    //for each attribute in metamodel for this relationclass create an instance of the attribute
    for (const attribute of relation_metaclass.attributes) {
      //call function to instantiate attribute and add to class_instance
      if (attribute.attribute_type.has_table_attribute.length == 0) {
        //call function to instantiate attribute and add to class_instance
        this.createAttributeInstance(attribute, null as any, relationclass_instance.uuid, attribute.default_value || "", null as any, null as any, null as any, null as any, null as any, null as any);
      } else {
        this.createAttributeInstance(attribute, null as any, relationclass_instance.uuid, "", null as any, null as any, null as any, null as any, null as any, null as any);
      }
    }

    //return instance
    return relationclass_instance;
  }

  addPointToClassInstance(relationclass_instance: RelationclassInstance, object: THREE.Object3D) {
    const worldPosition: THREE.Vector3 = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    const linePoint = {
      UUID: object.uuid,
      Point: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
    };
    relationclass_instance.line_points.push(linePoint);
  }

  //-------------------------------------------------
  // create_line_instances
  //-------------------------------------------------
  addLinePoint(line: Line2 | null, point: THREE.Vector3, object: THREE.Mesh) {
    let bendpoint: THREE.Mesh | undefined;
    if (line) {
      // create Bendpoint and insert to scene
      this.logger.log("create Bendpoint", "info");

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

    // if line is direct between two objects, add bendpoint  (not active at the moment)
    if (linePointArray[3] === linePointArray[6]) {
      // direct connection between two objects
    }

    // this is the point (Objects) position
    line.userData.relObj.pop();
    line.userData.relObj.push(lastObject);
  }

  //-------------------------------------------------
  // port_instance
  //-------------------------------------------------
  async createPortInstance(uuid: UUID, metaPortUUID: UUID, class_instance: ClassInstance, scene_instance: SceneInstance) {
    let class_instance_uuid: UUID | undefined = undefined;
    let scene_instance_uuid: UUID | undefined = undefined;

    if (class_instance) {
      class_instance_uuid = class_instance.uuid;
    }

    if (scene_instance) {
      scene_instance_uuid = scene_instance.uuid;
    }

    const port_instance = new PortInstance(uuid, metaPortUUID, class_instance_uuid, scene_instance_uuid, []);

    this.globalObjectInstance.current_port_instance = port_instance;
    if (class_instance) class_instance.port_instance.push(port_instance);
    if (scene_instance) scene_instance.port_instances.push(port_instance);

    //push to log file
    this.logger.log("Port Instance " + port_instance.name + " created", "done");

    // get metaPort
    const meta_port = await this.metaUtility.getMetaPort(port_instance.uuid_port);

    //for each attribute in metamodel for this port create an instance of the attribute
    for (const attribute of meta_port!.attributes) {
      //if no table attribute...
      if (attribute.attribute_type.has_table_attribute.length == 0) {
        //call function to instantiate attribute and add to port_instance
        this.createAttributeInstance(
          attribute,
          null as any,
          null as any,
          // The attribute's default value, or "" when it states none: an unset value is
          // empty, and whether that is allowed is what the attribute type's regex says.
          attribute.default_value || "",
          port_instance.uuid,
          null as any,
          null as any,
          null as any,
          null as any,
          null as any,
        );
      } else {
        this.createAttributeInstance(attribute, null as any, null as any, "", port_instance.uuid, null as any, null as any, null as any, null as any, null as any);
      }
    }

    return port_instance;
  }

  //-------------------------------------------------
  // role_instance
  //-------------------------------------------------
  async createRoleInstance(role_instance_uuid: UUID, uuid_has_reference_class_instance: ClassInstance, uuid_has_reference_port_instance: PortInstance, from_or_to: string, uuid_relationclass: UUID, role_instance_name?: string, reference_attribute_role?: UUID) {
    let role_from: any = null;
    let role_to: any = null;
    //only do that if assigned to classInstance or PortInstance
    if (from_or_to == "from" || from_or_to == "to") {
      const selectedRelationClassUUID =
        this.globalRelationclassObject.getSelectedRelationClassUUID();
      const selectedRelationClass =
        await this.metaUtility.getMetaRelationclass(selectedRelationClassUUID);
      //for relationclasses we need to get the role from the relationclass
      role_from = selectedRelationClass!.role_from;
      role_to = selectedRelationClass!.role_to;
    }

    let uuid_meta_role: any = null;

    if (from_or_to == "from") {
      uuid_meta_role = role_from.uuid;
    } else if (from_or_to == "to") {
      uuid_meta_role = role_to.uuid;
      // if the roleInstance belongs to a reference attribute we need to get the role from the constructor -->
    } else if (from_or_to == "attribute_reference") {
      uuid_meta_role = reference_attribute_role;
    }

    let class_instance_uuid: UUID | undefined;
    let port_instance_uuid: UUID | undefined;

    if (uuid_has_reference_class_instance) {
      class_instance_uuid = uuid_has_reference_class_instance.uuid;
    }

    if (uuid_has_reference_port_instance) {
      port_instance_uuid = uuid_has_reference_port_instance.uuid;
    }

    const role_instance: RoleInstance = new RoleInstance(
      role_instance_uuid,
      uuid_meta_role,
      uuid_relationclass, // will be deleted
      null as any, // will be deleted
      class_instance_uuid,
      port_instance_uuid,
      null as any,
      null as any,
      null as any,
    );
    // RoleInstance's constructor has no `name` parameter to forward this to (it never
    // calls `super(uuid, name)`), so every caller's `role_instance_name` — the
    // reference dialog's "name_placeholder", the relation role's "role_from for
    // metaobject: ..." — was silently dropped, leaving `role_instance.name` undefined
    // until something else happened to resolve and overwrite it.
    if (role_instance_name) {
      role_instance.name = role_instance_name;
    }

    //push to log file
    this.logger.log("Role Instance " + role_instance.uuid + " created", "done");

    // add role instance to global object array role_instances[]
    this.globalObjectInstance.role_instances.push(role_instance);
    this.logger.log("Role Instance " + role_instance.uuid + " added to globalObject.role_instances", "done");

    //return role_instance
    return role_instance;
  }
}

// Module singleton — one shared instance.
export const instanceCreationHandler = new InstanceCreationHandler();
