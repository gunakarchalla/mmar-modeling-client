import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";

import { Text } from "troika-three-text";

import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ObjectInstance, ClassInstance, PortInstance, UUID, RelationclassInstance } from "@gds";

import { globalObject } from "@/engine/global-definition";
import { metaUtility } from "@/resources/services/meta-utility";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { expressionUtility } from "@/resources/services/expression-utility";

/**
 * The `gc` object every meta object's `vizRep(gc)` code string is evaluated against
 * (see `runVizRepFunction`).
 *
 * The method surface is therefore an API: vizRep strings stored in the database call
 * these names with positional arguments, so methods must not be renamed, reordered or
 * have parameters inserted — including the ones this codebase never calls itself.
 *
 * Objects built by a vizRep run accumulate in the `object3D` / `labels` / `button3D` /
 * `rel_*` buckets keyed by three.js uuid; `drawVizRep*` then merges each bucket into
 * the mesh that goes into the scene, and `resetInstance()` empties them for the next
 * run.
 */

interface custom_object {
  [key: string]: any;
}

export class GraphicContext {
  private globalObjectInstance = globalObject;
  private metaUtility = metaUtility;
  private instanceUtility = instanceUtility;
  private logger = logger;
  private expression = expressionUtility;

  //this are the objects where the object3ds are stored on call of a gc.function
  object3D: custom_object = {};
  button3D: custom_object = {};
  labels: custom_object = {};
  rel_from_objects: custom_object = {};
  rel_to_objects: custom_object = {};
  labels_rel_from_objects: custom_object = {};
  labels_rel_to_objects: custom_object = {};
  labels_rel_middle_objects: custom_object = {};
  attached_ports: custom_object = {};
  return_instances: ObjectInstance[];

  custom_variables: custom_object;
  //this is the current objectInstance, if available (for update)
  current_instance_object: ObjectInstance;

  constructor() {
    this.object3D = {};
    this.labels = {};
    this.rel_from_objects = {};
    this.rel_to_objects = {};
    this.labels_rel_from_objects = {};
    this.labels_rel_to_objects = {};
    this.labels_rel_middle_objects = {};
    this.return_instances = [];
    this.custom_variables = {};
  }

  /**
   * Apply an optional texture to a material. `map` is a data-URL produced by a vizRep
   * code string, which is why the guard also rejects the literal "undefined" such a
   * string can build. The base colour goes to white so the texture is not tinted.
   */
  private applyTextureMap(material: THREE.MeshBasicMaterial, map: string | undefined, options?: { alphaTest?: number }): void {
    if (!map || map == "undefined") return;

    const image = new Image();
    const texture = new THREE.Texture(image);
    image.onload = () => {
      texture.needsUpdate = true;
    };
    image.src = map;

    if (options?.alphaTest !== undefined) material.alphaTest = options.alphaTest;
    material.map = texture;
    material.transparent = true;
    material.color.set("white");
  }

  /** Offset a freshly built primitive by the relative position its vizRep asked for. */
  private placeAt(object: THREE.Object3D, x_rel?: number, y_rel?: number, z_rel?: number): void {
    if (x_rel) object.position.x = x_rel;
    if (y_rel) object.position.y = y_rel;
    if (z_rel) object.position.z = z_rel;
  }

  async setVariable(name: string, value: any, instance_adaptable: boolean) {
    if (this.current_instance_object && instance_adaptable && this.current_instance_object.custom_variables) {
      const civ = this.current_instance_object.custom_variables as any;

      if (civ[name]) {
        this.custom_variables[name] = {
          value: civ[name].value,
          instance_adaptable: instance_adaptable,
          user_locked: civ[name].user_locked == true ? true : false,
        };
      } else {
        this.custom_variables[name] = {
          value: value,
          instance_adaptable: instance_adaptable,
          user_locked: false,
        };
      }
      civ[name] = this.custom_variables[name];
      this.logger.log("variable " + name + " value set to instance value: " + this.custom_variables[name].value, "info");
    } else {
      this.custom_variables[name] = {
        value: value,
        instance_adaptable: instance_adaptable,
        user_locked: false,
      };

      this.logger.log("variable " + name + " value set to " + value, "info");
    }
  }

  async getVariableValue(name: string) {
    return this.custom_variables[name].value;
  }

  async getVariableInstance_adaptable(name: string) {
    return this.custom_variables[name].instance_adaptable;
  }

  //------------------------------------------------------------------------------------------------
  // deprecated function. Use expression.attrvalByInst instead
  //------------------------------------------------------------------------------------------------
  //this function gets the value from an attribute_instance based on the given arguments
  async dynval(attribute_uuid: UUID, assigned_instance_uuid: UUID) {
    return await this.expression.attrvalByInst(attribute_uuid, assigned_instance_uuid);
  }

