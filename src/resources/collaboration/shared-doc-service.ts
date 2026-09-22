import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { jwtDecode } from "jwt-decode";
import { SceneInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { globalStateObject } from "@/engine/global-state-object";
import { backendService } from "@/resources/services/backend-service";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { SYNC_URL } from "@/config";
import { clearToken } from "@/resources/services/token";
import { useCollabStore } from "@/resources/store/collabStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { SCENE_FIELDS_KEY } from "@/resources/services/scene-diff";
import {
  sceneInstanceToYDoc,
  applyYDocClassChangeToSceneInstance,
  applyYDocRelationChangeToSceneInstance,
  applyYDocSceneAttributeChangeToSceneInstance,
  type YDocChangeResult,
} from "./y-mapping";
import { userColor, initials } from "./color-util";
import { collectUsers } from "./awareness-users";

/**
 * Owns one SharedSession per tab index: a Y.Doc and a WebsocketProvider connected to the
 * sync server, with deep observers that fold remote changes back into the tab's
 * in-memory gds SceneInstance and THREE.Scene. The room name is the SceneInstance uuid
 * and auth is `?token=<jwt>`, matching mmar-sync-server/src/connection.ts.
 *
 * The SharedSession object is authoritative for engine and service code (`forTab()`);
 * `collabStore` is a one-way reactive mirror for React. Writes to `access`,
 * `connectionStatus` and `disconnectBanner` therefore go through `setSessionStatus` /
 * `setSessionAccess` / `setSessionBanner`, which update both.
 *
 * The constructor sets `globalObject.sharedDocServiceRef`, the back-reference the engine
 * handlers use to reach the service without importing it (which would be a cycle). That
 * happens on module evaluation, so the import in `engine/coordinates-updater.ts` is
 * load-bearing: it wires the ref before any engine code looks for it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessLevel = "read" | "edit" | "delete";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface SharedSession {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  /** Shorthand for provider.awareness */
  awareness: WebsocketProvider["awareness"];
  sceneInstanceUuid: string;
  applyingRemote: boolean;
  /** Sentinel object used to tag locally-originated Y.Doc transactions. */
  localOrigin: object;
  access: AccessLevel;
  connectionStatus: ConnectionStatus;
  /** Human-readable banner shown while disconnected. Null when connected. */
  disconnectBanner: string | null;
  /** Awareness 'change' handler feeding collabStore.users (kept so detach can unsubscribe). */
  usersHandler?: () => void;
}

interface JwtPayload {
  uuid: string;
  username: string;
  exp?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SharedDocService {
  private sessions = new Map<number, SharedSession>();
  private globalObjectInstance = globalObject;

  constructor() {
    // Back-reference avoids circular DI import
    this.globalObjectInstance.sharedDocServiceRef = this;
    // Expose for console-driven smoke testing in development
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__sharedDocService = this;
    }
  }

  /**
   * Create (or replace) a shared session for the given tab. Populates the
   * Y.Doc from the already-loaded SceneInstance, connects to the sync server,
   * and installs deep observers.
   */
  attach(tabIndex: number, sceneInstance: SceneInstance, access: AccessLevel = "edit"): SharedSession {
    this.detach(tabIndex);

    const ydoc = new Y.Doc();
    const localOrigin: object = {};

    if (access !== "read") {
      sceneInstanceToYDoc(sceneInstance, ydoc, localOrigin);
    }

    const token = this.globalObjectInstance.accessToken;

    const provider = new WebsocketProvider(SYNC_URL, sceneInstance.uuid, ydoc, { params: { token } });

    const awareness = provider.awareness;

    // Broadcast our own user state so other clients can show our chip/cursor.
    this.setLocalUserState(awareness, access);

    const session: SharedSession = {
      ydoc,
      provider,
      awareness,
      sceneInstanceUuid: sceneInstance.uuid,
      applyingRemote: false,
      localOrigin,
      access,
      connectionStatus: "connecting",
      disconnectBanner: null,
    };

    this.installObservers(session, tabIndex);
    this.installConnectionLifecycle(session, tabIndex);

    this.sessions.set(tabIndex, session);
    // Seed the reactive mirror React reads.
    useCollabStore.getState().setTab(tabIndex, {
      status: session.connectionStatus,
      access: session.access,
      banner: session.disconnectBanner,
      users: collectUsers(awareness),
    });
    this.installAwarenessUsers(session, tabIndex);
    return session;
  }

