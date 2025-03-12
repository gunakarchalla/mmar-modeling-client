import { singleton } from 'aurelia';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';

import { Text } from 'troika-three-text'
import { GlobalDefinition } from './global_definitions';

import { mergeBufferGeometries, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GlobalStateObject } from './global_state_object';
import { ObjectInstance, Port, ClassInstance, SceneInstance, PortInstance, UUID, RelationclassInstance } from '../../../mmar-global-data-structure';
import { MetaUtility } from './services/meta_utility';
import { InstanceUtility } from './services/instance_utility';
import { Logger } from './services/logger';
import { ExpressionUtility } from './expression_utility';



interface custom_object {
  [key: string]: any;
}

@singleton()
export class GraphicContext {

  //this are the objects where the object3ds are stored on call of a gc.function
  object3D: custom_object = {};
  labels: custom_object = {};
  rel_from_objects: custom_object = {};
  rel_to_objects: custom_object = {};
  labels_rel_from_objects: custom_object = {};
  labels_rel_to_objects: custom_object = {};
  labels_rel_middle_objects: custom_object = {};
  map = '';
  attached_ports: custom_object = {};
  return_instances: ObjectInstance[];

  custom_variables: custom_object;
  //this is the current objectInstance, if available (for update)
  current_instance_object: ObjectInstance;



