import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * `id` is a stable, monotonically increasing identity for the entry.
 *
 * Entries are prepended (newest first), so every existing row's ARRAY INDEX shifts by
 * one on each new entry. Keying the rendered rows by index therefore told React that
 * every row had changed and made it reconcile the whole (up to 500-row) list — each row
 * a MUI <Tooltip> — on every single log call. Keyed by `id`, an unchanged row keeps its
 * element and is skipped.
 */
export type LogEntry = { id: number; value: string; status: string };

/**
 * Cap on retained log entries. Every `log()` allocates a fresh array and re-renders the
 * LogWindow, which maps a heavy MUI <Tooltip> per entry, so an unbounded array makes a
 * bulk operation that logs thousands of times (a URDF import, say) O(n²) in both the
 * array copy and the rendered row count. The log is a live status panel rather than an
 * audit trail, so dropping the oldest rows is safe.
 */
const MAX_LOG_ENTRIES = 500;

export type SnackbarSeverity = "error" | "info" | "success" | "warning";

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: SnackbarSeverity;
}

interface LogState {
  logArray: LogEntry[];
  snackbar: SnackbarState;
  /** Prepend an entry; a status of "error" also raises the snackbar. */
  log: (value: string, status: string) => void;
  closeSnackbar: () => void;
  /**
   * Drop every entry and dismiss the snackbar (logout). The panel shows scene names and
   * operations, so it is the previous user's data as much as the canvas is.
   */
  clear: () => void;
}

/** Source of `LogEntry.id`; only ever incremented, never reset. */
let nextLogEntryId = 0;

export const useLogStore = create<LogState>((set) => ({
  logArray: [],
  snackbar: { open: false, message: "", severity: "info" },

  log: (value, status) => {
    if (status === "error") {
      console.error(value);
      set({ snackbar: { open: true, message: value, severity: "error" } });
    }
    // Newest first. Slicing before spreading keeps the copy — and the LogWindow render
    // behind it — bounded to MAX_LOG_ENTRIES instead of growing with every call.
    set((s) => ({ logArray: [{ id: nextLogEntryId++, value, status }, ...s.logArray.slice(0, MAX_LOG_ENTRIES - 1)] }));
  },

  closeSnackbar: () => set((s) => ({ snackbar: { ...s.snackbar, open: false } })),

  clear: () => set({ logArray: [], snackbar: { open: false, message: "", severity: "info" } }),
}));

/**
 * Throttled read of `logArray` for the LogWindow panel.
 *
 * `logArray` mutates once per `logger.log()` call. Bulk engine operations — most
 * notably mapping a URDF file onto a scene instance, which creates hundreds of
 * class/attribute instances and logs "created"/"done" for each — fire thousands of
 * log calls in a tight (micro-task) chain. Subscribing to `logArray` directly (a new
 * array reference every call) would re-render LogWindow, and reconcile its up-to-500
 * MUI <Tooltip> rows, once *per log entry* — seconds of wasted work on a single import.
 *
 * This hook instead coalesces bursts into a single React update: each store change
 * schedules at most one trailing flush (a macro-task), so all the log calls emitted
 * while the engine loop holds the thread collapse into one re-render once it yields.
 * The store itself stays synchronous, so `getState().logArray` is always current.
 */
export function useThrottledLogArray(): LogEntry[] {
  const [snapshot, setSnapshot] = useState<LogEntry[]>(() => useLogStore.getState().logArray);

  useEffect(() => {
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      scheduled = null;
      setSnapshot(useLogStore.getState().logArray);
    };

    const unsubscribe = useLogStore.subscribe((state, prev) => {
      // Only react to logArray changes (not snackbar toggles).
      if (state.logArray === prev.logArray) return;
      if (scheduled != null) return; // a flush is already pending -> coalesce
      scheduled = setTimeout(flush, 0);
    });

    // Catch up on anything logged between the initial render and this effect running.
    flush();

    return () => {
      unsubscribe();
      if (scheduled != null) clearTimeout(scheduled);
    };
  }, []);

  return snapshot;
}
