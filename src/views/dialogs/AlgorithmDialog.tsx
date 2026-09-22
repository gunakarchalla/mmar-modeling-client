import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { Procedure } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { historyService } from "@/resources/services/history-service";
import { procedureUtility } from "@/resources/services/procedure-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * Lists the procedures ("algorithms") stored in the metamodel and runs the chosen one's
 * code string.
 *
 * Two groups: INDEPENDENT procedures, which are server-wide and always listed, and the
 * procedures ASSIGNED to the open tab's scene type, which appear only while a tab is
 * open. Execution goes through `procedureUtility.execute(independentName,
 * dependentName)`, where an empty name means "skip this group".
 *
 * Opening the dialog is what triggers the fetch: the uiStore flag does both.
 */
export default function AlgorithmDialog() {
  const open = useUiStore((s) => s.dialogs.algorithm);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [procedureNames, setProcedureNames] = useState<string[]>([]);
  const [assignedProcedureNames, setAssignedProcedureNames] = useState<string[]>([]);
  const [independentAlgorithmChoice, setIndependentAlgorithmChoice] = useState<string>("");
  const [dependentAlgorithmChoice, setDependentAlgorithmChoice] = useState<string>("");

  const names = (procedures: Procedure[]) => procedures.map((procedure) => procedure.name);

  // Load both procedure groups and reduce them to the names the selects show.
  const getProcedures = useCallback(async () => {
    const procedures = await procedureUtility.getGeneralProcedures();
    setProcedureNames(names(procedures));

    // Assigned procedures only exist while a tab is open. Leaving the previous
    // tab's list on screen when none was open (its getProcedureNames() reset the arrays,
    // but only after this branch); clearing is the same intent without the staleness.
    if (globalObject.tabContext[globalObject.selectedTab] != undefined) {
      const assignedProcedures = await procedureUtility.getAssignedProcedures();
      setAssignedProcedureNames(names(assignedProcedures));
    } else {
      setAssignedProcedureNames([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setIndependentAlgorithmChoice("");
    setDependentAlgorithmChoice("");
    void getProcedures().catch((err) =>
      logger.log(`Could not load algorithms: ${describeError(err)}`, "error"),
    );
  }, [open, getProcedures]);

  async function executeIndependent() {
    await procedureUtility.execute(independentAlgorithmChoice, "");
    // A procedure is an arbitrary stored code string that may rewrite any part of the
    // scene, so the step carries no touched list and the whole scene gets diffed.
    historyService.record(`algorithm ${independentAlgorithmChoice}`);
  }

  async function executeDependent() {
    await procedureUtility.execute("", dependentAlgorithmChoice);
    historyService.record(`algorithm ${dependentAlgorithmChoice}`);
  }

  const run = (fn: () => Promise<void>) => () =>
    void fn().catch((err) => logger.log(`Algorithm failed: ${describeError(err)}`, "error"));

  return (
    <Dialog open={open} onClose={() => closeDialog("algorithm")} maxWidth="sm" fullWidth>
      <DialogTitle>Choose your algorithm:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="h6">Independent algorithms</Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="independent-algorithm-label">Select independent algorithm to run.</InputLabel>
            <Select
              labelId="independent-algorithm-label"
              label="Select independent algorithm to run."
              value={independentAlgorithmChoice}
              onChange={(e) => setIndependentAlgorithmChoice(e.target.value)}
            >
              {/* Empty entry, so the user can clear the choice. */}
              <MenuItem value="">
                <em>&nbsp;</em>
              </MenuItem>
              {procedureNames.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={run(executeIndependent)} disabled={!independentAlgorithmChoice}>
            run
          </Button>

          <Divider />

          <Typography variant="h6">Specific algorithms for this SceneType</Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="dependent-algorithm-label">Select dependent algorithm to run.</InputLabel>
            <Select
              labelId="dependent-algorithm-label"
              label="Select dependent algorithm to run."
              value={dependentAlgorithmChoice}
              onChange={(e) => setDependentAlgorithmChoice(e.target.value)}
            >
              <MenuItem value="">
                <em>&nbsp;</em>
              </MenuItem>
              {assignedProcedureNames.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={run(executeDependent)} disabled={!dependentAlgorithmChoice}>
            run
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => closeDialog("algorithm")}>close</Button>
      </DialogActions>
    </Dialog>
  );
}
