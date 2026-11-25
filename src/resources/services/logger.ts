import { useLogStore } from "@/resources/store/logStore";

/**
 * Logging entry point for framework-agnostic code (the engine and the services), so
 * they never import a store directly. It forwards to `logStore`, which prepends the
 * entry to the log window's list and raises the snackbar for an "error" status.
 */
export const logger = {
  log: (value: string, status: string): void => useLogStore.getState().log(value, status),
};

export type Logger = typeof logger;
