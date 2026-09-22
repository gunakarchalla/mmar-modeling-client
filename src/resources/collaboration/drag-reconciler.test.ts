// Unit tests for the live-drag reconciler. No THREE and no yjs: both helpers read a
// handful of TransformControls fields and write one number, so a plain literal stands
// in for the controls. The behaviour they encode is asserted end-to-end against real
// Y.Docs in y-mapping.test.ts ("merges a concurrent drag ...").
import { describe, it, expect } from "vitest";
import { locallyDraggedAxes, rebaseDragBaseline, AXES } from "./drag-reconciler";

const OBJECT_UUID = "obj-1";

/** Stands in for a TransformControls mid-drag. */
function fakeControls(over: Record<string, unknown> = {}) {
  return {
    object: { uuid: OBJECT_UUID },
    mode: "translate",
    axis: "X",
    dragging: true,
    space: "world",
    _positionStart: { x: 1, y: 2, z: 3 },
    ...over,
  };
}

const axesOf = (controls: unknown) => [...locallyDraggedAxes(controls, OBJECT_UUID)];

describe("locallyDraggedAxes", () => {
  it("reports the axes of the arrow the local user is holding", () => {
    expect(axesOf(fakeControls({ axis: "X" }))).toEqual(["x"]);
    expect(axesOf(fakeControls({ axis: "Y" }))).toEqual(["y"]);
    expect(axesOf(fakeControls({ axis: "XZ" }))).toEqual(["x", "z"]);
  });

  it("reports every axis for the free-move handle, so nothing merges under it", () => {
    expect(axesOf(fakeControls({ axis: "XYZ" }))).toEqual([...AXES]);
  });

  /**
   * In local space the gizmo rotates its offset into the object's frame, so a
   * single-arrow drag can move all three STORED components — per-axis ownership stops
   * meaning anything. Claiming everything degrades to last-writer-wins instead of
   * merging two values that were never expressed in the same frame.
   */
  it("claims every axis in local space rather than merging across frames", () => {
    expect(axesOf(fakeControls({ space: "local", axis: "X" }))).toEqual([...AXES]);
  });

  it("reports nothing when no translate drag of that object is in flight", () => {
    expect(axesOf(fakeControls({ dragging: false }))).toEqual([]);
    expect(axesOf(fakeControls({ mode: "rotate" }))).toEqual([]);
    expect(axesOf(fakeControls({ mode: "scale" }))).toEqual([]);
    expect(axesOf(fakeControls({ axis: null }))).toEqual([]);
    expect(axesOf(fakeControls({ object: { uuid: "someone-else" } }))).toEqual([]);
    expect(axesOf(fakeControls({ object: undefined }))).toEqual([]);
    expect(axesOf(undefined)).toEqual([]);
  });
});

describe("rebaseDragBaseline", () => {
  it("moves the pointer-down snapshot on one axis and leaves the others alone", () => {
    const controls = fakeControls();
    rebaseDragBaseline(controls, OBJECT_UUID, "y", 42);
    expect(controls._positionStart).toEqual({ x: 1, y: 42, z: 3 });
  });

  it("does not touch the baseline of a drag that is not this object's", () => {
    const controls = fakeControls({ object: { uuid: "someone-else" } });
    rebaseDragBaseline(controls, OBJECT_UUID, "y", 42);
    expect(controls._positionStart).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("is a no-op with no drag in flight, or on controls exposing no baseline", () => {
    const idle = fakeControls({ dragging: false });
    rebaseDragBaseline(idle, OBJECT_UUID, "y", 42);
    expect(idle._positionStart).toEqual({ x: 1, y: 2, z: 3 });

    expect(() => rebaseDragBaseline(fakeControls({ _positionStart: undefined }), OBJECT_UUID, "y", 42)).not.toThrow();
    expect(() => rebaseDragBaseline(undefined, OBJECT_UUID, "y", 42)).not.toThrow();
  });
});
