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
import { SceneType } from "@gds";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * Loads exported SceneType JSON from disk into both `globalObject.importSceneTypes` and
 * `globalObject.sceneTypes`, so an imported type is immediately available to the scene
 * tree and to the create-scene dialog, then publishes `updateSceneGroup`.
 *
 * JSON only — this dialog does not unzip. Nothing is sent to the server, and the "Load
 * to database" button is an inert placeholder. Each file is read with `await
 * file.text()`, so selecting several imports all of them.
 */
export default function ImportMetamodelDialog() {
  const open = useUiStore((s) => s.dialogs.importMetamodel);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open) setFiles([]);
  }, [open]);

  async function loadLocal() {
    for (const file of files) {
      const result: unknown = JSON.parse(await file.text());

      // gds fromJS, never the app's plainToInstance: only gds's own class-transformer
      // holds the @Type metadata that deep-revives the nested objects.
      const sceneType = SceneType.fromJS(result) as SceneType;
      globalObject.importSceneTypes.push(sceneType);
      globalObject.sceneTypes.push(sceneType);

      logger.log("sceneType: " + sceneType.uuid + " pushed to importSceneTypes", "info");
    }

    // publish the event to update the scene group
    eventBus.publish("updateSceneGroup");
    setFiles([]);
    closeDialog("importMetamodel");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("importMetamodel")} maxWidth="sm" fullWidth>
      <DialogTitle>Upload some Metamodels:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button component="label" variant="outlined">
            Choose files
            <input
              hidden
              type="file"
              accept=".json"
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
