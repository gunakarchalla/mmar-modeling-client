import { describe, it, expect, beforeEach } from "vitest";
import { runExclusive, resetDrawLock } from "./draw-lock";

/**
 * The lane that keeps two vizRep draw sequences from interleaving over the shared
 * graphic context — a local click's and one started by a peer's change arriving on the
 * websocket. What matters is that a queued sequence does not begin until the running one
 * has fully settled, including across awaits and including when one of them throws.
 */

/** Records enter/exit around an awaited body, so overlap shows up in the trace. */
function traced(name: string, trace: string[], body: () => Promise<void>) {
  return async () => {
    trace.push(`${name}:enter`);
    await body();
    trace.push(`${name}:exit`);
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("draw-lock", () => {
  beforeEach(() => {
    resetDrawLock();
  });

  it("runs a queued sequence only after the running one has finished", async () => {
    const trace: string[] = [];

    // Both are started without awaiting the first — the real callers do exactly this:
    // the remote-add handler hands its draw over with `void` while a click is in flight.
    const first = runExclusive(traced("first", trace, async () => {
      await tick();
      await tick();
    }));
    const second = runExclusive(traced("second", trace, tick));

    await Promise.all([first, second]);

    expect(trace).toEqual(["first:enter", "first:exit", "second:enter", "second:exit"]);
  });

  it("lets the next sequence run after one throws, and still surfaces the failure", async () => {
    const trace: string[] = [];

    const failing = runExclusive(async () => {
      trace.push("failing:enter");
      await tick();
      throw new Error("vizrep blew up");
    });
    const next = runExclusive(traced("next", trace, tick));

    // A failed draw must not wedge the lane — every later refresh would stall behind it.
    await expect(failing).rejects.toThrow("vizrep blew up");
    await next;

    expect(trace).toEqual(["failing:enter", "next:enter", "next:exit"]);
  });

  it("serialises a burst of sequences in the order they were queued", async () => {
    const order: number[] = [];

    await Promise.all(
      [0, 1, 2, 3].map((index) =>
        runExclusive(async () => {
          // A longer body earlier in the burst must still not let a later one overtake.
          for (let i = 0; i < 4 - index; i++) await tick();
          order.push(index);
        }),
      ),
    );

    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("hands back the sequence's own result", async () => {
    await expect(runExclusive(async () => "drawn")).resolves.toBe("drawn");
  });
});
