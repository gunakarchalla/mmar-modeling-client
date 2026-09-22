import { useEffect } from "react";
import { Box, Switch, Tooltip, Typography } from "@mui/material";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { useUiStore } from "@/resources/store/uiStore";
import { useCollabStore } from "@/resources/store/collabStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";

// Owns the 5-second auto-save loop and its toggle. A shared scene forces auto-saving on,
// because collaborators must not diverge from the server, so the switch is disabled there.
//
// The engine's `globalObject.autoSave` is authoritative; `uiStore.autoSave` is the
// reactive mirror the switch reads, kept in lockstep by the toggle and the effect.
//
// Whether the active tab is shared depends on two independent signals, and both must be
// subscribed explicitly: a session attaching or detaching (`collabStore.tabs`) and the
// user moving to a different tab (`tabsStore.selectedTab`). Dropping either leaves the
// switch showing the previous tab's state.

export default function AutoSave() {
  const autoSave = useUiStore((s) => s.autoSave);
  const setAutoSave = useUiStore((s) => s.setAutoSave);
  const collabTabs = useCollabStore((s) => s.tabs);
  const selectedTab = useTabsStore((s) => s.selectedTab);

  // The 5 s auto-save loop, in an effect with cleanup so StrictMode's double-mount does
  // not stack intervals.
  useEffect(() => {
    const interval = setInterval(() => {
      void (async () => {
        const session = sharedDocService.forTab(globalObject.selectedTab);
        const isShared = session !== null;

        if (isShared) {
          // Force auto-save on in shared mode.
          if (!globalObject.autoSave) {
            globalObject.autoSave = true;
            setAutoSave(true);
          }
          if (globalObject.doSceneInstancePatchLocal && session!.access !== "read") {
            logger.log("AutoSave (shared): saving local changes", "info");
            await persistencyHandler.persistSceneInstanceToDB();
            globalObject.doSceneInstancePatchLocal = false;
          } else if (globalObject.doSceneInstancePatchLocal && session!.access === "read") {
            window.alert("You don't have enough authorization to edit this scene instance.");
            globalObject.doSceneInstancePatchLocal = false;
          }
        } else {
          // Non-shared: save when auto-save is on and a local patch is pending.
          if (globalObject.autoSave && globalObject.doSceneInstancePatch) {
            logger.log("AutoSave: " + globalObject.autoSave, "info");
            await persistencyHandler.persistSceneInstanceToDB();
            globalObject.doSceneInstancePatch = false;
          }
        }
      })();
    }, 5000);
    return () => clearInterval(interval);
  }, [setAutoSave]);

  // collabStore holds an entry for exactly the shared tabs, keyed by tab index, so the
  // rendered state derives from reactive data alone and updates on both triggers. The 5 s
  // loop and toggle() below read the session directly instead, because they run outside a
  // component body where the hook form is not available.
  const isShared = selectedTab in collabTabs;

  function toggle() {
    // Locked in shared mode.
    if (sharedDocService.forTab(globalObject.selectedTab)) return;
    const next = !globalObject.autoSave;
    globalObject.autoSave = next;
    setAutoSave(next);
    logger.log("AutoSave toggle: " + next, "info");
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Tooltip title={isShared ? "Auto-save is locked in shared mode" : "Toggle auto-save"}>
        <Switch checked={autoSave} onChange={toggle} disabled={isShared} size="small" />
      </Tooltip>
      <Typography variant="caption" sx={{ mr: 1 }}>
        Autosave
      </Typography>
    </Box>
  );
}
