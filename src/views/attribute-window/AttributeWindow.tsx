import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Divider, Tab, Tabs, TextField, Typography } from "@mui/material";
import type { AttributeInstance } from "@gds";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { eventBus, type UploadEventPayload } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { useUiStore } from "@/resources/store/uiStore";
import {
  buildAttributeGroups,
  emptyAttributeGroups,
  type AttributeGroups,
  type EnhancedAttributeInstance,
} from "./attributeModel";
import PlainAttributeRow from "./PlainAttributeRow";
import PositionPanel from "./PositionPanel";
import ReferenceAttributeDialog from "./ReferenceAttributeDialog";
import TableAttributeDialog from "./TableAttributeDialog";
import UploadFileDialog from "@/views/dialogs/UploadFileDialog";
import UploadGltfDialog from "@/views/dialogs/UploadGltfDialog";
import UploadImageDialog from "@/views/dialogs/UploadImageDialog";

/**
 * Shows the attribute instances of the selected class, port or relation class instance,
 * grouped into plain, table and reference attributes. With nothing selected it shows the
 * OPEN SCENE INSTANCE's own attributes instead — see the scene-fallback note on
 * `buildAttributeGroups`.
 *
 * Four things rebuild the panel:
 *  - `updateAttributeGui` — a new selection. The interaction handler publishes
 *    `removeAttributeGui` and then this, 10 ms later.
 *  - `removeAttributeGui` — a delayed rebuild rather than a clear: losing the selected
 *    element's attributes means falling back to the scene's, not showing an empty panel.
 *  - `tabChanged` — another tab means another scene instance, and a tab switch clears
 *    the selection without touching the attribute channels.
 *  - `selectionStore.revision` — an in-place attribute mutation that calls `bump()`
 *    re-renders the window without a bus round-trip. Selection IDENTITY still comes from
 *    the engine over the bus, so the store and the channels agree.
 */