  //this creates a craphic cube as object
  async graphic_cube(width: number, height: number, depth: number, color?: string, map?: string, x_rel?: number, y_rel?: number, z_rel?: number) {
    const geometry = new THREE.BoxGeometry(width, height, depth, 20, 20, 20);
    const material = new THREE.MeshBasicMaterial();

    if (color) material.color.set(color);

    this.applyTextureMap(material, map);

    const box: THREE.Mesh = new THREE.Mesh(geometry, material);
    this.placeAt(box, x_rel, y_rel, z_rel);

    this.object3D[box.uuid] = box;

    //return only used for relations
    return box;
  }

  //this creates a craphic cube as object
  async graphic_plane(width: number, height: number, color?: string, map?: string, x_rel?: number, y_rel?: number, z_rel?: number) {
    const geometry = new THREE.PlaneGeometry(width, height, 20, 20);
    const material = new THREE.MeshBasicMaterial();

    if (color) material.color.set(color);

    this.applyTextureMap(material, map, { alphaTest: 0.1 });

    const plane: THREE.Mesh = new THREE.Mesh(geometry, material);
    //set position
    this.placeAt(plane, x_rel, y_rel, z_rel);

    this.object3D[plane.uuid] = plane;

    (plane.material as THREE.Material).side = THREE.DoubleSide;

    //return only used for relations
    return plane;
  }

  //this creates a graphic sphere
  async graphic_sphere(radius: number, withSegments: number, heightSegments: number, color?: string, map?: string, x_rel?: number, y_rel?: number, z_rel?: number) {
    const geometry = new THREE.SphereGeometry(radius, withSegments, heightSegments);
    const material = new THREE.MeshBasicMaterial();

    if (color) material.color.set(color);

    this.applyTextureMap(material, map);

    const sphere: THREE.Mesh = new THREE.Mesh(geometry, material);
    //set position
    this.placeAt(sphere, x_rel, y_rel, z_rel);

    this.object3D[sphere.uuid] = sphere;

    //return only used for relations
    return sphere;
  }

