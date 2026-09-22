import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import type { SceneInstance } from "@gds";
import { globalObject } from "@/engine";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * The "Save Model" dialog, reached from File > Save Model and from Ctrl+S.
 *
 * Shows the open tab's SceneInstance: the uuid, coordinates and custom variables are
 * read-only; name and description are editable and are written STRAIGHT INTO the gds
 * SceneInstance as the user types. There is no apply step, so closing with Cancel does
 * not roll those edits back.
 *
 * The scene is re-read from the tab context every time the dialog opens, which is what
 * keeps the fields correct across tab switches.
 */
export default function SaveAsDialog() {
  const open = useUiStore((s) => s.dialogs.saveAs);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstance, setSceneInstance] = useState<SceneInstance | null>(null);
  // Local mirrors so the text fields re-render; each keystroke also writes through
  // to the gds object (see the note above).
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    // Read the open tab's scene instance. Rendering is gated
    // the whole content on `tabContext.length > 0`; with no open tab there is
    // nothing to save, so the dialog shows the same empty body.
    const tab = globalObject.tabContext[globalObject.selectedTab];
    const instance = (tab?.sceneInstance as SceneInstance | undefined) ?? null;
    setSceneInstance(instance);
    setName(instance?.name ?? "");
    setDescription(instance?.description ?? "");
  }, [open]);

  function changeName(value: string) {
    setName(value);
    if (sceneInstance) sceneInstance.name = value;
  }

  function changeDescription(value: string) {
    setDescription(value);
    if (sceneInstance) sceneInstance.description = value;
  }

  async function saveToText() {
    logger.log("saveToText button clicked", "info");
    await persistencyHandler.saveToTextfile();
    closeDialog("saveAs");
  }

  async function saveToDatabase() {
    logger.log("saveToDatabase button clicked", "info");
    await persistencyHandler.persistSceneInstanceToDB();
    closeDialog("saveAs");
  }

  function cancel() {
    logger.log("cancel button clicked", "close");
    closeDialog("saveAs");
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Enter your value</DialogTitle>
      <DialogContent>
        {sceneInstance && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="UUID"
              value={sceneInstance.uuid}
              slotProps={{ input: { readOnly: true } }}
              disabled
              fullWidth
            />
            <TextField
              label="Name"
              value={name}
              onChange={(e) => changeName(e.target.value)}
              helperText="String"
              fullWidth
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => changeDescription(e.target.value)}
              helperText="String"
              multiline
              minRows={3}
              fullWidth
            />
            <TextField
              label="Relative Coordinates 3D"
              value={JSON.stringify(sceneInstance.relative_coordinate_3d)}
              slotProps={{ input: { readOnly: true } }}
              disabled
              helperText="String"
              fullWidth
            />
            <TextField
              label="Absolute Coordinates 3D"
              value={JSON.stringify(sceneInstance.absolute_coordinate_3d)}
              slotProps={{ input: { readOnly: true } }}
              disabled
              helperText="String"
              fullWidth
            />
            <TextField
              label="Custom Variables"
              value={JSON.stringify(sceneInstance.custom_variables)}
              slotProps={{ input: { readOnly: true } }}
              disabled
              helperText="String"
              fullWidth
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        <Button
          onClick={() =>
            void saveToText().catch((err) => logger.log(describeError(err), "error"))
          }
          disabled={!sceneInstance}
        >
          Save to Textfile
        </Button>
        <Button
          onClick={() =>
            void saveToDatabase().catch((err) => logger.log(describeError(err), "error"))
          }
          disabled={!sceneInstance}
        >
          Save to Database
        </Button>
      </DialogActions>
    </Dialog>
  );
}
