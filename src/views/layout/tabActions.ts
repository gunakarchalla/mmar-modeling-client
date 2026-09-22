import type { SceneInstance } from "@gds";
import * as THREE from "three";
import {
  engine,
  globalObject,
  globalSelectedObject,
  globalClassObject,
  globalRelationclassObject,
  sceneInitiator,
} from "@/engine";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { backendService } from "@/resources/services/backend-service";
import { historyService } from "@/resources/services/history-service";
import { describeError } from "@/resources/util/describe-error";
import { useTabsStore } from "@/resources/store/tabsStore";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";
import { remoteCursorRenderer } from "@/resources/collaboration/remote-cursor-renderer";
import { remoteSelectionRenderer } from "@/resources/collaboration/remote-selection-renderer";

/**
 * Selecting, renaming and closing tabs — the single mutation path for everything except
 * opening, which belongs to `instance-utility.createTabContextSceneInstance`. Each
 * operation updates BOTH the engine (`globalObject.tabContext` / `selectedTab`) and the
 * reactive `tabsStore`, which is what keeps the two in lockstep.
 *
 * The store owns the selection-clamp rules on close — it preserves the current
 * selection where it can — and the engine is then reconciled to whatever index the
 * store settled on, so the two can never drift apart.
 *
 * The engine half (scene swap, transform controls) is only valid once the canvas has
 * mounted; until then it is skipped while the store half still runs.
 */

// Engine half of clickedTab: swap the active THREE.Scene to the tab's scene and
// re-add the shared helpers (mousePointer3d, transformControls, intersection plane).
// No store write — callers decide when to update tabsStore.
async function applyEngineTabSelection(index: number): Promise<void> {
  // Remove the selection box helper from the previously-active scene.
  globalSelectedObject.removeObject();
  globalObject.selectedTab = index;
  eventBus.publish("tabChanged");

  if (!engine.isInitialized) return;
  const tab = globalObject.tabContext[index];
  if (!tab) return;

  // Undo is scoped to the scene you are looking at (same rule as the metamodeling
  // per-tab history), so the controls follow the selection.
  historyService.setActiveScene(tab.sceneInstance);

  const threeScene = tab.threeScene;
  globalObject.scene = threeScene;
  logger.log(`Current Tab ${index}: name: ${tab.sceneInstance.name}`, "info");

  globalClassObject.initClasses();
  globalRelationclassObject.initRelationClasses();

  globalObject.dragObjects = tab.contextDragObjects;
  globalObject.scene.add(globalObject.mousePointer3d);
  await sceneInitiator.initTransformControls();
  globalObject.scene.add(globalObject.plane);
}

/** Activate the tab at `index` (clickedTab): engine scene swap + store selection. */
export async function switchToTab(index: number): Promise<void> {
  await applyEngineTabSelection(index);
  useTabsStore.getState().selectTab(index);
}

/**
 * Rename `sceneInstance`, whether or not it is currently open in a tab. Mutates the
 * SceneGroup tree node (matched by uuid), and — when the scene IS open — the engine's
 * tabContext SceneInstance and the reactive tabsStore, so tab bar + scene tree stay in
 * lockstep. Persists via a PATCH when autoSave is on (the same upsert the
 * create/autosave path uses); on a failed persist (e.g. 403 read-only on a shared
 * scene) the local name is reverted everywhere so the UI reflects the server. A
 * blank/unchanged name is a no-op.
 *
 * The tree-level entry point (SceneGroup's context menu) is why this is keyed on the
 * SceneInstance rather than on a tab index: a scene can be renamed from the tree while
 * it has no tab at all. `renameTab` is the tab-index-shaped wrapper the tab bar uses.
 */
