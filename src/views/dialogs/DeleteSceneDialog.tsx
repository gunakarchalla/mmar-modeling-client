import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import type { SceneInstance } from "@gds";
import { backendService } from "@/resources/services/backend-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { removeSceneInstanceFromTree } from "@/resources/services/scene-tree-service";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { closeTab } from "@/views/layout/tabActions";

// Deletes a SceneInstance from the
// database, then drops that one node from the tree and publishes 'updateSceneGroup' to
// re-render. Opened from the SceneGroup tree's "Delete" context-menu item via uiStore
// 'deleteScene', with the right-clicked scene as its `{ sceneInstance }` payload.
//
// It used to publish an 'initSceneGroup' event instead, which made SceneGroup rebuild
// the whole tree: refetch every metamodel file, every SceneType and every expanded
// type's fully hydrated scenes. (That channel is gone — this was its only publisher.) None of that can have changed — the delete touched the instance
// layer only — and a rebuild would drop the tree's local-only nodes (imported metamodels
// and models, scenes created with autoSave off). scene-tree-service's
// `removeSceneInstanceFromTree` does the one thing the delete actually implies; see its
// note for why the tree had no removal path before.
//
// The payload is REQUIRED, and the dialog is a plain confirmation rather than the old
// picker: the user already chose the scene by right-clicking it, so all that is left is
// the "are you sure?" that an irreversible action deserves. Dropping the picker also
// drops the loadAllSceneInstances() call that fetched every scene in the database fully
// hydrated just to fill a dropdown (see CopySceneDialog's note).
//
// If the deleted scene happens to be open in a tab, that tab is closed as part of the
// deletion (via tabActions.closeTab), so a stale tab can't survive to re-create the
// scene on its next auto-save PATCH (persistency-handler falls back to POST on a 404).
interface Payload {
  sceneInstance?: SceneInstance;
}

export default function DeleteSceneDialog() {
  const open = useUiStore((s) => s.dialogs.deleteScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstance, setSceneInstance] = useState<SceneInstance | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Read the payload each time the dialog opens (a stale one would confirm the
  // deletion of the previously right-clicked scene).
  useEffect(() => {
    if (!open) return;
    setErrorMsg("");
    setDeleting(false);
    const payload = useUiStore.getState().getDialogPayload<Payload>("deleteScene");
    const target = payload?.sceneInstance ?? null;
    setSceneInstance(target);
    if (!target) {
      logger.log("Delete dialog opened without a SceneInstance — nothing to delete", "error");
    }
  }, [open]);

  async function deleteScene() {
    if (!sceneInstance) return;
    const uuid = sceneInstance.uuid;

    // The delete can be rejected (403 without delete access on a shared scene). The
    // dialog stays open and says so, instead of closing as if it had worked — the
    // scene tree would still show the scene and leave the user guessing.
    setDeleting(true);
    setErrorMsg("");
    try {
      await backendService.sceneInstancesAllDELETE2(uuid);
    } catch (error) {
      setDeleting(false);
      setErrorMsg(
        Number((error as { status?: number }).status) === 403
          ? "You don't have enough authorization to delete this scene instance."
          : "An error occurred while deleting this scene instance.",
      );
      logger.log(`SceneInstance ${uuid} delete failed: ${describeError(error)}`, "error");
      return;
    }
    logger.log("SceneInstance" + uuid + " deleted", "delete");

    // If the deleted scene is open in a tab, close it so the tab bar and engine don't
    // keep a stale tab pointing at a now-nonexistent SceneInstance.
    const openTabIndex = useTabsStore.getState().tabs.findIndex((tab) => tab.uuid === uuid);
    if (openTabIndex !== -1) {
      await closeTab(openTabIndex);
    }

    // Order matters: the tab is closed above FIRST, because 'updateSceneGroup' folds
    // every open tab back into the tree and would re-add the scene we just removed.
    removeSceneInstanceFromTree(uuid);
    eventBus.publish("updateSceneGroup");
    setDeleting(false);
    closeDialog("deleteScene");
  }

  function cancel() {
    logger.log("cancel button clicked", "close");
    closeDialog("deleteScene");
  }

  // Without a scene there is nothing to confirm — the opener is at fault, and the
  // effect above has logged it.
  return (
    <Dialog open={open && sceneInstance !== null} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Delete SceneInstance</DialogTitle>
      <DialogContent>
        <Typography sx={{ mt: 1, fontSize: 14 }}>
          Delete <strong>{sceneInstance?.name}</strong>? This permanently removes the scene and
          everything in it, and cannot be undone.
        </Typography>
        {errorMsg && (
          <Typography sx={{ color: "#c00", fontSize: 12, mt: 1 }}>{errorMsg}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          color="error"
          onClick={() =>
            void deleteScene().catch((err) => logger.log(describeError(err), "error"))
          }
          disabled={deleting}
        >
          Delete SceneInstance
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