  /** Destroy the session for the given tab (no-op if none). */
  detach(tabIndex: number): void {
    const session = this.sessions.get(tabIndex);
    if (session) {
      // provider.destroy() only unsubscribes y-websocket's own awareness handler, so
      // ours has to be removed explicitly.
      if (session.usersHandler) session.awareness.off("change", session.usersHandler);
      session.provider.destroy();
      session.ydoc.destroy();
      this.sessions.delete(tabIndex);
      useCollabStore.getState().removeTab(tabIndex);
    }
  }

  /**
   * Destroy EVERY session, whatever tab index it is filed under (logout — see
   * `services/session-reset`). Each session holds a websocket opened with the logging-out
   * user's JWT and broadcasts their identity over awareness, so none may outlive them.
   *
   * Iterating the map rather than the open tabs is deliberate: sessions are keyed by tab
   * index and `detach(index)` can strand one when a lower tab is closed first (see the
   * note in `tabActions.closeTab`). A stranded session is unreachable through `forTab`
   * but its socket is still live, so the map is the only complete list.
   */
  detachAll(): void {
    for (const tabIndex of Array.from(this.sessions.keys())) {
      this.detach(tabIndex);
    }
  }

  /** Returns the active session for a tab, or null if the tab is not shared. */
  forTab(tabIndex: number): SharedSession | null {
    return this.sessions.get(tabIndex) ?? null;
  }

  // -----------------------------------------------------------------------
  // Session-field writers (session object + reactive mirror, always together)
  // -----------------------------------------------------------------------

  private setSessionStatus(tabIndex: number, session: SharedSession, status: ConnectionStatus): void {
    session.connectionStatus = status;
    useCollabStore.getState().patchTab(tabIndex, { status });
  }

  private setSessionAccess(tabIndex: number, session: SharedSession, access: AccessLevel): void {
    session.access = access;
    useCollabStore.getState().patchTab(tabIndex, { access });
  }

