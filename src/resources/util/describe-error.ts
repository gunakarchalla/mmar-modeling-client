/**
 * Render an unknown caught value as a log-safe message.
 *
 * A caught value can be any type, not just an Error (three/WebGL init can throw
 * DOMExceptions, strings, etc.).
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    // Circular / non-serializable payload.
    return String(err);
  }
}
