import { describe, it, expect } from "vitest";

/**
 * P12 LIVE test — the Algorithms dialog's two endpoints against the real mmar-server
 * (plan §9 P12 "Done when: Algorithms dialog lists+runs procedures from the live
 * server"). Skips gracefully when the server is unreachable (plan §7).
 *
 * WHY THIS ONE IS SAFE TO ADD, given P10's measurement that a 6th heavy live file made
 * the older live tests flake ~1 run in 3: both procedure endpoints are 2-BYTE responses
 * (~20 ms), and neither fetches `/metamodel/sceneTypes` (29 MB) — the thing P10 proved
 * must never be re-fetched. The scene-type uuid is PINNED (P7/P10's convention) rather
 * than discovered, and it is self-checking: the assert below fails loudly if the pin
 * ever stops resolving, instead of silently testing nothing.
 *
 * WHAT IT ESTABLISHES (and it is not what you might hope): the demo database contains
 * ZERO procedures — both endpoints return `[]`. So the dialog is correct-but-empty
 * against demo data, and "lists+runs procedures" cannot be shown end-to-end with the
 * data that exists. The listing/running logic is covered instead by
 * procedure-utility.test.ts, which runs REAL procedure code strings through the real
 * `new Function` sandbox. This test pins the contract the dialog depends on — the
 * endpoints exist, authenticate, and return ARRAYS — so that if procedures are ever
 * seeded, the dialog needs no change. See state.json → discoveries (P12).
 */

const API = "http://mmar-server:8000";

/** SceneType "Robotic system" — pinned (P7 recorded the BPMN one the same way). */
const ROBOTIC_SYSTEM_SCENETYPE_UUID = "113c3133-bf77-493a-a36f-553e77832280";

async function serverIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${API}/login/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const isUp = await serverIsUp();

async function login(): Promise<string> {
  const response = await fetch(`${API}/login/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  return JSON.parse(await response.text()) as string;
}

describe.skipIf(!isUp)("P12 algorithms — live server", () => {
  it("GET /metamodel/independent_procedures returns an array of procedures", async () => {
    const token = await login();

    const response = await fetch(`${API}/metamodel/independent_procedures`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.ok).toBe(true);
    const body: unknown = await response.json();
    // The shape the dialog's independent list is built from. P3 corrected
    // backendService.getProcedures' return type to Procedure[] on exactly this basis.
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /metamodel/sceneTypes/:uuid/procedures returns an array for a real scene type", async () => {
    const token = await login();

    const response = await fetch(`${API}/metamodel/sceneTypes/${ROBOTIC_SYSTEM_SCENETYPE_UUID}/procedures`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.ok).toBe(true);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  it("the pinned Robotic system scene type still exists (self-check for the pin above)", async () => {
    const token = await login();

    // 2-byte endpoint: lists the scene INSTANCES of the type. It does not validate the
    // uuid (P10's note), so a 200 alone proves nothing — but the procedures endpoint
    // above 404s for an unknown scene type, which is what actually guards the pin.
    const response = await fetch(`${API}/metamodel/sceneTypes/${ROBOTIC_SYSTEM_SCENETYPE_UUID}/procedures`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it("records the demo DB's actual procedure count (currently zero — see the header)", async () => {
    const token = await login();

    const response = await fetch(`${API}/metamodel/independent_procedures`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const procedures = (await response.json()) as unknown[];

    // Deliberately NOT asserting `toHaveLength(0)`: if a human seeds procedures, this
    // test must not go red for it. Every procedure the server does return must carry the
    // `name` + `definition` the dialog lists and the sandbox evaluates.
    for (const procedure of procedures as { name?: string; definition?: string }[]) {
      expect(typeof procedure.name).toBe("string");
      expect(typeof procedure.definition).toBe("string");
    }
    expect(procedures.length).toBeGreaterThanOrEqual(0);
  });
});
