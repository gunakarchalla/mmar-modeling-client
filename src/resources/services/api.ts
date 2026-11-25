import { API_URL } from "@/config";

/**
 * Error carrying the HTTP status, for the few callers that must branch on it.
 *
 * Most backend-service methods log a failure and resolve to `undefined` / `[]` instead
 * of throwing, because their callers have nothing better to do with an error. The
 * exception is the share dialog, which must tell "User not found" (404) and "Cannot
 * remove the last delete owner" (409) apart from a generic failure — so the three
 * endpoints it calls throw this error rather than swallowing.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The message the server put in a failed response, if it carries one.
 *
 * Errors come back as `{ "error": "..." }` (see the server's error_handling
 * middleware). The text matters where two different refusals share a status code —
 * a PATCH is answered with 403 both for "no edit rights" and for a broken metamodel
 * rule — so the caller can tell the user which of the two happened. Falls back to
 * `fallback` for a body that is empty, not JSON, or shaped differently.
 */
export async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.text();
    if (!body) return fallback;
    const parsed: unknown = JSON.parse(body);
    const message = (parsed as { error?: unknown })?.error;
    return typeof message === "string" && message ? message : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The single fetch wrapper every request goes through: it prefixes `API_URL` and sets
 * the default headers. A JSON body gets `Content-Type: application/json` so the server
 * parses it; FormData must NOT — the browser sets that header itself, together with the
 * multipart boundary the server needs to read the upload. Authorization is added by the
 * caller.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isFormData = init.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "Fetch",
    ...(init.body != null && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  return fetch(`${API_URL}/${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });
}
