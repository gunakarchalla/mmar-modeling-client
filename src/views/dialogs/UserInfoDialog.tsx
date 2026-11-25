import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useUiStore } from "@/resources/store/uiStore";
import { useStateStore } from "@/resources/store/stateStore";

/**
 * The help panel behind the state window's Info button: one section per interaction
 * mode, with the section for the CURRENT mode expanded.
 *
 * The active mode comes from `stateStore`, the engine's one-way mirror, so the panel
 * tracks it without reaching into the engine. The mode strings below must stay
 * byte-identical to `GlobalStateObject.stateNames` — they are compared, not displayed.
 *
 * "Report Problem" is an intentionally inert button: there is no destination to send a
 * report to. It is left visible rather than removed.
 */
const SELECTION_MODE = "SelectionMode (drag)";
const VIEW_MODE = "ViewMode";
const DRAWING_MODE = "DrawingMode (insert)";
const DRAWING_MODE_RELATIONCLASS = "DrawingModeRelationClass (line)";
const SIMULATION_MODE = "SimulationMode";

export default function UserInfoDialog() {
  const open = useUiStore((s) => s.dialogs.userInfo);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const activeState = useStateStore((s) => s.activeState);

  function cancel() {
    closeDialog("userInfo");
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>User Info</DialogTitle>
      <DialogContent>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Box
            component="section"
            sx={{ background: "#f9f9fb", p: 2, borderRadius: 3, boxShadow: 1, mb: 3 }}
          >
            <Typography
              variant="h6"
              sx={{ borderBottom: "2px solid #ccc", pb: 0.75, mb: 2 }}
            >
              🧭 Mode-Specific Information
            </Typography>

            {activeState === SELECTION_MODE && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  <strong>🎯 Selection Mode</strong>
                </Typography>
                <Typography variant="body2">
                  Drag and resize instances in the scene. Click an instance to select it.
                </Typography>
                <ul>
                  <li>
                    <strong>Left-click:</strong> Drag the object
                  </li>
                  <li>
                    <strong>Right-click:</strong> Scale the object
                  </li>
                  <li>
                    <strong>Middle-click:</strong> Rotate (3D view only)
                  </li>
                  <li>Use UI handles or arrow keys to adjust the object</li>
                  <li>Click or right-click empty canvas to exit</li>
                </ul>
              </Box>
            )}

            {activeState === DRAWING_MODE && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  <strong>✏️ Drawing Mode</strong>
                </Typography>
                <Typography variant="body2">
                  Select a class in the left panel, then click on an empty canvas area to add it.
                </Typography>
                <Typography variant="body2">
                  To draw a relationclass, select one from the panel.
                </Typography>
              </Box>
            )}

            {activeState === DRAWING_MODE_RELATIONCLASS && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  <strong>🔗 Relation Drawing Mode</strong>
                </Typography>
                <Typography variant="body2">
                  Select a relationclass, then click on a class instance to draw a relation.
                </Typography>
                <Typography variant="body2">
                  To go back to class drawing, just select a class from the panel.
                </Typography>
              </Box>
            )}

            {activeState === VIEW_MODE && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  <strong>👁️ View Mode</strong>
                </Typography>
                <Typography variant="body2">No class or relationclass selected.</Typography>
                <ul>
                  <li>
                    Select a class → <strong>Drawing Mode</strong>
                  </li>
                  <li>
                    Select a relationclass → <strong>Relation Drawing Mode</strong>
                  </li>
                  <li>
                    Click an instance → <strong>Selection Mode</strong>
                  </li>
                </ul>
              </Box>
            )}

            {activeState === SIMULATION_MODE && (
              <Box>
                <Typography variant="subtitle1">
                  <strong>🚀 Simulation Mode</strong>
                </Typography>
                <Typography variant="body2">
                  Click on a simulation button in the model to trigger its behavior.
                </Typography>
              </Box>
            )}
          </Box>

          <Divider />

          <Box component="section" sx={{ mt: 3 }}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>
                  <strong>🔄 2D/3D Mode</strong>
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <ul>
                  <li>🔛 Switch between 2D and 3D views using the toggle slider in the tools menu.</li>
                </ul>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>
                  <strong>📦 Create or Load Scene Instance</strong>
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <ul>
                  <li>
                    Select a SceneType from the left panel and click{" "}
                    <strong>Create New SceneInstance</strong>, or double-click its name.
                  </li>
                  <li>To load an existing one, expand a SceneType and double-click the desired instance.</li>
                </ul>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>
                  <strong>💾 Save, Download, and Import</strong>
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <ul>
                  <li>
                    <strong>File → Save Model:</strong> Save current scene
                  </li>
                  <li>
                    <strong>File → Export Model as .json:</strong> Download your scene
                  </li>
                  <li>
                    <strong>File → Import Model:</strong> Load a saved scene
                  </li>
                </ul>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>
                  <strong>🧰 General Actions</strong>
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <ul>
                  <li>
                    <strong>Zoom:</strong> Use mouse wheel or touchpad
                  </li>
                  <li>
                    <strong>Move:</strong> Right-click and drag to pan
                  </li>
                  <li>
                    <strong>Rotate:</strong> Middle-click and drag (3D only)
                  </li>
                  <li>
                    <strong>2D/3D View:</strong> Use the view toggle slider
                  </li>
                  <li>
                    <strong>Autosave:</strong> Use the autosave toggle slider to activate or
                    deactivate autosave to the DB
                  </li>
                </ul>
              </AccordionDetails>
            </Accordion>
          </Box>
        </Card>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        {/* Inert: there is no destination to report to. See the header. */}
        <Button onClick={() => undefined}>Report Problem</Button>
      </DialogActions>
    </Dialog>
  );
}