  //this creates a graphic cylinder
  async graphic_cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    radialSegments: number,
    heightSegments: number,
    color?: string,
    map?: string,
    x_rel?: number,
    y_rel?: number,
    z_rel?: number,
    openEnded?: boolean,
    thetaStart?: number,
    thetaLength?: number,
  ) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);

    const material = new THREE.MeshBasicMaterial();

    if (color) material.color.set(color);

    this.applyTextureMap(material, map);

    const cylinder: THREE.Mesh = new THREE.Mesh(geometry, material);

    //set position
    this.placeAt(cylinder, x_rel, y_rel, z_rel);

    this.object3D[cylinder.uuid] = cylinder;

    //return only used for relations
    return cylinder;
  }

  //load a predefined gltf to the object
  //!! this must load async in the vizRep
  async graphic_gltf(objectString: string | ArrayBuffer, x_rel?: number, y_rel?: number, z_rel?: number, scale?: number[]) {
    // A glTF node carries its own scale in its node matrix — that is how a vizRep
    // authors e.g. the flattened sphere of "Place" — and `mergeOjects` later bakes
    // `mesh.scale` into the geometry. An explicit `scale` therefore has to multiply
    // that authored scale, and no `scale` at all must leave it untouched.
    const extraScale = scale && scale.length === 3 ? scale : undefined;
    // return array
    const meshes: THREE.Mesh[] = [];

    const loader = new GLTFLoader();

    //we parse the object string to three.js objects with the async parser
    await loader.parseAsync(objectString, "").then((gltf) => {
      //this would be of type GLTF -> there is a typedoc problem
      const anyobject = gltf as any;

      const objects: any[] = [];

      // convert all materials to phong
      //https://stackoverflow.com/questions/61717393/how-do-i-convert-all-materials-in-a-loaded-gltf-from-mesh-basic-to-mesh-phong
      gltf.scene.traverse((child: any) => {
        if (!child.isMesh) return;
        // check if child.material is MeshPhongMaterial
        const prevMaterial = child.material;
        child.material = new THREE.MeshPhongMaterial();
        THREE.MeshBasicMaterial.prototype.copy.call(child.material, prevMaterial);
      });

      this.metaUtility.findType(anyobject.scene, "Mesh", objects);
      this.metaUtility.findType(anyobject.scene, "SkinnedMesh", objects);

      for (const mesh of objects) {
        //move the object by the relative position
        mesh.position.x = x_rel ? mesh.position.x + x_rel : mesh.position.x;
        mesh.position.y = y_rel ? mesh.position.y + y_rel : mesh.position.y;
        mesh.position.z = z_rel ? mesh.position.z + z_rel : mesh.position.z;
        if (extraScale) {
          mesh.scale.set(mesh.scale.x * extraScale[0], mesh.scale.y * extraScale[1], mesh.scale.z * extraScale[2]);
        }

        this.object3D[mesh.uuid] = mesh;
        meshes.push(mesh);
      }
    });
    return meshes;
  }

  //load an STL mesh to the object
  async graphic_stl(buffer: ArrayBuffer, scale?: number[], x_rel?: number, y_rel?: number, z_rel?: number, color?: string) {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({ color: color || "#b0b0b0" });
    const mesh = new THREE.Mesh(geometry, material);

    const effectiveScale = scale && scale.length === 3 ? scale : [1, 1, 1];
    mesh.scale.set(effectiveScale[0], effectiveScale[1], effectiveScale[2]);

    mesh.position.x = x_rel ? mesh.position.x + x_rel : mesh.position.x;
    mesh.position.y = y_rel ? mesh.position.y + y_rel : mesh.position.y;
    mesh.position.z = z_rel ? mesh.position.z + z_rel : mesh.position.z;

    this.object3D[mesh.uuid] = mesh;

    return [mesh];
  }

  //this creates a 3D text
  async graphic_text(
    x_rel: number,
    y_rel: number,
    z_rel: number,
    size: number,
    color: string,
    att: string,
    pos_name_x?: string,
    pos_name_y?: string,
    pos_name_z?: string,
    rx?: number,
    ry?: number,
    rz?: number,
    rw?: number,
  ) {
    //todo --> height is not used anymore

    // Create:
    const textMesh = new Text();
    textMesh.name = att + textMesh.uuid;
    textMesh.anchorX = "center";
    textMesh.anchorY = "middle";

    // Set properties to configure:
    textMesh.text = att;
    textMesh.fontSize = size;
    textMesh.color = new THREE.Color(color);

    // Update the rendering:
    textMesh.sync();

    textMesh.userData.custom_variables = {};
    if (pos_name_x && pos_name_y && pos_name_z) {
      textMesh.userData.custom_variables[pos_name_x] = { value: x_rel, instance_adaptable: true, user_locked: false };
      textMesh.userData.custom_variables[pos_name_y] = { value: y_rel, instance_adaptable: true, user_locked: false };
      textMesh.userData.custom_variables[pos_name_z] = { value: z_rel, instance_adaptable: true, user_locked: false };
    }

    if (!rx) rx = 0;
    if (!ry) ry = 0;
    if (!rz) rz = 0;
    if (!rw) rw = 1;

    // the name of the rotation variables should be taken from the method arguments
    // todo: must be extended
    textMesh.userData.custom_variables["rx"] = { value: rx, instance_adaptable: true, user_locked: false };
    textMesh.userData.custom_variables["ry"] = { value: ry, instance_adaptable: true, user_locked: false };
    textMesh.userData.custom_variables["rz"] = { value: rz, instance_adaptable: true, user_locked: false };
    textMesh.userData.custom_variables["rw"] = { value: rw, instance_adaptable: true, user_locked: false };

    this.labels[textMesh.uuid] = textMesh;

    //return only used for relations
    return textMesh;
  }

  //this creates a 3D object that is a clickable button
  async graphic_button(object: THREE.Mesh | THREE.Mesh[], expression?: string) {
    //check if THREE.Mesh or THREE.Mesh[] is passed
    if (Array.isArray(object)) {
      for (const obj of object) {
        obj.userData.isButton = true;
        obj.userData.expression = expression;

        // delete the key obj.uuid from object3D
        delete this.object3D[obj.uuid];
        // add the object to the button3D object
        this.button3D[obj.uuid] = obj;
      }
    } else {
      object.userData.isButton = true;
      object.userData.expression = expression;

      // delete the key obj.uuid from object3D
      delete this.object3D[object.uuid];
      // add the object to the button3D object
      this.button3D[object.uuid] = object;
    }

    this.logger.log("button created with expression: " + expression, "info");
    return object;
  }

  //this creates a 3D line
  //this was changed in July21 to Line2 since we can create thick lines with Line2
  //function setPos was also updated
  async rel_graphic_line(color: string, line_width: number, dashed: boolean, dash_scale: number, dash_size: number, gap_size: number) {
    const positions: number[] = [];

    positions.push(0, 0, 0);

    const geometry: LineGeometry = new LineGeometry();
    geometry.setPositions(positions);

    const material: LineMaterial = new LineMaterial({
      color: color as unknown as number,
      linewidth: line_width * 10, // in meter
      //vertexColors: true,
      //resolution:  new THREE.Vector2(window.innerWidth * 10,window.innerHeight * 10),
      dashed: dashed,
      dashScale: dash_scale,
      dashSize: dash_size,
      gapSize: gap_size,
      alphaToCoverage: false,
      //problem fix -> this ensures that the line is not in front
      depthTest: true,
      worldUnits: true,
    });

    const line: Line2 = new Line2(geometry, material);
    await line.computeLineDistances();
    line.scale.set(1, 1, 1);
    this.globalObjectInstance.scene.add(line);

    //set middle pos variable
    line.userData.midPoint = new THREE.Vector3(0, 0, 0);

    //set uuid of mesh to class_instance_uuid
    line.uuid = await this.instanceUtility.get_current_class_instance_uuid();
    this.logger.log("class_instance uuid " + line.uuid + " maped with three.object3d uuid in gc.rel_graphic_line", "info");

    //push line to update array
    this.globalObjectInstance.updateLinesArray.push(line);

    //add line to gc.object3D object
    //this is also how the caller gets the line back: drawVizRep_rel() returns
    //object3D[current class_instance uuid], i.e. exactly this line. It is deliberately
    //NOT published on globalStateObject.activeStateLine — that field means "the line the
    //local user is currently drawing", and a draw triggered by a peer's change or by a
    //scene load would overwrite the half-drawn line the user is holding.
    this.object3D[line.uuid] = line;

    //set start, end object array to empty (init)
    line.userData.relObj = [];
  }

  //this is the function that defines a object for the from end of a relation (can be called multiple times)
  //takes a gc visual object as argument
  async rel_from_object(object: THREE.Mesh) {
    //sets the object to the gc object with all from objects
    this.rel_from_objects[object.uuid] = object;
  }

  /** Merges everything collected by `rel_from_object()` into the relation's from-end. */
  async rel_merge_from_objects() {
    this.rel_from_objects = await this.mergeRelationEnd(this.rel_from_objects);
  }

  //this is the function that defines a object for the to end of a relation (can be called multiple times)
  //takes a gc visual object as argument
  async rel_to_object(object: THREE.Mesh) {
    //sets the object to the gc object with all to objects
    this.rel_to_objects[object.uuid] = object;
  }

  /** Merges everything collected by `rel_to_object()` into the relation's to-end. */
  async rel_merge_to_objects() {
    this.rel_to_objects = await this.mergeRelationEnd(this.rel_to_objects);
  }

  /**
   * Collapse one end of a relation (an arrow head, a diamond, ...) into a single mesh
   * carrying the relation instance's uuid, and cache its bounding-box size in
   * `userData.boxParameter` — the animator reads that size to shift the end back off
   * the object the line points at.
   */
  private async mergeRelationEnd(objects: custom_object): Promise<custom_object> {
    const merged: THREE.Mesh = await this.mergeOjects(Object.values(objects));
    merged.uuid = await this.instanceUtility.get_current_class_instance_uuid();

    merged.geometry.computeBoundingBox();
    const box = new THREE.Box3().copy(merged.geometry.boundingBox!).applyMatrix4(merged.matrixWorld);
    const boxParameter = new THREE.Vector3();
    box.getSize(boxParameter);
    merged.userData.boxParameter = boxParameter;

    return { [merged.uuid]: merged };
  }

  async rel_graphic_text_from(object: THREE.Mesh) {
    this.labels_rel_from_objects[object.uuid] = object;
  }
  async rel_graphic_text_middle(object: THREE.Mesh) {
    this.labels_rel_middle_objects[object.uuid] = object;
  }
  async rel_graphic_text_to(object: THREE.Mesh) {
    this.labels_rel_to_objects[object.uuid] = object;
  }

  async mergeOjects(loadedObjects: THREE.Mesh[]) {
    const firstMesh: THREE.Mesh = new THREE.Mesh();
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    const materialsToAdd: any[] = [];

    const globAttributes: string[] = [];
    const globValues: any[] = [];

    //get all geometries
    for (const loadedObject of loadedObjects) {
      const geometry: THREE.BufferGeometry = loadedObject.geometry;
      const attributes = geometry.attributes;
      const keys = Object.keys(attributes);
      const values = Object.values(attributes);

      for (let i = 0; i < keys.length; i++) {
        if (!globAttributes.includes(keys[i])) {
          globAttributes.push(keys[i]);
          globValues.push(values[i]);
        }
      }
    }

    //get all geometries for second run
    for (const loadedObject of loadedObjects) {
      const matrix = new THREE.Matrix4().compose(loadedObject.position, loadedObject.quaternion, loadedObject.scale);
      loadedObject.geometry.applyMatrix4(matrix);

      //for each entry in attributes check if it exists in the geometry
      // if not, add it with empty array
      // if yes, do nothing
      for (let j = 0; j < globAttributes.length; j++) {
        const geometryAttribute = loadedObject.geometry.getAttribute(globAttributes[j]);
        if (!geometryAttribute) {
          loadedObject.geometry.setAttribute(globAttributes[j], globValues[j]);
        }
      }

      geometriesToMerge.push(loadedObject.geometry);
      materialsToAdd.push(loadedObject.material);
    }

    //merge geometries
    const mergedMesh = firstMesh;
    if (geometriesToMerge && geometriesToMerge.length > 0) {
      const mergedGeometry = mergeGeometries(geometriesToMerge, true);
      mergedMesh.geometry = mergedGeometry;
      mergedMesh.material = materialsToAdd;
    }

    return mergedMesh;
  }

  async getMergedObjects() {
    //this are the objects that have been calculated from the metafunction
    const loadedObjects: THREE.Mesh[] = Object.values(this.object3D) as unknown as THREE.Mesh[]; // --> should be mesh

    const mergedMesh = await this.mergeOjects(loadedObjects);
    //this.object3D = {};
    return mergedMesh;
  }

  async drawButtons(toAttach: THREE.Mesh) {
    //this are the objects that have been calculated from the metafunction
    const loadedObjects: THREE.Mesh[] = Object.values(this.button3D) as unknown as THREE.Mesh[]; // --> should be mesh
    for (const object of loadedObjects) {
      toAttach.add(object);
      this.globalObjectInstance.buttonObjects.push(object);
    }

    this.button3D = {};
  }

  async removeButtons(parentMesh: THREE.Mesh) {
    // for each child of the parentMesh
    for (const child of parentMesh.children) {
      // if the child is a button
      if (child.userData.isButton) {
        // remove the button from the scene
        await this.deleteObject(child as THREE.Mesh);
      }
    }
  }

  async drawVizRep(position: THREE.Vector3, class_instance: ClassInstance) {
    const mergedMesh = await this.getMergedObjects();

    const object = await this.insertObjectToScene(
      class_instance.uuid,
      mergedMesh,
      position.x,
      position.y,
      position.z,
      class_instance.rotation ? class_instance.rotation.x : 0,
      class_instance.rotation ? class_instance.rotation.y : 0,
      class_instance.rotation ? class_instance.rotation.z : 0,
      class_instance.rotation ? class_instance.rotation.w : 1,
      "class",
    );

    //set custom variables which are independent of labels
    await this.setCustomVariables(class_instance);

    await this.drawButtons(mergedMesh);

    await this.drawLabels(mergedMesh);

    await this.setScale(mergedMesh, class_instance);

    //reset gc
    await this.resetInstance();

    return object;
  }

  // Update the VizRep for classes.
  async updateVizRepClass(class_instance: ClassInstance) {
    const mergedMesh = await this.getMergedObjects();
    // Retrieve the class instance from the scene
    const classObjectToUpdate: THREE.Mesh = (await this.globalObjectInstance.scene.getObjectByProperty("uuid", class_instance.uuid)) as THREE.Mesh;
    // There is nothing to update when the instance is no longer drawn — a refresh that
    // was in flight while the scene was rebuilt (a rolled-back save re-imports it) finds
    // no object, where it used to throw "Cannot set properties of undefined (setting
    // 'geometry')". The next draw pass renders the instance from scratch anyway.
    if (!classObjectToUpdate) {
      this.logger.log(`no drawn object for class instance ${class_instance.uuid}, vizrep update skipped`, "close");
      await this.resetInstance();
      return;
    }
    // Update the geometry and material of the object.
    classObjectToUpdate.geometry = mergedMesh.geometry;
    classObjectToUpdate.material = mergedMesh.material;
    // Remove and redraw the labels of the object.

    await this.removeLabels(classObjectToUpdate);
    await this.removeButtons(classObjectToUpdate);

    await this.drawButtons(classObjectToUpdate);

    await this.drawLabels(classObjectToUpdate);
    await this.setScale(mergedMesh, class_instance);
    await this.resetInstance();
  }

  async drawVizRepPort(position: THREE.Vector3, port_instance: PortInstance) {
    const mergedMesh = await this.getMergedObjects();

    const object = await this.insertObjectToScene(
      port_instance.uuid,
      mergedMesh,
      position.x,
      position.y,
      position.z,
      port_instance.rotation ? port_instance.rotation.x : 0,
      port_instance.rotation ? port_instance.rotation.y : 0,
      port_instance.rotation ? port_instance.rotation.z : 0,
      port_instance.rotation ? port_instance.rotation.w : 1,
      "port",
    );

    //we do not do that here since it overwrites the custom variables of the port_instance
    // await this.setCustomVariables(port_instance);

    await this.drawLabels(mergedMesh);

    await this.setScale(mergedMesh, port_instance);

    //reset gc
    await this.resetInstance();
    return object;
  }

  async updateVizRepPort(port_instance: PortInstance) {
    const mergedMesh = await this.getMergedObjects();

    // Retrieve the port instance object from the scene
    const portObjectInScene = this.globalObjectInstance.scene.getObjectByProperty("uuid", port_instance.uuid) as THREE.Mesh;

    // Same as updateVizRepClass: a port that is no longer drawn has no geometry to
    // update, and dereferencing it would throw instead of skipping the refresh.
    if (!portObjectInScene) {
      this.logger.log(`no drawn object for port instance ${port_instance.uuid}, vizrep update skipped`, "close");
      await this.resetInstance();
      return;
    }

    // Update the geometry and material of the object.
    portObjectInScene.geometry = mergedMesh.geometry;
    portObjectInScene.material = mergedMesh.material;

    // Remove and redraw the labels of the object.
    await this.removeLabels(portObjectInScene);
    // to test if this should be specific for ports. now it is written to class_instance
    await this.drawLabels(portObjectInScene);

    await this.resetInstance();
  }

  //set custom variables
  async setCustomVariables(objectInstance: ObjectInstance) {
    //set custom variables
    for (const [key, value] of Object.entries(this.custom_variables)) {
      if (value.instance_adaptable == true && value.user_locked == false) {
        (objectInstance.custom_variables as any)[key] = value;
        this.logger.log("variable " + key + " value set to custom_variables: " + value.value, "info");
      }
    }
  }

  //function draws labels to object
  async drawLabels(parentObject: THREE.Mesh) {
    const loadedTextArray = Object.values(this.labels);

    for (const textObject of loadedTextArray) {
      // if class_instance context
      if (this.globalObjectInstance.current_class_instance && !this.globalObjectInstance.current_port_instance) {
        const cci_vars = this.globalObjectInstance.current_class_instance.custom_variables as any;
        // if the keys are in both the last wins
        this.globalObjectInstance.current_class_instance.custom_variables = { ...textObject.userData.custom_variables, ...cci_vars };
        // search in this.globalObjectInstance.current_class_instance.custom_variables for each key that is in textObject.userData.custom_variables and replace the value
        for (const key in textObject.userData.custom_variables) {
          if ((this.globalObjectInstance.current_class_instance.custom_variables as any)[key]) {
            textObject.userData.custom_variables[key].value = (this.globalObjectInstance.current_class_instance.custom_variables as any)[key].value;
          }
        }

        parentObject.userData.custom_variables = this.globalObjectInstance.current_class_instance.custom_variables;
      }
      // else check if port_instance context
      else if (this.globalObjectInstance.current_port_instance) {
        const cpi_vars = this.globalObjectInstance.current_port_instance.custom_variables as any;
        // if the keys are in both the last wins
        this.globalObjectInstance.current_port_instance.custom_variables = { ...textObject.userData.custom_variables, ...cpi_vars };
        // search in this.globalObjectInstance.current_port_instance.custom_variables for each key that is in textObject.userData.custom_variables and replace the value
        for (const key in textObject.userData.custom_variables) {
          if ((this.globalObjectInstance.current_port_instance.custom_variables as any)[key]) {
            textObject.userData.custom_variables[key] = (this.globalObjectInstance.current_port_instance.custom_variables as any)[key];
          }
        }

        parentObject.userData.custom_variables = this.globalObjectInstance.current_port_instance.custom_variables;
      }

      await this.attachText(textObject as THREE.Mesh, parentObject);
      this.globalObjectInstance.dragObjects.unshift(textObject as THREE.Mesh);
    }
  }

  //function removes labels from object
  async removeLabels(object: THREE.Mesh) {
    //we remove labels from scene

    if (object.userData.Label) {
      //if there are labels on the object, we delete them
      await Promise.all(
        object.userData.Label.map(async (label: THREE.Mesh) => {
          await this.deleteObject(label);
        }),
      );
      //we remove labels from parent object userData
      object.userData.Label = [];
    }
  }

  // create TextMesh and add it to the scene.
  // Add to the parent object a reference to UserData to iterate and update Labels
  //update august 21 --> text is added to parent (attach) instead of added to scene
  async attachText(textObject: THREE.Mesh, toAttach: THREE.Object3D) {
    //globalObjectInstance.scene.add(textObject);
    toAttach.add(textObject);

    if (!toAttach.userData.Label) {
      toAttach.userData.Label = [];
    }
    toAttach.userData.Label.push(textObject);

    //we search for custom_variables that contain "rel" and "x" to set the position of the label
    //we do this since we can have multiple labels on one object and we do not know the exact key. It must contain "rel" and "x, y, z" though
    //get all keys of custom_variables
    const keys = Object.keys(textObject.userData.custom_variables);

    // find key value pair where key contains "rel" and "x"
    const rel_x = keys.find((key) => key.includes("rel") && key.includes("x"));
    const rel_y = keys.find((key) => key.includes("rel") && key.includes("y"));
    const rel_z = keys.find((key) => key.includes("rel") && key.includes("z"));

    //if rel_x, rel_y, rel_z are found, set position to value of rel_x, rel_y, rel_z
    textObject.position.x = rel_x ? textObject.userData.custom_variables[rel_x].value : 0;
    textObject.position.y = rel_y ? textObject.userData.custom_variables[rel_y].value : 0;
    textObject.position.z = rel_z ? textObject.userData.custom_variables[rel_z].value : 0;

    //else if rotation delivered by vizRep, set rotation
    if (
      textObject.userData.custom_variables.rx.value != undefined &&
      textObject.userData.custom_variables.ry.value != undefined &&
      textObject.userData.custom_variables.rz.value != undefined &&
      textObject.userData.custom_variables.rw.value != undefined &&
      (textObject.userData.custom_variables.rx.value != 0 ||
        textObject.userData.custom_variables.ry.value != 0 ||
        textObject.userData.custom_variables.rz.value != 0 ||
        textObject.userData.custom_variables.rw.value != 1)
    ) {
      textObject.quaternion.x = textObject.userData.custom_variables.rx.value;
      textObject.quaternion.y = textObject.userData.custom_variables.ry.value;
      textObject.quaternion.z = textObject.userData.custom_variables.rz.value;
      textObject.quaternion.w = textObject.userData.custom_variables.rw.value;
    }

    //The text label is added to the dragObject, if the parent is a line.
    //this enables the dragging function of line labels
    if (textObject.parent!.type == "Line2") {
      this.globalObjectInstance.dragObjects.unshift(textObject);
    }

    //for line middle text if there is a position stored on the parent, set position to that stored position
    if (toAttach.userData["midPoint"]) {
      textObject.position.x = toAttach.userData["midPoint"].x;
      textObject.position.y = toAttach.userData["midPoint"].y;
      textObject.position.z = toAttach.userData["midPoint"].z;
    }

    // Define getter and setter for midPoint
    //like that, the position of the text is bound directly to the userData.midPoint of the parent object (line)
    Object.defineProperty(toAttach.userData, "midPoint", {
      get() {
        return (this as any)._midPoint;
      },
      set(value: any) {
        (this as any)._midPoint = value;
        textObject.position.x = value.x;
        textObject.position.y = value.y;
        textObject.position.z = value.z;
      },
      configurable: true,
      enumerable: true,
    });

    // Initialize midPoint if it exists
    if (toAttach.userData._midPoint) {
      textObject.position.x = toAttach.userData._midPoint.x;
      textObject.position.y = toAttach.userData._midPoint.y;
      textObject.position.z = toAttach.userData._midPoint.z;
    }
  }

  /** Draws the relation and returns ITS line — the caller decides what to do with it. */
  async drawVizRep_rel(): Promise<Line2> {
    const uuid = await this.instanceUtility.get_current_class_instance_uuid();
    const obj: Line2 = this.object3D[uuid];

    // if there is a from object, add it to the object
    if (Object.values(this.rel_from_objects).length > 0) {
      await this.rel_merge_from_objects();
      obj.add(Object.values(this.rel_from_objects)[0]);
    }

    // if there is a to object, add it to the object
    if (Object.values(this.rel_to_objects).length > 0) {
      await this.rel_merge_to_objects();
      obj.add(Object.values(this.rel_to_objects)[0]);
    }

    for (const object of Object.values(this.labels_rel_from_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      await this.attachText(obj, this.object3D[await this.instanceUtility.get_current_class_instance_uuid()].children[0]);
    }

    for (const object of Object.values(this.labels_rel_to_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      await this.attachText(obj, this.object3D[await this.instanceUtility.get_current_class_instance_uuid()].children[1]);
    }

    for (const object of Object.values(this.labels_rel_middle_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      // attach it directly to the line
      await this.attachText(obj, this.object3D[await this.instanceUtility.get_current_class_instance_uuid()]);
    }

    //reset gc
    await this.resetInstance();

    return obj;
  }

  async updateVizRepRelClass(relationclass_instance: RelationclassInstance) {
    await this.rel_merge_from_objects();
    await this.rel_merge_to_objects();

    // Retrieve the relationclass instance object from scene
    const correspondingSceneObject = (await this.globalObjectInstance.scene.getObjectByProperty("uuid", relationclass_instance.uuid)) as any;

    // Update the fromObject
    const fromObject = this.rel_from_objects[relationclass_instance.uuid];
    correspondingSceneObject.children[0].geometry = fromObject.geometry;
    correspondingSceneObject.children[0].material = fromObject.material;

    // Update the toObject
    const toObject = this.rel_to_objects[relationclass_instance.uuid];
    correspondingSceneObject.children[1].geometry = toObject.geometry;
    correspondingSceneObject.children[1].material = toObject.material;

    // Update the line of he relationclass.
    const line = this.object3D[relationclass_instance.uuid];
    correspondingSceneObject.geometry = line.geometry;
    correspondingSceneObject.material = line.material;

    // Update the labels of the relation
    await this.removeLabels(correspondingSceneObject);
    await this.removeLabels(correspondingSceneObject.children[0]);
    await this.removeLabels(correspondingSceneObject.children[1]);

    // Draw the labels of the fromObject
    for (const object of Object.values(this.labels_rel_from_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      await this.attachText(obj, correspondingSceneObject.children[0]);
    }

    // Draw the labels of the toObject
    for (const object of Object.values(this.labels_rel_to_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      await this.attachText(obj, correspondingSceneObject.children[1]);
    }

    // Draw the labels of the middleObject
    for (const object of Object.values(this.labels_rel_middle_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      await this.attachText(obj, correspondingSceneObject);
    }

    // Reset instance
    await this.resetInstance();
  }

  async resetInstance() {
    this.object3D = {};
    this.labels = {};
    this.rel_from_objects = {};
    this.rel_to_objects = {};
    this.labels_rel_from_objects = {};
    this.labels_rel_to_objects = {};
    this.labels_rel_middle_objects = {};
    this.attached_ports = {};
    this.button3D = {};
    this.current_instance_object = null as any;
  }

  //this attaches the port physically to the parent object and sets the relative position
  //it adds the port object to the global dragObjects array to make them draggable.
  async attachPort(portObject: THREE.Mesh, toAttach: THREE.Mesh) {
    toAttach.add(portObject);
    toAttach.geometry.computeBoundingBox();
    const box = toAttach.geometry.boundingBox!;

    //creates the update function to make sure that a port cannot be outside of an parent object
    portObject.userData.limit = {
      min: box.min,
      max: box.max,
    };
    portObject.userData.update = function () {
      portObject.position.clamp(portObject.userData.limit.min, portObject.userData.limit.max);
      // portObject.userData["x_rel"] = portObject.position.x;
      // portObject.userData["y_rel"] = portObject.position.y;
      // portObject.userData["z_rel"] = portObject.position.z;
    };

    portObject.userData.update();
  }

  async setScale(object: THREE.Object3D, instance: ObjectInstance) {
    const custom_variables = instance.custom_variables as any;
    if (custom_variables["scale"]) {
      const scale = custom_variables["scale"] as THREE.Vector3;
      this.logger.log("Set Scale: set scale for object :" + object.uuid + " to " + JSON.stringify(scale), "info");
      object.scale.set(scale.x, scale.y, scale.z);
    } else {
      custom_variables["scale"] = object.scale;
    }

    //set scale of children
    //if they have their own scale they are ignored for rescaling relative to parent
    object.traverse((child: THREE.Object3D) => {
      if (child != object) {
        const newScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1).divide(object.scale);
        if (!child.userData || !("custom_variables" in child.userData) || !("key" in child.userData.custom_variables)) {
          child.scale.set(newScale.x, newScale.y, newScale.z);
        } else {
          const scale: THREE.Vector3 = child.userData.custom_variables["scale"];
          if (scale) {
            child.scale.set(scale.x, scale.y, scale.z);
          }
        }
      }
    });
  }

  /**
   * Put a finished object into the scene at the given pose and make it draggable.
   *
   * `type` ("class" / "port" / "bendpoint") is part of the historical signature and is
   * kept for vizRep strings that pass it; nothing branches on it any more.
   */
  async insertObjectToScene(class_instance_uuid: UUID, object: THREE.Mesh, x: number, y: number, z: number, rx: number, ry: number, rz: number, rw: number, type?: string) {
    //set THREE.Object3D.uuid to the uuid of the class_instance for a direct mapping
    object.uuid = class_instance_uuid;
    this.logger.log("class_instance uuid " + class_instance_uuid + " maped with three.object3d uuid", "info");

    //position of object
    object.position.x = x;
    object.position.y = y;
    object.position.z = z;

    object.setRotationFromQuaternion(new THREE.Quaternion(rx, ry, rz, rw));

    this.globalObjectInstance.scene.add(object);

    //push to dragObjects Array
    this.globalObjectInstance.dragObjects.unshift(object);
    return object;
  }

  /**
   * The single place an object leaves the scene graph, so it is also where the
   * transform gizmo has to let go of it: three's TransformControls dereferences
   * `object.parent` every frame and logs "The attached 3D object must be a part of the
   * scene graph" for as long as it points at a detached object. A delete is a chain of
   * awaited HTTP calls, so the render loop draws many frames between the removal here
   * and whatever detaches later — every one of them used to log that error.
   */
  async deleteObject(object: THREE.Mesh) {
    if (!object) return;

    this.detachTransformControlsFrom(object);

    //remove from scene
    object.parent?.remove(object);

    //remove children
    for (const child of object.children) {
      await this.deleteObject(child as THREE.Mesh);
    }

    //remove from dragObjects Array
    const index = this.globalObjectInstance.dragObjects.indexOf(object);
    if (index > -1) {
      this.globalObjectInstance.dragObjects.splice(index, 1);
    }

    //remove from buttonObjects Array
    const index2 = this.globalObjectInstance.buttonObjects.indexOf(object);
    if (index2 > -1) {
      this.globalObjectInstance.buttonObjects.splice(index2, 1);
    }

    //dispose all Objects for Memory reasons
    try {
      object.geometry.dispose();
    } catch {
      this.logger.log("no geometry to delete", "close");
    }
    try {
      //typedef not complete
      const mat: any = object.material;
      mat.dispose();
    } catch {
      this.logger.log("no material to delete", "close");
    }
  }

  /**
   * Let the transform gizmo go before `object` (or anything under it) is unparented.
   * The gizmo may be holding a CHILD of what is being deleted — a label or a port is
   * attached directly — so the whole subtree is checked, not just the object itself.
   */
  private detachTransformControlsFrom(object: THREE.Object3D): void {
    const controls = this.globalObjectInstance.transformControls;
    const attached = controls?.object;
    if (!attached) return;
    for (let node: THREE.Object3D | null = attached; node; node = node.parent) {
      if (node === object) {
        controls.detach();
        return;
      }
    }
  }

  //update vizRep
  async updateVizRep(instanceToUpdate: ObjectInstance) {
    //if relationInstance
    if (instanceToUpdate instanceof RelationclassInstance) {
      await this.updateVizRepRelClass(instanceToUpdate);
    }
    //else if the instanceToUpdate is a classInstance
    else if (instanceToUpdate instanceof ClassInstance) {
      await this.updateVizRepClass(instanceToUpdate);
    }
    //else if portInstance
    else if (instanceToUpdate instanceof PortInstance) {
      await this.updateVizRepPort(instanceToUpdate);
    }
  }

  /**
   * Runs the vizRep function with the provided vizRep code.
   * @param vizRepCode The mechanism code to be executed.
   */
  async runVizRepFunction(vizRepCode: string) {
    const vizRepFunction = await this.metaUtility.parseMetaFunction(vizRepCode);
    await vizRepFunction(this);
  }
}

// Module singleton — one shared instance.
export const graphicContext = new GraphicContext();
