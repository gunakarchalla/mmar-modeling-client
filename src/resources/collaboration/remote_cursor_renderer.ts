import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from '../global_definitions';
// TYPE-ONLY: erased at build time, so importing the broadcaster's contract adds no
// runtime edge to ray_helper (which reaches this module's siblings through DI).
import type { CursorAnchorKind } from '../ray_helper';
import { SharedDocService } from './shared_doc_service';
import { AwarenessRenderer, RenderedEntry } from './awareness_renderer';
import { createNamedCursor, scaleLabel } from './label_sprite';

interface CursorEntry extends RenderedEntry {
    helper: THREE.ArrowHelper;
    /** Faint outline of the object this collaborator is pointing at, if any. */
    hoverBox?: THREE.BoxHelper;
    /** UUID the hover box currently wraps, so we only rebuild it when the target changes. */
    hoverUuid?: string;
}

/** Smallest arrow length (world units) we bother drawing — avoids degenerate zero-length arrows. */
const MIN_ARROW_LENGTH = 1e-3;

/** Arrow head size in world units — small, and constant however long the ray is. */
const HEAD_LENGTH = 0.2;
const HEAD_WIDTH = 0.1;

/** Opacity of the ray shaft. Solid rays from several peers at once swamp the model. */
const SHAFT_OPACITY = 0.35;

/** Opacity of the hover outline — clearly weaker than a selection box, same hue. */
const HOVER_BOX_OPACITY = 0.3;

interface CursorState {
    active?: boolean;
    origin?: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    kind?: CursorAnchorKind;
    objectUuid?: string;
}

/**
 * Draws each *remote* collaborator's pointer as a named cursor in their own colour: a
 * translucent shaft from their eye to the point their ray lands on, a solid arrow head
 * marking that point, an initials pill beside it, and — when they are pointing at an
 * object — a faint outline around it. Cursor rays travel over Yjs awareness (ephemeral
 * presence, never persisted) under the `cursor` field, broadcast by {@link RayHelper},
 * which also resolves what the ray landed on (`kind` / `objectUuid`). Shared lifecycle
 * lives in {@link AwarenessRenderer}; {@link RemoteSelectionRenderer} is the
 * persistent-selection counterpart.
 *
 * WHY THE ARROW IS ALWAYS DRAWN: whether it conveys anything depends on the angle
 * between the sender's ray and the RECEIVER's camera, not on either one's mode. It
 * collapses to a point only when a peer's ray runs parallel to your view axis (two
 * top-down 2D users, or two 3D users at the same orbit angle) — precisely when it has
 * nothing to tell you, and the named cursor carries the position on its own. In every
 * other pairing, including 2D↔3D sessions, it is how you read where a collaborator is
 * working from.
 *
 * The head is small and a FIXED world size, not the length-proportional one three's
 * `setLength` defaults to: it marks a point, so its size should say nothing about how
 * far the ray travelled to get there.
 */
@singleton()
export class RemoteCursorRenderer extends AwarenessRenderer<CursorEntry> {
    constructor(
        globalObjectInstance: GlobalDefinition,
        sharedDocService: SharedDocService,
    ) {
        super(globalObjectInstance, sharedDocService);
    }

    /**
     * Keep every named cursor at a constant on-screen size as the LOCAL camera moves.
     * Awareness only fires when a peer moves their pointer, so without this a label
     * would keep the size it had when it was last broadcast while you zoom past it.
     * Called from the render loop, and a cheap no-op when nobody else is present.
     */
    refreshCursors(): void {
        if (this.entries.size === 0) return;

        const camera = this.globalObjectInstance.camera;
        for (const entry of Array.from(this.entries.values())) {
            if (entry.label) scaleLabel(entry.label, camera);
        }
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

        // Remove cursors for clients that left or deactivated their cursor
        for (const [clientId, entry] of Array.from(this.entries)) {
            if (entry.tabIndex !== tabIndex) continue;
            const state = states.get(clientId);
            const cursorActive = state?.cursor?.active === true;
            if (!states.has(clientId) || !cursorActive) {
                this.disposeEntry(entry, scene);
                this.entries.delete(clientId);
            }
        }

        // Add / update cursors for remote clients with active cursors
        for (const [clientId, state] of Array.from(states)) {
            if (clientId === localId) continue; // skip self

            const cursor = state?.cursor as CursorState | undefined;
            if (!cursor?.active || !cursor.origin || !cursor.target) continue;

            const user = state?.user as { color?: string; initials?: string } | undefined;
            const color = user?.color ?? 'hsl(0, 70%, 55%)';

            let entry = this.entries.get(clientId);
            if (!entry) {
                const arrow = this.createCursorArrow(color);
                scene.add(arrow);
                const label = createNamedCursor(user?.initials ?? '?', color);
                scene.add(label);
                entry = { helper: arrow, tabIndex, label };
                this.entries.set(clientId, entry);
            }

            this.orientArrow(entry.helper, cursor.origin, cursor.target);
            if (entry.label) {
                entry.label.position.set(cursor.target.x, cursor.target.y, cursor.target.z);
                scaleLabel(entry.label, this.globalObjectInstance.camera);
            }
            this.updateHoverBox(entry, scene, cursor, state, color);
        }

        this.globalObjectInstance.render = true;
    }