  constructor(
    private globalObjectInstance: GlobalDefinition,
    private globalStateObject: GlobalStateObject,
    private metaUtility: MetaUtility,
    private instanceUtility: InstanceUtility,
    private logger: Logger,
    private expression: ExpressionUtility
  ) {
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


  async setVariable(name: string, value: any, instance_adaptable: boolean) {
    if (this.current_instance_object && instance_adaptable && this.current_instance_object.custom_variables) {

      if (this.current_instance_object.custom_variables[name]) {
        this.custom_variables[name] = {
          "value": this.current_instance_object.custom_variables[name].value,
          "instance_adaptable": instance_adaptable,
          "user_locked": this.current_instance_object.custom_variables[name].user_locked == true ? true : false
        };
      } else {
        this.custom_variables[name] = {
          "value": value,
          "instance_adaptable": instance_adaptable,
          "user_locked": false
        };
      }
      this.current_instance_object.custom_variables[name] = this.custom_variables[name];
      this.logger.log('variable ' + name + ' value set to instance value: ' + this.custom_variables[name].value, 'info');
    }
    else {
      this.custom_variables[name] = {
        "value": value,
        "instance_adaptable": instance_adaptable,
        "user_locked": false
      };

      this.logger.log('variable ' + name + ' value set to ' + value, 'info');
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

    // //find the attribute_instance, that belongs to the class_instance or port_instance that has been initialized
    // let attribute_instance;
    // if (this.globalObjectInstance.attribute_instances) {
    //   attribute_instance = this.globalObjectInstance.attribute_instances.find(
    //     attribute_instance => (
    //       attribute_instance.uuid_attribute == attribute_uuid &&
    //       (
    //         attribute_instance.assigned_uuid_class_instance == assigned_instance_uuid ||
    //         attribute_instance.assigned_uuid_port_instance == assigned_instance_uuid ||
    //         attribute_instance.assigned_uuid_scene_instance == assigned_instance_uuid)
    //     )
    //   );
    // }

    // if (attribute_instance && attribute_instance.value) {
    //   return attribute_instance.value;
    // }
    // else { return "the attribute value is undefined or not available" }
    return await this.expression.attrvalByInst(attribute_uuid, assigned_instance_uuid);
  }

  //this creates a craphic cube as object
  async graphic_cube(width: number, height: number, depth: number, color?: string, map?: string, x_rel?: number, y_rel?: number, z_rel?: number) {

    const geometry = new THREE.BoxGeometry(width, height, depth, 20, 20, 20);
    const material = new THREE.MeshBasicMaterial();

    if (color)
      material.color.set(color);

    if (map && map != undefined && map != '' && map != null && map != 'undefined') {

      this.map = map;

      // Create an image
      const image = new Image();
      // Create texture
      const texture = new THREE.Texture(image);
      // On image load, update texture
      image.onload = async () => { texture.needsUpdate = true };
      // Set image source
      image.src = map;

      material.map = texture;
      material.transparent = true;
      material.color.set('white');

    }

    const box = new THREE.Mesh(geometry, material);
    box.position.x = x_rel ? x_rel : box.position.x;
    box.position.y = y_rel ? y_rel : box.position.y;
    box.position.z = z_rel ? z_rel : box.position.z;

    this.object3D[box.uuid] = box;

    //return only used for relations
    return box;
  }

  //this creates a craphic cube as object
  async graphic_plane(width: number, height: number, color?: string, map?: string, x_rel?: number, y_rel?: number, z_rel?: number) {

    const geometry = new THREE.PlaneGeometry(width, height, 20, 20);
    const material = new THREE.MeshBasicMaterial();

    if (color)
      material.color.set(color);

    if (map && map != undefined && map != '' && map != null && map != 'undefined') {
      this.map = map;

      // Create an image
      const image = new Image();
      // Create texture
      const texture = new THREE.Texture(image);
      // On image load, update texture
      image.onload = () => { texture.needsUpdate = true };
      // Set image source
      image.src = map;

      material.alphaTest = 0.1;
      material.map = texture;
      material.transparent = true;
      material.color.set('white');
    }

    const plane = new THREE.Mesh(geometry, material);
    //set position
    plane.position.x = x_rel ? x_rel : plane.position.x;
    plane.position.y = y_rel ? y_rel : plane.position.y;
    plane.position.z = z_rel ? z_rel : plane.position.z;

    this.object3D[plane.uuid] = plane;

    plane.material.side = THREE.DoubleSide;


    //return only used for relations
    return plane;
  }

  //this creates a graphic sphere
  async graphic_sphere(radius: number, withSegments: number, heightSegments: number, color?: string, map?: string, x_rel?: number, y_rel?: number, z_rel?: number) {
    const geometry = new THREE.SphereGeometry(radius, withSegments, heightSegments);
    const material = new THREE.MeshBasicMaterial();

    if (color)
      material.color.set(color);

    if (map && map != undefined && map != '' && map != null && map != 'undefined') {
      this.map = map;

      // Create an image
      const image = new Image(); // or document.createElement('img' );
      // Create texture
      const texture = new THREE.Texture(image);
      // On image load, update texture
      image.onload = () => { texture.needsUpdate = true };
      // Set image source
      image.src = map;

      material.map = texture;
      material.transparent = true;
      material.color.set('white');
    }

    const sphere = new THREE.Mesh(geometry, material);
    //set position
    sphere.position.x = x_rel ? x_rel : sphere.position.x;
    sphere.position.y = y_rel ? y_rel : sphere.position.y;
    sphere.position.z = z_rel ? z_rel : sphere.position.z;

    this.object3D[sphere.uuid] = sphere;

    //return only used for relations
    return sphere;
  }

  //load a predefined gltf to the object
  //!! this must load async in the vizRep
  async graphic_gltf(objectString: string, x_rel?: number, y_rel?: number, z_rel?: number) {

    //we define the loader
    const loader = new GLTFLoader();

    //we parse the object string to three.js objects with the async parser
    const loadedGltf = await loader.parseAsync(objectString, '').then(gltf => {
      //this would be of type GLTF -> there is a typedoc problem
      const anyobject = gltf as any;

      const objects = [];

      // convert all materials to phong
      //https://stackoverflow.com/questions/61717393/how-do-i-convert-all-materials-in-a-loaded-gltf-from-mesh-basic-to-mesh-phong
      gltf.scene.traverse((child) => {
        if (!child.isMesh) return;
        // check if child.material is MeshPhongMaterial
        const prevMaterial = child.material;
        child.material = new THREE.MeshPhongMaterial();
        THREE.MeshBasicMaterial.prototype.copy.call(child.material, prevMaterial);
      });

      this.metaUtility.findType(anyobject.scene, 'Mesh', objects);

      for (const mesh of objects) {
        //move the object by the relative position
        mesh.position.x = x_rel ? mesh.position.x + x_rel : mesh.position.x;
        mesh.position.y = y_rel ? mesh.position.y + y_rel : mesh.position.y;
        mesh.position.z = z_rel ? mesh.position.z + z_rel : mesh.position.z;

        this.object3D[mesh.uuid] = mesh;
      }

    });
  }


  //this creates a 3D text
  async graphic_text(x_rel: number, y_rel: number, z_rel: number, size: number, color: string, att: string, pos_name_x?: string, pos_name_y?: string, pos_name_z?: string, rx?: number, ry?: number, rz?: number, rw?: number) {

    //todo --> height is not used anymore

    // Create:
    const textMesh = new Text()
    textMesh.name = att + textMesh.uuid;
    textMesh.anchorX = 'center';
    textMesh.anchorY = 'middle';


    // Set properties to configure:
    textMesh.text = att;
    textMesh.fontSize = size;
    textMesh.color = new THREE.Color(color);

    // Update the rendering:
    textMesh.sync();

    textMesh.userData.custom_variables = {};
    if (pos_name_x && pos_name_y && pos_name_z) {
      textMesh.userData.custom_variables[pos_name_x] = { "value": x_rel, "instance_adaptable": true, "user_locked": false };
      textMesh.userData.custom_variables[pos_name_y] = { "value": y_rel, "instance_adaptable": true, "user_locked": false };
      textMesh.userData.custom_variables[pos_name_z] = { "value": z_rel, "instance_adaptable": true, "user_locked": false };
    }


    rx ? rx : rx = 0;
    ry ? ry : ry = 0;
    rz ? rz : rz = 0;
    rw ? rw : rw = 1;

    // the name of the rotation variables should be taken from the method arguments
    // todo: must be extended
    textMesh.userData.custom_variables["rx"] = { "value": rx, "instance_adaptable": true, "user_locked": false };
    textMesh.userData.custom_variables["ry"] = { "value": ry, "instance_adaptable": true, "user_locked": false };
    textMesh.userData.custom_variables["rz"] = { "value": rz, "instance_adaptable": true, "user_locked": false };
    textMesh.userData.custom_variables["rw"] = { "value": rw, "instance_adaptable": true, "user_locked": false };

    this.labels[textMesh.uuid] = textMesh;

    //return only used for relations
    return textMesh;
  }

  //this creates a 3D line
  //this was changed in July21 to Line2 since we can create thick lines with Line2
  //function setPos was also updated
  async rel_graphic_line(color: string, line_width: number, dashed: boolean, dash_scale: number, dash_size: number, gap_size: number) {

    const positions: number[] = [];
    const threeColor: THREE.Color = new THREE.Color(color);

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
      worldUnits: true
    });


    const line: Line2 = new Line2(geometry, material);
    await line.computeLineDistances();
    line.scale.set(1, 1, 1);
    this.globalObjectInstance.scene.add(line);

    //set middle pos variable
    line.userData.midPoint = new THREE.Vector3(0, 0, 0);


    //set uuid of mesh to class_instance_uuid
    line.uuid = await this.instanceUtility.get_current_class_instance_uuid();
    this.logger.log('class_instance uuid ' + line.uuid + ' maped with three.object3d uuid in gc.rel_graphic_line', 'info');

    //push line to update array
    this.globalObjectInstance.updateLinesArray.push(line);

    //add line to gc.object3D object
    this.object3D[line.uuid] = line;

    //set start, end object array to empty (init)
    line.userData.relObj = [];

    //set the line to the state object as active line
    this.globalStateObject.activeStateLine = line;

  }

