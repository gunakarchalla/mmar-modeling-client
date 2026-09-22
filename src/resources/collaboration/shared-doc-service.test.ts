// P10 unit tests for SharedDocService: session lifecycle (attach / detach / forTab),
// the collabStore mirror, the remote-vs-local observer split, and the connection-close
// codes (4401 / 4403 / 4500) the sync server really sends.
//
// `y-websocket` is mocked with a fake provider whose `on(...)` handlers the test can
// fire — the real one opens a socket (that path is covered live in
// p10-sync-server.integration.test.ts). `@/engine/global-definition` is mocked per the
// P3/P4 pattern (the real one builds a WebGLRenderer at module scope). Y.Doc itself is
// REAL: it is pure and is what makes the observer assertions meaningful.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as Y from "yjs";
import * as THREE from "three";
import { SceneInstance, ClassInstance, type AttributeInstance } from "@gds";

// vi.mock is hoisted above every top-level declaration, so FakeProvider has to be
// defined INSIDE vi.hoisted — declaring the class below and referencing it from the
// factory throws "Cannot access 'FakeProvider' before initialization".
const mocks = vi.hoisted(() => {
  // A JWT admin/admin-shaped payload; jwtDecode only base64-decodes, no verification.
  const payload = Buffer.from(JSON.stringify({ uuid: "user-1", username: "admin" })).toString("base64url");

  const providers: FakeProvider[] = [];

  /**
   * Stands in for y-protocols' Awareness. P11 made this a real handler registry rather
   * than a bag of vi.fn()s: shared-doc-service now subscribes 'change' to feed
   * collabStore.users, so a test needs to fire that event and control getStates().
   */
  class FakeAwareness {
    clientID = 1;
    states = new Map<number, any>();
    setLocalState = vi.fn();
    setLocalStateField = vi.fn();
    getStates = vi.fn(() => this.states);
    handlers = new Map<string, ((payload: any) => void)[]>();

    on(event: string, handler: (payload: any) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }

    off(event: string, handler: (payload: any) => void) {
      const list = (this.handlers.get(event) ?? []).filter((h) => h !== handler);
      this.handlers.set(event, list);
    }

    /** Drive an awareness event the real Awareness would emit. */
    emit(event: string, payload?: unknown) {
      (this.handlers.get(event) ?? []).forEach((handler) => handler(payload));
    }
  }

  /** Stands in for y-websocket's WebsocketProvider: records handlers so tests can fire them. */
  class FakeProvider {
    awareness = new FakeAwareness();
    handlers = new Map<string, ((payload: any) => void)[]>();
    destroy = vi.fn();
    disconnect = vi.fn();

    constructor(
      public url: string,
      public room: string,
      public doc: unknown,
      public opts: { params?: Record<string, string> },
    ) {
      providers.push(this);
    }

    on(event: string, handler: (payload: any) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }

    /** Drive a lifecycle event the real provider would emit. */
    emit(event: string, payload: unknown) {
      (this.handlers.get(event) ?? []).forEach((handler) => handler(payload));
    }
  }

  return {
    token: `header.${payload}.signature`,
    FakeProvider,
    providers,
    globalObject: {
      selectedTab: 0,
      tabContext: [] as unknown[],
      dragObjects: [] as unknown[],
      attribute_instances: [] as AttributeInstance[],
      role_instances: [] as unknown[],
      render: false,
      sharedDocServiceRef: null as unknown,
      accessToken: "",
      // The real GlobalDefinition builds these in its constructor; clearing a
      // remotely-deleted selection detaches the gizmo and removes the box helper.
      scene: null as unknown,
      boxHelper: undefined as unknown,
      transformControls: { detach: vi.fn(), attach: vi.fn() },
      current_class_instance: undefined as unknown,
      current_port_instance: undefined as unknown,
    } as any,
    backendService: {
      sceneInstancesGET: vi.fn(async (): Promise<SceneInstance | undefined> => undefined),
      sceneAccessMeGET: vi.fn(async (): Promise<{ level: "read" | "edit" | "delete" | null }> => ({ level: null })),
    },
    logger: { log: vi.fn() },
    clearToken: vi.fn(),
  };
});

