//
// P10 LIVE integration test (plan §9 P10): "a node integration test against the live
// sync server: two Y.Docs + two WebsocketProviders (same room uuid, token param) — a
// change in doc A appears in doc B".
//
// Like every *.integration.test.ts here (P1/P3/P7/P8/P9) it probes the servers first
// and `describe.skipIf`s itself when they are unreachable, and it self-cleans.
//
// It drives yjs/y-websocket DIRECTLY rather than through shared-doc-service, for the
// same reason the older live tests drive raw HTTP: the bundle's baked-in
// VITE_API_URL/VITE_SYNC_URL point at localhost (correct for the BROWSER, unresolvable
// in this container), so the test owns the URLs.
//
// TWO TRAPS THIS TEST IS BUILT AROUND — both would otherwise make it pass for the
// wrong reason (or fail for a non-reason):
//
//  1. `disableBc: true` IS LOAD-BEARING. y-websocket also syncs peers through a
//     BroadcastChannel, which is in-process — two providers in one process would sync
//     even with the sync server switched off, so the test would prove nothing.
//     Disabling it forces the round-trip through the real websocket. (Verified by
//     negative control: pointed at a dead port, all three tests fail.)
//  2. THIS FILE NEEDS A WebSocket AND MUST SAY WHERE IT COMES FROM. Node 20 has NO
//     global WebSocket (`typeof globalThis.WebSocket` === "undefined"), so vitest's
//     default node env leaves y-websocket nothing to construct. It used to carry a
//     `@vitest-environment jsdom` docblock and lean on jsdom's WebSocket instead.
//
//     P7 REMOVED THAT. jsdom 29 stopped implementing WebSocket itself (it dropped its
//     `ws` dependency) and now delegates to undici's. undici's WebSocket extends
//     Node's EventTarget but builds its events from the AMBIENT global `Event`, and
//     vitest's jsdom environment replaces `globalThis.Event` with jsdom's class — so
//     the moment the socket opens, Node's `dispatchEvent` rejects its own event with
//     `TypeError: The "event" argument must be an instance of Event. Received an
//     instance of Event`. Bisected in-tree: jsdom 25 + vitest 4 passes, jsdom 29 +
//     vitest 4 fails, so it is jsdom's change and not vitest's.
//
//     So the socket now comes from `ws`, declared as a devDependency here rather than
//     borrowed transitively. P11 made that declaration load-bearing rather than merely
//     tidy: y-websocket 1 listed `ws` as an OPTIONAL dependency (it shipped a server
//     binary), and y-websocket 3 dropped both, so NOTHING supplies `ws` transitively
//     any more. That also drops the jsdom env this file no longer
//     needs: nothing below touches the DOM. `ws` is pinned to 8.21.3, the same version
//     mmar-sync-server serves this protocol with.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

const API_URL = "http://mmar-server:8000";
const SYNC_URL = "ws://mmar-sync-server:8060";

async function reachable(): Promise<boolean> {
  try {
    // The sync server answers a plain HTTP GET with 404 — that is a live server.
    const [api, sync] = await Promise.all([
      fetch(`${API_URL}/login/signin`, { method: "OPTIONS", signal: AbortSignal.timeout(4000) }).then(
        () => true,
        () => false,
      ),
      fetch(SYNC_URL.replace("ws://", "http://"), { signal: AbortSignal.timeout(4000) }).then(
        () => true,
        () => false,
      ),
    ]);
    return api && sync;
  } catch {
    return false;
  }
}

const isUp = await reachable();