  private setSessionBanner(tabIndex: number, session: SharedSession, banner: string | null): void {
    session.disconnectBanner = banner;
    useCollabStore.getState().patchTab(tabIndex, { banner });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private setLocalUserState(awareness: WebsocketProvider["awareness"], access: AccessLevel): void {
    try {
      const token = this.globalObjectInstance.accessToken;
      if (!token) return;
      const decoded = jwtDecode<JwtPayload>(token);
      awareness.setLocalState({
        user: {
          uuid: decoded.uuid,
          username: decoded.username,
          color: userColor(decoded.uuid),
          initials: initials(decoded.username),
        },
        access,
        cursor: { active: false },
        selection: { uuid: null },
      });
    } catch {
      // ignore decode errors (e.g. in test environments)
    }
  }

  /**
   * Keep `collabStore.tabs[tabIndex].users` in step with the session's awareness so the
   * user legend updates as peers join and leave.
   */
  private installAwarenessUsers(session: SharedSession, tabIndex: number): void {
    const handler = () => {
      useCollabStore.getState().setUsers(tabIndex, collectUsers(session.awareness));
    };
    session.awareness.on("change", handler);
    session.usersHandler = handler;
  }

  private installObservers(session: SharedSession, tabIndex: number): void {
    const classInstancesMap = session.ydoc.getMap<Y.Map<unknown>>("class_instances");

    classInstancesMap.observeDeep((events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
      // Skip events that we originated ourselves — the in-memory model was
      // already updated by the code that called applyLocalChangeToYDoc.
      if (transaction.origin === session.localOrigin) return;
      // Guard against re-entrancy
      if (session.applyingRemote) return;

      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (!tabCtx) return;

      session.applyingRemote = true;
      try {
        const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [], deletedInstanceUuids: [] };
        for (const event of events) {
          const r = applyYDocClassChangeToSceneInstance(event, tabCtx.sceneInstance, tabCtx.threeScene, this.globalObjectInstance);
          if (r.classInstanceAdded) aggregate.classInstanceAdded = true;
          aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
          aggregate.deletedInstanceUuids.push(...r.deletedInstanceUuids);
        }
        // Signal Three.js renderer to redraw
        this.globalObjectInstance.render = true;

        // Trigger VizRep updates for remotely-changed attribute values
        for (const ai of aggregate.changedAttributeInstances) {
          eventBus.publish("checkForVizRepUpdateByAttributeInstance", ai);
        }
        // Trigger render of newly added class instances via PersistencyHandler
        if (aggregate.classInstanceAdded) {
          eventBus.publish("remoteClassInstanceAdded", { tabIndex });
        }
        // A remote edit mutated the gds objects in place; the attribute window only
        // re-renders when selectionStore's revision changes (its bump() contract).
        this.notifyRemoteMutation(aggregate);
        this.clearSelectionOfRemotelyDeleted(tabIndex, aggregate);
        this.notifyRemoteInstances(tabIndex, events);
      } finally {
        session.applyingRemote = false;
      }
    });

    // Observer for RelationclassInstance add / remove / attribute / line-point changes
    const relationInstancesMap = session.ydoc.getMap<Y.Map<unknown>>("relationclasses_instances");

    relationInstancesMap.observeDeep((events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
      if (transaction.origin === session.localOrigin) return;
      if (session.applyingRemote) return;

      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (!tabCtx) return;

      session.applyingRemote = true;
      try {
        const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [], deletedInstanceUuids: [] };
        for (const event of events) {
          const r = applyYDocRelationChangeToSceneInstance(event, tabCtx.sceneInstance, tabCtx.threeScene, this.globalObjectInstance);
          if (r.relationInstanceAdded) aggregate.relationInstanceAdded = true;
          aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
          aggregate.deletedInstanceUuids.push(...r.deletedInstanceUuids);
        }
        this.globalObjectInstance.render = true;

        for (const ai of aggregate.changedAttributeInstances) {
          eventBus.publish("checkForVizRepUpdateByAttributeInstance", ai);
        }
        if (aggregate.relationInstanceAdded) {
          eventBus.publish("remoteRelationInstanceAdded", { tabIndex });
        }
        this.notifyRemoteMutation(aggregate);
        this.clearSelectionOfRemotelyDeleted(tabIndex, aggregate);
        this.notifyRemoteInstances(tabIndex, events);
      } finally {
        session.applyingRemote = false;
      }
    });

    // Observer for the SCENE INSTANCE's own attributes (the ones the attribute window
    // shows while nothing is selected). Same shape as the two above, minus the three.js
    // work: a scene attribute has no object of its own in the scene graph.
    const sceneAttributesMap = session.ydoc.getMap<Y.Map<unknown>>("attribute_instances");

