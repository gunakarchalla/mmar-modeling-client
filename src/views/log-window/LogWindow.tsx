import { memo, useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Icon,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { useThrottledLogArray, type LogEntry } from "@/resources/store/logStore";

// One row. Memoised, and the sx objects are hoisted to module constants, so a row whose
// entry has not changed is skipped entirely when a new entry arrives: a burst of log
// calls (the engine emits them from the render loop) otherwise reconciled every row —
// each a MUI <Tooltip>, which is not cheap — for every entry added.
const rowSx = {
  alignContent: "center",
  fontSize: "8pt",
  borderTop: "solid 1pt rgb(128,128,128)",
  px: 0.5,
  py: 0.25,
} as const;
const iconSx = { fontSize: "12pt", verticalAlign: "middle", mr: 0.5 } as const;

const LogEntryRow = memo(function LogEntryRow({ entry, time }: { entry: LogEntry; time: string }) {
  return (
    <Tooltip title={entry.value} placement="left">
      <Box sx={rowSx}>
        {time}:
        <br />
        <Icon sx={iconSx}>{entry.status}</Icon>
        <span>{entry.value}</span>
      </Box>
    </Tooltip>
  );
});

// Renders the shared log entries, newest first. Each row prints the CURRENT time
// rather than a per-entry timestamp — log entries carry no time of their own.
//
// Rows are keyed by `entry.id`, not by index: entries are PREPENDED, so every index
// shifts on each new entry and an index key would defeat the memo above by making every
// row look new.
function LogEntries() {
  const logArray = useThrottledLogArray();
  const time = new Date().toLocaleTimeString();
  return (
    <>
      {logArray.map((entry) => (
        <LogEntryRow key={entry.id} entry={entry} time={time} />
      ))}
    </>
  );
}

// A scrollable "Log" panel with an expand-to-dialog button. Newest entries are at the
// top, so the scroll position is pinned to the top as entries arrive.
export default function LogWindow() {
  const [open, setOpen] = useState(false);
  const logArray = useThrottledLogArray();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [logArray.length]);

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 1 }} ref={scrollRef}>
      <Typography
        variant="subtitle2"
        sx={{
          m: 0,
          p: 0,
          position: "sticky",
          top: 0,
          backgroundColor: "#f5f5f5e5",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        Log
        <IconButton size="small" onClick={() => setOpen(true)}>
          <OpenInFullIcon fontSize="small" />
        </IconButton>
      </Typography>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Log Window</DialogTitle>
        <DialogContent>
          <LogEntries />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} autoFocus>
            Ok
          </Button>
        </DialogActions>
      </Dialog>

      <LogEntries />
    </Box>
  );
}
