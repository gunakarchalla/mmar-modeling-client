import { singleton } from 'aurelia';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { jwtDecode } from 'jwt-decode';
import { SceneInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from '../global_definitions';
import { sceneInstanceToYDoc, applyYDocChangeToSceneInstance } from './y_mapping';
import { userColor, initials } from './color_util';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessLevel = 'read' | 'edit' | 'delete';

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

    constructor(private globalObjectInstance: GlobalDefinition) {
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

        // Populate the Y.Doc before connecting so the first client pushes its
        // full state to the server's empty room document.
        sceneInstanceToYDoc(sceneInstance, ydoc);

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
        };

        this.installObservers(session, tabIndex);

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
                for (const event of events) {
                    applyYDocChangeToSceneInstance(
                        event,
                        tabCtx.sceneInstance,
                        tabCtx.threeScene,
                        this.globalObjectInstance
                    );
                }
                // Signal Three.js renderer to redraw
                this.globalObjectInstance.render = true;
            } finally {
                session.applyingRemote = false;
            }
        });
    }
}