export default function AttributeWindow() {
  const [groups, setGroups] = useState<AttributeGroups>(emptyAttributeGroups);
  const revision = useSelectionStore((s) => s.revision);
  const openDialog = useUiStore((s) => s.openDialog);

  // Tracks the latest rebuild so a slow one cannot overwrite a newer result, and so
  // the delayed reset can be cancelled by a rebuild that starts first.
  const runIdRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rebuild = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    const runId = ++runIdRef.current;
    void buildAttributeGroups()
      .then((next) => {
        if (runId === runIdRef.current) setGroups(next);
      })
      .catch((err) => logger.log("attribute window update failed: " + describeError(err), "error"));
  }, []);

  // A rebuild delayed by 10 ms. The delay lets the text meshes finish updating against
  // the previous values, and it lets the interaction handler's paired
  // `updateAttributeGui` — published 10 ms after `removeAttributeGui` — supersede this
  // one with an immediate `rebuild()`.
  //
  // It re-derives rather than blanking, because "the selected element's attributes are
  // gone" means "show the open scene instance's attributes", which only
  // `buildAttributeGroups` can decide. It still clears the window when there is nothing
  // at all to show, which is what it returns with no scene open.
  const delayedReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      rebuild();
    }, 10);
  }, [rebuild]);

  // An upload changed an attribute value underneath us, so the fields are rebuilt, and
  // the hybrid algorithms are run for that attribute instance — which is what swaps an
  // ObjectSpace Augmentation's mesh for the uploaded glTF, or resizes a Detectable's
  // plane for the uploaded image.
  const uploaded = useCallback(
    (payload: UploadEventPayload) => {
      rebuild();
      const attributeInstance = payload?.attributeInstance as AttributeInstance | undefined;
      if (!attributeInstance) return;
      void hybridAlgorithmsService
        .checkHybridAlgorithms(attributeInstance)
        .catch((err) => logger.log("hybrid algorithms failed: " + describeError(err), "error"));
    },
    [rebuild],
  );

  useEffect(() => {
    const subs = [
      eventBus.subscribe("updateAttributeGui", rebuild),
      eventBus.subscribe("removeAttributeGui", delayedReset),
      eventBus.subscribe("gltfUploaded", uploaded),
      eventBus.subscribe("imageUploaded", uploaded),
      // fileUploaded only rebuilds — it is not wired to the hybrid
      // algorithms, and its payload carries a fileUuid rather than the instance.
      eventBus.subscribe("fileUploaded", rebuild),
      eventBus.subscribe("tableAttributeChanged", rebuild),
      // Switching (or closing) a tab swaps the scene instance whose attributes the
      // fallback shows, and clears the selection without publishing on the attribute
      // channels — see tabActions.applyEngineTabSelection.
      eventBus.subscribe("tabChanged", rebuild),
    ];
    return () => {
      subs.forEach((s) => s.dispose());
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [rebuild, delayedReset, uploaded]);

  // Rebuild when the selection store changes (a new selection, or a bump()).
  useEffect(() => {
    rebuild();
  }, [revision, rebuild]);

  const { currentClassInstance, currentPortInstance, currentRelationclassInstance, currentSceneInstance } =
    groups;
  const hasDynamic = groups.plain.length !== 0 || groups.table.length !== 0 || groups.reference.length !== 0;

  // Position editing applies to a class or port instance — the things with a draggable
  // mesh behind them. A relation (a line) and the scene fallback have no single position.
  const positionInstance = currentClassInstance ?? currentPortInstance ?? null;

  // The instance the Position tab is open for. A new selection starts back on the
  // attributes panel — the position panel left open belonged to the previous object. It is
  // reset during render (React's pattern for adjusting state to changed props) rather than
  // in an effect, which would first render the new object with the old object's tab.
  const [positionTabFor, setPositionTabFor] = useState<string | null>(null);
  if (positionTabFor !== null && positionTabFor !== positionInstance?.uuid) setPositionTabFor(null);
  const showPosition = positionInstance !== null && positionTabFor === positionInstance.uuid;

  // `buildAttributeGroups` resolves the selected THREE object back to its class / port /
  // relationclass instance, and falls back to the open scene instance when nothing is
  // selected. All four are null only when no scene is open at all — then there is
  // nothing to display, so render nothing rather than an empty panel. All hooks above
  // run unconditionally, so this early return is safe.
  const hasInstance = Boolean(
    currentClassInstance || currentPortInstance || currentRelationclassInstance || currentSceneInstance,
  );
  if (!hasInstance) return null;

  // One reference dialog is shared by every reference button, so opening it means both
  // publishing the clicked attribute as its context and raising the dialog's flag.
  function openReferenceDialog(enhanced: EnhancedAttributeInstance) {
    eventBus.publish("openReferenceDialog", { attributeInstance: enhanced.attributeInstance });
    openDialog("referenceAttribute", { attributeInstance: enhanced.attributeInstance });
  }

  // No scene-instance field in the payload: the dialog only uses the owner to dispatch
  // the hybrid algorithms (class / port only), and it resolves the column structure of a
  // scene-owned table attribute through metaUtility instead — see its `load()`.
  function openTableDialog(enhanced: EnhancedAttributeInstance) {
    openDialog("tableAttribute", {
      attributeInstance: enhanced.attributeInstance,
      currentClassInstance,
      currentPortInstance,
    });
  }

  return (
    <Box sx={{ height: "100%", overflowY: "auto" }}>
      {/* For the given instance display the uuid */}
      {currentClassInstance && (
        <StaticAttributes uuid={currentClassInstance.uuid} name={currentClassInstance.name} />
      )}
      {currentRelationclassInstance && (
        <StaticAttributes
          uuid={currentRelationclassInstance.uuid}
          name={currentRelationclassInstance.name}
        />
      )}
      {currentPortInstance && (
        <StaticAttributes uuid={currentPortInstance.uuid} name={currentPortInstance.name} />
      )}
      {/* nothing selected: the open scene instance itself */}
      {currentSceneInstance && (
        <StaticAttributes
          uuid={currentSceneInstance.uuid}
          name={currentSceneInstance.name}
          nameLabel="Scene"
        />
      )}

      {/* Attributes vs. Position. The Position tab is only offered for a class or port
          instance — the things with a draggable mesh whose transform this can edit. */}
      {positionInstance && (
        <Tabs
          value={showPosition ? "position" : "attributes"}
          onChange={(_e, value: string) => setPositionTabFor(value === "position" ? positionInstance.uuid : null)}
          variant="fullWidth"
          sx={{ minHeight: 36, mb: 1 }}
        >
          <Tab value="attributes" label="Attributes" sx={{ minHeight: 36, textTransform: "none" }} />
          <Tab value="position" label="Position" sx={{ minHeight: 36, textTransform: "none" }} />
        </Tabs>
      )}

      {showPosition ? (
        <PositionPanel
          instanceUuid={positionInstance.uuid}
          instanceName={positionInstance.name}
          fallbackCoordinates={positionInstance.coordinates_2d}
        />
      ) : (
        <>
          {hasDynamic && (
            <Typography variant="h6" sx={{ mt: 0, mb: 1.5, p: 0, fontSize: "1rem", fontWeight: 600 }}>
              Dynamic Attributes
            </Typography>
          )}

          {/* for each attributeInstance that is not a tableattribute */}
          {groups.plain.map((enhanced) => (
            <PlainAttributeRow
              key={enhanced.attributeInstance.uuid}
              enhanced={enhanced}
              isFileAttribute={groups.fileTypeUuids.includes(enhanced.attributeInstance.uuid)}
              owner={groups}
              onChanged={rebuild}
            />
          ))}

          {groups.table.length !== 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
                Table Attributes
              </Typography>
              {groups.table.map((enhanced) => (
                <Button
                  key={enhanced.attributeInstance.uuid}
                  variant="outlined"
                  onClick={() => openTableDialog(enhanced)}
                  sx={{ width: "100%", mb: 0.5 }}
                >
                  {enhanced.attributeInstance.name}
                </Button>
              ))}
              <Divider sx={{ borderColor: "silver" }} />
            </Box>
          )}

          {groups.reference.length !== 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
                Reference Attributes
              </Typography>
              {groups.reference.map((enhanced) => (
                <Box key={enhanced.attributeInstance.uuid} sx={{ mb: 1 }}>
                  <TextField
                    slotProps={{ input: { readOnly: true } }}
                    size="small"
                    fullWidth
                    label={enhanced.attributeInstance.name}
                    value={enhanced.attributeInstance.role_instance_from?.name ?? ""}
                  />
                  {/* This button opens a dialog. All reference buttons share one dialog
                      view, so the context is passed when opening (see openReferenceDialog). */}
                  <Button
                    variant="outlined"
                    onClick={() => openReferenceDialog(enhanced)}
                    sx={{ width: "100%", wordBreak: "break-word", fontSize: ".7em" }}
                  >
                    {enhanced.attributeInstance.name}
                  </Button>
                </Box>
              ))}
              <Divider sx={{ borderColor: "silver" }} />
            </Box>
          )}
        </>
      )}

      {/* The dialogs below are rendered once and driven by uiStore, replacing the old
          per-attribute inline <mdc-dialog view-model.ref="..."> elements. */}
      <ReferenceAttributeDialog onChanged={rebuild} />
      <TableAttributeDialog />
      <UploadFileDialog />
      <UploadGltfDialog />
      <UploadImageDialog />
    </Box>
  );
}

/**
 * The "Static Attributes" block: read-only UUID and class name. `nameLabel` is the
 * one addition — the scene-instance block labels the same field "Scene", which is what
 * tells the user at a glance that these are the model's attributes, not an element's.
 */
function StaticAttributes({
  uuid,
  name,
  nameLabel = "Class",
}: {
  uuid: string;
  name: string;
  nameLabel?: string;
}) {
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
        Static Attributes
      </Typography>
      <TextField
        slotProps={{ input: { readOnly: true } }}
        size="small"
        label="UUID"
        value={uuid}
        sx={{ width: "100%" }}
      />
      <Divider sx={{ borderColor: "silver", my: 1 }} />
      <TextField
        slotProps={{ input: { readOnly: true } }}
        size="small"
        label={nameLabel}
        value={name ?? ""}
        sx={{ width: "100%" }}
      />
      <Divider sx={{ borderColor: "silver", my: 1 }} />
    </Box>
  );
}
