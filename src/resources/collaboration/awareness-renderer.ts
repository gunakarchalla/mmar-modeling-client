import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";
import { sharedDocService } from "./shared-doc-service";
import { disposeLabelSprite } from "./label-sprite";

/**
 * Shared lifecycle for renderers that draw one THREE helper per remote collaborator from
 * Yjs awareness state: remote cursors ({@link RemoteCursorRenderer}) and remote selection
 * boxes ({@link RemoteSelectionRenderer}). This base class owns awareness subscription,
 * per-tab teardown and helper disposal; subclasses implement only `updateForTab`.
 *
 * The renderers import `shared-doc-service` directly rather than going through
 * `globalObject.sharedDocServiceRef` as the engine handlers do: they live downstream of
 * the service in `resources/collaboration/`, so there is no import cycle to avoid.
 */

/** One drawn helper per remote collaborator, tagged with the tab it belongs to. */
export interface RenderedEntry {
  /** The THREE helper drawn for this collaborator (ArrowHelper, BoxHelper, …). */
  helper: THREE.Object3D & { dispose: () => void };
  tabIndex: number;
  /**
   * Optional text sprite drawn alongside the helper — the named cursor at a peer's
   * ray anchor, or the name tag above their selection box. Kept on the base entry so
   * both subclasses inherit its teardown from {@link disposeEntry}.
   */
  label?: THREE.Sprite;
}

export abstract class AwarenessRenderer<TEntry extends RenderedEntry> {
  /** clientId -> rendered entry */
  protected entries = new Map<number, TEntry>();
  /** tabIndex -> awareness 'change' handler (kept so we can unsubscribe) */
  private handlers = new Map<number, () => void>();

  protected globalObjectInstance = globalObject;
  protected sharedDocService = sharedDocService;

  /**
   * Subscribe to awareness changes for a tab's shared session.
   * Call this immediately after sharedDocService.attach().
   */
  bindToSession(tabIndex: number): void {
    const session = this.sharedDocService.forTab(tabIndex);
    if (!session) return;

    const handler = () => this.updateForTab(tabIndex);
    session.awareness.on("change", handler);
    this.handlers.set(tabIndex, handler);
  }

  /**
   * Remove all helpers for a tab and unsubscribe.
   * Call this before sharedDocService.detach() — the session must still exist for the
   * awareness unsubscribe to find it (tab teardown in tabActions orders it that way).
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
      session.awareness.off("change", handler);
    }
    this.handlers.delete(tabIndex);
  }

  /**
   * Remove every helper on every tab and unsubscribe from every session (logout — see
   * `services/session-reset`). Like `SharedDocService.detachAll`, this walks its own maps
   * instead of the open tabs so entries filed under a stranded tab index are dropped too.
   * Call it BEFORE the sessions are detached, for the same reason `clearForTab` is.
   */
  clearAll(): void {
    for (const [clientId, entry] of Array.from(this.entries)) {
      this.disposeEntry(entry, this.globalObjectInstance.tabContext[entry.tabIndex]?.threeScene);
      this.entries.delete(clientId);
    }
    for (const [tabIndex, handler] of Array.from(this.handlers)) {
      this.sharedDocService.forTab(tabIndex)?.awareness.off("change", handler);
      this.handlers.delete(tabIndex);
    }
  }

  /** Remove an entry's helper (and its label, if any) and free their GPU resources. */
  protected disposeEntry(entry: TEntry, scene: THREE.Scene | undefined): void {
    if (!scene) return;
    scene.remove(entry.helper);
    entry.helper.dispose();
    if (entry.label) {
      scene.remove(entry.label);
      disposeLabelSprite(entry.label);
      entry.label = undefined;
    }
  }

  /** Rebuild this tab's helpers from the current awareness state. */
  protected abstract updateForTab(tabIndex: number): void;
}