    /** Also drop the hover outline, which the base class knows nothing about. */
    protected disposeEntry(entry: CursorEntry, scene: THREE.Scene | undefined): void {
        this.clearHoverBox(entry, scene);
        super.disposeEntry(entry, scene);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Outline the object this collaborator is pointing at. Deliberately UNLABELLED:
     * their named cursor is sitting on the object already, so a name tag here would
     * repeat it a few pixels away. A selection box gets one because it outlives the
     * pointer.
     */
    private updateHoverBox(
        entry: CursorEntry,
        scene: THREE.Scene,
        cursor: CursorState,
        state: Record<string, any> | undefined,
        color: string,
    ): void {
        const selectedUuid = (state?.selection as { uuid?: string | null } | undefined)?.uuid;
        // Pointing at their own selection would stack two outlines on one object; the
        // selection box wins, being the stronger statement.
        const hoverUuid = cursor.kind === 'object' && cursor.objectUuid !== selectedUuid ? cursor.objectUuid : undefined;
        if (!hoverUuid) {
            this.clearHoverBox(entry, scene);
            return;
        }

        const target = scene.getObjectByProperty('uuid', hoverUuid);
        if (!target) {
            // Object not present locally (not yet synced / different tab).
            this.clearHoverBox(entry, scene);
            return;
        }

        if (entry.hoverUuid !== hoverUuid) {
            this.clearHoverBox(entry, scene);
            const box = new THREE.BoxHelper(target, new THREE.Color(color).getHex());
            const material = box.material as THREE.LineBasicMaterial;
            // Opacity is the only lever here — WebGL ignores line width — and it reads
            // consistently across users because userColor pins saturation and lightness.
            material.transparent = true;
            material.opacity = HOVER_BOX_OPACITY;
            material.depthWrite = false;
            scene.add(box);
            entry.hoverBox = box;
            entry.hoverUuid = hoverUuid;
        }

        entry.hoverBox?.setFromObject(target);
        entry.hoverBox?.update();
    }

    private clearHoverBox(entry: CursorEntry, scene: THREE.Scene | undefined): void {
        if (!entry.hoverBox) return;
        scene?.remove(entry.hoverBox);
        entry.hoverBox.dispose();
        entry.hoverBox = undefined;
        entry.hoverUuid = undefined;
    }

    /** Point an arrow from `origin` to `target`. */
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
        arrow.setLength(length, HEAD_LENGTH, HEAD_WIDTH);
    }

    private createCursorArrow(color: string): THREE.ArrowHelper {
        const hex = new THREE.Color(color).getHex();
        const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, -1), // placeholder direction (set on first orient)
            new THREE.Vector3(),
            1,
            hex,
        );

        // Both parts respect scene depth, so a ray is occluded by objects in front of it
        // the way a real one would be.
        //
        // The shaft is translucent so several collaborators' rays don't dominate the
        // model; the head stays solid, because it marks the point being pointed at and
        // that should read crisply.
        const shaft = arrow.line.material as THREE.LineBasicMaterial;
        shaft.depthTest = true;
        shaft.transparent = true;
        shaft.opacity = SHAFT_OPACITY;
        // Translucent geometry writing depth would occlude whatever is sorted behind it.
        shaft.depthWrite = false;
        arrow.line.renderOrder = 0;

        const head = arrow.cone.material as THREE.MeshBasicMaterial;
        head.depthTest = true;
        head.depthWrite = true;
        head.transparent = false;
        arrow.cone.renderOrder = 0;

        return arrow;
    }
}
