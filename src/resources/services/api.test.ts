// Unit tests for `responseErrorMessage`: the server's own wording, pulled out of a
// failed response so a caller can tell two refusals with the same status apart.
//
// A PATCH of a scene instance is answered with 403 both for "no edit rights" and for a
// broken metamodel rule, and the body is the only thing that differs — persistency-
// handler picks the message it shows from it.
import { describe, it, expect } from "vitest";
import { responseErrorMessage } from "./api";

const FALLBACK = "Failed to update scene instance (403)";

describe("responseErrorMessage", () => {
  it("returns the message the server put in the body", async () => {
    // Verbatim from a live PATCH refused by the rule engine.
    const body = JSON.stringify({
      error:
        "The rule error was fired for the attribute ai-1: abc does not match the regex /^[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$/gim",
    });

    const message = await responseErrorMessage(new Response(body, { status: 403 }), FALLBACK);

    expect(message).toContain("does not match the regex");
  });

  it("falls back for a body that is empty, not JSON, or shaped differently", async () => {
    expect(await responseErrorMessage(new Response("", { status: 403 }), FALLBACK)).toBe(FALLBACK);
    expect(await responseErrorMessage(new Response("<html>502</html>", { status: 502 }), FALLBACK)).toBe(FALLBACK);
    expect(await responseErrorMessage(new Response(JSON.stringify({ detail: "?" }), { status: 403 }), FALLBACK)).toBe(FALLBACK);
    expect(await responseErrorMessage(new Response(JSON.stringify({ error: "" }), { status: 403 }), FALLBACK)).toBe(FALLBACK);
  });
});
