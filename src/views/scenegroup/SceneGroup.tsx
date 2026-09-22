import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { SceneInstance, SceneType } from "@gds";
import { engine, globalObject, globalClassObject, globalRelationclassObject, sceneInitiator } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { metaUtility } from "@/resources/services/meta-utility";
import { historyService } from "@/resources/services/history-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { snapshotService } from "@/resources/services/snapshot-service";
import {
  loadSceneInstancesForType,
  resetSceneInstanceCache,
  sceneInstanceCacheGeneration,
  isSceneTypeLoaded,
} from "@/resources/services/scene-tree-service";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { backendService } from "@/resources/services/backend-service";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { sharedDocService, type AccessLevel } from "@/resources/collaboration/shared-doc-service";
import { remoteCursorRenderer } from "@/resources/collaboration/remote-cursor-renderer";
import { remoteSelectionRenderer } from "@/resources/collaboration/remote-selection-renderer";
import { closeTab, switchToTab, renameSceneInstance } from "@/views/layout/tabActions";

/**
 * The scene tree: SceneTypes at the top level, their SceneInstances underneath, and a
 * double-click to open one in a tab.
 *
 * CONTEXT MENUS carry their target with them — the node under the cursor is passed to
 * the dialog as its payload, so nothing has to be re-selected inside it:
 *   SceneType      Create (that type preselected)
 *   SceneInstance  Open / Create (its parent type preselected) / Duplicate / Rename /
 *                  Share / Delete, each prefilled with that scene
 *   empty space    Create with nothing preselected
 * Because the scene is always known, the Duplicate, Delete and Share dialogs have no
 * scene picker, and so never call `loadAllSceneInstances()` — which hydrates every
 * scene in the database just to fill a dropdown.
 *
 * LAZY LOADING: the tree is built to the SceneType level on mount; each type's
 * SceneInstances are fetched the first time its arrow is expanded. That matters because
 * the server hydrates each scene in full (classes, relations, ports, attributes, roles),
 * so an eager fetch would scale startup with the whole database rather than with the
 * scene being opened. The one consumer that genuinely needs every scene — the reference
 * dialog, since a reference may point into a scene the user never expanded — calls
 * `loadAllSceneInstances()` behind its own spinner.
 *
 * The canonical arrays live on `globalObject.sceneTypes` / `globalObject.sceneTree`;
 * this component mirrors them into local state to render.
 */

type SceneTypeNode = SceneType & { children?: SceneInstance[] };

// Dedupe concurrent initTree() calls (StrictMode double-mount) — resolves to the
// same in-flight fetch; nulled on completion so a later login re-fetches.
let initInFlight: Promise<void> | null = null;
// Identity of the in-flight init, so only that init's own completion clears the slot
// above (a retired one must not clear its successor's).
let initToken: object | null = null;
// The scene-tree-service generation the in-flight init was started under. A logout bumps
// it (session-reset calls resetSceneInstanceCache), which retires that init: its
// SceneTypes were fetched with the previous user's token, so the next user's mount must
// neither join it nor inherit its answer.
let initGeneration = -1;

/**
 * Attach a shared session to a tab when its scene is collaborative — which it is as soon
 * as at least two users hold access to it. The caller's own access level decides whether
 * the session is read-only, and the cursor and selection renderers bind to it right
 * after, so remote presence starts drawing as soon as peers publish it.
 *
 * `tabIndex` defaults to the tab just opened, which is the open-scene case. The
 * `sceneAccessGranted` handler passes an explicit index instead, so an already-open tab
 * can be promoted to shared the moment it crosses the two-user threshold, without a
 * reload; the early `isShared` return makes that idempotent.
 *
 * Failures are non-fatal: a user without delete access cannot read the access list, and
 * a scene that cannot be checked simply stays non-shared.
 */
