import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from '../global_definitions';
import { SharedDocService } from './shared_doc_service';

interface SelectionEntry {
    box: THREE.BoxHelper;
    tabIndex: number;
    /** UUID of the mesh this box currently wraps (the selected instance). */
    targetUuid: string;
}

/**
 * Draws a bounding box around the object each *remote* collaborator has selected,
 * in that collaborator's own color. This is the shared-presence counterpart to the
 * local red selection box created in {@link GlobalSelectedObject}.
 *
 * Selections travel over Yjs awareness (ephemeral presence, never persisted) under
 * the `selection` field — published by {@link GlobalSelectedObject}. This renderer is
 * a near-mirror of {@link RemoteCursorRenderer}; keep the two in sync if either changes.
 */
@singleton()
export class RemoteSelectionRenderer {
    /** clientId → selection box entry */
    private selections = new Map<number, SelectionEntry>();
    /** tabIndex → awareness change handler (for cleanup) */
    private handlers = new Map<number, () => void>();

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private sharedDocService: SharedDocService,
    ) {}

    /**
     * Subscribe to awareness changes for a tab's shared session.
     * Call this immediately after SharedDocService.attach() (next to the cursor binding).
     */
    bindToSession(tabIndex: number): void {
        const session = this.sharedDocService.forTab(tabIndex);
        if (!session) return;

        const handler = () => this.updateSelections(tabIndex);
        session.awareness.on('change', handler);
        this.handlers.set(tabIndex, handler);
    }

    /**
     * Remove all selection boxes for a tab and unsubscribe.
     * Call this on SharedDocService.detach().
     */
    clearForTab(tabIndex: number): void {
        const tabCtx = this.globalObjectInstance.tabContext[tabIndex];

        for (const [clientId, entry] of Array.from(this.selections)) {
            if (entry.tabIndex === tabIndex) {
                if (tabCtx?.threeScene) {
                    tabCtx.threeScene.remove(entry.box);
                    entry.box.dispose();
                }
                this.selections.delete(clientId);
            }
        }

        const session = this.sharedDocService.forTab(tabIndex);
        const handler = this.handlers.get(tabIndex);
        if (session && handler) {
            session.awareness.off('change', handler);
        }
        this.handlers.delete(tabIndex);
    }

    /**
     * Re-fit every remote selection box to its (possibly moved) target mesh, and drop
     * boxes whose target no longer exists (e.g. deleted by another collaborator).
     *
     * Awareness changes only fire when someone *changes* their selection, not when the
     * already-selected object is dragged — so this is called from the render loop to keep
     * boxes glued to objects as collaborators move them. It is a cheap no-op when there
     * are no remote selections.
     */
    refreshBoxes(): void {
        if (this.selections.size === 0) return;

        for (const [clientId, entry] of Array.from(this.selections)) {
            const tabCtx = this.globalObjectInstance.tabContext[entry.tabIndex];
            const target = tabCtx?.threeScene?.getObjectByProperty('uuid', entry.targetUuid);
            if (!target) {
                // Selected object is gone (deleted remotely) — drop the orphaned box.
                if (tabCtx?.threeScene) {
                    tabCtx.threeScene.remove(entry.box);
                    entry.box.dispose();
                }
                this.selections.delete(clientId);
                continue;
            }
            entry.box.setFromObject(target);
            entry.box.update();
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private updateSelections(tabIndex: number): void {
        const session = this.sharedDocService.forTab(tabIndex);
        const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
        if (!session || !tabCtx?.threeScene) return;

        const localId = session.awareness.clientID;
        const states = session.awareness.getStates();

        // Remove boxes for clients that left or cleared their selection.
        for (const [clientId, entry] of Array.from(this.selections)) {
            if (entry.tabIndex !== tabIndex) continue;
            const state = states.get(clientId);
            const selectedUuid = (state?.selection as { uuid?: string | null } | undefined)?.uuid;
            if (!states.has(clientId) || !selectedUuid) {
                tabCtx.threeScene.remove(entry.box);
                entry.box.dispose();
                this.selections.delete(clientId);
            }
        }

        // Add / update boxes for remote clients with an active selection.
        for (const [clientId, state] of Array.from(states)) {
            if (clientId === localId) continue; // skip self — we draw our own red box

            const selection = state?.selection as { uuid?: string | null } | undefined;
            const selectedUuid = selection?.uuid;
            if (!selectedUuid) continue;

            const target = tabCtx.threeScene.getObjectByProperty('uuid', selectedUuid);
            if (!target) continue; // object not present locally (not yet synced / different tab)

            const user = state?.user as { color?: string } | undefined;
            const color = user?.color ?? 'red';

            let entry = this.selections.get(clientId);
            // If this client switched to a different object, rebuild the box for the new target.
            if (entry && entry.targetUuid !== selectedUuid) {
                tabCtx.threeScene.remove(entry.box);
                entry.box.dispose();
                this.selections.delete(clientId);
                entry = undefined;
            }
            if (!entry) {
                const box = new THREE.BoxHelper(target as THREE.Object3D, new THREE.Color(color).getHex());
                tabCtx.threeScene.add(box);
                entry = { box, tabIndex, targetUuid: selectedUuid };
                this.selections.set(clientId, entry);
            }

            entry.box.setFromObject(target);
            entry.box.update();
        }

        this.globalObjectInstance.render = true;
    }
}
