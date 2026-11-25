import * as THREE from "three";
// The `@/engine` BARREL, not the global-definition leaf: the barrel is the documented
// import point for engine singletons, and it is what view tests already mock.
import { globalObject, globalSelectedObject, globalStateObject } from "@/engine";
import { eventBus } from "./event-bus";
import { historyService } from "./history-service";
import { snapshotService } from "./snapshot-service";
import { metaUtility } from "./meta-utility";
import { resetSceneInstanceCache } from "./scene-tree-service";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";
import { remoteCursorRenderer } from "@/resources/collaboration/remote-cursor-renderer";
import { remoteSelectionRenderer } from "@/resources/collaboration/remote-selection-renderer";
import { useTabsStore } from "@/resources/store/tabsStore";
import { useCollabStore } from "@/resources/store/collabStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { useStateStore } from "@/resources/store/stateStore";
import { useUiStore } from "@/resources/store/uiStore";
import { useLogStore } from "@/resources/store/logStore";

/**
 * Tears the whole session down when a user logs out, so the next user starts from an
 * empty app.
 *
 * WHY THIS EXISTS: logging out used to clear only the JWT and `authStore.currentUser`.
 * Everything the session had built is module-singleton state that lives as long as the
 * PAGE, not as long as the login: `globalObject.tabContext` (the SceneInstances, their
 * THREE.Scenes and the drag/pick lists), `tabsStore`, the per-scene undo histories, the
 * collaboration websockets, the scene tree and the snapshots. `AppLayout` merely stops
 * rendering the body while nobody is signed in — it destroys none of that. So the next
 * login re-rendered the body over the previous user's session: the tab bar came back
 * from `tabsStore`, `ThreeCanvas` re-attached the same engine singleton, and selecting a
 * tab swapped in the previous user's THREE.Scene together with `contextDragObjects` —
 * which is the raycasters' pick list, so their objects were not just visible but
 * selectable, draggable and deletable. `SceneGroup.updateTree` then folded every
 * surviving `tabContext` scene back into the new user's tree.
 *
 * WIRING: `authStore.logout()` publishes `login: false`, and the subscription at the
 * bottom of this file runs the teardown synchronously inside that publish — before React
 * re-renders and before any sign-in can succeed. The bus is what keeps `authStore` (and
 * its node-environment tests) out of the engine's import graph: `global-definition`
 * builds a real `WebGLRenderer` at module scope, so a direct import would drag a DOM
 * dependency into the auth layer.
 *
 * ORDER MATTERS: presence helpers are removed while their sessions and scenes still
 * exist, sessions are then destroyed while `tabContext` still exists, and only then are
 * the tabs and the engine state emptied.
 */
export function resetSessionState(): void {
  // --- 1. Selection ------------------------------------------------------
  // Before anything is torn out from under it: the gizmo logs on every frame for as
  // long as it stays attached to a mesh that has left the scene graph.
  globalObject.transformControls?.detach();
  globalSelectedObject.removeObject();
  useSelectionStore.getState().clearSelection();

  // --- 2. Collaboration --------------------------------------------------
  // Remote cursors/boxes first (they need the sessions alive to unsubscribe and the
  // scenes alive to remove their helpers), then the sessions themselves: each holds a
  // websocket opened with the logging-out user's JWT and broadcasts their name and
  // colour over awareness, so none may survive the logout.
  remoteCursorRenderer.clearAll();
  remoteSelectionRenderer.clearAll();
  sharedDocService.detachAll();
  useCollabStore.getState().reset();

  // --- 3. Tabs and engine scene state ------------------------------------
  // The engine half and the store half go together, exactly as on the per-tab path
  // (`instance-utility.createTabContextSceneInstance` / `tabActions.closeTab`).
  globalObject.tabContext.length = 0;
  globalObject.selectedTab = -1;
  // A fresh empty scene, like closeTab's "no tabs left" branch. The previous scenes go
  // with their tabContext entries.
  globalObject.scene = new THREE.Scene();
  globalObject.dragObjects = [];
  globalObject.updateLinesArray = [];
  globalObject.relationObjects = [];
  globalObject.buttonObjects = [];
  globalObject.attribute_instances = [];
  globalObject.role_instances = [];
  globalObject.allPositions = [];
  globalObject.allRotations = [];
  globalObject.allScales = [];
  // The vizRep pipeline's "instance being drawn" pointers.
  globalObject.current_class_instance = undefined as unknown as typeof globalObject.current_class_instance;
  globalObject.current_port_instance = undefined as unknown as typeof globalObject.current_port_instance;
  globalObject.current_meta_port = undefined as unknown as typeof globalObject.current_meta_port;
  useTabsStore.getState().reset();

  // --- 4. Per-scene caches -----------------------------------------------
  historyService.reset();
  snapshotService.clear();

  // --- 5. Scene tree and metamodel ---------------------------------------
  // What the next user may read is decided by their own token, so none of this carries
  // over. `SceneGroup` remounts on the next login and its `initTree()` refetches the
  // SceneTypes and the files; `resetSceneInstanceCache` is what makes it refetch the
  // instances of whichever types get expanded.
  globalObject.sceneTree = [];
  globalObject.sceneTypes = [];
  globalObject.importSceneTypes = [];
  globalObject.importSceneInstances = [];
  resetSceneInstanceCache();
  metaUtility.Files.clear();

  // --- 6. UI -------------------------------------------------------------
  // Interaction mode is reset through the field rather than `setState(0)`: that runs
  // `onStateChange`, which dereferences engine controls that need not exist yet.
  globalStateObject.activeState = "";
  useStateStore.getState().setActiveState("");
  globalObject.autoSave = true;
  globalObject.doSceneInstancePatch = false;
  globalObject.doSceneInstancePatchLocal = false;
  globalObject.runMechanism = false;
  globalObject.readyForVizRepUpdate = true;
  globalObject.objectScaled = false;
  // Closes any dialog the previous user left open and drops its payload — the payload is
  // the SceneInstance the dialog would act on.
  useUiStore.getState().reset();
  // The log panel names their scenes and the operations they ran on them.
  useLogStore.getState().clear();
}

/**
 * Load-bearing module side effect: importing this file is what arms the teardown.
 * `main.tsx` imports it for exactly that reason — see the note there.
 */
eventBus.subscribe("login", (loggedIn) => {
  if (!loggedIn) resetSessionState();
});