  //this is the function that defines a object for the from end of a relation (can be called multiple times)
  //takes a gc visual object as argument
  async rel_from_object(object: THREE.Mesh) {
    //sets the object to the gc object with all from objects
    this.rel_from_objects[object.uuid] = object;
  }

  //merges all objects in gc.rel_from_objects to one object
  async rel_merge_from_objects() {
    //merge the objects in  rel_from_objects
    const objects_from_merge = [];

    //push all objects to array
    for (const [key, value] of Object.entries(this.rel_from_objects)) {
      objects_from_merge.push(value);
    }

    const temp: THREE.Mesh = await this.mergeOjects(objects_from_merge);
    temp.uuid = await this.instanceUtility.get_current_class_instance_uuid();
    this.rel_from_objects = {};

    //get bounding box
    const box = new THREE.Box3();

    // ensure the bounding box is computed for its geometry
    // this should be done only once (assuming static geometries)
    temp.geometry.computeBoundingBox();

    // compute the current bounding box with the world matrix
    box.copy(temp.geometry.boundingBox).applyMatrix4(temp.matrixWorld);

    //add width, height, depth to userData
    let boxParameter = new THREE.Vector3();
    box.getSize(boxParameter)
    temp.userData.boxParameter = boxParameter;

    //set to object for later
    this.rel_from_objects[temp.uuid] = temp;
  }

  //this is the function that defines a object for the to end of a relation (can be called multiple times)
  //takes a gc visual object as argument
  async rel_to_object(object: THREE.Mesh) {
    //sets the object to the gc object with all to objects
    this.rel_to_objects[object.uuid] = object;
  }

