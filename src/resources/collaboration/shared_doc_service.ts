import { singleton } from 'aurelia';
import * as Y from 'yjs';
import { SceneInstance } from '../../../../mmar-global-data-structure';
import { GlobalDefinition } from '../global_definitions';
import { sceneInstanceToYDoc, applyYDocChangeToSceneInstance } from './y_mapping';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessLevel = 'read' | 'edit' | 'delete';

export interface SharedSession {
    ydoc: Y.Doc;
    sceneInstanceUuid: string;
    applyingRemote: boolean;
    /** Sentinel object used to tag locally-originated Y.Doc transactions. */
    localOrigin: object;
    access: AccessLevel;
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
     * Y.Doc from the already-loaded SceneInstance and installs deep observers.
     */
    attach(tabIndex: number, sceneInstance: SceneInstance, access: AccessLevel = 'edit'): SharedSession {
        this.detach(tabIndex);

        const ydoc = new Y.Doc();
        const localOrigin: object = {};

        const session: SharedSession = {
            ydoc,
            sceneInstanceUuid: sceneInstance.uuid,
            applyingRemote: false,
            localOrigin,
            access,
        };

        sceneInstanceToYDoc(sceneInstance, ydoc);
        this.installObservers(session, tabIndex);

        this.sessions.set(tabIndex, session);
        return session;
    }

    /** Destroy the session for the given tab (no-op if none). */
    detach(tabIndex: number): void {
        const session = this.sessions.get(tabIndex);
        if (session) {
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
