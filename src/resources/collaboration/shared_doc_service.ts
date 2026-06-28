import { EventAggregator, singleton } from 'aurelia';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { jwtDecode } from 'jwt-decode';
import { SceneInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from '../global_definitions';
import { FetchHelper } from '../services/fetchHelper';
import { sceneInstanceToYDoc, applyYDocClassChangeToSceneInstance, applyYDocRelationChangeToSceneInstance, YDocChangeResult } from './y_mapping';
import { userColor, initials } from './color_util';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessLevel = 'read' | 'edit' | 'delete';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface SharedSession {
    ydoc: Y.Doc;
    provider: WebsocketProvider;
    /** Shorthand for provider.awareness */
    awareness: WebsocketProvider['awareness'];
    sceneInstanceUuid: string;
    applyingRemote: boolean;
    /** Sentinel object used to tag locally-originated Y.Doc transactions. */
    localOrigin: object;
    access: AccessLevel;
    connectionStatus: ConnectionStatus;
    /** Human-readable banner shown while disconnected. Null when connected. */
    disconnectBanner: string | null;
}

interface JwtPayload {
    uuid: string;
    username: string;
    exp?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@singleton()
export class SharedDocService {
    private sessions = new Map<number, SharedSession>();

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private fetchHelper: FetchHelper,
        private eventAggregator: EventAggregator,
    ) {
        // Back-reference avoids circular DI import
        globalObjectInstance.sharedDocServiceRef = this;
        // Expose for console-driven smoke testing in development
        if (typeof window !== 'undefined') {
            (window as any).__sharedDocService = this;
        }
    }

    /**
     * Create (or replace) a shared session for the given tab. Populates the
     * Y.Doc from the already-loaded SceneInstance, connects to the sync server,
     * and installs deep observers.
     */
    attach(tabIndex: number, sceneInstance: SceneInstance, access: AccessLevel = 'edit'): SharedSession {
        this.detach(tabIndex);

        const ydoc = new Y.Doc();
        const localOrigin: object = {};

        if (access !== 'read') {
            sceneInstanceToYDoc(sceneInstance, ydoc, localOrigin);
        }

        const syncUrl = (process.env as any).SYNC_URL || 'ws://localhost:8060';
        const token = this.globalObjectInstance.accessToken;

        const provider = new WebsocketProvider(
            syncUrl,
            sceneInstance.uuid,
            ydoc,
            { params: { token } }
        );

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
            connectionStatus: 'connecting',
            disconnectBanner: null,
        };

        this.installObservers(session, tabIndex);
        this.installConnectionLifecycle(session, tabIndex);

        this.sessions.set(tabIndex, session);
        return session;
    }

    /** Destroy the session for the given tab (no-op if none). */
    detach(tabIndex: number): void {
        const session = this.sessions.get(tabIndex);
        if (session) {
            session.provider.destroy();
            session.ydoc.destroy();
            this.sessions.delete(tabIndex);
        }
    }

    /** Returns the active session for a tab, or null if the tab is not shared. */
    forTab(tabIndex: number): SharedSession | null {
        return this.sessions.get(tabIndex) ?? null;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private setLocalUserState(awareness: WebsocketProvider['awareness'], access: AccessLevel): void {
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

    private installObservers(session: SharedSession, tabIndex: number): void {
        const classInstancesMap = session.ydoc.getMap<Y.Map<unknown>>('class_instances');

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
                const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [] };
                for (const event of events) {
                    const r = applyYDocClassChangeToSceneInstance(
                        event,
                        tabCtx.sceneInstance,
                        tabCtx.threeScene,
                        this.globalObjectInstance
                    );
                    if (r.classInstanceAdded) aggregate.classInstanceAdded = true;
                    aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
                }
                // Signal Three.js renderer to redraw
                this.globalObjectInstance.render = true;

                // Trigger VizRep updates for remotely-changed attribute values
                for (const ai of aggregate.changedAttributeInstances) {
                    this.eventAggregator.publish('checkForVizRepUpdateByAttributeInstance', ai);
                }
                // Trigger render of newly added class instances via PersistencyHandler
                if (aggregate.classInstanceAdded) {
                    this.eventAggregator.publish('remoteClassInstanceAdded', { tabIndex });
                }
            } finally {
                session.applyingRemote = false;
            }
        });

        // Observer for RelationclassInstance add / remove / attribute / line-point changes
        const relationInstancesMap = session.ydoc.getMap<Y.Map<unknown>>('relationclasses_instances');

        relationInstancesMap.observeDeep((events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
            if (transaction.origin === session.localOrigin) return;
            if (session.applyingRemote) return;

            const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
            if (!tabCtx) return;

            session.applyingRemote = true;
            try {
                const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [] };
                for (const event of events) {
                    const r = applyYDocRelationChangeToSceneInstance(
                        event,
                        tabCtx.sceneInstance,
                        tabCtx.threeScene,
                        this.globalObjectInstance
                    );
                    if (r.relationInstanceAdded) aggregate.relationInstanceAdded = true;
                    aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
                }
                this.globalObjectInstance.render = true;

                for (const ai of aggregate.changedAttributeInstances) {
                    this.eventAggregator.publish('checkForVizRepUpdateByAttributeInstance', ai);
                }
                if (aggregate.relationInstanceAdded) {
                    this.eventAggregator.publish('remoteRelationInstanceAdded', { tabIndex });
                }
            } finally {
                session.applyingRemote = false;
            }
        });
    }

    private installConnectionLifecycle(session: SharedSession, tabIndex: number): void {
        let wasDisconnected = false;

        // ---- Status changes ------------------------------------------------
        session.provider.on('status', ({ status }: { status: string }) => {
            if (status === 'connecting') {
                session.connectionStatus = 'connecting';
                // Banner is already set (either null on first connect, or from the
                // disconnect event that preceded this retry).

            } else if (status === 'disconnected') {
                session.connectionStatus = 'disconnected';
                wasDisconnected = true;
                // Force read-only so edits are blocked while we're offline.
                session.access = 'read';
                session.disconnectBanner = 'Disconnected — reconnecting…';
                this.setLocalUserState(session.awareness, 'read');

            } else if (status === 'connected') {
                session.connectionStatus = 'connected';
                if (wasDisconnected) {
                    wasDisconnected = false;
                    // Reconnected after a drop: re-fetch authoritative state.
                    this.onReconnect(tabIndex, session);
                } else {
                    // Initial connection — just clear any transitional banner.
                    session.disconnectBanner = null;
                }
            }
        });

        // ---- WebSocket close codes -----------------------------------------
        session.provider.on('connection-close', (event: CloseEvent) => {
            const code = event?.code;

            if (code === 4401) {
                // Bad / expired JWT — stop retrying and redirect to login.
                session.provider.disconnect();
                session.disconnectBanner = 'Session expired. Please log in again.';
                window.alert('Your session has expired. Please log in again.');
                localStorage.removeItem('jwtToken');
                location.reload();

            } else if (code === 4403) {
                // Access was revoked — stop retrying and force-close the tab.
                session.provider.disconnect();
                session.disconnectBanner = 'Your access to this scene was revoked.';
                this.eventAggregator.publish('sceneAccessRevoked', { tabIndex });

            } else if (code === 4500) {
                // Sync server temporarily unavailable — provider will keep retrying.
                session.connectionStatus = 'disconnected';
                wasDisconnected = true;
                session.access = 'read';
                session.disconnectBanner =
                    'Sync server unavailable — your changes won\'t be saved until reconnected.';
                this.setLocalUserState(session.awareness, 'read');
            }
            // Codes 1000 (normal close) and others are handled by the status listener.
        });
    }

    /** Called once on the first 'connected' event after a 'disconnected'. */
    private async onReconnect(tabIndex: number, session: SharedSession): Promise<void> {
        try {
            // 1. Re-fetch authoritative scene state from REST.
            const freshScene = await this.fetchHelper.sceneInstancesGET(session.sceneInstanceUuid);

            // 2. Update the in-memory tab context so the rest of the app sees fresh data.
            const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
            if (tabCtx && freshScene) {
                tabCtx.sceneInstance = freshScene;
            }

            // 3. Re-fetch the caller's access level (may have changed while offline).
            try {
                const me = await this.fetchHelper.sceneAccessMeGET(session.sceneInstanceUuid);
                if (me?.level) {
                    session.access = me.level;
                }
            } catch {
                // If the call fails, assume the previous access level still holds.
            }

            // 4. Broadcast our updated user state with the restored access level.
            this.setLocalUserState(session.awareness, session.access);

            // 5. Signal the scene view to rebuild the Three.js scene from the fresh data.
            this.eventAggregator.publish('sharedSceneReconnected', { tabIndex });

        } catch {

        } finally {
            session.disconnectBanner = null;
        }
    }
}