vi.mock("y-websocket", () => ({ WebsocketProvider: mocks.FakeProvider }));
vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));
vi.mock("@/resources/services/token", () => ({ clearToken: mocks.clearToken }));

import { SharedDocService } from "./shared-doc-service";
import { useCollabStore } from "@/resources/store/collabStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { eventBus } from "@/resources/services/event-bus";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { globalStateObject } from "@/engine/global-state-object";

const SCENE_UUID = "scene-1";
const CI_UUID = "ci-1";
const ATTR_UUID = "attr-1";
/** An attribute of the scene instance itself, not of any instance inside it. */
const SCENE_ATTR_UUID = "scene-attr-1";

function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: SCENE_UUID,
    uuid_scene_type: "st-1",
    name: "My Scene",
    class_instances: [
      {
        uuid: CI_UUID,
        uuid_class: "class-1",
        name: "Task",
        coordinates_2d: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        custom_variables: {},
        attribute_instance: [{ uuid: ATTR_UUID, uuid_attribute: "meta-1", name: "Name", value: "original" }],
      },
    ],
    relationclasses_instances: [],
    attribute_instances: [
      {
        uuid: SCENE_ATTR_UUID,
        uuid_attribute: "meta-scene-1",
        name: "Comment",
        value: "original",
        assigned_uuid_scene_instance: SCENE_UUID,
      },
    ],
  }) as SceneInstance;
}

let service: SharedDocService;
let scene: SceneInstance;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.providers.length = 0;
  scene = makeScene();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    tabContext: [{ sceneInstance: scene, threeScene: new THREE.Scene(), contextDragObjects: [], isShared: false }],
    dragObjects: [],
    attribute_instances: [],
    role_instances: [],
    render: false,
    accessToken: mocks.token,
    scene: new THREE.Scene(),
    boxHelper: undefined,
    transformControls: { detach: vi.fn(), attach: vi.fn() },
    current_class_instance: undefined,
    current_port_instance: undefined,
  });
  useCollabStore.setState({ tabs: {} });
  service = new SharedDocService();
});

describe("attach / detach / forTab", () => {
  it("connects to the scene's room with the token and seeds the Y.Doc", () => {
    const session = service.attach(0, scene, "edit");

    const provider = mocks.providers[0];
    // Room name = scene instance uuid, auth via ?token= (mmar-sync-server/connection.ts).
    expect(provider.room).toBe(SCENE_UUID);
    expect(provider.opts.params).toEqual({ token: mocks.token });
    // The doc is populated from the already-loaded SceneInstance.
    expect(session.ydoc.getMap("class_instances").has(CI_UUID)).toBe(true);
    expect(session.access).toBe("edit");
    expect(service.forTab(0)).toBe(session);
  });

  it("does NOT seed the Y.Doc for a read-only session (the server would drop the writes)", () => {
    const session = service.attach(0, scene, "read");
    expect(session.ydoc.getMap("class_instances").size).toBe(0);
  });

  it("sets the globalObject back-reference so engine handlers can find it", () => {
    expect(mocks.globalObject.sharedDocServiceRef).toBe(service);
  });

  it("broadcasts our own user state for other clients' legend/cursor", () => {
    service.attach(0, scene, "edit");
    const state = mocks.providers[0].awareness.setLocalState.mock.calls[0][0] as any;
    expect(state.user.uuid).toBe("user-1");
    expect(state.user.username).toBe("admin");
    expect(state.user.initials).toBe("AD");
    expect(state.access).toBe("edit");
  });

  it("mirrors the session into collabStore for React", () => {
    service.attach(0, scene, "read");
    expect(useCollabStore.getState().tabs[0]).toEqual({ status: "connecting", access: "read", banner: null, users: [] });
  });

  it("returns null for a tab that is not shared", () => {
    expect(service.forTab(3)).toBeNull();
  });

  it("destroys the provider and clears the store on detach", () => {
    service.attach(0, scene, "edit");
    const provider = mocks.providers[0];

    service.detach(0);

    expect(provider.destroy).toHaveBeenCalled();
    expect(service.forTab(0)).toBeNull();
    expect(useCollabStore.getState().tabs[0]).toBeUndefined();
  });

  it("replaces an existing session when the same tab attaches again", () => {
    service.attach(0, scene, "edit");
    service.attach(0, scene, "edit");
    expect(mocks.providers[0].destroy).toHaveBeenCalled();
    expect(service.forTab(0)).not.toBeNull();
  });

  it("detaching an unshared tab is a no-op", () => {
    expect(() => service.detach(7)).not.toThrow();
  });
});

