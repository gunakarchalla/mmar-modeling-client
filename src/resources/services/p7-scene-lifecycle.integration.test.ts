// P7 END-TO-END MILESTONE live-server integration test (plan §7):
// "login -> fetch tree -> open a SceneInstance -> ... -> mutate a class instance
//  coordinate -> run persistency -> GET it back and assert the PATCH stuck."
//
// The demo DB ships scene TYPES but no scene INSTANCES (P3 note), so this test
// CREATES its own scene — with one class instance on a real metaclass — persists a
// mutated coordinate, GETs it back, asserts the change stuck AND that the graph
// revives to real gds instances (`instanceof ClassInstance`), then DELETEs the
// scene in a `finally` (self-cleaning).
//
// BROWSER LIMITATION: the plan's "assert meshes exist in tabContext[0].threeScene"
// step needs a real WebGL context, which this container has no browser to provide.
// The persist ROUND-TRIP that persistency-handler.persistSceneInstanceToDB() owns is
// exercised here directly against the live server instead (the drawing half is
// covered by the P4 vizRep tests + the component tests).
//
// Runs against the in-container REST API at http://mmar-server:8000 (localhost:8000
// does NOT resolve in-container); skipped gracefully when the server is down. Raw
// HTTP controls the base URL regardless of the bundle's baked-in VITE_API_URL; the
// data is run through the SAME gds `fromJS` revive the app uses.
import { describe, it, expect } from "vitest";
import { SceneType, SceneInstance, ClassInstance, Metamodel } from "@gds";

const SERVER = "http://mmar-server:8000";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER}/`, { method: "GET", signal: AbortSignal.timeout(2000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const loginRes = await fetch(`${SERVER}/login/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const token: string = JSON.parse(await loginRes.text());
  return { Accept: "application/json", authorization: `Bearer ${token}` };
}

const isUp = await serverReachable();

describe.skipIf(!isUp)("P7 scene lifecycle — live end-to-end persist round-trip", () => {
  it("creates a scene, persists a mutated class-instance coordinate, and reads it back", async () => {
    const headers = await authHeaders();
    const jsonHeaders = { ...headers, "Content-Type": "application/json" };

    // 1) Fetch the tree (same revive path as backendService.getSceneTypes) and pick a
    //    scene type that actually has a class to instantiate.
    const stRes = await fetch(`${SERVER}/metamodel/sceneTypes`, { method: "GET", headers });
    expect(stRes.ok).toBe(true);
    const sceneTypes = Metamodel.fromJS(await stRes.json()).sceneTypes ?? [];
    expect(sceneTypes.length).toBeGreaterThan(0);
    expect(sceneTypes[0]).toBeInstanceOf(SceneType);

    const sceneType = sceneTypes.find((st) => st.classes && st.classes.length > 0);
    expect(sceneType, "expected a demo scene type with at least one class").toBeTruthy();
    const metaClass = sceneType!.classes[0];

    const sceneUuid = crypto.randomUUID();
    const classInstanceUuid = crypto.randomUUID();
    const scene = {
      uuid: sceneUuid,
      name: "P7 milestone test scene",
      uuid_scene_type: sceneType!.uuid,
      class_instances: [
        {
          uuid: classInstanceUuid,
          uuid_class: metaClass.uuid,
          name: "p7-ci",
          coordinates_2d: { x: 1.5, y: 2.5, z: 0 },
          coordinates_3d: { x: 0, y: 0, z: 0 },
          geometry: "",
          attribute_instance: [],
          port_instance: [],
          custom_variables: {},
          line_points: [],
        },
      ],
      relationclasses_instances: [],
      role_instances: [],
      attribute_instances: [],
      port_instances: [],
    };

    try {
      // 2) Create the scene (like "opening" a new SceneInstance that auto-saves).
      const postRes = await fetch(
        `${SERVER}/instances/sceneTypes/${encodeURIComponent(sceneType!.uuid)}/sceneInstances`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(scene) },
      );
      expect(postRes.ok).toBe(true);

      // 3) GET it back and revive it — the class instance is a real gds ClassInstance.
      const getRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(sceneUuid)}`,
        { method: "GET", headers },
      );
      expect(getRes.ok).toBe(true);
      const loaded = SceneInstance.fromJS(await getRes.json()) as SceneInstance;
      expect(loaded).toBeInstanceOf(SceneInstance);
      expect(loaded.class_instances).toHaveLength(1);
      expect(loaded.class_instances[0]).toBeInstanceOf(ClassInstance);
      expect(loaded.class_instances[0].coordinates_2d.x).toBe(1.5);

      // 4) Mutate the coordinate in place (what dragging a class instance does) and
      //    PATCH the whole scene (persistency-handler.persistSceneInstanceToDB path).
      loaded.class_instances[0].coordinates_2d.x = 9.9;
      loaded.class_instances[0].coordinates_2d.y = 8.8;
      const patchRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(sceneUuid)}`,
        { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(loaded) },
      );
      expect(patchRes.ok).toBe(true);

      // 5) GET again — assert the PATCH stuck.
      const verifyRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(sceneUuid)}`,
        { method: "GET", headers },
      );
      expect(verifyRes.ok).toBe(true);
      const verified = SceneInstance.fromJS(await verifyRes.json()) as SceneInstance;
      expect(verified.class_instances[0].coordinates_2d.x).toBe(9.9);
      expect(verified.class_instances[0].coordinates_2d.y).toBe(8.8);
    } finally {
      // Cleanup: delete the scene we created (unconditionally, by uuid).
      await fetch(`${SERVER}/instances/sceneInstances/${encodeURIComponent(sceneUuid)}`, {
        method: "DELETE",
        headers,
      }).catch(() => {});
    }
  });
});
