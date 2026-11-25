import { globalObject } from "@/engine/global-definition";
import { applyLocalChangeToYDoc, type LocalChangeType } from "./y-mapping";

/**
 * The one way a local edit reaches the collaborators of the active tab. It bundles the
 * three steps every mutation site needs — resolve the tab's shared session, skip the
 * edit if it is a remote update being replayed, then write it with the session's doc and
 * origin — because getting any of them wrong fails silently, either as an edit that never
 * leaves the client or as one echoed back to its sender.
 *
 * The session is reached through `globalObject.sharedDocServiceRef` rather than by
 * importing SharedDocService, because this module is called from the engine and the
 * back-reference keeps the engine's import graph free of the collaboration layer. On a
 * tab with no shared session every function here is a no-op.
 */

/** The active tab's shared session, or `null` when that tab is not collaborative. */
function activeSession() {
  return globalObject.sharedDocServiceRef?.forTab(globalObject.selectedTab) ?? null;
}

/** True when the active tab is collaborative. */
function isActiveTabShared(): boolean {
  return activeSession() !== null;
}

/**
 * Push one or more deltas to the peers of the active tab, in order. Returns whether they
 * were sent; `false` means the tab is solo, or that a peer's update is currently being
 * applied and re-publishing it would echo it back.
 */
export function publishLocalChange(...changes: LocalChangeType[]): boolean {
  const session = activeSession();
  if (!session || session.applyingRemote) return false;
  for (const change of changes) {
    applyLocalChangeToYDoc(session.ydoc, change, session.localOrigin);
  }
  return true;
}

/**
 * Flag the active scene for the next auto-save tick. A shared tab uses the
 * local-origin flag so the shared auto-save branch picks the change up; a solo tab
 * uses the plain one.
 */
export function markActiveSceneDirty(): void {
  if (isActiveTabShared()) {
    globalObject.doSceneInstancePatchLocal = true;
  } else {
    globalObject.doSceneInstancePatch = true;
  }
}
