import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from '../global_definitions';
import { SharedDocService } from './shared_doc_service';
import { AwarenessRenderer, RenderedEntry } from './awareness_renderer';

interface CursorEntry extends RenderedEntry {
    helper: THREE.ArrowHelper;
}

/** Smallest arrow length (world units) we bother drawing — avoids degenerate zero-length arrows. */
const MIN_ARROW_LENGTH = 1e-3;

/**
 * Draws an arrow in each *remote* collaborator's colour pointing at the scene location
 * they're hovering. Cursor rays travel over Yjs awareness (ephemeral presence, never
 * persisted) under the `cursor` field. Near-mirror of {@link RemoteSelectionRenderer};
 * shared lifecycle lives in {@link AwarenessRenderer}.
 */
@singleton()
export class RemoteCursorRenderer extends AwarenessRenderer<CursorEntry> {
    constructor(
        globalObjectInstance: GlobalDefinition,
        sharedDocService: SharedDocService,
    ) {
        super(globalObjectInstance, sharedDocService);
    }

    // -----------------------------------------------------------------------
    // AwarenessRenderer hook
    // -----------------------------------------------------------------------

    protected updateForTab(tabIndex: number): void {
        const session = this.sharedDocService.forTab(tabIndex);
        const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
        if (!session || !tabCtx?.threeScene) return;
        const scene = tabCtx.threeScene;

        const localId = session.awareness.clientID;
        const states = session.awareness.getStates();

        // Remove arrows for clients that left or deactivated their cursor
        for (const [clientId, entry] of Array.from(this.entries)) {
            if (entry.tabIndex !== tabIndex) continue;
            const state = states.get(clientId);
            const cursorActive = state?.cursor?.active === true;
            if (!states.has(clientId) || !cursorActive) {
                this.disposeEntry(entry, scene);
                this.entries.delete(clientId);
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

            let entry = this.entries.get(clientId);
            if (!entry) {
                const arrow = this.createCursorArrow(color);
                scene.add(arrow);
                entry = { helper: arrow, tabIndex };
                this.entries.set(clientId, entry);
            }

            this.orientArrow(entry.helper, cursor.origin, cursor.target);
        }

        this.globalObjectInstance.render = true;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

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