async function login(): Promise<string> {
  const response = await fetch(`${API_URL}/login/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  return JSON.parse(await response.text()) as string;
}

/** Wait for `predicate`, polling briefly — yjs sync is a few network round-trips. */
async function waitFor(predicate: () => boolean, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting for condition");
}

function connect(room: string, token: string, doc: Y.Doc): WebsocketProvider {
  return new WebsocketProvider(SYNC_URL, room, doc, {
    params: { token },
    disableBc: true, // trap 1 — see the header
    // trap 2 — see the header. The cast is needed because y-websocket types this
    // option as the DOM `WebSocket` constructor and `ws` does not implement the full
    // EventTarget surface (it has addEventListener but no dispatchEvent). y-websocket
    // only ever constructs it and uses binaryType/send/close/onopen/onmessage/onerror/
    // onclose, all of which `ws` provides.
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  });
}

/**
 * The BPMN scene type of the demo metamodel, recorded by P7. Pinned ON PURPOSE: the
 * only way to DISCOVER a scene type is `GET /metamodel/sceneTypes`, which is a 29 MB
 * payload (there is no lightweight listing — verified against the live server and the
 * mmar-server routes). P8's note warned that each live test file independently
 * fetching+reviving it is what starves the others under vitest's parallel-file
 * scheduling, and measurably so: adding this file with that fetch made the P7/P8 live
 * tests flake ~1 run in 3, and removing it made them 4/4 clean again.
 *
 * This test needs nothing FROM the scene type but a uuid to hang a scene instance off,
 * so it pins one and lets `resolveSceneTypeUuid` fall back to the expensive discovery
 * only if the demo DB no longer has it (a bad uuid makes the POST fail, so the pin is
 * self-checking rather than silently wrong).
 */
const DEMO_SCENE_TYPE_UUID = "5e37e51c-e420-438c-9747-e9424723b4cd";

describe.skipIf(!isUp)("P10 sync server (live)", () => {
  let token = "";
  let sceneInstanceUuid = "";

  /** POST a throwaway empty scene on `sceneTypeUuid`; resolves to the response. */
  async function createScene(sceneTypeUuid: string, uuid: string): Promise<Response> {
    return fetch(`${API_URL}/instances/sceneTypes/${sceneTypeUuid}/sceneInstances`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        uuid,
        uuid_scene_type: sceneTypeUuid,
        name: "p10-sync-test-scene",
        class_instances: [],
        relationclasses_instances: [],
      }),
    });
  }

  beforeAll(async () => {
    token = await login();

    // The sync server authorises a room by asking the API for the caller's access to
    // the scene instance of that uuid (mmar-sync-server/src/{connection,auth}.ts), so
    // the room must be a REAL scene instance we can read — a random uuid gets 4403.
    // Nothing is pre-seeded that we may rely on (P3/P9 notes), so create our own.
    sceneInstanceUuid = uuidv4();
    let created = await createScene(DEMO_SCENE_TYPE_UUID, sceneInstanceUuid);

    if (!created.ok) {
      // The pinned demo scene type is gone — fall back to discovery (see the constant).
      const typesResponse = await fetch(`${API_URL}/metamodel/sceneTypes`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const metamodel = (await typesResponse.json()) as { sceneTypes: { uuid: string }[] };
      created = await createScene(metamodel.sceneTypes[0].uuid, sceneInstanceUuid);
    }
    expect(created.ok).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (!sceneInstanceUuid) return;
    await fetch(`${API_URL}/instances/sceneInstances/${sceneInstanceUuid}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }, 30000);

  it("relays a change from one client's Y.Doc to another's through the sync server", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const providerA = connect(sceneInstanceUuid, token, docA);
    const providerB = connect(sceneInstanceUuid, token, docB);

    try {
      await waitFor(() => providerA.wsconnected && providerB.wsconnected);

      // Write on A in the same shape shared-doc-service uses (class_instances map).
      docA.getMap<Y.Map<unknown>>("class_instances").set("ci-sync-1", new Y.Map(Object.entries({ name: "from A" })));

      await waitFor(() => docB.getMap<Y.Map<unknown>>("class_instances").has("ci-sync-1"));
      expect(docB.getMap<Y.Map<unknown>>("class_instances").get("ci-sync-1")!.get("name")).toBe("from A");

      // ...and back the other way, proving the relay is not one-directional.
      docB.getMap<Y.Map<unknown>>("class_instances").set("ci-sync-2", new Y.Map(Object.entries({ name: "from B" })));
      await waitFor(() => docA.getMap<Y.Map<unknown>>("class_instances").has("ci-sync-2"));
      expect(docA.getMap<Y.Map<unknown>>("class_instances").get("ci-sync-2")!.get("name")).toBe("from B");
    } finally {
      providerA.destroy();
      providerB.destroy();
      docA.destroy();
      docB.destroy();
    }
  }, 60000);

  it("closes a connection with a bad token (4401) instead of syncing", async () => {
    const doc = new Y.Doc();
    const provider = connect(sceneInstanceUuid, "not-a-jwt", doc);
    let closeCode = 0;
    provider.on("connection-close", (event: CloseEvent | null) => {
      // null = closed locally (destroy() in the finally, or the watchdog); only a close
      // the server sent carries the code these tests assert on.
      if (event) closeCode = event.code;
    });

    try {
      await waitFor(() => closeCode !== 0);
      // The close codes shared-doc-service's lifecycle branches on are real.
      expect(closeCode).toBe(4401);
      expect(provider.wsconnected).toBe(false);
    } finally {
      provider.destroy();
      doc.destroy();
    }
  }, 60000);

  it("closes a live connection with 4403 once the user's access is revoked", async () => {
    // Admin holds access to every scene through `public.is_administrator`, so the
    // revocation has to be aimed at an ordinary user: a throwaway one is created here
    // and deleted again in the `finally`.
    const username = `p10revoke_${Date.now()}`;
    const password = "P10-Revoke-Pw-1!";

    const signup = await fetch(`${API_URL}/login/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ uuid: uuidv4(), name: username, username, password, has_user_group: [] }),
    });
    expect(signup.ok).toBe(true);
    const memberUuid = ((await signup.json()) as { uuid: string }).uuid;

    const memberToken = JSON.parse(
      await (
        await fetch(`${API_URL}/login/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
      ).text(),
    ) as string;

    const doc = new Y.Doc();
    let provider: WebsocketProvider | undefined;

    try {
      const granted = await fetch(`${API_URL}/instances/sceneInstances/${sceneInstanceUuid}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ uuid_user: memberUuid, access: "edit" }),
      });
      expect(granted.ok).toBe(true);

      provider = connect(sceneInstanceUuid, memberToken, doc);
      let closeCode = 0;
      provider.on("connection-close", (event: CloseEvent | null) => {
        if (event) closeCode = event.code;
      });
      await waitFor(() => provider!.wsconnected);

      const revoked = await fetch(
        `${API_URL}/instances/sceneInstances/${sceneInstanceUuid}/access/${memberUuid}`,
        { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
      );
      expect(revoked.ok).toBe(true);

      // The sync server re-reads the grant behind each open connection on an interval
      // (ACCESS_REVALIDATE_INTERVAL_MS, 15 s by default), so the close arrives one tick
      // after the revocation rather than instantly. 4403 is what shared-doc-service
      // turns into the access-denied notice that closes the scene tab.
      await waitFor(() => closeCode !== 0, 60000);
      expect(closeCode).toBe(4403);
    } finally {
      provider?.destroy();
      doc.destroy();
      await fetch(`${API_URL}/users/${memberUuid}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  }, 120000);

  it("broadcasts awareness state between clients (the P11 legend's data source)", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const providerA = connect(sceneInstanceUuid, token, docA);
    const providerB = connect(sceneInstanceUuid, token, docB);

    try {
      await waitFor(() => providerA.wsconnected && providerB.wsconnected);
      providerA.awareness.setLocalState({ user: { uuid: "u-a", username: "admin" } });

      await waitFor(() =>
        Array.from(providerB.awareness.getStates().values()).some(
          (state) => (state as { user?: { uuid?: string } })?.user?.uuid === "u-a",
        ),
      );
      expect(
        Array.from(providerB.awareness.getStates().values()).some(
          (state) => (state as { user?: { uuid?: string } })?.user?.uuid === "u-a",
        ),
      ).toBe(true);
    } finally {
      providerA.destroy();
      providerB.destroy();
      docA.destroy();
      docB.destroy();
    }
  }, 60000);
});
