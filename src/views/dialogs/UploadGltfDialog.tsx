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
 * Reads a `.gltf` or `.referenceobject` file into the attribute instance's value: glTF
 * as text (it is JSON), a `.referenceobject` as a data URL. Nothing is posted to the
 * server — the attribute value IS the model, and `graphic_gltf` accepts it directly.
 *
 * The read is awaited, so `gltfUploaded` is published once the value is actually set.
 */
interface Payload {
  attributeInstance: AttributeInstance;
}

export default function UploadGltfDialog() {
  const open = useUiStore((s) => s.dialogs.uploadGltf);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.uploadGltf) as Payload | undefined;
  const attributeInstance = payload?.attributeInstance;

  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) setFile(null);
  }, [open]);

  async function load() {
    if (!file || !attributeInstance) return;

    // if file name is .referenceobject, read as data url; otherwise read the glTF as text
    const isReferenceObject = file.name.includes(".referenceobject");
    const value = isReferenceObject ? await fileUtility.FiletoDataUrl(file) : await file.text();
    logger.log(isReferenceObject ? "Reference object uploaded" : "GLTF uploaded", "info");

    attributeInstance.value = value;

    //publish the event to update the scene group
    eventBus.publish("gltfUploaded", {
      attributeInstanceUuid: attributeInstance.uuid,
      fileUuid: "",
      attributeInstance,
    });
    closeDialog("uploadGltf");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("uploadGltf")} maxWidth="sm" fullWidth>
      <DialogTitle>Upload GLTF:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button variant="outlined" component="label">
            Choose .gltf / .referenceobject
            <input
              hidden
              type="file"
              accept=".gltf,.referenceobject"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="upload-gltf-input"
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            {file ? file.name : "No file selected"}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => closeDialog("uploadGltf")}>Cancel</Button>
        <Button
          disabled={!file}
          onClick={() =>
            void load().catch((err) => logger.log("GLTF upload failed: " + describeError(err), "error"))
          }
        >
          Load
        </Button>
      </DialogActions>
    </Dialog>
  );
}
