// P3 live-server integration test (plan §7): "fetch scene types + scene instances
// of the first type and build a tab context end-to-end (no UI)".
//
// The demo DB ships scene TYPES but no scene INSTANCES, so this test CREATES a
// throwaway scene instance on the first scene type, revives the round-tripped
// response, builds the tab context through the real createTabContextSceneInstance
// path, asserts, and DELETES the instance again in a `finally` (self-cleaning, the
// same create+reset pattern the plan uses for later live tests).
//
// Runs against the in-container REST API at http://mmar-server:8000 (localhost:8000
// does NOT resolve in-container); skipped gracefully when the server is down. Raw
// HTTP is used so the test controls the base URL regardless of the bundle's baked-in
// VITE_API_URL; the data is then run through the SAME gds `fromJS` revive the app
// uses, proving reviving keeps `instanceof` working end to end.
//
// global-definition is faked (importing the real one builds a WebGLRenderer at
// module scope, which has no WebGL context under vitest-node); the fake is just the
// plain state bag createTabContextSceneInstance + metaUtility read/write.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneType, SceneInstance, Metamodel } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));

import { instanceUtility } from "./instance-utility";
import { useTabsStore } from "@/resources/store/tabsStore";

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

beforeEach(() => {
  Object.assign(mocks.globalObject, {
    selectedTab: -1,
    tabContext: [],
    scene: { uuid: "" },
    sceneTypes: [],
    dragObjects: [],
  });
  useTabsStore.setState({ tabs: [], selectedTab: -1 });
});

describe.skipIf(!isUp)("P3 data services — live end-to-end tab context", () => {
  it("revives scene types, round-trips a scene instance, and builds a tab context", async () => {
    const headers = await authHeaders();

    // 1) Scene types (same revive path as backendService.getSceneTypes).
    const stRes = await fetch(`${SERVER}/metamodel/sceneTypes`, { method: "GET", headers });
    expect(stRes.ok).toBe(true);
    const sceneTypes = Metamodel.fromJS(await stRes.json()).sceneTypes ?? [];
    expect(sceneTypes.length).toBeGreaterThan(0);
    expect(sceneTypes[0]).toBeInstanceOf(SceneType);

    // Populate the engine's sceneTypes (metaUtility.getSceneTypeByUUID reads this).
    mocks.globalObject.sceneTypes = sceneTypes;

    // 2) Create a throwaway scene instance on the FIRST scene type.
    const sceneType = sceneTypes[0];
    const newUuid = crypto.randomUUID();
    const body = {
      uuid: newUuid,
      name: "P3 integration test scene",
      uuid_scene_type: sceneType.uuid,
      class_instances: [],
      relationclasses_instances: [],
      role_instances: [],
      attribute_instances: [],
      port_instances: [],
    };

    try {
      const postRes = await fetch(
        `${SERVER}/instances/sceneTypes/${encodeURIComponent(sceneType.uuid)}/sceneInstances`,
        { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      expect(postRes.ok).toBe(true);

      // Revive the round-tripped instance exactly like backendService does.
      const created = SceneInstance.fromJS(await postRes.json()) as SceneInstance;
      expect(created).toBeInstanceOf(SceneInstance);
      expect(created.uuid).toBe(newUuid);

      // 3) Build the tab context end-to-end (the real createTabContextSceneInstance).
      const ctx = await instanceUtility.createTabContextSceneInstance(created);

      expect(ctx.sceneType).toBeInstanceOf(SceneType);
      expect(ctx.sceneType.uuid).toBe(created.uuid_scene_type);
      expect(ctx.sceneInstance).toBeInstanceOf(SceneInstance);
      expect(mocks.globalObject.tabContext).toHaveLength(1);
      expect(mocks.globalObject.selectedTab).toBe(0);

      // The reactive store was driven in lockstep.
      const store = useTabsStore.getState();
      expect(store.tabs).toHaveLength(1);
      expect(store.tabs[0].uuid).toBe(newUuid);
      expect(store.selectedTab).toBe(0);
    } finally {
      // Cleanup: delete the scene instance we created (by uuid, unconditionally).
      await fetch(`${SERVER}/instances/sceneInstances/${encodeURIComponent(newUuid)}`, {
        method: "DELETE",
        headers,
      }).catch(() => {});
    }
  });
});