export async function renameSceneInstance(
  sceneInstance: SceneInstance,
  rawName: string,
): Promise<void> {
  const name = rawName.trim();
  if (!sceneInstance || !name || name === sceneInstance.name) return;

  const uuid = sceneInstance.uuid;
  const previousName = sceneInstance.name;

  // The tree node and the tab's SceneInstance may be different object references (the
  // tree is merged by uuid, see scene-tree-service), so every holder is updated by uuid.
  // The OPEN scene's instance is the authoritative, engine-attached one — it is what
  // gets PATCHed when the scene has a tab.
  const tabIndex = globalObject.tabContext.findIndex(
    (tab) => tab.sceneInstance?.uuid === uuid,
  );
  const openSceneInstance =
    tabIndex === -1 ? undefined : globalObject.tabContext[tabIndex].sceneInstance;
  const treeArr = (globalObject.sceneTree ?? []) as { children?: { uuid: string; name: string }[] }[];

  const applyName = (value: string) => {
    sceneInstance.name = value;
    if (openSceneInstance) openSceneInstance.name = value;
    for (const sceneType of treeArr) {
      const node = sceneType.children?.find((child) => child.uuid === uuid);
      if (node) node.name = value;
    }
    if (tabIndex !== -1) useTabsStore.getState().renameTab(tabIndex, value);
    eventBus.publish("updateSceneGroup");
  };

  applyName(name);

  // Undo is scoped to the scene you are looking at, so a rename is only a history step
  // when the renamed scene is the active tab; renaming some other scene from the tree
  // must not push a step onto the open scene's stack.
  const isActiveScene = tabIndex !== -1 && tabIndex === globalObject.selectedTab;
  const recordStep = () => {
    if (isActiveScene) historyService.record(`rename to ${name}`, { coalesceKey: `rename:${uuid}` });
  };

  if (!globalObject.autoSave) {
    logger.log(`SceneInstance renamed to ${name} (autoSave off, not persisted)`, "info");
    recordStep();
    return;
  }

  try {
    await backendService.sceneInstancesPATCH(uuid, openSceneInstance ?? sceneInstance);
    logger.log(`SceneInstance renamed to ${name}`, "info");
    // Recorded only once the rename has stuck. The catch below reverts a rejected one
    // everywhere, and a step for a change that no longer exists would be a trap.
    recordStep();
  } catch (error) {
    // Revert the rename everywhere so the UI matches the server (mirrors the 403
    // revert-to-snapshot behaviour in persistency-handler.persistSceneInstanceToDB).
    applyName(previousName);
    if (Number((error as { status?: number }).status) === 403 && typeof window !== "undefined") {
      window.alert("You don't have enough authorization to rename this scene instance.");
    }
    logger.log(`SceneInstance rename failed: ${describeError(error)}`, "error");
  }
}

/**
 * Rename the SceneInstance shown on the tab at `index` — the tab bar's entry point,
 * kept as-is for its callers; the work itself lives in `renameSceneInstance`.
 */
export async function renameTab(index: number, rawName: string): Promise<void> {
  const tab = globalObject.tabContext[index];
  if (!tab) return;
  return renameSceneInstance(tab.sceneInstance, rawName);
}

/** Close the tab at `index` (closeTab): tear down the engine tab, reconcile selection. */
export async function closeTab(index: number): Promise<void> {
  const tabContext = globalObject.tabContext;
  if (index < 0 || index >= Math.max(tabContext.length, useTabsStore.getState().tabs.length)) {
    return;
  }

  // Drop this tab's remote cursor and selection helpers FIRST: `clearForTab` needs the
  // session alive to unsubscribe its awareness handler, and the tabContext entry alive
  // to remove the helpers from the right scene.
  remoteCursorRenderer.clearForTab(index);
  remoteSelectionRenderer.clearForTab(index);

  // Then tear the shared session down, so the websocket closes gracefully and the user
  // disappears from the other clients' awareness.
  //
  // Known limitation: sessions are keyed by tab index, and the splice below shifts every
  // later tab down one while their sessions keep the old key. With two shared tabs open,
  // closing the lower one therefore strands the survivor's session: `forTab()` misses it,
  // and its observers still write to the old index.
  sharedDocService.detach(index);

  // Remove the tab from the engine's tabContext (same position the store removes).
  const closedSceneUuid = tabContext[index]?.sceneInstance?.uuid;
  if (index < tabContext.length) tabContext.splice(index, 1);

  // The scene is gone from memory, so its undo stack has nothing left to restore into.
  historyService.dropScene(closedSceneUuid);

  // Let the store apply its selection-clamp rules, then read the resulting index.
  useTabsStore.getState().closeTab(index);
  const newSelected = useTabsStore.getState().selectedTab;

  if (newSelected < 0) {
    // No tabs left: reset the engine to an empty scene (mirrors closeTab's else).
    // Detach the gizmo and pull its helper out of the closed scene — nothing runs
    // initTransformControls on this path, so it would otherwise linger. The selection
    // goes too: it names an instance of the closed scene, and Delete would act on it.
    globalObject.transformControls?.detach();
    globalObject.transformControls?.getHelper().removeFromParent();
    globalSelectedObject.removeObject();
    globalObject.selectedTab = -1;
    globalObject.scene = new THREE.Scene();
    globalObject.dragObjects = [];
    historyService.setActiveScene(null);
    eventBus.publish("tabChanged");
    return;
  }

  // Reconcile the engine to the store's chosen selection.
  await applyEngineTabSelection(newSelected);
  logger.log("close tab", "info");
}
