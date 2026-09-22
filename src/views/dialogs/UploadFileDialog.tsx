import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { validate as uuidValidate } from "uuid";
import type { AttributeInstance } from "@gds";
import { backendService } from "@/resources/services/backend-service";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * Uploads a file into an attribute instance of the File attribute type: POST for a fresh
 * attribute, PATCH when it already holds a file uuid. Images can optionally be
 * compressed server-side through the `compress` / `targetWidth` / `quality` params.
 *
 * One file at a time, and compression is offered only for images.
 */
interface Payload {
  attributeInstance: AttributeInstance;
}

/** The target width must be a number greater than zero. */
function validateTargetWidth(targetWidth: string): string {
  if (targetWidth === "" || isNaN(Number(targetWidth))) return "Target width is required.";
  if (Number(targetWidth) <= 0) return "Must be a number greater than 0.";
  return "";
}

/** dialog-upload-file.ts:114 — validateQuality(). */
function validateQuality(quality: string): string {
  if (quality === "" || isNaN(Number(quality))) return "Quality is required.";
  if (Number(quality) <= 0 || Number(quality) > 100) return "Must be a number between 1 and 100.";
  return "";
}

export default function UploadFileDialog() {
  const open = useUiStore((s) => s.dialogs.uploadFile);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.uploadFile) as Payload | undefined;
  const attributeInstance = payload?.attributeInstance;

  const [file, setFile] = useState<File | null>(null);
  const [compress, setCompress] = useState(false);
  const [targetWidth, setTargetWidth] = useState<string>("100");
  const [quality, setQuality] = useState<string>("100");
  const [uploading, setUploading] = useState(false);

  // uppy's 'file-removed' handler reset all of this; the dialog reopening is the
  // equivalent moment in React.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setCompress(false);
    setTargetWidth("100");
    setQuality("100");
    setUploading(false);
  }, [open]);

  // validateFile(): compression is only offered for images.
  const disableCompress = !file || !file.type.startsWith("image/");

  // validateTargetWidth() / validateQuality(). compressChanged() cleared both whenever
  // compress was switched off, so the errors only exist while compress is on.
  const targetWidthError = compress ? validateTargetWidth(targetWidth) : "";
  const qualityError = compress ? validateQuality(quality) : "";

  const uploadDisabled = !file || uploading || (compress && (!!targetWidthError || !!qualityError));

  async function upload() {
    if (!file || !attributeInstance) return;
    setUploading(true);
    try {
      // The file is posted as-is rather than round-tripped through a data URL and rebuilt
      // it byte-by-byte ("Create a proper binary File"). That was a workaround for
      // uppy's file wrapper; a real `File` from an <input type="file"> is already
      // binary, so it is posted directly — same bytes, same name, same type.
      const response = uuidValidate(attributeInstance.value)
        ? await backendService.patchFileByUUID(
            attributeInstance.value,
            file,
            compress,
            Number(targetWidth),
            Number(quality),
          )
        : await backendService.postFile(file, compress, Number(targetWidth), Number(quality));

      if (response) {
        const uuid = (response as { uuid?: string }).uuid;
        if (!uuid) throw new Error("upload response carried no uuid");
        eventBus.publish("fileUploaded", { attributeInstanceUuid: attributeInstance.uuid, fileUuid: uuid });
        attributeInstance.value = uuid;
        await metaUtility.setFile(uuid, file);
        setFile(null);
        setCompress(false);
        closeDialog("uploadFile");
      }
    } catch (error) {
      logger.log("File upload failed: " + describeError(error), "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("uploadFile")} maxWidth="sm" fullWidth>
      <DialogTitle>File: {attributeInstance?.value ?? ""}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button variant="outlined" component="label">
            Choose file
            <input
              hidden
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="upload-file-input"
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            {file ? `${file.name} (${file.type || "unknown type"})` : "No file selected"}
          </Typography>

          {compress && (
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Target Width"
                type="number"
                size="small"
                value={targetWidth}
                onChange={(e) => setTargetWidth(e.target.value)}
                error={!!targetWidthError}
                helperText={targetWidthError}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                label="Quality"
                type="number"
                size="small"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                error={!!qualityError}
                helperText={qualityError}
                slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <FormControlLabel
          sx={{ mr: "auto" }}
          control={
            <Checkbox
              checked={compress}
              disabled={disableCompress}
              onChange={(e) => setCompress(e.target.checked)}
            />
          }
          label="Compress Image"
        />
        <Button onClick={() => closeDialog("uploadFile")}>Cancel</Button>
        <Button
          onClick={() =>
            void upload().catch((err) => logger.log("File upload failed: " + describeError(err), "error"))
          }
          disabled={uploadDisabled}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
}
