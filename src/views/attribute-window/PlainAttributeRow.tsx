import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { validate as uuidValidate } from "uuid";
import { metaUtility } from "@/resources/services/meta-utility";
import { backendService } from "@/resources/services/backend-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { numerise, stringifyNumber } from "@/resources/services/format";
import { useUiStore } from "@/resources/store/uiStore";
import {
  IMAGE_DEFAULT_VALUE,
  IMAGE_TO_DETECT_ATTRIBUTE_UUID,
  OBJECT_3D_ATTRIBUTE_UUID,
  OBJECT_3D_DEFAULT_VALUE,
} from "@/constants";
import {
  attributeTypeName,
  attributeValueMatchesRegex,
  reportMetamodelViolation,
} from "@/resources/services/metamodel-constraints";
import { applyFieldChange, type AttributeOwner, type EnhancedAttributeInstance } from "./attributeModel";

/**
 * One row of the plain (non-table, non-reference) attribute group — the branchy part
 * of `attribute-window.html` lines 50-137, plus the `deleteFile` / `downloadFile`
 * methods from `attribute-window.ts`.
 *
 * The branches below are INDEPENDENT, not an if/else chain, so a
 * single attribute can render more than one of them (a File attribute renders both the
 * text field showing its uuid AND the upload/delete/download buttons — the text-field
 * branch only excludes the Object-3D and Image attributes, not File). That is kept.
 *
 * Value editing follows a commit-on-blur pair: keystrokes update only local state (so
 * the input stays controlled), and the commit (blur / slider release / select) writes
 * the value onto the gds AttributeInstance and runs `applyFieldChange`, which publishes
 * the vizrep-update event and flags the scene dirty.
 *
 * A commit that the metamodel refuses does neither — see `commit` below.
 */
interface PlainAttributeRowProps {
  enhanced: EnhancedAttributeInstance;
  /** True when this attribute instance's meta attribute is of the File attribute type. */
  isFileAttribute: boolean;
  /** The instance that owns this attribute; needed to address the change to peers. */
  owner: AttributeOwner;
  /** Ask the window to rebuild (a file delete rewrites the value out of band). */
  onChanged: () => void;
}

