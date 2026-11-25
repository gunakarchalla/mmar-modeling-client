import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { AttributeInstance } from "@gds";
import { eventBus } from "@/resources/services/event-bus";
import { fileUtility } from "@/resources/services/file-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * Reads an image into the attribute instance's value as a FULL data URL — the
 * `data:image/...;base64,` prefix is kept, because the vizRep code strings expect it —
 * and then asks the vizRep pipeline to redraw the instance.
 */
interface Payload {
  attributeInstance: AttributeInstance;
}

export default function UploadImageDialog() {
  const open = useUiStore((s) => s.dialogs.uploadImage);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.uploadImage) as Payload | undefined;
  const attributeInstance = payload?.attributeInstance;

  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) setFile(null);
  }, [open]);

  async function load() {
    if (!file || !attributeInstance) return;

    //when a file is loaded, convert it to base64 string
    attributeInstance.value = await fileUtility.FiletoDataUrl(file);

    eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);
    //publish the event to update the scene group
    eventBus.publish("imageUploaded", {
      attributeInstanceUuid: attributeInstance.uuid,
      fileUuid: "",
      attributeInstance,
    });
    closeDialog("uploadImage");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("uploadImage")} maxWidth="sm" fullWidth>
      <DialogTitle>Image:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button variant="outlined" component="label">
            Choose image
            <input
              hidden
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.svg,.webp,.bmp,.tiff"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="upload-image-input"
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            {file ? file.name : "No file selected"}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => closeDialog("uploadImage")}>Cancel</Button>
        <Button
          disabled={!file}
          onClick={() =>
            void load().catch((err) => logger.log("Image upload failed: " + describeError(err), "error"))
          }
        >
          Load
        </Button>
      </DialogActions>
    </Dialog>
  );
}
