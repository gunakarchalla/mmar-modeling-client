/**
 * Which modifier key means "command" here: ⌘ on macOS, Ctrl on Windows/Linux.
 *
 * Shared with the metamodeling client so the
 * two clients advertise and obey the SAME undo/redo chords. That client needed the
 * detection to agree with Monaco's own (`vs/base/common/platform.js` tests the user
 * agent for a "Macintosh" substring); this client has no code editor, but the shared
 * heuristic keeps both apps in step for a user switching between them.
 */
export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.indexOf("Macintosh") >= 0;
}

/**
 * True when a keyboard event carries the platform's command modifier. Read at call
 * time rather than memoized at import: it is trivial to compute, and this keeps it
 * correct (and stubbable) regardless of import order.
 */
export function hasCommandModifier(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}