export default function PlainAttributeRow({ enhanced, isFileAttribute, owner, onChanged }: PlainAttributeRowProps) {
  const { attributeInstance, facets, metaAttribute, uiType } = enhanced;
  const openDialog = useUiStore((s) => s.openDialog);
  const [value, setValue] = useState<string>(attributeInstance.value ?? "");

  // Re-sync when the window rebuilds with a different instance, or the value changed
  // underneath us (an upload dialog, or a remote edit from a collaborator).
  //
  // The mount run is skipped deliberately. `useState` above already seeded `value`
  // from the very same source, so re-setting it on mount cannot change anything —
  // except that React 19 flushes passive effects a tick later than React 18 did, so
  // the field is painted and can be typed into BEFORE this effect runs, and the
  // "harmless" reset then throws that first edit away. Remembering what was last
  // synced keeps the resync for genuine outside changes and drops the no-op.
  const syncedRef = useRef<{ instance: typeof attributeInstance; value: string } | null>(null);
  useEffect(() => {
    const incoming = attributeInstance.value ?? "";
    const synced = syncedRef.current;
    syncedRef.current = { instance: attributeInstance, value: incoming };
    if (synced === null) return;
    if (synced.instance === attributeInstance && synced.value === incoming) return;
    setValue(incoming);
  }, [attributeInstance, attributeInstance.value]);

  const isObject3d = attributeInstance.uuid_attribute === OBJECT_3D_ATTRIBUTE_UUID;
  const isImage = attributeInstance.uuid_attribute === IMAGE_TO_DETECT_ATTRIBUTE_UUID;
  const lowerUiType = (uiType ?? "").toLowerCase();

  /**
   * Write an edited value onto the attribute instance and save it — unless the
   * metamodel refuses it, in which case the field snaps back to the stored value and
   * the user gets the rejection snackbar.
   *
   * The value reaches the AttributeInstance HERE and nowhere else: a value the server's
   * rule engine refuses (letters in a Float attribute, say) used to sit on the instance
   * from the first keystroke, so the next autosave was answered with a 403 that rolled
   * the whole scene back — and the re-import behind that rollback is what produced the
   * "not authorized" alert and the burst of vizrep / transform-control / ray errors.
   *
   * Returns whether the value was accepted.
   */
  function commit(next: string): boolean {
    // A blur that changed nothing has neither a value to save nor a verdict to report.
    if (next === (attributeInstance.value ?? "")) return true;

    if (!attributeValueMatchesRegex(next, metaAttribute)) {
      reportMetamodelViolation(
        `"${next}" is not a valid ${attributeTypeName(metaAttribute)} value for ${attributeInstance.name}.`,
      );
      setValue(attributeInstance.value ?? "");
      return false;
    }

    attributeInstance.value = next;
    setValue(next);
    void applyFieldChange(attributeInstance, owner).catch((err) =>
      logger.log("attribute change failed: " + describeError(err), "error"),
    );
    return true;
  }

  // attribute-window.ts:73 — deleteFile
  async function deleteFile() {
    if (!uuidValidate(attributeInstance.value)) return;
    await backendService.deleteFileByUUID(attributeInstance.value);
    metaUtility.deleteFileByUUID(attributeInstance.value);
    // Re-fetched rather than reusing `metaAttribute` from the props: the delete path
    // only needs the default value, and shadowing the destructured one would confuse.
    const fileMetaAttribute = await metaUtility.getMetaAttribute(attributeInstance.uuid_attribute);
    attributeInstance.value = fileMetaAttribute!.default_value;
    setValue(attributeInstance.value ?? "");
    onChanged();
  }

  // attribute-window.ts:82 — downloadFile (local cache first, then the server)
  async function downloadFile() {
    if (!uuidValidate(attributeInstance.value)) return;
    let file: File | undefined = metaUtility.Files.get(attributeInstance.value)?.[0];

    // If file is not in local cache, fetch it from server
    if (!file) {
      try {
        file = await backendService.getFileByUUID(attributeInstance.value);
        if (!file) throw new Error("file not found");
        // Store it in local cache for future use
        await metaUtility.setFile(attributeInstance.value, file);
      } catch (error) {
        logger.log(`Failed to download file: ${describeError(error)}`, "error");
        return;
      }
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const showTextField = facets.length === 0 && !isObject3d && !isImage;
  const isSlider = facets.length > 0 && lowerUiType === "slider";
  const isDropdown = facets.length > 0 && lowerUiType === "dropdown";
  const valueIsFileUuid = uuidValidate(attributeInstance.value);

  return (
    <Box className="attribute" sx={{ mb: 1 }}>
      {/* if attributeInstance is not a boolean and not a 3D object */}
      {showTextField && (
        <TextField
          fullWidth
          size="small"
          label={attributeInstance.name}
          type={uiType || "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits without waiting for blur, so the scene vizrep updates
            // immediately, matching how a plain <input> commits on Enter.
            if (e.key === "Enter") {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
            }
          }}
          onBlur={() => commit(value)}
          helperText={uiType}
        />
      )}

      {/* only if attribute is of 'file' type */}
      {isFileAttribute && (
        <Box>
          {/* label flips on whether a file uuid is already stored */}
          <Button
            variant="outlined"
            sx={{ width: "100%" }}
            onClick={() => openDialog("uploadFile", { attributeInstance })}
          >
            {!valueIsFileUuid ? "Upload File" : "Replace File"}
          </Button>
          {valueIsFileUuid && (
            <Button
              variant="outlined"
              sx={{ width: "100%" }}
              onClick={() =>
                void deleteFile().catch((err) =>
                  logger.log("delete file failed: " + describeError(err), "error"),
                )
              }
            >
              Delete File
            </Button>
          )}
          {valueIsFileUuid && (
            <Button
              variant="outlined"
              sx={{ width: "100%" }}
              onClick={() =>
                void downloadFile().catch((err) =>
                  logger.log("download file failed: " + describeError(err), "error"),
                )
              }
            >
              Download
            </Button>
          )}
        </Box>
      )}

      {/* facets must be a value and uiType should be slider to make slider */}
      {isSlider && (
        <Box>
          <Box sx={{ ml: 1 }}>
            <Typography component="label" variant="body2">
              {attributeInstance.name}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              component="span"
              variant="body2"
              sx={{ whiteSpace: "nowrap", ml: 0.5, width: 25 }}
            >
              Val: {numerise(value, undefined, Number(facets[0]))}
            </Typography>
            <Slider
              sx={{ flex: 1 }}
              min={Number(facets[0])}
              max={Number(facets[1])}
              step={Number(facets[2]) || 1}
              value={numerise(value, undefined, Number(facets[0]))}
              onChange={(_e, next) => setValue(stringifyNumber(next as number))}
              onChangeCommitted={(_e, next) => commit(stringifyNumber(next as number))}
              aria-label={attributeInstance.name}
            />
          </Box>
        </Box>
      )}

      {/* facets must be a value and uiType should be dropdown to make dropdown */}
      {isDropdown && (
        <FormControl fullWidth required size="small">
          <InputLabel id={`attr-select-${attributeInstance.uuid}`}>{attributeInstance.name}</InputLabel>
          <Select
            labelId={`attr-select-${attributeInstance.uuid}`}
            label={attributeInstance.name}
            value={value}
            onChange={(e: SelectChangeEvent) => commit(e.target.value)}
          >
            {facets.map((facet) => (
              <MenuItem key={facet} value={facet}>
                {facet}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* only if attribute is 'Object 3D' */}
      {isObject3d && (
        <Button
          variant="outlined"
          sx={{ width: "100%" }}
          onClick={() => openDialog("uploadGltf", { attributeInstance })}
        >
          {attributeInstance.value !== OBJECT_3D_DEFAULT_VALUE ? "Replace 3D Object" : "Upload 3D Object"}
        </Button>
      )}

      {/* only if attribute is 'Image to detect' */}
      {isImage && (
        <Button
          variant="outlined"
          sx={{ width: "100%" }}
          onClick={() => openDialog("uploadImage", { attributeInstance })}
        >
          {attributeInstance.value !== IMAGE_DEFAULT_VALUE ? "Replace Image" : "Upload Image"}
        </Button>
      )}

      <Divider sx={{ borderColor: "silver", mt: 1 }} />
    </Box>
  );
}