    sceneAttributesMap.observeDeep((events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
      if (transaction.origin === session.localOrigin) return;
      if (session.applyingRemote) return;

      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (!tabCtx) return;

      session.applyingRemote = true;
      try {
        const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [], deletedInstanceUuids: [] };
        for (const event of events) {
          const r = applyYDocSceneAttributeChangeToSceneInstance(event, tabCtx.sceneInstance, this.globalObjectInstance);
          aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
        }

        // A scene-type vizRep can read the scene's attributes, so the same refresh a
        // class attribute triggers applies here.
        for (const ai of aggregate.changedAttributeInstances) {
          eventBus.publish("checkForVizRepUpdateByAttributeInstance", ai);
        }
        this.notifyRemoteMutation(aggregate);
        // The scene instance itself is what changed; `notifyRemoteInstances` names
        // instances by uuid for the undo history, and the scene's own key is the
        // sentinel scene-diff uses for it.
        if (aggregate.changedAttributeInstances.length > 0) {
          eventBus.publish("remoteSceneInstanceChanged", { tabIndex, instanceUuids: [SCENE_FIELDS_KEY] });
        }
      } finally {
        session.applyingRemote = false;
      }
    });
  }

  /**
   * Name the instances a peer just changed, so the undo history can exclude them (it
   * holds local edits only — see history-service). The uuids come off the Y events
   * directly: the observed maps are keyed by instance uuid, so a root-level event names
   * them in `changes.keys` and a nested one has the uuid as its first path segment.
   */
  private notifyRemoteInstances(tabIndex: number, events: Y.YEvent<Y.Map<unknown>>[]): void {
    const instanceUuids = new Set<string>();
    for (const event of events) {
      const path = event.path as Array<string | number>;
      if (path.length === 0) {
        (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((_change, uuid) => {
          instanceUuids.add(uuid);
        });
      } else if (typeof path[0] === "string") {
        instanceUuids.add(path[0]);
      }
    }
    if (instanceUuids.size > 0) {
      eventBus.publish("remoteSceneInstanceChanged", { tabIndex, instanceUuids: [...instanceUuids] });
    }
  }

  /**
   * A remote change mutates the gds instances in place, which React cannot observe, so
   * the attribute window would keep rendering stale values. The selection store's
   * contract is that in-place mutation of the selected instance bumps its revision.
   */
  private notifyRemoteMutation(aggregate: YDocChangeResult): void {
    if (aggregate.changedAttributeInstances.length === 0) return;
    useSelectionStore.getState().bump();
  }

  /**
   * Drop the local selection when a peer deleted the instance it points at. Otherwise
   * the object leaves the scene while the selection state still names it: the attribute
   * window keeps rendering its attributes (it rebuilds only on a selection change or a
   * `bump()`, and a deletion produces neither), the red box helper hangs in empty space,
   * and the transform gizmo stays attached to a mesh that has left the scene graph.
   *
   * Clearing follows the same path as a click on empty space — engine state first, then
   * the reactive store — so the attribute window falls back to the scene instance's own
   * attributes rather than blanking, and `removeObject()` publishes the empty selection
   * so collaborators stop drawing their presence box around it.
   *
   * The selection is global while sessions are per tab, so a deletion on a background
   * tab must leave it alone.
   */
  private clearSelectionOfRemotelyDeleted(tabIndex: number, aggregate: YDocChangeResult): void {
    if (aggregate.deletedInstanceUuids.length === 0) return;
    if (tabIndex !== this.globalObjectInstance.selectedTab) return;

    const deleted = new Set(aggregate.deletedInstanceUuids);
    if (!this.selectionUuids().some((uuid) => deleted.has(uuid))) return;

    // Detach the gizmo before the mesh it is attached to leaves the scene graph.
    this.globalObjectInstance.transformControls?.detach();
    // Clears the selected instance and the engine's context pointers along with the
    // mesh, so this path cannot drift from the others that deselect.
    globalSelectedObject.removeObject();
    // A relation instance's selected line is tracked separately from the mesh.
    globalStateObject.activeStateLine = undefined;

    useSelectionStore.getState().clearSelection();
    eventBus.publish("removeAttributeGui");
    this.globalObjectInstance.render = true;
  }

  /**
   * Every uuid the current selection is known by, so a remote delete matches whichever
   * one the peer named. They are normally the same instance seen from three places (the
   * THREE mesh, the engine's `current_*` pointers, the reactive store), but they drift
   * apart mid-interaction and a stale one is exactly what this guards against.
   *
   * A port has no entry of its own in the Y.Doc — it is deleted with its class instance
   * — so a selected port also answers to its owner's uuid.
   */
  private selectionUuids(): string[] {
    const uuids: string[] = [];
    // Starts as an empty THREE.Mesh whose uuid matches no instance, which is harmless:
    // it simply never matches a deleted uuid.
    const selectedMesh = globalSelectedObject.object;
    if (selectedMesh?.uuid) uuids.push(selectedMesh.uuid);

    const storeUuid = useSelectionStore.getState().selectedInstanceUuid;
    if (storeUuid) uuids.push(storeUuid);

    // Holds the relationclass instance too when one is selected (see the interaction
    // handler's onSelectionMode).
    const currentClass = this.globalObjectInstance.current_class_instance;
    if (currentClass?.uuid) uuids.push(currentClass.uuid);

    const currentPort = this.globalObjectInstance.current_port_instance;
    if (currentPort?.uuid) uuids.push(currentPort.uuid);
    if (currentPort?.uuid_class_instance) uuids.push(currentPort.uuid_class_instance);

    return uuids;
  }

  private installConnectionLifecycle(session: SharedSession, tabIndex: number): void {
    let wasDisconnected = false;

    // ---- Status changes ------------------------------------------------
    session.provider.on("status", ({ status }: { status: string }) => {
      if (status === "connecting") {
        this.setSessionStatus(tabIndex, session, "connecting");
        // Banner is already set (either null on first connect, or from the
        // disconnect event that preceded this retry).
      } else if (status === "disconnected") {
        this.setSessionStatus(tabIndex, session, "disconnected");
        wasDisconnected = true;
        // Force read-only so edits are blocked while we're offline.
        this.setSessionAccess(tabIndex, session, "read");
        this.setSessionBanner(tabIndex, session, "Disconnected — reconnecting…");
        this.setLocalUserState(session.awareness, "read");
      } else if (status === "connected") {
        this.setSessionStatus(tabIndex, session, "connected");
        if (wasDisconnected) {
          wasDisconnected = false;
          // Reconnected after a drop: re-fetch authoritative state.
          void this.onReconnect(tabIndex, session).catch((err) => logger.log(`Reconnect refresh failed: ${err}`, "error"));
        } else {
          // Initial connection — just clear any transitional banner.
          this.setSessionBanner(tabIndex, session, null);
        }
      }
    });

    // ---- WebSocket close codes -----------------------------------------
    // `event` is null when the close was initiated locally (provider.disconnect(), the
    // no-message watchdog, or the re-entrant emit our own disconnect() below triggers).
    // Only a close the SERVER sent carries a code, so the branches below key off it.
    session.provider.on("connection-close", (event: CloseEvent | null) => {
      const code = event?.code;

      if (code === 4401) {
        // Bad / expired JWT — stop retrying and redirect to login.
        session.provider.disconnect();
        this.setSessionBanner(tabIndex, session, "Session expired. Please log in again.");
        window.alert("Your session has expired. Please log in again.");
        // token.ts is the single writer of the stored credential, so go through it.
        clearToken();
        location.reload();
      } else if (code === 4403) {
        // Access was revoked — stop retrying and force-close the tab.
        session.provider.disconnect();
        this.setSessionBanner(tabIndex, session, "Your access to this scene was revoked.");
        eventBus.publish("sceneAccessRevoked", { tabIndex });
      } else if (code === 4500) {
        // Sync server temporarily unavailable — provider will keep retrying.
        this.setSessionStatus(tabIndex, session, "disconnected");
        wasDisconnected = true;
        this.setSessionAccess(tabIndex, session, "read");
        this.setSessionBanner(tabIndex, session, "Sync server unavailable — your changes won't be saved until reconnected.");
        this.setLocalUserState(session.awareness, "read");
      }
      // Codes 1000 (normal close) and others are handled by the status listener.
    });
  }

  /** Called once on the first 'connected' event after a 'disconnected'. */
  private async onReconnect(tabIndex: number, session: SharedSession): Promise<void> {
    try {
      // 1. Re-fetch authoritative scene state from REST.
      const freshScene = await backendService.sceneInstancesGET(session.sceneInstanceUuid);

      // 2. Update the in-memory tab context so the rest of the app sees fresh data.
      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (tabCtx && freshScene) {
        tabCtx.sceneInstance = freshScene;
      }

      // 3. Re-fetch the caller's access level (may have changed while offline).
      try {
        const me = await backendService.sceneAccessMeGET(session.sceneInstanceUuid);
        if (me?.level) {
          this.setSessionAccess(tabIndex, session, me.level);
        }
      } catch {
        // If the call fails, assume the previous access level still holds.
      }

      // 4. Broadcast our updated user state with the restored access level.
      this.setLocalUserState(session.awareness, session.access);

      // 5. Signal the scene view to rebuild the Three.js scene from the fresh data.
      eventBus.publish("sharedSceneReconnected", { tabIndex });
    } catch {
      /* keep the previous in-memory state */
    } finally {
      this.setSessionBanner(tabIndex, session, null);
    }
  }
}

// Module singleton. Constructing it sets globalObject.sharedDocServiceRef (see above).
export const sharedDocService = new SharedDocService();