// P11: the user legend's data source. The old client polled awareness every 500 ms
// from the component; the service now pushes awareness 'change' into collabStore, so
// the legend is a pure store reader (plan §9 P11).
describe("awareness -> collabStore.users", () => {
  it("seeds the tab's user list from awareness at attach time", () => {
    const provider = () => mocks.providers[0];
    service.attach(0, scene, "edit");
    provider().awareness.states.set(1, { user: { uuid: "u-1", username: "admin", initials: "AD", color: "#f00" } });
    provider().awareness.emit("change");

    expect(useCollabStore.getState().tabs[0].users).toEqual([
      { clientId: 1, uuid: "u-1", username: "admin", color: "#f00", initials: "AD", isLocal: true },
    ]);
  });

  it("updates the list when a peer joins and again when it leaves", () => {
    service.attach(0, scene, "edit");
    const { awareness } = mocks.providers[0];

    awareness.states.set(1, { user: { uuid: "u-1", username: "admin" } });
    awareness.states.set(2, { user: { uuid: "u-2", username: "test" } });
    awareness.emit("change");
    expect(useCollabStore.getState().tabs[0].users.map((u) => u.username)).toEqual(["admin", "test"]);

    awareness.states.delete(2);
    awareness.emit("change");
    expect(useCollabStore.getState().tabs[0].users.map((u) => u.username)).toEqual(["admin"]);
  });

  it("stops updating the store after detach (y-websocket's destroy leaves OUR handler on)", () => {
    service.attach(0, scene, "edit");
    const { awareness } = mocks.providers[0];
    awareness.states.set(1, { user: { uuid: "u-1", username: "admin" } });
    awareness.emit("change");

    service.detach(0);
    // A late awareness event must not resurrect an entry for the closed tab.
    awareness.states.set(2, { user: { uuid: "u-2", username: "test" } });
    awareness.emit("change");

    expect(useCollabStore.getState().tabs[0]).toBeUndefined();
    expect(awareness.handlers.get("change")).toEqual([]);
  });
});

