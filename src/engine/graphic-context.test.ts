// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { Text } from "troika-three-text";
import { ClassInstance } from "@gds";

/**
 * P4 headless vizRep-evaluation tests (plan §9 P4 "Verify").
 *
 * `@/engine/global-definition` is mocked with a plain mutable fake (the P3 test
 * pattern): importing the real one constructs a WebGLRenderer + OrbitControls at
 * module scope, which needs a real GPU context. Everything else is REAL — a real
 * THREE.Scene, real geometries, the real `new Function(...)` vizRep eval through
 * metaUtility.parseMetaFunction, and real gds ClassInstances (built via `fromJS`
 * so `instanceof` works — see P3's class-transformer discovery).
 *
 * jsdom is required: troika-three-text's `Text` touches DOM/canvas APIs on sync().
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    scene: null as unknown as THREE.Scene,
    dragObjects: [] as THREE.Mesh[],
    buttonObjects: [] as THREE.Mesh[],
    updateLinesArray: [] as unknown[],
    current_class_instance: null as unknown,
    current_port_instance: null as unknown,
    readyForVizRepUpdate: true,
    selectedTab: 0,
    tabContext: [] as unknown[],
    render: false,
    // Stands in for three's TransformControls: deleteObject has to let go of a
    // gizmo pointed at anything it is about to unparent.
    transformControls: {
      object: undefined as THREE.Object3D | undefined,
      detach() {
        this.object = undefined;
      },
    },
  },
}));

vi.mock("@/engine/global-definition", () => fakeGlobal);

// The gc maps three.js object uuids onto the class-instance uuid being drawn.
const CURRENT_UUID = "11111111-1111-4111-8111-111111111111";
vi.mock("@/resources/services/instance-utility", () => ({
  instanceUtility: {
    get_current_class_instance_uuid: vi.fn(async () => CURRENT_UUID),
  },
}));

const { graphicContext } = await import("@/engine/graphic-context");

/** A real vizRep pulled from the live demo metamodel: e3-Value Model -> class "e3-Value_bendpoint". */
const REAL_BENDPOINT_VIZREP = `/** @param {GraphicContext} gc */
 async function vizRep(gc) { await gc.graphic_sphere(0.05, 10, 10, 'black');}`;

/** Exercises the primitive + label + button surface a class vizRep typically uses. */
const CUBE_WITH_LABEL_VIZREP = `async function vizRep(gc) {
  const box = await gc.graphic_cube(1, 1, 1, 'red');
  await gc.graphic_text(0.5, 0.2, 0, 0.1, 'black', 'hello', 'x_rel', 'y_rel', 'z_rel');
  const btn = await gc.graphic_cube(0.2, 0.2, 0.2, 'blue');
  await gc.graphic_button(btn, 'someExpression');
  return box;
}`;

function makeClassInstance(uuid = CURRENT_UUID): ClassInstance {
  return ClassInstance.fromJS({
    uuid,
    name: "test-instance",
    uuid_class: "22222222-2222-4222-8222-222222222222",
    coordinates_2d: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    custom_variables: {},
    attribute_instances: [],
    port_instances: [],
  }) as ClassInstance;
}

beforeEach(async () => {
  fakeGlobal.globalObject.scene = new THREE.Scene();
  fakeGlobal.globalObject.dragObjects = [];
  fakeGlobal.globalObject.buttonObjects = [];
  fakeGlobal.globalObject.updateLinesArray = [];
  fakeGlobal.globalObject.current_class_instance = null;
  fakeGlobal.globalObject.current_port_instance = null;
  fakeGlobal.globalObject.transformControls.object = undefined;
  await graphicContext.resetInstance();
  graphicContext.custom_variables = {};
});

