import { Box, IconButton, Tooltip, Button } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteIcon from "@mui/icons-material/Delete";
import { engine, deletionHandler } from "@/engine";
import { useAuthStore } from "@/resources/store/authStore";
import {
  selectCanRedo,
  selectCanUndo,
  selectRedoLabel,
  selectUndoLabel,
  useHistoryStore,
} from "@/resources/store/historyStore";
import { historyService } from "@/resources/services/history-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { isMacPlatform } from "@/resources/util/platform";
import CameraToggle from "./CameraToggle";
import AutoSave from "./AutoSave";
import UserLegend from "@/views/user-legend/UserLegend";

// Tooltip suffixes advertising each button's chord, matching the
// toolbar. The `aria-label`s stay bare ("undo", "redo") so accessible names do not
// drift with the platform — MUI would otherwise derive them from these titles.
const CHORDS = isMacPlatform() ? { undo: "⌘Z", redo: "⌘⇧Z" } : { undo: "Ctrl+Z", redo: "Ctrl+Shift+Z" };

// 1px light-grey separator between toolbar groups.
function VDivider() {
  return <Box sx={{ borderLeft: "1px solid #bdbdbd", height: 24, mx: 0.5 }} />;
}

// The main toolbar. Undo and redo step the ACTIVE tab's scene history, Delete drives
// the deletion handler, and Logout clears the session, which brings the sign-in dialog
// back. The zoom buttons are deliberately inert placeholders. AutoSave, CameraToggle
// and UserLegend are separate components; the legend renders nothing unless the active
// tab is shared.
export default function Toolbar() {
  const logout = useAuthStore((s) => s.logout);

  // Boolean/string selectors: the toolbar re-renders when a step becomes (un)available
  // or the described step changes, not on every recorded step.
  const canUndo = useHistoryStore(selectCanUndo);
  const canRedo = useHistoryStore(selectCanRedo);
  const undoLabel = useHistoryStore(selectUndoLabel);
  const redoLabel = useHistoryStore(selectRedoLabel);

  function onDelete() {
    logger.log("delete", "info");
    if (!engine.isInitialized) return;
    deletionHandler.onPressDelete();
  }

  function onUndo() {
    void historyService.undo().catch((err) => logger.log(`Undo failed: ${describeError(err)}`, "error"));
  }

  function onRedo() {
    void historyService.redo().catch((err) => logger.log(`Redo failed: ${describeError(err)}`, "error"));
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", width: "100%", height: "100%", px: 1 }}>
      <Button variant="outlined" size="small" onClick={() => logout()} sx={{ mr: 1 }}>
        Logout
      </Button>

      <Tooltip title="zoom in">
        <span>
          <IconButton size="small" disabled onClick={() => logger.log("zoomIn", "info")}>
            <ZoomInIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="zoom out">
        <span>
          <IconButton size="small" disabled onClick={() => logger.log("zoomOut", "info")}>
            <ZoomOutIcon />
          </IconButton>
        </span>
      </Tooltip>

      <VDivider />
      <AutoSave />
      <VDivider />

      {/* The <span> wrappers keep the tooltips working while the buttons are disabled
          (a disabled button fires no pointer events), which is also why each button
          carries its own aria-label — MUI would otherwise hang the tooltip's accessible
          name on the span. */}
      <Tooltip title={`undo${undoLabel ? ` ${undoLabel}` : ""} (${CHORDS.undo})`}>
        <span>
          <IconButton size="small" aria-label="undo" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={`redo${redoLabel ? ` ${redoLabel}` : ""} (${CHORDS.redo})`}>
        <span>
          <IconButton size="small" aria-label="redo" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon />
          </IconButton>
        </span>
      </Tooltip>

      <VDivider />
      <Tooltip title="delete">
        <IconButton size="small" onClick={onDelete}>
          <DeleteIcon />
        </IconButton>
      </Tooltip>
      <VDivider />

      <CameraToggle />

      <Box sx={{ flex: 1 }} />
      <UserLegend />
    </Box>
  );
}
