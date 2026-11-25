import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { SceneInstance, SceneType } from "@gds";
import {
  globalObject,
  globalClassObject,
  globalRelationclassObject,
  instanceCreationHandler,
  sceneInitiator,
} from "@/engine";
import { metaUtility } from "@/resources/services/meta-utility";
import { historyService } from "@/resources/services/history-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

// Creates a SceneInstance of a chosen SceneType.
// Opened via uiStore 'createNewScene' with an optional `{ sceneType }` payload
// (set when the user double-clicks a SceneType in the tree). Lets the user pick a
// SceneType + name/description and creates a new (empty) SceneInstance, opening it
// as a tab through instance-utility.createTabContextSceneInstance (the single
// mutation path). SceneTypes come from globalObject.sceneTypes (filled by
// SceneGroup.initTree).
//
// The new scene is not pushed into the tree by hand: SceneGroup owns the tree and
// re-scans the open tabs when this dialog publishes 'updateSceneGroup'.
interface Payload {
  sceneType?: SceneType;
}

export default function CreateNewSceneDialog() {
  const open = useUiStore((s) => s.dialogs.createNewScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneTypes, setSceneTypes] = useState<SceneType[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Refresh the list + apply any payload preselection each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const types = globalObject.sceneTypes ?? [];
    setSceneTypes(types);
    const payload = useUiStore.getState().getDialogPayload<Payload>("createNewScene");
    const preselected = payload?.sceneType;
    if (preselected) {
      setSelectedUuid(preselected.uuid);
      setName("new " + preselected.name);
    } else {
      setSelectedUuid("");
      setName("");
    }
    setDescription("");
  }, [open]);

  const selectedSceneType = sceneTypes.find((st) => st.uuid === selectedUuid);

  function onSelectionChange(event: SelectChangeEvent) {
    const uuid = event.target.value;
    setSelectedUuid(uuid);
    const st = sceneTypes.find((s) => s.uuid === uuid);
    if (st) setName("new " + st.name);
  }

  async function createNewScene() {
    if (selectedSceneType && metaUtility.checkIfSceneType(selectedSceneType)) {
      const sceneType = selectedSceneType;
      const sceneInstance = new SceneInstance(uuidv4(), sceneType.uuid);
      sceneInstance.name = name;
      sceneInstance.description = description;

      await sceneInitiator.sceneInit();
      await instanceUtility.createTabContextSceneInstance(sceneInstance);

      // Instantiate the scene type's own attributes, the way createClassInstance does
      // for a class — the attribute window shows them while nothing is selected. Runs
      // before the POST below so they are part of the scene's first save, and cannot
      // fail the scene creation itself.
      await instanceCreationHandler
        .createMissingSceneAttributeInstances(sceneInstance)
        .catch((error) =>
          logger.log(`Scene attribute instantiation failed: ${describeError(error)}`, "error"),
        );

      // Post the new sceneInstance to the DB if autoSave is enabled.
      if (globalObject.autoSave) {
        await persistencyHandler.persistSceneInstanceToDB();
      }

      // Set globalClassObject/globalRelationclassObject classes for the palettes.
      globalClassObject.initClasses();
      globalRelationclassObject.initRelationClasses();

      // Undo floor for the new tab: the empty scene it was created as.
      historyService.initScene(sceneInstance);

      logger.log(`SceneInstance with name ${sceneInstance.name} created`, "info");
    }

    eventBus.publish("updateSceneGroup");
    closeDialog("createNewScene");
  }

  function cancel() {
    logger.log("cancel button clicked", "close");
    closeDialog("createNewScene");
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Enter your value</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth required>
            <InputLabel id="create-scene-type-label">Select SceneType</InputLabel>
            <Select
              labelId="create-scene-type-label"
              label="Select SceneType"
              value={selectedUuid}
              onChange={onSelectionChange}
            >
              {sceneTypes.map((sceneType) => (
                <MenuItem key={sceneType.uuid} value={sceneType.uuid}>
                  {sceneType.name} | {sceneType.uuid}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedSceneType && (
            <>
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
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={createNewScene} disabled={!selectedSceneType}>
          Create new Scene
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