describe("runVizRepFunction", () => {
  it("evaluates a real vizRep string from the demo metamodel into a mesh", async () => {
    await graphicContext.runVizRepFunction(REAL_BENDPOINT_VIZREP);

    const produced = Object.values(graphicContext.object3D) as THREE.Mesh[];
    expect(produced).toHaveLength(1);
    expect(produced[0].geometry.type).toBe("SphereGeometry");
  });

  it("collects primitives, labels and buttons into their separate gc buckets", async () => {
    await graphicContext.runVizRepFunction(CUBE_WITH_LABEL_VIZREP);

    // The button was moved out of object3D and into button3D by graphic_button.
    expect(Object.values(graphicContext.object3D)).toHaveLength(1);
    expect(Object.values(graphicContext.button3D)).toHaveLength(1);
    expect(Object.values(graphicContext.labels)).toHaveLength(1);

    const button = Object.values(graphicContext.button3D)[0] as THREE.Mesh;
    expect(button.userData.isButton).toBe(true);
    expect(button.userData.expression).toBe("someExpression");

    // troika `Text` is a Mesh subclass; `text` lives on the subclass.
    const label = Object.values(graphicContext.labels)[0] as Text;
    expect(label.text).toBe("hello");
    // graphic_text seeds the positional custom_variables the label is placed by.
    expect(label.userData.custom_variables.x_rel.value).toBe(0.5);
    expect(label.userData.custom_variables.rw.value).toBe(1);
  });
});

describe("drawVizRep", () => {
  it("draws a class instance into the scene under the instance uuid", async () => {
    const classInstance = makeClassInstance();
    fakeGlobal.globalObject.current_class_instance = classInstance;

    await graphicContext.runVizRepFunction(CUBE_WITH_LABEL_VIZREP);
    const object = await graphicContext.drawVizRep(new THREE.Vector3(1, 2, 3), classInstance);

    // three.js object uuid is remapped onto the gds class-instance uuid — this
    // mapping is what lets the rest of the engine find meshes by instance uuid.
    expect(object.uuid).toBe(classInstance.uuid);
    expect(fakeGlobal.globalObject.scene.getObjectByProperty("uuid", classInstance.uuid)).toBe(object);
    expect(object.position.toArray()).toEqual([1, 2, 3]);

    // The mesh is draggable and its label is attached as a child.
    expect(fakeGlobal.globalObject.dragObjects).toContain(object);
    expect(object.userData.Label).toHaveLength(1);
    expect(object.children.some((c) => c.userData.isButton)).toBe(true);
    expect(fakeGlobal.globalObject.buttonObjects).toHaveLength(1);
  });

  it("resets the gc buckets after drawing so the next vizRep starts clean", async () => {
    const classInstance = makeClassInstance();
    await graphicContext.runVizRepFunction(REAL_BENDPOINT_VIZREP);
    await graphicContext.drawVizRep(new THREE.Vector3(0, 0, 0), classInstance);

    expect(Object.values(graphicContext.object3D)).toHaveLength(0);
    expect(Object.values(graphicContext.labels)).toHaveLength(0);
    expect(Object.values(graphicContext.button3D)).toHaveLength(0);
    expect(graphicContext.current_instance_object).toBeNull();
  });

  it("writes instance_adaptable variables back onto the class instance", async () => {
    const classInstance = makeClassInstance();
    await graphicContext.setVariable("width", 42, true);
    await graphicContext.runVizRepFunction(REAL_BENDPOINT_VIZREP);
    await graphicContext.drawVizRep(new THREE.Vector3(0, 0, 0), classInstance);

    const vars = classInstance.custom_variables as Record<string, { value: number }>;
    expect(vars.width.value).toBe(42);
  });
});

