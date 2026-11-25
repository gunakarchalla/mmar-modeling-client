// P9 live-server integration test (plan §7 / §9 P9 "every File-menu entry works
// against the live server").
//
// The copy dialog's whole risk is that a duplicate is only *internally* consistent:
// copySceneModel.test.ts proves the uuid rewriting in isolation, but nothing there
// proves the SERVER accepts the result and stores it as a genuinely separate scene.
// That is what this test does, and it is the one thing unit tests cannot:
//
//   login -> create an original scene (with a class instance on a real metaclass)
//   -> duplicateSceneInstance() -> POST the copy -> GET BOTH back
//   -> assert they coexist with disjoint uuids and the copy's own name
//   -> DELETE both in a finally (self-cleaning).
//
// It also covers the delete-scene dialog's endpoint (sceneInstancesAllDELETE2's URL)
// by asserting the original is really gone afterwards.
//
// The demo DB ships scene TYPES but no scene INSTANCES (P3 note), so the test
// creates everything it needs. Raw HTTP against the in-container REST API at
// http://mmar-server:8000 (localhost:8000 does NOT resolve in-container), so the
// base URL is controlled regardless of the bundle's baked-in VITE_API_URL; skipped
// gracefully when the server is down.
import { describe, it, expect } from "vitest";
import { SceneInstance, ClassInstance, Metamodel } from "@gds";
import { duplicateSceneInstance, collectSceneInstanceUuids } from "./copySceneModel";

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

describe.skipIf(!isUp)("P9 model ops — live copy + delete round-trip", () => {
  it("duplicates a scene into an independent copy the server accepts, then deletes both", async () => {
    const headers = await authHeaders();
    const jsonHeaders = { ...headers, "Content-Type": "application/json" };

    // Pick a scene type that actually has a class to instantiate (not pinned to a
    // uuid — same auto-pick as the P7 milestone test).
    const stRes = await fetch(`${SERVER}/metamodel/sceneTypes`, { method: "GET", headers });
    expect(stRes.ok).toBe(true);
    const sceneTypes = Metamodel.fromJS(await stRes.json()).sceneTypes ?? [];
    const sceneType = sceneTypes.find((st) => st.classes && st.classes.length > 0);
    expect(sceneType, "expected a demo scene type with at least one class").toBeTruthy();
    const metaClass = sceneType!.classes[0];

    const originalUuid = crypto.randomUUID();
    const original = {
      uuid: originalUuid,
      name: "P9 original scene",
      description: "original",
      uuid_scene_type: sceneType!.uuid,
      class_instances: [
        {
          uuid: crypto.randomUUID(),
          uuid_class: metaClass.uuid,
          name: "p9-ci",
          coordinates_2d: { x: 3.5, y: 4.5, z: 0 },
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

    let copyUuid: string | undefined;
    try {
      const postRes = await fetch(
        `${SERVER}/instances/sceneTypes/${encodeURIComponent(sceneType!.uuid)}/sceneInstances`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(original) },
      );
      expect(postRes.ok).toBe(true);

      // Load it back the way the dialog gets it (SceneGroup's tree holds revived
      // instances), then run the real duplicate used by CopySceneDialog.
      const getRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(originalUuid)}`,
        { method: "GET", headers },
      );
      expect(getRes.ok).toBe(true);
      const loaded = SceneInstance.fromJS(await getRes.json()) as SceneInstance;

      const copy = duplicateSceneInstance(loaded, "P9 copied scene", "copied");
      copyUuid = copy.uuid;
      expect(copyUuid).not.toBe(originalUuid);

      // THE point of this test: the server accepts the rewritten graph.
      const copyRes = await fetch(
        `${SERVER}/instances/sceneTypes/${encodeURIComponent(sceneType!.uuid)}/sceneInstances`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(copy) },
      );
      expect(copyRes.ok, "the server rejected the duplicated scene").toBe(true);

      // Both scenes now exist, independently.
      const [originalAfter, copyAfter] = await Promise.all(
        [originalUuid, copyUuid].map(async (uuid) => {
          const res = await fetch(
            `${SERVER}/instances/sceneInstances/${encodeURIComponent(uuid)}`,
            { method: "GET", headers },
          );
          expect(res.ok).toBe(true);
          return SceneInstance.fromJS(await res.json()) as SceneInstance;
        }),
      );

      expect(originalAfter.name).toBe("P9 original scene");
      expect(copyAfter.name).toBe("P9 copied scene");
      expect(copyAfter.class_instances).toHaveLength(1);
      expect(copyAfter.class_instances[0]).toBeInstanceOf(ClassInstance);
      // the copy kept the content...
      expect(copyAfter.class_instances[0].uuid_class).toBe(metaClass.uuid);
      expect(copyAfter.class_instances[0].coordinates_2d.x).toBe(3.5);
      // ...but shares NO instance uuid with the original, as stored by the server.
      const originalUuids = new Set(collectSceneInstanceUuids(originalAfter));
      const shared = collectSceneInstanceUuids(copyAfter).filter((u) => originalUuids.has(u));
      expect(shared, "copy and original share instance uuids on the server").toEqual([]);

      // Delete-scene dialog's endpoint: the original is really gone afterwards.
      const delRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(originalUuid)}`,
        { method: "DELETE", headers },
      );
      expect(delRes.ok).toBe(true);

      const goneRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(originalUuid)}`,
        { method: "GET", headers },
      );
      expect(goneRes.ok).toBe(false);

      // ...and deleting the original left the copy untouched (proving independence).
      const survivorRes = await fetch(
        `${SERVER}/instances/sceneInstances/${encodeURIComponent(copyUuid)}`,
        { method: "GET", headers },
      );
      expect(survivorRes.ok).toBe(true);
    } finally {
      // Cleanup: remove whatever still exists, unconditionally.
      for (const uuid of [originalUuid, copyUuid]) {
        if (!uuid) continue;
        await fetch(`${SERVER}/instances/sceneInstances/${encodeURIComponent(uuid)}`, {
          method: "DELETE",
          headers,
        }).catch(() => {});
      }
    }
  });
});
