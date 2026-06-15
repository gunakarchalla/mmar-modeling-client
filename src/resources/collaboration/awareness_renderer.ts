import * as THREE from 'three';
import { GlobalDefinition } from '../global_definitions';
import { SharedDocService } from './shared_doc_service';

/** One drawn helper per remote collaborator, tagged with the tab it belongs to. */
export interface RenderedEntry {
    /** The THREE helper drawn for this collaborator (ArrowHelper, BoxHelper, …). */
    helper: THREE.Object3D & { dispose: () => void };
    tabIndex: number;
}

/**
 * Shared lifecycle for renderers that draw one THREE helper per remote collaborator
 * from Yjs awareness state — remote {@link RemoteCursorRenderer cursors} and remote
 * {@link RemoteSelectionRenderer selection boxes}. The base class owns awareness
 * subscription, per-tab teardown and helper disposal; subclasses implement only
 * {@link updateForTab} to add / update / remove their helpers in response to a change.
 */
export abstract class AwarenessRenderer<TEntry extends RenderedEntry> {
    /** clientId → rendered entry */
    protected entries = new Map<number, TEntry>();
    /** tabIndex → awareness 'change' handler (kept so we can unsubscribe) */
    private handlers = new Map<number, () => void>();

    constructor(
        protected globalObjectInstance: GlobalDefinition,
        protected sharedDocService: SharedDocService,
    ) {}

    /**
     * Subscribe to awareness changes for a tab's shared session.
     * Call this immediately after SharedDocService.attach().
     */
    bindToSession(tabIndex: number): void {
        const session = this.sharedDocService.forTab(tabIndex);
        if (!session) return;

        const handler = () => this.updateForTab(tabIndex);
        session.awareness.on('change', handler);
        this.handlers.set(tabIndex, handler);
    }

    /**
     * Remove all helpers for a tab and unsubscribe.
     * Call this on SharedDocService.detach().
     */
    clearForTab(tabIndex: number): void {
        const scene = this.globalObjectInstance.tabContext[tabIndex]?.threeScene;
        for (const [clientId, entry] of Array.from(this.entries)) {
            if (entry.tabIndex === tabIndex) {
                this.disposeEntry(entry, scene);
                this.entries.delete(clientId);
            }
        }

        const session = this.sharedDocService.forTab(tabIndex);
        const handler = this.handlers.get(tabIndex);
        if (session && handler) {
            session.awareness.off('change', handler);
        }
        this.handlers.delete(tabIndex);
    }

    /** Remove an entry's helper from the scene and free its GPU resources. */
    protected disposeEntry(entry: TEntry, scene: THREE.Scene | undefined): void {
        if (!scene) return;
        scene.remove(entry.helper);
        entry.helper.dispose();
    }

    /** Rebuild this tab's helpers from the current awareness state. */
    protected abstract updateForTab(tabIndex: number): void;
}
