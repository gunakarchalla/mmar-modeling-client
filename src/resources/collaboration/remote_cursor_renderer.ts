import { singleton } from 'aurelia';
import * as THREE from 'three';
import { GlobalDefinition } from '../global_definitions';
import { SharedDocService } from './shared_doc_service';

interface CursorEntry {
    sprite: THREE.Sprite;
    tabIndex: number;
}

@singleton()
export class RemoteCursorRenderer {
    /** clientId → sprite entry */
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
     * Remove all cursor sprites for a tab and unsubscribe.
     * Call this on SharedDocService.detach().
     */
    clearForTab(tabIndex: number): void {
        const tabCtx = this.globalObjectInstance.tabContext[tabIndex];

        // Remove sprites belonging to this tab from its scene
        for (const [clientId, entry] of Array.from(this.cursors)) {
            if (entry.tabIndex === tabIndex) {
                if (tabCtx?.threeScene) {
                    tabCtx.threeScene.remove(entry.sprite);
                    entry.sprite.material.map?.dispose();
                    (entry.sprite.material as THREE.SpriteMaterial).dispose();
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

        // Remove sprites for clients that left or deactivated their cursor
        for (const [clientId, entry] of Array.from(this.cursors)) {
            if (entry.tabIndex !== tabIndex) continue;
            const state = states.get(clientId);
            const cursorActive = state?.cursor?.active === true;
            if (!states.has(clientId) || !cursorActive) {
                tabCtx.threeScene.remove(entry.sprite);
                entry.sprite.material.map?.dispose();
                (entry.sprite.material as THREE.SpriteMaterial).dispose();
                this.cursors.delete(clientId);
            }
        }

        // Add / update sprites for remote clients with active cursors
        for (const [clientId, state] of Array.from(states)) {
            if (clientId === localId) continue; // skip self

            const cursor = state?.cursor;
            if (!cursor?.active) continue;

            const user = state?.user as { initials?: string; color?: string } | undefined;
            const color = user?.color ?? 'hsl(0, 70%, 55%)';
            const label = user?.initials ?? '?';

            let entry = this.cursors.get(clientId);
            if (!entry) {
                const sprite = this.createCursorSprite(label, color);
                tabCtx.threeScene.add(sprite);
                entry = { sprite, tabIndex };
                this.cursors.set(clientId, entry);
            }

            const world = cursor.world as { x: number; y: number; z: number };
            // Place slightly above Z=0 so the sprite is visible over flat scene objects
            entry.sprite.position.set(world.x, world.y, (world.z ?? 0) + 5);
        }

        this.globalObjectInstance.render = true;
    }

    private createCursorSprite(label: string, color: string): THREE.Sprite {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // Resolve HSL string to a colour the canvas understands
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.fill();

        // White initials
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.slice(0, 2), size / 2, size / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            transparent: true,
        });
        const sprite = new THREE.Sprite(material);
        // Scale to roughly 30 world-units so it's visible but not huge
        sprite.scale.set(30, 30, 1);
        return sprite;
    }
}
