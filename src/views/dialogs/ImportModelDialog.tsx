import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { SceneInstance } from "@gds";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * Loads exported SceneInstance JSON files from disk into
 * `globalObject.importSceneInstances`, then publishes `updateSceneGroup` so the scene
 * tree folds them in. Nothing is sent to the server — the "Load to database" button is
 * an intentionally inert placeholder. Several files can be imported at once.
 *
 * `.zip` is accepted by the file input but has no unzip branch: the bytes go straight to
 * `JSON.parse`, so a zip surfaces as a logged parse error rather than silently doing
 * nothing. The map-from-file dialog is the one that unzips.
 */
export default function ImportModelDialog() {
  const open = useUiStore((s) => s.dialogs.importModel);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open) setFiles([]);
  }, [open]);

  async function loadLocal() {
    for (const file of files) {
      const result: unknown = JSON.parse(await file.text());

      // convert the json to a SceneInstance object.
      // gds fromJS, never the app's plainToInstance: the app's copy of
      // class-transformer lacks gds's @Type metadata and would leave nested
      // class_instances as plain Objects, breaking every instanceof downstream.
      const sceneInstance = SceneInstance.fromJS(result) as SceneInstance;
      globalObject.importSceneInstances.push(sceneInstance);
      logger.log("sceneInstance: " + sceneInstance.uuid + " pushed to importSceneInstances", "info");
    }

    // publish the event to update the scene group
    eventBus.publish("updateSceneGroup");
    setFiles([]);
    closeDialog("importModel");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("importModel")} maxWidth="sm" fullWidth>
      <DialogTitle>Upload some Models:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button component="label" variant="outlined">
            Choose files
            <input
              hidden
              type="file"
              accept=".json,.zip"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </Button>
          {files.length > 0 ? (
            <List dense>
              {files.map((file) => (
                <ListItem key={file.name}>
                  <ListItemText primary={file.name} />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No files selected.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => void loadLocal().catch((err) => logger.log(describeError(err), "error"))}
          disabled={files.length === 0}
        >
          Load local
        </Button>
        {/* Inert placeholder: nothing is sent to the server from here. */}
        <Button disabled>Load to database</Button>
      </DialogActions>
    </Dialog>
  );
}
