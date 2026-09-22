import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Slider, Stack, Typography } from "@mui/material";
import { eventBus } from "@/resources/services/event-bus";
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import {
  applyJointValue,
  buildSimulationState,
  type JointControl,
} from "@/views/simulation-window/simulationModel";

/**
 * The simulation-mode panel: one slider per Joint instance of an open Robotic system
 * scene. Dragging a slider re-poses the cached URDF robot and pushes the recomputed
 * world poses back into the gds instances and the live three.js objects.
 *
 * The slider list is rebuilt on mount (RightNav mounts this only in simulation mode),
 * on `tabChanged`, and on a `sceneInstanceMutated` naming the ACTIVE scene — adding or
 * deleting instances changes which joints exist. The triggers are coalesced through a
 * 100 ms timer so a cascade of mutations rebuilds the list once.
 */
export default function SimulationWindow() {
  const [loading, setLoading] = useState(false);
  const [isRoboticSystemSceneType, setIsRoboticSystemSceneType] = useState(false);
  const [jointControls, setJointControls] = useState<JointControl[]>([]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow refresh landing after a newer one, and against a setState
  // after unmount.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const runId = ++runIdRef.current;
    setLoading(true);
    try {
      const state = await buildSimulationState();
      if (!mountedRef.current || runId !== runIdRef.current) return;
      setIsRoboticSystemSceneType(state.isRoboticSystemSceneType);
      setJointControls(state.jointControls);
    } finally {
      if (mountedRef.current && runId === runIdRef.current) setLoading(false);
    }
  }, []);

  /** Coalesces multiple refresh requests into a single refresh call. */
  const requestRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh().catch((err) =>
        logger.log(`Simulation window refresh failed: ${describeError(err)}`, "error"),
      );
    }, 100);
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;

    // Keep the simulation panel in sync with active tab changes.
    const tabChangedSub = eventBus.subscribe("tabChanged", () => requestRefresh());

    // Recompute the joint list when instances are added/removed from the active SceneInstance.
    const sceneInstanceMutatedSub = eventBus.subscribe("sceneInstanceMutated", (payload) => {
      void (async () => {
        const sceneInstance = await instanceUtility.getTabContextSceneInstance();
        const activeSceneInstanceUuid = sceneInstance?.uuid;
        if (!activeSceneInstanceUuid) return;

        // Only refresh if the mutation applies to the currently active SceneInstance.
        if (payload?.sceneInstanceUuid === activeSceneInstanceUuid) {
          requestRefresh();
        }
      })().catch((err) => logger.log(describeError(err), "error"));
    });

    requestRefresh();

    return () => {
      mountedRef.current = false;
      tabChangedSub.dispose();
      sceneInstanceMutatedSub.dispose();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [requestRefresh]);

  function onJointValueChanged(ctrl: JointControl, rawValue: number | number[]) {
    const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    void applyJointValue(ctrl, raw)
      .then((clamped) => {
        if (!mountedRef.current) return;
        setJointControls((prev) =>
          prev.map((c) => (c.instance.uuid === ctrl.instance.uuid ? { ...c, value: clamped } : c)),
        );
      })
      .catch((err) => logger.log(`Joint update failed: ${describeError(err)}`, "error"));
  }

  return (
    <Box sx={{ overflowY: "auto" }}>
      <Typography variant="subtitle2" gutterBottom>
        Simulation Controls
      </Typography>

      {loading && <Typography variant="body2">Loading…</Typography>}

      {!loading && isRoboticSystemSceneType && jointControls.length === 0 && (
        <Typography variant="body2">No Joint instances found in the active scene.</Typography>
      )}

      {!loading &&
        isRoboticSystemSceneType &&
        jointControls.map((ctrl) => (
          <Box key={ctrl.instance.uuid} sx={{ my: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography variant="body2">{ctrl.displayName}</Typography>
              <Typography variant="body2">Value: {ctrl.value}</Typography>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography variant="caption" sx={{ minWidth: 72 }}>
                Min: {ctrl.lower}
              </Typography>
              <Slider
                sx={{ flex: 1 }}
                size="small"
                aria-label={ctrl.displayName}
                min={ctrl.lower}
                max={ctrl.upper}
                step={ctrl.step}
                value={ctrl.value}
                disabled={ctrl.disabled}
                onChange={(_e, value) => onJointValueChanged(ctrl, value)}
              />
              <Typography variant="caption" sx={{ minWidth: 72 }}>
                Max: {ctrl.upper}
              </Typography>
            </Stack>
          </Box>
        ))}
    </Box>
  );
}
