import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SceneInstance } from "@gds";
import { globalClassObject, globalRelationclassObject, sceneInitiator } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { historyService } from "@/resources/services/history-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { duplicateSceneInstance } from "@/views/dialogs/copySceneModel";

// Duplicates an existing
// SceneInstance under a new name, with every uuid in the graph rewritten
// (see copySceneModel.duplicateSceneInstance for that half + its two deviations).
// Opened from the SceneGroup tree's "Duplicate" context-menu item via uiStore
// 'copyScene', with the right-clicked scene as its `{ sceneInstance }` payload.
//
// The payload is REQUIRED — the dialog does not pick a scene. That matters for more
// than convenience: a dialog with its own scene picker has to call
// loadAllSceneInstances() to fill the dropdown, which fetches every scene in the
// database FULLY HYDRATED (classes, relations, ports, attributes, roles) just to render
// a list of names. Arriving from a right-click on the scene itself skips all of that —
// the tree node handed over is already hydrated, which is exactly what
// duplicateSceneInstance needs.
interface Payload {
  sceneInstance?: SceneInstance;
}

export default function CopySceneDialog() {
  const open = useUiStore((s) => s.dialogs.copyScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sourceSceneInstance, setSourceSceneInstance] = useState<SceneInstance | null>(null);
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Read the payload each time the dialog opens (a stale one would duplicate the
  // previously right-clicked scene).
  useEffect(() => {
    if (!open) return;
    const payload = useUiStore.getState().getDialogPayload<Payload>("copyScene");
    const source = payload?.sceneInstance ?? null;
    setSourceSceneInstance(source);
    setName(source ? `${source.name} - Copy` : "");
    setDescription("");
    if (!source) {
      logger.log("Copy dialog opened without a SceneInstance — nothing to duplicate", "error");
    }
  }, [open]);

  async function createNewScene() {
    if (sourceSceneInstance && instanceUtility.checkIfSceneInstance(sourceSceneInstance)) {
      const newSceneInstance = duplicateSceneInstance(sourceSceneInstance, name, description);

      await sceneInitiator.sceneInit();
      await instanceUtility.createTabContextSceneInstance(newSceneInstance);
      await persistencyHandler.loadPersistedModel(newSceneInstance);

      // set globalClassObject classes
      globalClassObject.initClasses();
      globalRelationclassObject.initRelationClasses();

      //check hybrid algorithms -> specifically for reference attributes --> we do not
      // No attribute instance: this is a whole-scene pass, not a single-value change.
      await hybridAlgorithmsService.checkHybridAlgorithms(null, newSceneInstance.class_instances);

      // Undo floor for the new tab: the duplicate as it was just built.
      historyService.initScene(newSceneInstance);

      logger.log(`SceneInstance with name ${newSceneInstance.name} created`, "info");
    }

    eventBus.publish("updateSceneGroup");
    closeDialog("copyScene");
  }

  function cancel() {
    logger.log("cancel button clicked", "close");
    closeDialog("copyScene");
  }

  // Without a scene there is nothing to show (and no picker to fall back to) — the
  // opener is at fault, and the effect above has logged it.
  return (
    <Dialog open={open && sourceSceneInstance !== null} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Duplicate SceneInstance</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 13 }}>
            Duplicating <strong>{sourceSceneInstance?.name}</strong>
          </Typography>
          <TextField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Description"
            multiline
            minRows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() =>
            void createNewScene().catch((err) => logger.log(describeError(err), "error"))
          }
          disabled={!name.trim()}
        >
          Copy SceneInstance
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