  //merges all objects in gc.rel_to_objects to one object
  async rel_merge_to_objects() {
    //merge the objects in  rel_to_objects
    const objects_to_merge = [];

    //push all objects to array
    for (const [key, value] of Object.entries(this.rel_to_objects)) {
      objects_to_merge.push(value);
    }

    const temp: THREE.Mesh = await this.mergeOjects(objects_to_merge);
    temp.uuid = await this.instanceUtility.get_current_class_instance_uuid();
    this.rel_to_objects = {};

    //get bounding box
    const box = new THREE.Box3();

    // ensure the bounding box is computed for its geometry
    // this should be done only once (assuming static geometries)
    temp.geometry.computeBoundingBox();

    // compute the current bounding box with the world matrix
    box.copy(temp.geometry.boundingBox).applyMatrix4(temp.matrixWorld);

    //add width, height, depth to userData
    let boxParameter = new THREE.Vector3();
    box.getSize(boxParameter)
    temp.userData.boxParameter = boxParameter;

    //set to object for later
    this.rel_to_objects[temp.uuid] = temp;
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
    const materialsToAdd = [];

    let globAttributes: string[] = [];
    let globValues = [];

    //get all geometries
    for (const loadedObject of loadedObjects) {

      const geometry: THREE.BufferGeometry = loadedObject.geometry
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
      const matrix = new THREE.Matrix4().compose(loadedObject.position, loadedObject.quaternion, loadedObject.scale)
      loadedObject.geometry.applyMatrix4(matrix)

      //for each entry in attributes check if it exists in the geometry
      // if not, add it with empty array
      // if yes, do nothing
      for (let j = 0; j < globAttributes.length; j++) {
        let geometryAttribute = loadedObject.geometry.getAttribute(globAttributes[j]);
        if (!geometryAttribute) {
          loadedObject.geometry.setAttribute(globAttributes[j], globValues[j]);
        }
      }

      geometriesToMerge.push(loadedObject.geometry);
      materialsToAdd.push(loadedObject.material)
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
    const loadedObjects: THREE.Mesh[] = Object.values(this.object3D) as unknown as THREE.Mesh[];     // --> should be mesh

    const mergedMesh = await this.mergeOjects(loadedObjects);
    //this.object3D = {};
    return mergedMesh;
  }

  async drawVizRep(position: THREE.Vector3, class_instance: ClassInstance) {
    const mergedMesh = await this.getMergedObjects();

    let object = await this.insertObjectToScene(
      class_instance.uuid,
      mergedMesh,
      position.x,
      position.y,
      position.z,
      class_instance.rotation ? class_instance.rotation.x : 0,
      class_instance.rotation ? class_instance.rotation.y : 0,
      class_instance.rotation ? class_instance.rotation.z : 0,
      class_instance.rotation ? class_instance.rotation.w : 1,
      'class'
    );

    //set custom variables which are independent of labels
    await this.setCustomVariables(class_instance);

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
    const classObjectToUpdate: THREE.Mesh = await this.globalObjectInstance.scene.getObjectByProperty('uuid', class_instance.uuid);
    // Update the geometry and material of the object.
    classObjectToUpdate.geometry = mergedMesh.geometry;
    classObjectToUpdate.material = mergedMesh.material;
    // Remove and redraw the labels of the object.


    await this.removeLabels(classObjectToUpdate);
    //set custom variables which are independent of labels
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
      'port'
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
    const portObjectInScene = this.globalObjectInstance.scene.getObjectByProperty('uuid', port_instance.uuid);

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
        objectInstance.custom_variables[key] = value;
        this.logger.log('variable ' + key + ' value set to custom_variables: ' + value.value, 'info');
      }
    }
  }

  //function draws labels to object
  async drawLabels(parentObject: THREE.Mesh) {
    const loadedTextArray = Object.values(this.labels);

    for (const textObject of loadedTextArray) {

      // if class_instance context
      if (this.globalObjectInstance.current_class_instance && !this.globalObjectInstance.current_port_instance) {
        // if the keys are in both the last wins
        this.globalObjectInstance.current_class_instance.custom_variables = { ...textObject.userData.custom_variables, ...this.globalObjectInstance.current_class_instance.custom_variables }
        // search in this.globalObjectInstance.current_class_instance.custom_variables for each key that is in textObject.userData.custom_variables and replace the value
        for (const key in textObject.userData.custom_variables) {
          if (this.globalObjectInstance.current_class_instance.custom_variables[key]) {
            textObject.userData.custom_variables[key].value = this.globalObjectInstance.current_class_instance.custom_variables[key].value;
          }
        }

        parentObject.userData.custom_variables = this.globalObjectInstance.current_class_instance.custom_variables;
      }
      // else check if port_instance context
      else if (this.globalObjectInstance.current_port_instance) {
        // if the keys are in both the last wins
        this.globalObjectInstance.current_port_instance.custom_variables = { ...textObject.userData.custom_variables, ...this.globalObjectInstance.current_port_instance.custom_variables }
        // search in this.globalObjectInstance.current_port_instance.custom_variables for each key that is in textObject.userData.custom_variables and replace the value
        for (const key in textObject.userData.custom_variables) {
          if (this.globalObjectInstance.current_port_instance.custom_variables[key]) {
            textObject.userData.custom_variables[key] = this.globalObjectInstance.current_port_instance.custom_variables[key];
          }
        }

        parentObject.userData.custom_variables = this.globalObjectInstance.current_port_instance.custom_variables;
      }

      await this.attachText(textObject as THREE.Mesh, parentObject)
      this.globalObjectInstance.dragObjects.unshift(textObject as THREE.Mesh);
    }
  }

  //function removes labels from object
  async removeLabels(object: THREE.Mesh) {
    //we remove labels from scene

    if (object.userData.Label) {

      //if there are labels on the object, we delete them
      await Promise.all(object.userData.Label.map(async (label) => {
        await this.deleteObject(label);
      }));
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
    const rel_x = keys.find(key => key.includes("rel") && key.includes("x"));
    const rel_y = keys.find(key => key.includes("rel") && key.includes("y"));
    const rel_z = keys.find(key => key.includes("rel") && key.includes("z"));

    //if rel_x, rel_y, rel_z are found, set position to value of rel_x, rel_y, rel_z 
    textObject.position.x = rel_x ? textObject.userData.custom_variables[rel_x].value : 0;
    textObject.position.y = rel_y ? textObject.userData.custom_variables[rel_y].value : 0;
    textObject.position.z = rel_z ? textObject.userData.custom_variables[rel_z].value : 0;


    //else if rotation delivered by vizRep, set rotation
    if ((textObject.userData.custom_variables.rx.value != undefined && textObject.userData.custom_variables.ry.value != undefined && textObject.userData.custom_variables.rz.value != undefined && textObject.userData.custom_variables.rw.value != undefined) &&
      (textObject.userData.custom_variables.rx.value != 0 || textObject.userData.custom_variables.ry.value != 0 || textObject.userData.custom_variables.rz.value != 0 || textObject.userData.custom_variables.rw.value != 1)) {
      textObject.quaternion.x = textObject.userData.custom_variables.rx.value;
      textObject.quaternion.y = textObject.userData.custom_variables.ry.value;
      textObject.quaternion.z = textObject.userData.custom_variables.rz.value;
      textObject.quaternion.w = textObject.userData.custom_variables.rw.value;
    }


    //The text label is added to the dragObject, if the parent is a line. 
    //this enables the dragging function of line labels
    if (textObject.parent.type == "Line2") {
      this.globalObjectInstance.dragObjects.unshift(textObject)
    }

    //for line middle text if there is a position stored on the parent, set position to that stored position
    if (toAttach.userData["midPoint"]) {
      textObject.position.x = toAttach.userData["midPoint"].x;
      textObject.position.y = toAttach.userData["midPoint"].y;
      textObject.position.z = toAttach.userData["midPoint"].z;
    }

    // Define getter and setter for midPoint
    //like that, the position of the text is bound directly to the userData.midPoint of the parent object (line)
    Object.defineProperty(toAttach.userData, 'midPoint', {
      get() {
        return this._midPoint;
      },
      set(value) {
        this._midPoint = value;
        textObject.position.x = value.x;
        textObject.position.y = value.y;
        textObject.position.z = value.z;
      },
      configurable: true,
      enumerable: true
    });

    // Initialize midPoint if it exists
    if (toAttach.userData._midPoint) {
      textObject.position.x = toAttach.userData._midPoint.x;
      textObject.position.y = toAttach.userData._midPoint.y;
      textObject.position.z = toAttach.userData._midPoint.z;
    }
  }

  async drawVizRep_rel() {
    const uuid = await this.instanceUtility.get_current_class_instance_uuid();
    let obj = this.object3D[uuid];

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
    };

    for (const object of Object.values(this.labels_rel_to_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      await this.attachText(obj, this.object3D[await this.instanceUtility.get_current_class_instance_uuid()].children[1]);
    };

    for (const object of Object.values(this.labels_rel_middle_objects)) {
      const obj: THREE.Mesh = object as THREE.Mesh;
      // attach it directly to the line
      await this.attachText(obj, this.object3D[await this.instanceUtility.get_current_class_instance_uuid()]);
    }


    //reset gc
    await this.resetInstance();
  }

  async updateVizRepRelClass(relationclass_instance: RelationclassInstance) {
    await this.rel_merge_from_objects();
    await this.rel_merge_to_objects();

    // Retrieve the relationclass instance object from scene
    const correspondingSceneObject = await this.globalObjectInstance.scene.getObjectByProperty('uuid', relationclass_instance.uuid);

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
  }


  //this attaches the port physically to the parent object and sets the relative position
  //it adds the port object to the global dragObjects array to make them draggable.
  async attachPort(portObject: THREE.Mesh, toAttach: THREE.Mesh) {

    toAttach.add(portObject);
    toAttach.geometry.computeBoundingBox();
    const box = toAttach.geometry.boundingBox;

    //creates the update function to make sure that a port cannot be outside of an parent object
    portObject.userData.limit = {
      min: box.min,
      max: box.max
    };
    portObject.userData.update = function () {
      portObject.position.clamp(portObject.userData.limit.min, portObject.userData.limit.max);
      // portObject.userData["x_rel"] = portObject.position.x;
      // portObject.userData["y_rel"] = portObject.position.y;
      // portObject.userData["z_rel"] = portObject.position.z;
    }

    portObject.userData.update();

  }


  async setScale(object: THREE.Object3D, instance: ObjectInstance) {
    const custom_variables = instance.custom_variables;
    if (custom_variables["scale"]) {
      const scale = custom_variables["scale"] as THREE.Vector3;
      this.logger.log('Set Scale: set scale for object :' + object.uuid + ' to ' + JSON.stringify(scale), 'info');
      object.scale.set(scale.x, scale.y, scale.z);
    }
    else {
      instance.custom_variables["scale"] = object.scale;
    }

    //set scale of children
    //if they have their own scale they are ignored for rescaling relative to parent
    object.traverse((child: THREE.Mesh) => {
      if (child != object) {
        const newScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1).divide(object.scale);
        if (!child.userData || !("custom_variables" in child.userData) || !("key" in child.userData.custom_variables)) {
          child.scale.set(newScale.x, newScale.y, newScale.z);
        }

        else {
          const scale: THREE.Vector3 = child.userData.custom_variables["scale"];
          if (scale) {
            child.scale.set(scale.x, scale.y, scale.z);
          }
        }
      }
    });
  }


  //insert given object on given position
  async insertObjectToScene(class_instance_uuid: UUID, object: THREE.Mesh, x: number, y: number, z: number, rx: number, ry: number, rz: number, rw: number, type?: string) {

    //set THREE.Object3D.uuid to the uuid of the class_instance for a direct mapping
    object.uuid = class_instance_uuid;
    this.logger.log('class_instance uuid ' + class_instance_uuid + ' maped with three.object3d uuid', 'info');

    //position of object 
    object.position.x = x;
    object.position.y = y;
    object.position.z = z;

    object.setRotationFromQuaternion(new THREE.Quaternion(rx, ry, rz, rw));

    this.globalObjectInstance.scene.add(object);


    //if bendpoint
    if (type == 'bendpoint') {
      // console.info('This is a THREE.Object for a bendpoint. ');
    }

    //push to dragObjects Array
    this.globalObjectInstance.dragObjects.unshift(object);
    return object;
  }

  async deleteObject(object: THREE.Mesh) {

    //remove from scene
    object.parent.remove(object);

    //remove children
    for (const child of object.children) {
      await this.deleteObject(child as THREE.Mesh);
    }

    //remove from dragObjects Array
    const index = this.globalObjectInstance.dragObjects.indexOf(object);
    if (index > -1) {
      this.globalObjectInstance.dragObjects.splice(index, 1);
    }


    //dispose all Objects for Memory reasons
    try {
      object.geometry.dispose();
    } catch (error) {
      this.logger.log('no geometry to delete', 'close');
    }
    try {
      //typedef not complete
      const mat: any = object.material;
      mat.dispose();
    } catch (error) {
      this.logger.log('no material to delete', 'close');
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
