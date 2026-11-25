import { useState } from "react";
import { Box, IconButton, Switch, Tooltip, Typography } from "@mui/material";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import CachedIcon from "@mui/icons-material/Cached";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { engine, globalObject, globalStateObject } from "@/engine";
import { logger } from "@/resources/services/logger";

// Resets the view, toggles the world between 2D (orthographic) and 3D (perspective),
// and switches the transform gizmo's mode. Every handler touches engine state that
// only exists after the canvas has mounted, hence the `engine.isInitialized` guards.
export default function CameraToggle() {
  // Local mirror of globalObject.threeDimensional so the Switch + the Rotate button
  // visibility re-render on toggle (the engine field is authoritative; default 2D).
  const [is3d, setIs3d] = useState(globalObject.threeDimensional);

  // Back to view mode, with the active camera's position, zoom and orbit controls
  // returned to their saved state.
  function resetView() {
    if (!engine.isInitialized) return;
    globalStateObject.setState(1);
    if (!globalObject.threeDimensional) {
      globalObject.normalCamera2d.position.set(0, 0, 10);
      globalObject.normalCamera2d.zoom = 1;
      globalObject.orbitControls2d.reset();
    } else {
      globalObject.normalCamera3d.position.set(0, 0, 10);
      globalObject.normalCamera3d.zoom = 1;
      globalObject.orbitControls3d.reset();
    }
  }

  // toggle(): flip 2D/3D, swap camera + orbit controls (via engine.setThreeDimensional
  // so the facade stays the single swap path), point transformControls at the new
  // camera, and reset the view on both sides. Mirrors camera-toggle.toggle.
  function toggle() {
    if (!engine.isInitialized) return;
    resetView();
    const next = !globalObject.threeDimensional;
    engine.setThreeDimensional(next);
    setIs3d(next);
    logger.log("CameraToggle toggle" + next, "info");
    globalObject.transformControls.camera = globalObject.camera;
    resetView();
  }

  function setMode(mode: "translate" | "rotate" | "scale") {
    if (!engine.isInitialized) return;
    globalObject.transformControls.setMode(mode);
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Tooltip title="Reset View">
        <IconButton size="small" onClick={resetView} aria-label="Reset View">
          <ViewInArIcon />
        </IconButton>
      </Tooltip>

      <Switch checked={is3d} onChange={toggle} size="small" aria-label="2D/3D" />
      <Typography variant="caption" sx={{ mr: 1 }}>
        2D/3D
      </Typography>

      <Box sx={{ borderLeft: "1px solid #bdbdbd", height: 24, mx: 0.5 }} />

      <Tooltip title="Translate">
        <IconButton size="small" onClick={() => setMode("translate")} aria-label="Translate">
          <OpenWithIcon />
        </IconButton>
      </Tooltip>
      {is3d && (
        <Tooltip title="Rotate">
          <IconButton size="small" onClick={() => setMode("rotate")} aria-label="Rotate">
            <CachedIcon />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Scale">
        <IconButton size="small" onClick={() => setMode("scale")} aria-label="Scale">
          <OpenInFullIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