async function maybeAttachSharedSession(
  sceneInstance: SceneInstance,
  tabContext: { isShared: boolean },
  tabIndex: number = globalObject.tabContext.length - 1,
): Promise<void> {
  if (tabContext.isShared) return;
  try {
    const accessList = await backendService.sceneAccessListGET(sceneInstance.uuid);
    if (!accessList || accessList.length < 2) return;

    let access: AccessLevel = "edit";
    const me = await backendService.sceneAccessMeGET(sceneInstance.uuid);
    if (me && me.level) access = me.level;

    sharedDocService.attach(tabIndex, sceneInstance, access);
    remoteCursorRenderer.bindToSession(tabIndex);
    remoteSelectionRenderer.bindToSession(tabIndex);
    tabContext.isShared = true;
    useTabsStore.getState().setTabShared(tabIndex, true);
    logger.log(`Shared session attached for scene ${sceneInstance.uuid} (access: ${access})`, "info");
  } catch (err) {
    // Non-fatal: access check may fail for users without delete access
    logger.log(`Access check skipped (${err}), treating scene as non-shared`, "info");
  }
}

export default function SceneGroup() {
  const openDialog = useUiStore((s) => s.openDialog);
  const setLoading = useUiStore((s) => s.setLoading);

  const [tree, setTree] = useState<SceneTypeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** SceneTypes whose instances are being fetched right now (drives the row spinner). */
  const [loadingTypes, setLoadingTypes] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ uuid: string; isType: boolean } | null>(null);
  /**
   * Open context menu, anchored at the cursor. `sceneType` is the type half of the row
   * (for an instance row: its parent), so "Create" can preselect it from either kind of
   * row; `sceneInstance` is set only on an instance row and is what marks the menu as
   * the six-item variant. BOTH are absent for the empty area below the tree, which
   * offers Create with nothing preselected.
   */
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    sceneType?: SceneTypeNode;
    sceneInstance?: SceneInstance;
  } | null>(null);
  /** Rename dialog state: the scene being renamed + the in-progress name value. */
  const [renaming, setRenaming] = useState<{ sceneInstance: SceneInstance; value: string } | null>(
    null,
  );
  const mountedRef = useRef(true);
  /** `expanded` readable from initTree without making it a dependency. */
  const expandedRef = useRef<Set<string>>(new Set());

  // Mirror the canonical globalObject.sceneTree into local state to trigger a render.
  const syncTreeFromGlobal = useCallback(() => {
    if (mountedRef.current) setTree([...(globalObject.sceneTree as SceneTypeNode[])]);
  }, []);

  /**
   * Fetch one SceneType's instances (if not already loaded) with the row spinner up.
   * Used both by the expand arrow and by initTree, which has to re-fill the types the
   * user already had open — a re-init resets the cache, so without this an expanded
   * type would sit there empty until the user collapsed and re-expanded it.
   */
  const ensureTypeLoaded = useCallback(
    (uuid: string) => {
      if (isSceneTypeLoaded(uuid)) return;
      setLoadingTypes((prev) => new Set(prev).add(uuid));
      void loadSceneInstancesForType(uuid)
        .catch((err) => logger.log(`Loading scene instances failed: ${err}`, "error"))
        .finally(() => {
          if (!mountedRef.current) return;
          syncTreeFromGlobal();
          setLoadingTypes((prev) => {
            const next = new Set(prev);
            next.delete(uuid);
            return next;
          });
        });
    },
    [syncTreeFromGlobal],
  );

  const initTree = useCallback(async () => {
    const startedAt = sceneInstanceCacheGeneration();
    if (initInFlight && initGeneration === startedAt) return initInFlight;

    const token = {};
    initToken = token;
    initGeneration = startedAt;

    initInFlight = (async () => {
      setLoading(true);
      try {
        await metaUtility.getFiles();
        const sceneTypes = (await metaUtility.getAllSceneTypesFromDB()) as SceneTypeNode[];
        // A logout landed while this was in flight. Both requests above went out with
        // the previous user's token, and what the next user may read is decided by
        // theirs, so this answer must not become their tree. Their own mount starts a
        // fresh init.
        if (sceneInstanceCacheGeneration() !== startedAt) return;
        globalObject.sceneTypes = sceneTypes;

        // Only the SceneType skeleton is fetched here — each type's SceneInstances are
        // fetched when its arrow is first expanded (see toggleExpand / scene-tree-service).
        // `children` is still initialised to [] because instance-utility's
        // getAllSceneInstancesFromLocal iterates it unguarded.
        for (const sceneType of sceneTypes) {
          if (!sceneType.children) sceneType.children = [];
        }
        resetSceneInstanceCache();
        globalObject.sceneTree = sceneTypes;
        syncTreeFromGlobal();
        // Re-fill whatever the user still has expanded (see ensureTypeLoaded).
        for (const uuid of expandedRef.current) ensureTypeLoaded(uuid);
      } finally {
        setLoading(false);
        if (initToken === token) initInFlight = null;
      }
    })();
    return initInFlight;
  }, [setLoading, syncTreeFromGlobal, ensureTypeLoaded]);

  // Fold imported scene instances and open tabs into the tree.
  const updateTree = useCallback(() => {
    const sceneTypes = globalObject.sceneTypes as SceneTypeNode[];
    const treeArr = globalObject.sceneTree as SceneTypeNode[];
    const importSceneInstances = globalObject.importSceneInstances ?? [];

    for (const sceneType of sceneTypes) {
      const addChild = (sceneInstance: SceneInstance | undefined) => {
        if (!sceneInstance || sceneInstance.uuid_scene_type !== sceneType.uuid) return;
        const index = treeArr.findIndex((item) => item.uuid === sceneType.uuid);
        if (index === -1) {
          logger.log(`SceneType with uuid ${sceneType.uuid} not found in tree`, "info");
          return;
        }
        if (!treeArr[index].children) treeArr[index].children = [];
        if (!treeArr[index].children!.some((c) => c.uuid === sceneInstance.uuid)) {
          treeArr[index].children!.push(sceneInstance);
        }
      };

      for (const imp of importSceneInstances) addChild(imp);
      for (const ctx of globalObject.tabContext) addChild(ctx.sceneInstance);
    }

    globalObject.importSceneInstances = [];
    globalObject.sceneTree = treeArr;
    syncTreeFromGlobal();
  }, [syncTreeFromGlobal]);

  // Init on mount (only reached post-login) + subscribe to the update channel.
  //
  // There is no re-init channel: the tree is built here on mount and edited in place
  // afterwards (updateTree adds, scene-tree-service's removeSceneInstanceFromTree
  // removes), so nothing outside needs to ask for a rebuild. A re-login remounts this
  // component, which re-runs initTree anyway. The delete dialog used to publish an
  // 'initSceneGroup' channel to get one; it now removes the node it deleted.
  useEffect(() => {
    mountedRef.current = true;
    void initTree().catch((err) => logger.log(`SceneGroup init failed: ${err}`, "error"));

    const subUpdate = eventBus.subscribe("updateSceneGroup", () => updateTree());

    // Collaboration subscriptions. Handlers are never async: the bus does not await them.

    // Reconnected after a drop: reload the Three.js scene from the freshly
    // fetched SceneInstance that SharedDocService put in the tab context.
    const subReconnect = eventBus.subscribe("sharedSceneReconnected", (payload) => {
      const tabCtx = globalObject.tabContext[payload.tabIndex];
      if (!tabCtx?.sceneInstance) return;
      logger.log(`Reloading scene after reconnect for tab ${payload.tabIndex}`, "info");
      void persistencyHandler
        .loadPersistedModel(tabCtx.sceneInstance)
        .catch((err) => logger.log(`Scene reload after reconnect failed: ${err}`, "error"));
    });

    // Access revoked while connected: show a modal and close the tab.
    const subRevoked = eventBus.subscribe("sceneAccessRevoked", (payload) => {
      const tabCtx = globalObject.tabContext[payload.tabIndex];
      const name = tabCtx?.sceneInstance?.name ?? "this scene";
      window.alert(`Your access to "${name}" was revoked. The tab will be closed.`);
      // Closing goes through tabActions.closeTab, the single mutation path for tab
      // removal: it also drops the presence renderers, detaches the shared session and
      // keeps tabsStore in lockstep with the engine.
      void closeTab(payload.tabIndex).catch((err) =>
        logger.log(`Closing revoked tab failed: ${err}`, "error"),
      );
    });

    // Access granted while the scene's tab is already open: re-check shared mode for
    // that tab so the collab session attaches (and the presence icon appears) live,
    // instead of only on the next open / a full window reload. If the scene is not
    // open, there is nothing to do — its next open runs the same check.
    const subGranted = eventBus.subscribe("sceneAccessGranted", (payload) => {
      const tabIndex = useTabsStore
        .getState()
        .tabs.findIndex((tab) => tab.uuid === payload.sceneInstanceUuid);
      if (tabIndex === -1) return;
      const tabCtx = globalObject.tabContext[tabIndex];
      if (!tabCtx?.sceneInstance || tabCtx.isShared) return;
      void maybeAttachSharedSession(tabCtx.sceneInstance, tabCtx, tabIndex).catch((err) =>
        logger.log(`Attaching shared session after grant failed: ${err}`, "error"),
      );
    });

    return () => {
      mountedRef.current = false;
      subUpdate.dispose();
      subReconnect.dispose();
      subRevoked.dispose();
      subGranted.dispose();
    };
  }, [initTree, updateTree]);

  // Expanding a SceneType is what fetches its SceneInstances (lazily, once). The
  // per-type spinner matters because that request is not cheap — the server returns
  // each scene fully hydrated — so without it the row would just sit there empty.
  function toggleExpand(uuid: string) {
    const willExpand = !expanded.has(uuid);
    const next = new Set(expanded);
    if (willExpand) next.add(uuid);
    else next.delete(uuid);
    expandedRef.current = next;
    setExpanded(next);
    if (willExpand) ensureTypeLoaded(uuid);
  }

  async function openScene(node: SceneTypeNode | SceneInstance) {
    if (metaUtility.checkIfSceneType(node)) {
      // Opening a SceneType -> create-new-scene dialog preselected with this type.
      openDialog("createNewScene", { sceneType: node as SceneType });
    } else if (instanceUtility.checkIfSceneInstance(node)) {
      const sceneInstance = node as SceneInstance;

      // If this SceneInstance is already open, don't create a second tab — redirect
      // to the existing one. tabsStore is in lockstep with globalObject.tabContext
      // (single mutation path), so its index is authoritative for switchToTab.
      const existingIndex = useTabsStore
        .getState()
        .tabs.findIndex((tab) => tab.uuid === sceneInstance.uuid);
      if (existingIndex !== -1) {
        await switchToTab(existingIndex);
        return;
      }

      // Baseline for "revert local edits" (what a rejected 403 save restores). The old
      // eager initTree snapshotted every scene it fetched; now that scenes arrive
      // lazily, the snapshot is taken here — the last point at which this SceneInstance
      // is still exactly what the server sent. Guarded so re-opening a scene does not
      // clobber the baseline persistency-handler maintains on each successful save.
      if (!snapshotService.hasSceneInstanceSnapshot(sceneInstance.uuid)) {
        snapshotService.setSceneInstanceSnapshot(sceneInstance);
      }

      // The engine must be initialised before we build a scene (guard the race where
      // a double-click lands before ThreeCanvas has finished engine.mount()).
      await engine.whenReady();
      await sceneInitiator.sceneInit();
      const tabContext = await instanceUtility.createTabContextSceneInstance(sceneInstance);

      // Two or more users with access makes the scene collaborative.
      await maybeAttachSharedSession(sceneInstance, tabContext);

      await persistencyHandler.loadPersistedModel(sceneInstance);
      globalClassObject.initClasses();
      globalRelationclassObject.initRelationClasses();

      // The undo floor for this tab is the scene AS OPENED — set once the instances
      // have been imported, so the first Ctrl+Z lands on a fully drawn scene.
      historyService.initScene(sceneInstance);

      // Run the hybrid algorithms for the freshly loaded scene — for a Statechange
      // scene this is what makes its Reference instances adopt their targets' meshes.
      await hybridAlgorithmsService.checkHybridAlgorithms(null, sceneInstance.class_instances);

      // The scene is now drawn and its hybrid algorithms have run. `tabChanged` went out
      // back in createTabContextSceneInstance, before any of that, so announce the
      // finished scene for the views that list its contents (the model tree).
      eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: sceneInstance.uuid });
    }
  }

  async function openSceneWithRollback(node: SceneTypeNode | SceneInstance) {
    const openingSceneInstance = instanceUtility.checkIfSceneInstance(node);
    if (openingSceneInstance) snapshotService.createSceneOpenSnapshot();
    try {
      await openScene(node);
      snapshotService.clearSceneOpenSnapshot();
    } catch (error) {
      snapshotService.rollbackSceneOpen();
      throw error;
    }
  }

  async function handleDoubleClick(node: SceneTypeNode | SceneInstance) {
    try {
      await openSceneWithRollback(node);
    } catch {
      window.alert(
        "You don't have enough authorization to read comprehensive elements of this scene type.",
      );
    }
  }

  /**
   * Right-clicking a row selects it first, then opens the menu at the cursor: the menu
   * has no title of its own, so without the selection moving there would be nothing on
   * screen tying it to the row it is about.
   */
  function handleContextMenu(
    e: MouseEvent<HTMLElement>,
    sceneType: SceneTypeNode,
    sceneInstance?: SceneInstance,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const node = sceneInstance ?? sceneType;
    setSelected({ uuid: node.uuid, isType: !sceneInstance });
    setMenu({ x: e.clientX, y: e.clientY, sceneType, sceneInstance });
  }

  /**
   * Right-click on the panel itself rather than on a row (the empty space below the
   * tree, which is most of the panel when few types are expanded). Create is the only
   * action that makes sense with no node under the cursor, and it opens with nothing
   * preselected — the dialog's own SceneType picker then does the choosing. This is
   * how a scene is created when no row is a sensible target.
   *
   * Row handlers stopPropagation, so a right-click on a row never reaches this.
   */
  function handleBackgroundContextMenu(e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    setSelected(null);
    setMenu({ x: e.clientX, y: e.clientY });
  }

  /** Close the menu, then run the item's action against the node it was opened on. */
  function runMenuAction(
    action: (target: { sceneType?: SceneTypeNode; sceneInstance?: SceneInstance }) => void,
  ) {
    if (!menu) return;
    const target = { sceneType: menu.sceneType, sceneInstance: menu.sceneInstance };
    setMenu(null);
    action(target);
  }

  function onRenameKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmRename();
    }
  }

  function confirmRename() {
    if (!renaming) return;
    const { sceneInstance, value } = renaming;
    setRenaming(null);
    void renameSceneInstance(sceneInstance, value)
      .then(syncTreeFromGlobal)
      .catch((err) => logger.log(describeError(err), "error"));
  }

  const helperFor = (uuid: string, isType: boolean) =>
    selected?.uuid === uuid ? (isType ? " DC for new" : " DC to open") : "";

  return (
    // The whole panel is right-clickable, not just the rows: `minHeight` guarantees
    // there is some empty area below the tree to aim at even when nothing is expanded,
    // which is where the unprefilled "Create new SceneInstance" action lives.
    <Box onContextMenu={handleBackgroundContextMenu} sx={{ minHeight: 140 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Scenes
      </Typography>
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mb: 0.5 }}>
        Right-click a scene, a scene type, or the empty space for actions.
      </Typography>

      <List dense disablePadding>
        {tree.map((sceneType) => {
          const isOpen = expanded.has(sceneType.uuid);
          const children = sceneType.children ?? [];
          const isLoadingType = loadingTypes.has(sceneType.uuid);
          return (
            <Fragment key={sceneType.uuid}>
              <ListItemButton
                selected={selected?.uuid === sceneType.uuid}
                onClick={() => setSelected({ uuid: sceneType.uuid, isType: true })}
                onDoubleClick={() => void handleDoubleClick(sceneType)}
                onContextMenu={(e) => handleContextMenu(e, sceneType)}
                data-uuid={sceneType.uuid}
              >
                {/* Always rendered: until the type is expanded once we do not know
                    whether it has any instances, so there is no child count to test. */}
                <IconButton
                  size="small"
                  edge="start"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(sceneType.uuid);
                  }}
                  aria-label={isOpen ? "collapse" : "expand"}
                  sx={{ mr: 0.5 }}
                >
                  {isLoadingType ? (
                    <CircularProgress size={14} aria-label="loading scene instances" />
                  ) : isOpen ? (
                    <ExpandLess fontSize="inherit" />
                  ) : (
                    <ExpandMore fontSize="inherit" />
                  )}
                </IconButton>
                <ListItemText
                  primary={
                    <span style={{ fontSize: "10pt" }}>
                      {sceneType.name}
                      <span style={{ fontSize: "7pt", color: "red", marginLeft: 4 }}>
                        {helperFor(sceneType.uuid, true)}
                      </span>
                    </span>
                  }
                />
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {isLoadingType && (
                    <ListItemText
                      sx={{ pl: 4, py: 0.5, display: "flex", alignItems: "center", gap: 1 }}
                      primary={
                        <>
                          <CircularProgress size={12} sx={{ mr: 1 }} />
                          <span style={{ fontSize: "9pt", fontStyle: "italic" }}>
                            Loading scenes…
                          </span>
                        </>
                      }
                    />
                  )}
                  {!isLoadingType && children.length === 0 && (
                    <ListItemText
                      sx={{ pl: 4, py: 0.5 }}
                      primary={
                        <span style={{ fontSize: "9pt", fontStyle: "italic", opacity: 0.7 }}>
                          No scene instances
                        </span>
                      }
                    />
                  )}
                  {children.map((sceneInstance) => (
                    <ListItemButton
                      key={sceneInstance.uuid}
                      sx={{ pl: 4 }}
                      selected={selected?.uuid === sceneInstance.uuid}
                      onClick={() => setSelected({ uuid: sceneInstance.uuid, isType: false })}
                      onDoubleClick={() => void handleDoubleClick(sceneInstance)}
                      onContextMenu={(e) => handleContextMenu(e, sceneType, sceneInstance)}
                      data-uuid={sceneInstance.uuid}
                    >
                      <ListItemText
                        primary={
                          <span style={{ fontSize: "10pt" }}>
                            {sceneInstance.name}
                            <span style={{ fontSize: "7pt", color: "red", marginLeft: 4 }}>
                              {helperFor(sceneInstance.uuid, false)}
                            </span>
                          </span>
                        }
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Fragment>
          );
        })}
      </List>

      {/* One menu for both row kinds: a SceneType only offers Create (there is nothing
          else you can do to a type from here), a SceneInstance gets the full set. Every
          item hands the clicked node to its dialog as a payload, so nothing has to be
          re-selected in the dialog. */}
      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        {menu?.sceneInstance && (
          <MenuItem
            onClick={() =>
              runMenuAction(({ sceneInstance }) => void handleDoubleClick(sceneInstance!))
            }
          >
            Open
          </MenuItem>
        )}
        <MenuItem
          onClick={() =>
            // No payload from the empty area: the dialog opens with its SceneType picker
            // empty, which is the only thing it can do without a row to read a type off.
            runMenuAction(({ sceneType }) =>
              openDialog("createNewScene", sceneType ? { sceneType } : undefined),
            )
          }
        >
          Create new SceneInstance
        </MenuItem>
        {menu?.sceneInstance && [
          <MenuItem
            key="duplicate"
            onClick={() =>
              runMenuAction(({ sceneInstance }) => openDialog("copyScene", { sceneInstance }))
            }
          >
            Duplicate SceneInstance
          </MenuItem>,
          <MenuItem
            key="rename"
            onClick={() =>
              runMenuAction(({ sceneInstance }) =>
                setRenaming({ sceneInstance: sceneInstance!, value: sceneInstance!.name }),
              )
            }
          >
            Rename SceneInstance
          </MenuItem>,
          <MenuItem
            key="share"
            onClick={() =>
              runMenuAction(({ sceneInstance }) => openDialog("shareScene", { sceneInstance }))
            }
          >
            Share SceneInstance
          </MenuItem>,
          <Divider key="divider" />,
          // Separated from the rest: it is the one irreversible item, and the dialog it
          // opens is a confirmation rather than a form.
          <MenuItem
            key="delete"
            sx={{ color: "error.main" }}
            onClick={() =>
              runMenuAction(({ sceneInstance }) => openDialog("deleteScene", { sceneInstance }))
            }
          >
            Delete SceneInstance
          </MenuItem>,
        ]}
      </Menu>

      {/* Tree-level rename. The tab bar has the same dialog for the tab it is on; this
          one works whether or not the scene is open (see tabActions.renameSceneInstance). */}
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Rename SceneInstance</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={renaming?.value ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, value: e.target.value } : r))}
            onKeyDown={onRenameKeyDown}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={confirmRename} disabled={!renaming?.value.trim()}>
            Rename
          </Button>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