describe("deleteObject", () => {
  it("removes the mesh from the scene and from the drag/button arrays", async () => {
    const classInstance = makeClassInstance();
    fakeGlobal.globalObject.current_class_instance = classInstance;
    await graphicContext.runVizRepFunction(CUBE_WITH_LABEL_VIZREP);
    const object = await graphicContext.drawVizRep(new THREE.Vector3(0, 0, 0), classInstance);

    await graphicContext.deleteObject(object);

    expect(fakeGlobal.globalObject.scene.getObjectByProperty("uuid", classInstance.uuid)).toBeUndefined();
    expect(fakeGlobal.globalObject.dragObjects).not.toContain(object);
    expect(fakeGlobal.globalObject.buttonObjects).toHaveLength(0);
  });

  // three's TransformControls dereferences `object.parent` on every frame and logs
  // "The attached 3D object must be a part of the scene graph" once that is null. A
  // delete is a chain of awaited HTTP calls, so the render loop draws many frames
  // between the removal and whatever detaches afterwards — the gizmo has to be let go
  // HERE, at the removal, or every one of those frames logs the error.
  it("detaches the transform gizmo from the object it removes", async () => {
    const classInstance = makeClassInstance();
    fakeGlobal.globalObject.current_class_instance = classInstance;
    await graphicContext.runVizRepFunction(CUBE_WITH_LABEL_VIZREP);
    const object = await graphicContext.drawVizRep(new THREE.Vector3(0, 0, 0), classInstance);
    fakeGlobal.globalObject.transformControls.object = object;

    await graphicContext.deleteObject(object);

    expect(fakeGlobal.globalObject.transformControls.object).toBeUndefined();
  });

  // The gizmo is attached to whatever was picked, and a label or a port is a child of
  // the instance mesh rather than the mesh itself — deleting the instance orphans it
  // just the same, so the whole subtree has to be checked.
  it("detaches the gizmo when it holds a CHILD of the object being removed", async () => {
    const classInstance = makeClassInstance();
    fakeGlobal.globalObject.current_class_instance = classInstance;
    await graphicContext.runVizRepFunction(CUBE_WITH_LABEL_VIZREP);
    const object = await graphicContext.drawVizRep(new THREE.Vector3(0, 0, 0), classInstance);
    const label = object.children[0];
    expect(label).toBeDefined();
    fakeGlobal.globalObject.transformControls.object = label;

    await graphicContext.deleteObject(object);

    expect(fakeGlobal.globalObject.transformControls.object).toBeUndefined();
  });

  it("leaves a gizmo attached to an unrelated object alone", async () => {
    const classInstance = makeClassInstance();
    fakeGlobal.globalObject.current_class_instance = classInstance;
    await graphicContext.runVizRepFunction(CUBE_WITH_LABEL_VIZREP);
    const object = await graphicContext.drawVizRep(new THREE.Vector3(0, 0, 0), classInstance);
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    fakeGlobal.globalObject.scene.add(other);
    fakeGlobal.globalObject.transformControls.object = other;

    await graphicContext.deleteObject(object);

    expect(fakeGlobal.globalObject.transformControls.object).toBe(other);
  });

  // A mesh the scene no longer holds still has to release its buffers; `object.parent!`
  // threw here, which aborted the rest of the delete cascade.
  it("tolerates an object that is already out of the scene graph", async () => {
    const orphan = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

    await expect(graphicContext.deleteObject(orphan)).resolves.toBeUndefined();
  });
});

/**
 * Minimal glTF holding one triangle under a node whose matrix flattens it on z.
 * Real vizReps author flattened primitives exactly this way — the "Sphere" node of
 * the Petri-net "Place" model carries a `matrix` with 0.1 in the z-scale slot.
 */
function makeFlattenedGltf(): string {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bytes = new Uint8Array(positions.buffer);
  const uri = "data:application/octet-stream;base64," + btoa(String.fromCharCode(...bytes));

  return JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    // column-major; the 0.1 in slot 10 is the z scale
    nodes: [{ name: "Sphere", mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.byteLength, target: 34962 }],
    buffers: [{ byteLength: bytes.byteLength, uri }],
  });
}

describe("graphic_gltf", () => {
  it("keeps the scale a glTF node bakes into its own matrix", async () => {
    const [mesh] = await graphicContext.graphic_gltf(makeFlattenedGltf());

    // Regression: the flattened spheres of Place / Variable / Start Event rendered as
    // full spheres because an unconditional scale.set() overwrote the node's own scale.
    expect(mesh.scale.z).toBeCloseTo(0.1);
    expect(mesh.scale.x).toBeCloseTo(1);
  });

  it("multiplies an explicit scale onto the node's own scale", async () => {
    const [mesh] = await graphicContext.graphic_gltf(makeFlattenedGltf(), 0, 0, 0, [2, 2, 2]);

    expect(mesh.scale.toArray().map((v) => Number(v.toFixed(3)))).toEqual([2, 2, 0.2]);
  });
});