describe("observers", () => {
  it("applies a REMOTE class change to the scene and flags a re-render", () => {
    const session = service.attach(0, scene, "edit");

    // A remote transaction = any origin that is not the session's localOrigin.
    session.ydoc.transact(() => {
      const ci = session.ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;
      (ci.get("coordinates_2d") as Y.Map<number>).set("x", 42);
    }, "remote-peer");

    expect(scene.class_instances[0].coordinates_2d.x).toBe(42);
    expect(mocks.globalObject.render).toBe(true);
  });

  it("IGNORES a local-origin change (the in-memory model was already updated)", () => {
    const session = service.attach(0, scene, "edit");

    session.ydoc.transact(() => {
      const ci = session.ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;
      (ci.get("coordinates_2d") as Y.Map<number>).set("x", 99);
    }, session.localOrigin);

    // Untouched: applying it again would be an echo of our own edit.
    expect(scene.class_instances[0].coordinates_2d.x).toBe(0);
    expect(mocks.globalObject.render).toBe(false);
  });

  it("publishes the vizrep channel and bumps selectionStore for a remote attribute edit", () => {
    const session = service.attach(0, scene, "edit");
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => received.push(payload));
    const revisionBefore = useSelectionStore.getState().revision;

    session.ydoc.transact(() => {
      const ci = session.ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;
      (ci.get("attribute_instance") as Y.Map<Y.Map<unknown>>).get(ATTR_UUID)!.set("value", "remote edit");
    }, "remote-peer");
    sub.dispose();

    expect(scene.class_instances[0].attribute_instance[0].value).toBe("remote edit");
    expect(received.map((a) => a.uuid)).toEqual([ATTR_UUID]);
    // P8's contract: an in-place mutation must bump, or the window shows stale values.
    expect(useSelectionStore.getState().revision).toBe(revisionBefore + 1);
  });

  it("publishes remoteClassInstanceAdded so persistency-handler draws the new instance", () => {
    const session = service.attach(0, scene, "edit");
    const received: { tabIndex: number }[] = [];
    const sub = eventBus.subscribe("remoteClassInstanceAdded", (payload) => received.push(payload));

    session.ydoc.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("uuid", "ci-remote");
      map.set("uuid_class", "class-1");
      session.ydoc.getMap<Y.Map<unknown>>("class_instances").set("ci-remote", map);
    }, "remote-peer");
    sub.dispose();

    expect(received).toEqual([{ tabIndex: 0 }]);
    expect(scene.class_instances.map((c) => c.uuid)).toContain("ci-remote");
  });

  it("publishes remoteRelationInstanceAdded for a remote relation add", () => {
    const session = service.attach(0, scene, "edit");
    const received: { tabIndex: number }[] = [];
    const sub = eventBus.subscribe("remoteRelationInstanceAdded", (payload) => received.push(payload));

    session.ydoc.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("uuid", "ri-remote");
      map.set("uuid_class", "relclass-1");
      session.ydoc.getMap<Y.Map<unknown>>("relationclasses_instances").set("ri-remote", map);
    }, "remote-peer");
    sub.dispose();

    expect(received).toEqual([{ tabIndex: 0 }]);
  });

  it("applies a remote edit of the SCENE's own attribute and refreshes the window", () => {
    const session = service.attach(0, scene, "edit");
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => received.push(payload));
    const revisionBefore = useSelectionStore.getState().revision;

    session.ydoc.transact(() => {
      session.ydoc.getMap<Y.Map<unknown>>("attribute_instances").get(SCENE_ATTR_UUID)!.set("value", "remote model name");
    }, "remote-peer");
    sub.dispose();

    expect(scene.attribute_instances[0].value).toBe("remote model name");
    expect(received.map((a) => a.uuid)).toEqual([SCENE_ATTR_UUID]);
    expect(useSelectionStore.getState().revision).toBe(revisionBefore + 1);
  });

  it("reports a remote scene-attribute change under the scene key so undo skips it", () => {
    const session = service.attach(0, scene, "edit");
    const received: { tabIndex: number; instanceUuids: string[] }[] = [];
    const sub = eventBus.subscribe("remoteSceneInstanceChanged", (payload) => received.push(payload));

    session.ydoc.transact(() => {
      session.ydoc.getMap<Y.Map<unknown>>("attribute_instances").get(SCENE_ATTR_UUID)!.set("value", "theirs");
    }, "remote-peer");
    sub.dispose();

    // history-service subtracts these from a step's touched set, and the scene's own
    // state is named by the scene-diff sentinel.
    expect(received).toEqual([{ tabIndex: 0, instanceUuids: ["__scene__"] }]);
  });

  it("adopts scene attributes a peer instantiated for a scene that had none", () => {
    scene.attribute_instances = [];
    const session = service.attach(0, scene, "edit");

    session.ydoc.transact(() => {
      const map = new Y.Map<unknown>();
      map.set("uuid", "scene-attr-remote");
      map.set("uuid_attribute", "meta-scene-2");
      map.set("name", "Name");
      map.set("value", "their model");
      session.ydoc.getMap<Y.Map<unknown>>("attribute_instances").set("scene-attr-remote", map);
    }, "remote-peer");

    expect(scene.attribute_instances.map((a) => a.uuid)).toEqual(["scene-attr-remote"]);
    expect(mocks.globalObject.attribute_instances.map((a: AttributeInstance) => a.uuid)).toEqual([
      "scene-attr-remote",
    ]);
  });

  /**
   * A peer deleting the instance the local user has selected: the object leaves the
   * scene, so every piece of selection state naming it has to go too — otherwise the
   * attribute window keeps rendering a deleted element's attributes.
   */
  describe("selection of a remotely deleted instance", () => {
    /** Select CI_UUID the way the interaction handler does. */
    function selectClassInstance(): THREE.Mesh {
      const mesh = new THREE.Mesh();
      Object.defineProperty(mesh, "uuid", { value: CI_UUID });
      globalSelectedObject.setObject(mesh);
      mocks.globalObject.current_class_instance = scene.class_instances[0];
      useSelectionStore.getState().setSelection(CI_UUID, "class");
      return mesh;
    }

    it("clears it when a peer deletes the selected class instance", () => {
      const session = service.attach(0, scene, "edit");
      selectClassInstance();
      const published: string[] = [];
      const sub = eventBus.subscribe("removeAttributeGui", () => published.push("removeAttributeGui"));

      session.ydoc.transact(() => {
        session.ydoc.getMap<Y.Map<unknown>>("class_instances").delete(CI_UUID);
      }, "remote-peer");
      sub.dispose();

      expect(useSelectionStore.getState().selectedInstanceUuid).toBeNull();
      expect(useSelectionStore.getState().selectedType).toBeNull();
      expect(globalSelectedObject.object).toBeUndefined();
      expect(mocks.globalObject.current_class_instance).toBeUndefined();
      // The gizmo must come off before the mesh leaves the scene graph.
      expect(mocks.globalObject.transformControls.detach).toHaveBeenCalled();
      // The attribute window falls back to the scene's own attributes.
      expect(published).toEqual(["removeAttributeGui"]);
    });

    it("clears it when a peer deletes the selected RELATION instance", () => {
      scene.relationclasses_instances = [
        {
          uuid: "ri-sel",
          uuid_class: "rc-1",
          name: "Flow",
          coordinates_2d: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          custom_variables: {},
          attribute_instance: [],
          line_points: [],
        },
      ] as any;
      const session = service.attach(0, scene, "edit");

      const mesh = new THREE.Mesh();
      Object.defineProperty(mesh, "uuid", { value: "ri-sel" });
      globalSelectedObject.setObject(mesh);
      // A relation is held in current_class_instance too — see onSelectionMode.
      mocks.globalObject.current_class_instance = scene.relationclasses_instances[0];
      useSelectionStore.getState().setSelection("ri-sel", "relationclass");

      session.ydoc.transact(() => {
        session.ydoc.getMap<Y.Map<unknown>>("relationclasses_instances").delete("ri-sel");
      }, "remote-peer");

      expect(useSelectionStore.getState().selectedInstanceUuid).toBeNull();
      expect(globalSelectedObject.object).toBeUndefined();
      expect(globalStateObject.activeStateLine).toBeUndefined();
    });

    it("clears a selected PORT when its owning class instance is deleted", () => {
      const session = service.attach(0, scene, "edit");
      // A port has no Y.Doc entry of its own; it goes with its class instance, so the
      // deleted uuid never matches the port's.
      const mesh = new THREE.Mesh();
      Object.defineProperty(mesh, "uuid", { value: "port-1" });
      globalSelectedObject.setObject(mesh);
      mocks.globalObject.current_port_instance = { uuid: "port-1", uuid_class_instance: CI_UUID };
      useSelectionStore.getState().setSelection("port-1", "port");

      session.ydoc.transact(() => {
        session.ydoc.getMap<Y.Map<unknown>>("class_instances").delete(CI_UUID);
      }, "remote-peer");

      expect(useSelectionStore.getState().selectedInstanceUuid).toBeNull();
      expect(mocks.globalObject.current_port_instance).toBeUndefined();
    });

    it("LEAVES a selection of a different instance alone", () => {
      scene.class_instances.push(
        ClassInstance.fromJS({
          uuid: "ci-other",
          uuid_class: "class-1",
          name: "Other",
          coordinates_2d: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          custom_variables: {},
          attribute_instance: [],
        }) as ClassInstance,
      );
      const session = service.attach(0, scene, "edit");

      const mesh = new THREE.Mesh();
      Object.defineProperty(mesh, "uuid", { value: "ci-other" });
      globalSelectedObject.setObject(mesh);
      mocks.globalObject.current_class_instance = scene.class_instances[1];
      useSelectionStore.getState().setSelection("ci-other", "class");

      session.ydoc.transact(() => {
        session.ydoc.getMap<Y.Map<unknown>>("class_instances").delete(CI_UUID);
      }, "remote-peer");

      expect(useSelectionStore.getState().selectedInstanceUuid).toBe("ci-other");
      expect(globalSelectedObject.object).toBe(mesh);
      expect(mocks.globalObject.current_class_instance.uuid).toBe("ci-other");
    });

    it("LEAVES the selection alone when the delete arrives on a BACKGROUND tab", () => {
      // Session on tab 1 while the user is looking at tab 0.
      mocks.globalObject.tabContext[1] = { sceneInstance: scene, threeScene: new THREE.Scene(), contextDragObjects: [] };
      const session = service.attach(1, scene, "edit");
      const mesh = selectClassInstance();

      session.ydoc.transact(() => {
        session.ydoc.getMap<Y.Map<unknown>>("class_instances").delete(CI_UUID);
      }, "remote-peer");

      expect(useSelectionStore.getState().selectedInstanceUuid).toBe(CI_UUID);
      expect(globalSelectedObject.object).toBe(mesh);
      expect(mocks.globalObject.current_class_instance).toBeDefined();
    });

    it("does not touch the selection when NOTHING was deleted", () => {
      const session = service.attach(0, scene, "edit");
      selectClassInstance();

      session.ydoc.transact(() => {
        const ci = session.ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;
        (ci.get("coordinates_2d") as Y.Map<number>).set("x", 7);
      }, "remote-peer");

      expect(useSelectionStore.getState().selectedInstanceUuid).toBe(CI_UUID);
      expect(mocks.globalObject.transformControls.detach).not.toHaveBeenCalled();
    });
  });

  it("does nothing when the tab context is gone (a closed tab must not resurrect state)", () => {
    const session = service.attach(0, scene, "edit");
    mocks.globalObject.tabContext = [];

    expect(() =>
      session.ydoc.transact(() => {
        const ci = session.ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;
        (ci.get("coordinates_2d") as Y.Map<number>).set("x", 5);
      }, "remote-peer"),
    ).not.toThrow();
    expect(scene.class_instances[0].coordinates_2d.x).toBe(0);
  });
});

