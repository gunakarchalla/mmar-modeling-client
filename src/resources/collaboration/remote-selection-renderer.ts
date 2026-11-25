import * as THREE from "three";
import { AwarenessRenderer, type RenderedEntry } from "./awareness-renderer";
import { createNameTag, scaleLabel } from "./label-sprite";

/**
 * Draws a bounding box around the object each remote collaborator has selected, in that
 * collaborator's own colour, with their name above it. The shared-presence counterpart to
 * the local red selection box created in `engine/global-selected-object`.
 *
 * Selections travel over Yjs awareness (ephemeral presence, never persisted) under the
 * `selection` field, published by `globalSelectedObject.publishSelection`. Near-mirror of
 * {@link RemoteCursorRenderer}; shared lifecycle lives in {@link AwarenessRenderer}.
 *
 * This box is named while the cursor's hover box is not, because a selection persists
 * after its owner moves their pointer away and so has to identify itself. A hover outline
 * only exists while that peer's named cursor is on the object, which already says who.
 */

interface SelectionEntry extends RenderedEntry {
  helper: THREE.BoxHelper;
  /** UUID of the mesh this box currently wraps (the selected instance). */
  targetUuid: string;
}

/** Gap between the top of a selection box and the bottom of its name tag, in world units. */
const NAME_TAG_MARGIN = 0.1;

// Scratch objects — fitTo runs per remote selection per frame, so it allocates nothing.
const scratchBox = new THREE.Box3();
const scratchCentre = new THREE.Vector3();

export class RemoteSelectionRenderer extends AwarenessRenderer<SelectionEntry> {
  /**
   * Re-fit every remote selection box and name tag to its (possibly moved) target mesh,
   * and drop boxes whose target no longer exists (e.g. deleted by another collaborator).
   *
   * Awareness changes only fire when someone changes their selection, not when the
   * already-selected object is dragged, so this is called from the render loop
   * (engine/animator) to keep boxes glued to objects as collaborators move them and to
   * hold the name tags at a constant on-screen size as the local camera moves. A cheap
   * no-op when there are no remote selections.
   */
  refreshBoxes(): void {
    if (this.entries.size === 0) return;

    for (const [clientId, entry] of Array.from(this.entries)) {
      const scene = this.globalObjectInstance.tabContext[entry.tabIndex]?.threeScene;
      const target = scene?.getObjectByProperty("uuid", entry.targetUuid);
      if (!target) {
        // Selected object is gone (deleted remotely) — drop the orphaned box.
        this.disposeEntry(entry, scene);
        this.entries.delete(clientId);
        continue;
      }
      this.fitTo(entry, target);
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

    // Remove boxes for clients that left or cleared their selection.
    for (const [clientId, entry] of Array.from(this.entries)) {
      if (entry.tabIndex !== tabIndex) continue;
      const state = states.get(clientId);
      const selectedUuid = (state?.selection as { uuid?: string | null } | undefined)?.uuid;
      if (!states.has(clientId) || !selectedUuid) {
        this.disposeEntry(entry, scene);
        this.entries.delete(clientId);
      }
    }

    // Add / update boxes for remote clients with an active selection.
    for (const [clientId, state] of Array.from(states)) {
      if (clientId === localId) continue; // skip self — we draw our own red box

      const selection = state?.selection as { uuid?: string | null } | undefined;
      const selectedUuid = selection?.uuid;
      if (!selectedUuid) continue;

      const target = scene.getObjectByProperty("uuid", selectedUuid);
      if (!target) continue; // object not present locally (not yet synced / different tab)

      const user = state?.user as { color?: string; username?: string; initials?: string } | undefined;
      const color = user?.color ?? "red";

      let entry = this.entries.get(clientId);
      // If this client switched to a different object, rebuild the box for the new target.
      if (entry && entry.targetUuid !== selectedUuid) {
        this.disposeEntry(entry, scene);
        this.entries.delete(clientId);
        entry = undefined;
      }
      if (!entry) {
        const box = new THREE.BoxHelper(target, new THREE.Color(color).getHex());
        scene.add(box);
        const label = createNameTag(user?.username ?? user?.initials ?? "?", color);
        scene.add(label);
        entry = { helper: box, tabIndex, targetUuid: selectedUuid, label };
        this.entries.set(clientId, entry);
      }

      this.fitTo(entry, target);
    }

    this.globalObjectInstance.render = true;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Wrap the box around its target and park the name tag just above the box's top edge. */
  private fitTo(entry: SelectionEntry, target: THREE.Object3D): void {
    entry.helper.setFromObject(target);
    entry.helper.update();

    if (!entry.label) return;
    // The tag is anchored at its bottom edge, so it grows upward from this point and
    // its placement stays correct however scaleLabel resizes it.
    scaleLabel(entry.label, this.globalObjectInstance.camera);
    scratchBox.setFromObject(target);
    scratchBox.getCenter(scratchCentre);
    entry.label.position.set(scratchCentre.x, scratchBox.max.y + NAME_TAG_MARGIN, scratchCentre.z);
  }
}

// Module singleton — one instance shared by the whole app.
export const remoteSelectionRenderer = new RemoteSelectionRenderer();
