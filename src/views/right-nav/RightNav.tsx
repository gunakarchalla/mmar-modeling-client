import { Box } from "@mui/material";
import { useStateStore } from "@/resources/store/stateStore";
import LogWindow from "@/views/log-window/LogWindow";
import AttributeWindow from "@/views/attribute-window/AttributeWindow";
import SimulationWindow from "@/views/simulation-window/SimulationWindow";

// Right column: the simulation window in simulation mode and the attribute window in
// every other mode (the switch reads `stateStore`), with the log window underneath.
//
// The simulation window is mounted ONLY in simulation mode, so it rebuilds its sliders
// on every entry into that mode rather than showing a stale list.
export default function RightNav() {
  const activeState = useStateStore((s) => s.activeState);
  const isSimulation = activeState === "SimulationMode";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, minHeight: 0 }}>
        {isSimulation ? <SimulationWindow /> : <AttributeWindow />}
      </Box>
      <Box sx={{ flex: "0 0 40%", minHeight: 0, borderTop: "1px solid", borderColor: "divider" }}>
        <LogWindow />
      </Box>
    </Box>
  );
}