describe("connection lifecycle", () => {
  it("goes read-only with a banner when the socket drops", () => {
    const session = service.attach(0, scene, "edit");

    mocks.providers[0].emit("status", { status: "disconnected" });

    expect(session.connectionStatus).toBe("disconnected");
    // Edits are blocked while offline — they could not be relayed anyway.
    expect(session.access).toBe("read");
    expect(session.disconnectBanner).toBe("Disconnected — reconnecting…");
    expect(useCollabStore.getState().tabs[0]).toMatchObject({
      status: "disconnected",
      access: "read",
      banner: "Disconnected — reconnecting…",
    });
  });

  it("clears the banner on the FIRST connect without re-fetching", () => {
    const session = service.attach(0, scene, "edit");

    mocks.providers[0].emit("status", { status: "connected" });

    expect(session.connectionStatus).toBe("connected");
    expect(session.disconnectBanner).toBeNull();
    expect(mocks.backendService.sceneInstancesGET).not.toHaveBeenCalled();
  });

  it("re-fetches the scene + access level and republishes on RE-connect", async () => {
    const fresh = makeScene();
    mocks.backendService.sceneInstancesGET.mockResolvedValue(fresh);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "edit" });
    const session = service.attach(0, scene, "edit");
    const received: { tabIndex: number }[] = [];
    const sub = eventBus.subscribe("sharedSceneReconnected", (payload) => received.push(payload));

    mocks.providers[0].emit("status", { status: "disconnected" });
    mocks.providers[0].emit("status", { status: "connected" });
    await vi.waitFor(() => expect(received).toEqual([{ tabIndex: 0 }]));
    sub.dispose();

    expect(mocks.backendService.sceneInstancesGET).toHaveBeenCalledWith(SCENE_UUID);
    // The tab context now points at the authoritative server state...
    expect((mocks.globalObject.tabContext[0] as any).sceneInstance).toBe(fresh);
    // ...and the access level we lost on disconnect is restored.
    expect(session.access).toBe("edit");
    expect(session.disconnectBanner).toBeNull();
  });

  // The 4401 branch is the only one that touches browser globals. The file stays in
  // vitest's default node env (fast, and `location.reload` is "not implemented" in
  // jsdom anyway); the two globals it needs are stubbed just for this test.
  it("clears the token and reloads on close code 4401 (expired JWT)", () => {
    const alertSpy = vi.fn();
    const reloadSpy = vi.fn();
    vi.stubGlobal("window", { alert: alertSpy });
    vi.stubGlobal("location", { reload: reloadSpy });
    const session = service.attach(0, scene, "edit");

    mocks.providers[0].emit("connection-close", { code: 4401 });

    expect(mocks.providers[0].disconnect).toHaveBeenCalled();
    expect(session.disconnectBanner).toBe("Session expired. Please log in again.");
    expect(alertSpy).toHaveBeenCalled();
    // token.ts is the single writer of localStorage['jwtToken'] in this port (P1).
    expect(mocks.clearToken).toHaveBeenCalled();
    expect(reloadSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("publishes sceneAccessRevoked on close code 4403", () => {
    const session = service.attach(0, scene, "edit");
    const received: { tabIndex: number }[] = [];
    const sub = eventBus.subscribe("sceneAccessRevoked", (payload) => received.push(payload));

    mocks.providers[0].emit("connection-close", { code: 4403 });
    sub.dispose();

    expect(mocks.providers[0].disconnect).toHaveBeenCalled();
    expect(session.disconnectBanner).toBe("Your access to this scene was revoked.");
    expect(received).toEqual([{ tabIndex: 0 }]);
  });

  it("keeps retrying but goes read-only on close code 4500 (sync server down)", () => {
    const session = service.attach(0, scene, "edit");

    mocks.providers[0].emit("connection-close", { code: 4500 });

    // Not disconnected explicitly — the provider must keep retrying.
    expect(mocks.providers[0].disconnect).not.toHaveBeenCalled();
    expect(session.connectionStatus).toBe("disconnected");
    expect(session.access).toBe("read");
    expect(session.disconnectBanner).toContain("Sync server unavailable");
  });

  it("ignores a normal close (code 1000)", () => {
    const session = service.attach(0, scene, "edit");
    mocks.providers[0].emit("connection-close", { code: 1000 });
    expect(session.disconnectBanner).toBeNull();
    expect(mocks.providers[0].disconnect).not.toHaveBeenCalled();
  });
});
