import { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import PanoramaIcon from "@mui/icons-material/Panorama";
import InfoIcon from "@mui/icons-material/Info";
import { engine, globalStateObject } from "@/engine";
import { useStateStore } from "@/resources/store/stateStore";
import { useUiStore } from "@/resources/store/uiStore";

// Shows the active interaction mode (read from `stateStore`, the engine's one-way
// mirror), a button that returns the engine to view mode, and an Info button that
// opens the user-info dialog — the Info button blinks red on mount to draw a new
// user's attention to the interaction help behind it.
export default function StateWindow() {
  const activeState = useStateStore((s) => s.activeState);
  const openDialog = useUiStore((s) => s.openDialog);
  const [infoRed, setInfoRed] = useState(false);

  // Blink red 10 times, every 0.5s, then stop. Cleared on unmount so StrictMode's
  // double-mount cannot leave a stray interval behind.
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setInfoRed(i % 2 === 0);
      i++;
      if (i === 20) {
        setInfoRed(false);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // ViewMode (state 1). onStateChange touches transformControls/orbitControls, which
  // exist only after the engine has mounted — guard so a pre-mount click is a no-op
  // setState drives the three.js controls, which only exist after the canvas mounts.
  function viewClicked() {
    if (!engine.isInitialized) return;
    globalStateObject.setState(1);
  }

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        textAlign: "center",
        alignContent: "center",
        fontSize: "8pt",
      }}
    >
      State: {activeState || "—"}
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
        <Button size="small" onClick={viewClicked} sx={{ flex: 1 }} startIcon={<PanoramaIcon />}>
          View Mode
        </Button>
        <Button
          size="small"
          onClick={() => openDialog("userInfo")}
          sx={{ flex: 1, color: infoRed ? "red" : undefined }}
          startIcon={<InfoIcon />}
        >
          Info
        </Button>
      </Box>
    </Box>
  );
}
