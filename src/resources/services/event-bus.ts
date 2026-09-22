import type { AttributeInstance } from "@gds/models/instance/Instance_attributes.structure";

/**
 * The app's typed event bus: `.publish(event, payload)` and `.subscribe(event, cb)`,
 * where subscribing returns a disposable so a React effect can unsubscribe in cleanup.
 *
 * IMPORTANT: never subscribe with an `async` callback. `publish()` calls each listener
 * synchronously and discards what it returns, so a rejection would vanish as an
 * unhandled rejection. Wrap instead: `() => void doThing().catch(err => …)`.
 *
 * Dialogs are NOT opened over this bus — `uiStore` owns dialog state.
 */

/** Payload for the file / glTF / image upload channels. */
export interface UploadEventPayload {
  attributeInstanceUuid?: string;
  fileUuid: string;
  [key: string]: unknown;
}

/** Payload for collaboration channels that target a specific open tab. */
export interface TabIndexPayload {
  tabIndex: number;
}

/**
 * Payload for `sceneAccessGranted`. A share grant succeeded for this scene; the grant
 * is keyed by scene UUID (not a tab index) because the scene may not be open — the
 * handler resolves it to an open tab itself. Mirrors the `sceneAccessRevoked` flow but
 * in the other direction (revoke closes an open tab; grant may promote one to shared).
 */
export interface SceneAccessGrantedPayload {
  sceneInstanceUuid: string;
}

/**
 * Payload for `openReferenceDialog`. One reference dialog is shared by every reference
 * button, so the clicked attribute instance IS the context.
 */
export interface OpenReferenceDialogPayload {
  attributeInstance: AttributeInstance;
}

/**
 * Payload for `sceneInstanceMutated`. Only `sceneInstanceUuid` is required; the
 * creation and deletion handlers ride the optional `action` / `kind` / `instanceUuid`
 * along to describe what changed, which the simulation window uses to decide whether it
 * needs to rebuild its sliders.
 */
export interface SceneInstanceMutatedPayload {
  sceneInstanceUuid: string;
  action?: "added" | "deleted" | string;
  kind?: "class" | "relation" | "bendpoint" | string;
  instanceUuid?: string;
}

/**
 * Payload for `historyRecord`. Engine modules must NOT import `history-service` (it
 * reaches back into the engine, whose construction order engine/index.ts owns), so they
 * announce an undo step over the bus instead. `coalesceKey` merges a run of related
 * mutations into one step; `afterTransformSync` tells the service to flush the pending
 * three.js -> gds transform writes before snapshotting (see its `recordAfterTransformSync`).
 */
export interface HistoryRecordPayload {
  label: string;
  coalesceKey?: string | null;
  afterTransformSync?: boolean;
}

/**
 * Payload for `remoteSceneInstanceChanged`. Published by SharedDocService for every
 * Y.Doc update that came from a PEER, naming the class/relation instances it touched.
 * The history service subtracts these so a collaborator's edit never becomes part of a
 * local undo step (it stays in the snapshots — it is just never replayed).
 */
export interface RemoteSceneInstanceChangedPayload {
  tabIndex: number;
  instanceUuids: string[];
}

export interface EventPayloads {
  // Auth / scenegroup lifecycle
  login: boolean;
  updateSceneGroup: void;

  // Tab / instance lifecycle
  tabChanged: void;
  sceneInstanceMutated: SceneInstanceMutatedPayload;

  // Attribute window
  updateAttributeGui: void;
  removeAttributeGui: void;
  tableAttributeChanged: void;
  openReferenceDialog: OpenReferenceDialogPayload;

  // VizRep pipeline
  checkForVizRepUpdate: void;
  checkForVizRepUpdateByAttributeInstance: AttributeInstance;

  // Undo / redo history
  historyRecord: HistoryRecordPayload;
  remoteSceneInstanceChanged: RemoteSceneInstanceChangedPayload;

  // Keyboard
  ctrlPlusSPressed: void;

  // Uploads
  gltfUploaded: UploadEventPayload;
  imageUploaded: UploadEventPayload;
  fileUploaded: UploadEventPayload;

  // Collaboration (shared-doc-service -> persistency handler / scene tree)
  remoteClassInstanceAdded: TabIndexPayload;
  remoteRelationInstanceAdded: TabIndexPayload;
  sharedSceneReconnected: TabIndexPayload;
  sceneAccessRevoked: TabIndexPayload;
  sceneAccessGranted: SceneAccessGrantedPayload;
}

export type EventName = keyof EventPayloads;

export interface Subscription {
  dispose(): void;
}

type Callback = (payload: any) => void;

class EventBus {
  private listeners = new Map<EventName, Set<Callback>>();

  subscribe<E extends EventName>(
    event: E,
    callback: (payload: EventPayloads[E]) => void,
  ): Subscription {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set<Callback>();
      this.listeners.set(event, set);
    }
    set.add(callback as Callback);
    return {
      dispose: () => {
        this.listeners.get(event)?.delete(callback as Callback);
      },
    };
  }

  publish<E extends EventName>(
    event: E,
    ...payload: EventPayloads[E] extends void ? [] : [EventPayloads[E]]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // copy to a snapshot so a handler that (un)subscribes mid-dispatch is safe
    for (const cb of [...set]) {
      cb(payload[0]);
    }
  }
}

export const eventBus = new EventBus();
