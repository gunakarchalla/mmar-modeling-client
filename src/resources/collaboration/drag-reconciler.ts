import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

/**
 * Keeps a live local translate drag from fighting a peer's concurrent one.
 *
 * `coordinates_2d` is a Y.Map of three independent keys, so Yjs already merges an x-drag
 * against a y-drag per axis, provided each peer writes only the axes it moved (see the
 * coordinates case in y-mapping). That merge is still undone on screen, because three's
 * TransformControls recomputes the whole position from a pointer-down snapshot:
 *
 *     if ( axis.indexOf( 'Y' ) === - 1 ) this._offset.y = 0;
 *     object.position.copy( this._offset ).add( this._positionStart );
 *
 * On an axis the local gizmo does not own the offset is zeroed, pinning the object to
 * `_positionStart` for the whole drag: a peer's merged value lands on the mesh, is
 * reverted by the next pointer-move, and is republished as our value by the animator's
 * coordinates pass — a tug-of-war lasting as long as both users hold their arrows.
 * Moving the baseline is what makes the merge stick.
 *
 * Both helpers are no-ops unless a translate drag of that exact object is in flight, so
 * the ordinary path costs one property read.
 */

export type Axis = "x" | "y" | "z";

export const AXES: readonly Axis[] = ["x", "y", "z"];

/** The subset of TransformControls this module touches. */
type DragControls = Pick<TransformControls, "object" | "mode" | "axis" | "dragging" | "space"> & {
  /**
   * The pointer-down position snapshot, and the only baseline the translate branch adds
   * its offset to. Underscore-prefixed but a plain field rather than a `#private` one, so
   * it is reachable. Pinned to three 0.169 by package.json.
   */
  _positionStart?: { x: number; y: number; z: number };
};

/**
 * The axes the local user is currently authoring for `objectUuid` — the ones a remote
 * write must not move, because the pointer would only take them back.
 *
 * In local space the gizmo rotates its offset into the object's frame before adding it,
 * so a single-arrow drag can move all three stored components and per-axis ownership
 * stops meaning anything. Every axis is reported as owned there, which degrades to
 * last-writer-wins rather than to a wrong merge. The app never calls `setSpace`, so this
 * guards a future caller rather than the live path.
 */
export function locallyDraggedAxes(controls: unknown, objectUuid: string): Set<Axis> {
  const drag = controls as DragControls | undefined;
  if (!drag?.dragging || drag.mode !== "translate" || drag.object?.uuid !== objectUuid) return new Set();
  if (drag.space === "local") return new Set(AXES);
  const axis = drag.axis;
  if (!axis) return new Set();
  return new Set(AXES.filter((a) => axis.includes(a.toUpperCase())));
}

/**
 * Move the in-flight drag's baseline on one axis so the next pointer-move keeps the value
 * a peer just merged in instead of restoring the pre-drag one. Only called for an axis
 * `locallyDraggedAxes` reported as not owned, where the gizmo's offset is zero and the
 * baseline is therefore the whole of the rendered position.
 */
export function rebaseDragBaseline(controls: unknown, objectUuid: string, axis: Axis, value: number): void {
  const drag = controls as DragControls | undefined;
  if (!drag?.dragging || drag.mode !== "translate" || drag.object?.uuid !== objectUuid) return;
  const baseline = drag._positionStart;
  if (!baseline) return;
  baseline[axis] = value;
}
