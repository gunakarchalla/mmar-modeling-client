import { describe, it, expect } from "vitest";
import { SceneType } from "@gds/models/meta/Metamodel_scenetypes.structure";
import { Metamodel } from "@gds/models/meta/Metamodel_metamodels.structure";

// Live-server integration test (plan.md §7). Runs against the in-container REST
// API at http://mmar-server:8000 (localhost:8000 does NOT resolve in-container).
// It is skipped gracefully when the server is unreachable so the suite stays
// green offline / in CI without a backend.
//
// It validates the LOCKED reviving decision: API responses must become real gds
// class instances (plainToInstance / fromJS) because the modeling client relies
// on `instanceof` checks. This mirrors exactly what BackendService.getSceneTypes
// does (Metamodel.fromJS(...).sceneTypes); we drive the raw HTTP here so the test
// controls the base URL regardless of the bundle's baked-in VITE_API_URL.

const SERVER = "http://mmar-server:8000";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER}/`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    // Any HTTP response (even 404) means the server is up.
    return res.status > 0;
  } catch {
    return false;
  }
}

const isUp = await serverReachable();

describe.skipIf(!isUp)("BackendService live integration", () => {
  it("logs in with admin/admin and revives scene types into gds instances", async () => {
    const loginRes = await fetch(`${SERVER}/login/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    expect(loginRes.ok).toBe(true);
    const token: string = JSON.parse(await loginRes.text());
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const stRes = await fetch(`${SERVER}/metamodel/sceneTypes`, {
      method: "GET",
      headers: { Accept: "application/json", authorization: `Bearer ${token}` },
    });
    expect(stRes.ok).toBe(true);

    const data = await stRes.json();
    // Same reviving path BackendService.getSceneTypes uses.
    const sceneTypes = Metamodel.fromJS(data).sceneTypes ?? [];
    expect(Array.isArray(sceneTypes)).toBe(true);

    // The demo metamodel ships >=1 scene type; assert the revive kept the class
    // identity so downstream `instanceof SceneType` checks work.
    if (sceneTypes.length > 0) {
      expect(sceneTypes[0]).toBeInstanceOf(SceneType);
      expect(typeof sceneTypes[0].uuid).toBe("string");
    }
  });
});
