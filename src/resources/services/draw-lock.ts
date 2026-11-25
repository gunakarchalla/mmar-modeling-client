/**
 * A single-file lane for the vizRep draw sequences.
 *
 * Drawing a concept is a multi-await sequence over SHARED, non-reentrant state: the
 * `graphicContext` singleton (`object3D`, `rel_from_objects`, `current_instance_object`,
 * all wiped by `resetInstance()` at the end of a draw), `globalObject.current_class_instance`
 * — which is how `rel_graphic_line` and `drawVizRep_rel` learn WHICH instance they are
 * drawing — and `globalObject.selectedTab`, which the remote-add draw passes swap to the
 * tab an update belongs to and swap back afterwards.
 *
 * Nothing used to keep two such sequences apart. A local click runs one, and a peer's
 * change arriving over the Y.Doc starts another straight out of the websocket callback,
 * so the two interleave at any `await`: the second run overwrites `current_class_instance`
 * and then `resetInstance()`s the context the first is still drawing into, and the first
 * finishes by looking up `object3D[current_class_instance.uuid]` — now the peer's uuid,
 * now an empty map — and throwing on `undefined`.
 *
 * `runExclusive` queues a sequence behind whatever is already running. Locking is coarse
 * on purpose: these are short, and correctness beats overlap here.
 *
 * ONLY wrap a whole draw sequence, and never `await runExclusive(...)` from inside one —
 * the lane is not reentrant and would deadlock. The remote-add callers hand their work
 * over with `void`, which is what keeps that from happening.
 */

/** Resolves when the last queued sequence has settled. Rejections never propagate here. */
let tail: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  // Both arms run `task`: a previous sequence FAILING must not stall the lane.
  const result = tail.then(task, task);
  tail = result.catch(() => undefined);
  return result;
}

/** Test seam: drop any queued work so one test's lane cannot leak into the next. */
export function resetDrawLock(): void {
  tail = Promise.resolve();
}
