import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from '../global_definitions';
import { SharedDocService } from './shared_doc_service';

interface CursorEntry {
    arrow: THREE.ArrowHelper;
    tabIndex: number;
}

/** Smallest arrow length (world units) we bother drawing — avoids degenerate zero-length arrows. */
const MIN_ARROW_LENGTH = 1e-3;

@singleton()
export class RemoteCursorRenderer {
    /** clientId → arrow entry */
    private cursors = new Map<number, CursorEntry>();
    /** tabIndex → awareness change handler (for cleanup) */
    private handlers = new Map<number, () => void>();

    constructor(
        private globalObjectInstance: GlobalDefinition,
        private sharedDocService: SharedDocService,
    ) {}

    /**
     * Subscribe to awareness changes for a tab's shared session.
     * Call this immediately after SharedDocService.attach().
     */
    bindToSession(tabIndex: number): void {
        const session = this.sharedDocService.forTab(tabIndex);
        if (!session) return;

        const handler = () => this.updateCursors(tabIndex);
        session.awareness.on('change', handler);
        this.handlers.set(tabIndex, handler);
    }

    /**
     * Remove all cursor arrows for a tab and unsubscribe.
     * Call this on SharedDocService.detach().
     */
    clearForTab(tabIndex: number): void {
        const tabCtx = this.globalObjectInstance.tabContext[tabIndex];

        // Remove arrows belonging to this tab from its scene
        for (const [clientId, entry] of Array.from(this.cursors)) {
            if (entry.tabIndex === tabIndex) {
                if (tabCtx?.threeScene) {
                    tabCtx.threeScene.remove(entry.arrow);
                    entry.arrow.dispose();
                }
                this.cursors.delete(clientId);
            }
        }

        // Unsubscribe awareness listener
        const session = this.sharedDocService.forTab(tabIndex);
        const handler = this.handlers.get(tabIndex);
        if (session && handler) {
            session.awareness.off('change', handler);
        }
        this.handlers.delete(tabIndex);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private updateCursors(tabIndex: number): void {
        const session = this.sharedDocService.forTab(tabIndex);
        const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
        if (!session || !tabCtx?.threeScene) return;

        const localId = session.awareness.clientID;
        const states = session.awareness.getStates();

        // Remove arrows for clients that left or deactivated their cursor
        for (const [clientId, entry] of Array.from(this.cursors)) {
            if (entry.tabIndex !== tabIndex) continue;
            const state = states.get(clientId);
            const cursorActive = state?.cursor?.active === true;
            if (!states.has(clientId) || !cursorActive) {
                tabCtx.threeScene.remove(entry.arrow);
                entry.arrow.dispose();
                this.cursors.delete(clientId);
            }
        }

        // Add / update arrows for remote clients with active cursors
        for (const [clientId, state] of Array.from(states)) {
            if (clientId === localId) continue; // skip self

            const cursor = state?.cursor as
                | { active?: boolean; origin?: { x: number; y: number; z: number }; target?: { x: number; y: number; z: number } }
                | undefined;
            if (!cursor?.active || !cursor.origin || !cursor.target) continue;

            const user = state?.user as { color?: string } | undefined;
            const color = user?.color ?? 'hsl(0, 70%, 55%)';

            let entry = this.cursors.get(clientId);
            if (!entry) {
                const arrow = this.createCursorArrow(color);
                tabCtx.threeScene.add(arrow);
                entry = { arrow, tabIndex };
                this.cursors.set(clientId, entry);
            }

            this.orientArrow(entry.arrow, cursor.origin, cursor.target);
        }

        this.globalObjectInstance.render = true;
    }

    /** Point an arrow from `origin` to `target`, scaling its head with its length. */
    private orientArrow(
        arrow: THREE.ArrowHelper,
        origin: { x: number; y: number; z: number },
        target: { x: number; y: number; z: number },
    ): void {
        const from = new THREE.Vector3(origin.x, origin.y, origin.z);
        const dir = new THREE.Vector3(target.x, target.y, target.z).sub(from);
        const length = dir.length();
        if (length < MIN_ARROW_LENGTH) return;

        dir.normalize();
        arrow.position.copy(from);
        arrow.setDirection(dir);

        // Keep the head proportional but capped so long arrows don't get a huge cone.
        const headLength = Math.min(length * 0.2, 1);
        arrow.setLength(length, headLength, headLength * 0.5);
    }

    private createCursorArrow(color: string): THREE.ArrowHelper {
        const hex = new THREE.Color(color).getHex();
        const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, -1), // placeholder direction (set on first orient)
            new THREE.Vector3(),
            1,
            hex,
        );

        // Respect scene depth so the arrow is occluded by objects in front of it
        // (matches how a real ray would be hidden behind geometry it passes behind).
        for (const part of [arrow.line, arrow.cone]) {
            const material = part.material as THREE.Material;
            material.depthTest = true;
            material.depthWrite = true;
            material.transparent = false;
            part.renderOrder = 0;
        }
        return arrow;
    }
}
