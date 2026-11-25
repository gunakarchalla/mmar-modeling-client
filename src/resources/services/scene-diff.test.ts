// The diff rules behind undo/redo. These are the reason an undo in a SHARED scene does
// not wipe out a collaborator's work: a step is applied as a scoped diff, so only the
// instances the recorded action touched are ever moved back.
//
// Pure module — no engine, no Y.Doc, no mocks needed.
import { describe, it, expect } from "vitest";
import {
  SCENE_FIELDS_KEY,
  assignInPlace,
  diffScene,
  isEmptyDelta,
  serializeScene,
  touchedUuids,
  type SceneSnapshot,
} from "./scene-diff";

const classInstance = (uuid: string, overrides: Record<string, unknown> = {}) => ({
  uuid,
  name: `class-${uuid}`,
  coordinates_2d: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  custom_variables: {},
  attribute_instance: [],
  port_instance: [],
  ...overrides,
});

/** An attribute of the scene instance itself (what the attribute window edits). */
const sceneAttribute = (value: string, uuid = "scene-attr-1") => ({ uuid, value });

const scene = (overrides: Partial<SceneSnapshot> = {}): SceneSnapshot => ({
  uuid: "scene-1",
  name: "scene",
  description: "",
  class_instances: [],
  relationclasses_instances: [],
  ...overrides,
});

describe("touchedUuids", () => {
  it("names added, removed and modified instances", () => {
    const before = scene({ class_instances: [classInstance("a"), classInstance("b")] });
    const after = scene({
      class_instances: [
        classInstance("a"),
        classInstance("b", { coordinates_2d: { x: 5, y: 0, z: 0 } }),
        classInstance("c"),
      ],
    });

    expect(touchedUuids(before, after).sort()).toEqual(["b", "c"]);
    expect(touchedUuids(after, before).sort()).toEqual(["b", "c"]);
  });

  it("flags a scene-level rename with the scene sentinel", () => {
    expect(touchedUuids(scene(), scene({ name: "renamed" }))).toEqual([SCENE_FIELDS_KEY]);
  });

  // The scene instance's own attributes belong to the scene, so they ride along under
  // the same sentinel — without this, editing one is not a step at all and Ctrl+Z skips
  // straight past it.
  it("flags an edited scene-owned attribute with the scene sentinel", () => {
    const before = scene({ attribute_instances: [sceneAttribute("before")] });
    const after = scene({ attribute_instances: [sceneAttribute("after")] });

    expect(touchedUuids(before, after)).toEqual([SCENE_FIELDS_KEY]);
  });

  it("ignores a scene-owned attribute that did not change", () => {
    const before = scene({ attribute_instances: [sceneAttribute("same")] });
    const after = scene({ attribute_instances: [sceneAttribute("same")] });

    expect(touchedUuids(before, after)).toEqual([]);
  });

  it("returns nothing for identical snapshots", () => {
    expect(touchedUuids(scene({ class_instances: [classInstance("a")] }), scene({ class_instances: [classInstance("a")] }))).toEqual([]);
  });
});

describe("diffScene", () => {
  it("reports a move as a coordinates change with the target pose", () => {
    const from = scene({ class_instances: [classInstance("a", { coordinates_2d: { x: 9, y: 9, z: 0 } })] });
    const to = scene({ class_instances: [classInstance("a")] });

    const delta = diffScene(from, to);

    expect(delta.changed).toHaveLength(1);
    expect(delta.changed[0].coordinates).toEqual({ x: 0, y: 0, z: 0 });
    expect(delta.changed[0].rotation).toBeUndefined();
  });

  it("reports changed attribute values, ports included", () => {
    const from = scene({
      class_instances: [
        classInstance("a", {
          attribute_instance: [{ uuid: "attr-1", value: "new" }],
          port_instance: [{ uuid: "port-1", attribute_instances: [{ uuid: "attr-2", value: "new" }] }],
        }),
      ],
    });
    const to = scene({
      class_instances: [
        classInstance("a", {
          attribute_instance: [{ uuid: "attr-1", value: "old" }],
          port_instance: [{ uuid: "port-1", attribute_instances: [{ uuid: "attr-2", value: "old" }] }],
        }),
      ],
    });

    const delta = diffScene(from, to);

    expect(delta.changed[0].attributes).toEqual([
      { uuid: "attr-1", value: "old" },
      { uuid: "attr-2", value: "old" },
    ]);
  });

  it("reports custom-variable keys, scale included", () => {
    const from = scene({ class_instances: [classInstance("a", { custom_variables: { scale: { x: 2, y: 2, z: 1 } } })] });
    const to = scene({ class_instances: [classInstance("a", { custom_variables: { scale: { x: 1, y: 1, z: 1 } } })] });

    expect(diffScene(from, to).changed[0].customVariableKeys).toEqual(["scale"]);
  });

  it("splits additions and removals by kind", () => {
    const from = scene({ class_instances: [classInstance("a")], relationclasses_instances: [{ uuid: "r1" }] });
    const to = scene({ class_instances: [classInstance("b")], relationclasses_instances: [] });

    const delta = diffScene(from, to);

    expect(delta.added).toEqual([{ kind: "class", instance: expect.objectContaining({ uuid: "b" }) }]);
    // Order is not meaningful here — `history-service.applyDelta` picks its own
    // (relations before classes on the way out, classes before relations on the way in).
    expect(delta.removed).toEqual(
      expect.arrayContaining([
        { kind: "relation", uuid: "r1" },
        { kind: "class", uuid: "a" },
      ]),
    );
    expect(delta.removed).toHaveLength(2);
  });

  // The whole point of the scoped apply: an undo of MY step must leave a peer's
  // concurrent edit to another object alone.
  it("ignores instances outside the restrict set", () => {
    const from = scene({
      class_instances: [
        classInstance("mine", { coordinates_2d: { x: 9, y: 0, z: 0 } }),
        classInstance("theirs", { coordinates_2d: { x: 7, y: 0, z: 0 } }),
      ],
    });
    const to = scene({ class_instances: [classInstance("mine"), classInstance("theirs")] });

    const delta = diffScene(from, to, new Set(["mine"]));

    expect(delta.changed.map((change) => change.uuid)).toEqual(["mine"]);
  });

  it("keeps a scene rename out of a restricted diff that does not name it", () => {
    const from = scene({ name: "before", class_instances: [classInstance("a")] });
    const to = scene({ name: "after", class_instances: [classInstance("a")] });

    expect(diffScene(from, to, new Set(["a"])).sceneFields).toBeNull();
    expect(diffScene(from, to, new Set([SCENE_FIELDS_KEY])).sceneFields).toEqual({ name: "after" });
  });

  it("reports the scene's own attribute values under sceneFields", () => {
    const from = scene({ attribute_instances: [sceneAttribute("live value")] });
    const to = scene({ attribute_instances: [sceneAttribute("wanted value")] });

    const delta = diffScene(from, to);

    expect(delta.sceneFields).toEqual({ attributes: [{ uuid: "scene-attr-1", value: "wanted value" }] });
    expect(isEmptyDelta(delta)).toBe(false);
  });

  it("reports a scene attribute's table under sceneFields when its rows or cells differ", () => {
    const cell = (uuid: string, row: number, value: string) => ({ uuid, table_row: row, value });
    const table = (cells: object[]) => ({ uuid: "scene-table", value: "", table_attributes: cells });
    const from = scene({ attribute_instances: [table([cell("c1", 0, "a"), cell("c2", 1, "b")])] });
    const to = scene({ attribute_instances: [table([cell("c2", 0, "b"), cell("c1", 1, "a")])] });

    expect(touchedUuids(from, to)).toEqual([SCENE_FIELDS_KEY]);
    expect(diffScene(from, to).sceneFields).toEqual({
      attributes: [{ uuid: "scene-table", value: "", table_attributes: [cell("c2", 0, "b"), cell("c1", 1, "a")] }],
    });
    expect(isEmptyDelta(diffScene(from, from))).toBe(true);
  });

  it("keeps a scene attribute change out of a restricted diff that does not name the scene", () => {
    const from = scene({ attribute_instances: [sceneAttribute("before")], class_instances: [classInstance("a")] });
    const to = scene({ attribute_instances: [sceneAttribute("after")], class_instances: [classInstance("a")] });

    expect(diffScene(from, to, new Set(["a"])).sceneFields).toBeNull();
    expect(diffScene(from, to, new Set([SCENE_FIELDS_KEY])).sceneFields).toEqual({
      attributes: [{ uuid: "scene-attr-1", value: "after" }],
    });
  });

  it("is empty for identical scenes", () => {
    expect(isEmptyDelta(diffScene(scene(), scene()))).toBe(true);
  });
});

describe("assignInPlace", () => {
  it("mutates the target rather than replacing nested objects", () => {
    const target = { uuid: "a", coordinates_2d: { x: 1, y: 1, z: 1 } };
    const coordinates = target.coordinates_2d;

    assignInPlace(target, { uuid: "a", coordinates_2d: { x: 4, y: 5, z: 6 } });

    // Same object, new values — the engine holds references straight into this graph.
    expect(target.coordinates_2d).toBe(coordinates);
    expect(coordinates).toEqual({ x: 4, y: 5, z: 6 });
  });

  it("keeps array element identity by uuid, even when the order changed", () => {
    const first = { uuid: "1", value: "a" };
    const second = { uuid: "2", value: "b" };
    const target = { attribute_instance: [first, second] };

    assignInPlace(target, {
      attribute_instance: [
        { uuid: "2", value: "B" },
        { uuid: "1", value: "A" },
      ],
    });

    expect(target.attribute_instance[0]).toBe(second);
    expect(target.attribute_instance[1]).toBe(first);
    expect(second.value).toBe("B");
    expect(first.value).toBe("A");
  });

  it("adds elements that have no live counterpart and drops the ones that went away", () => {
    const kept = { uuid: "1", value: "a" };
    const target = { attribute_instance: [kept, { uuid: "2", value: "b" }] };

    assignInPlace(target, {
      attribute_instance: [
        { uuid: "1", value: "a" },
        { uuid: "3", value: "c" },
      ],
    });

    expect(target.attribute_instance).toHaveLength(2);
    expect(target.attribute_instance[0]).toBe(kept);
    expect(target.attribute_instance[1]).toEqual({ uuid: "3", value: "c" });
  });

  it("preserves the prototype so instanceof keeps holding", () => {
    class ClassInstanceLike {
      uuid = "a";
      name = "before";
    }
    const target = new ClassInstanceLike();

    assignInPlace(target, { uuid: "a", name: "after" });

    expect(target).toBeInstanceOf(ClassInstanceLike);
    expect(target.name).toBe("after");
  });

  it("removes keys the snapshot does not carry", () => {
    const target: Record<string, unknown> = { uuid: "a", stale: true };
    assignInPlace(target, { uuid: "a" });
    expect("stale" in target).toBe(false);
  });

  it("handles uuid-less rows (line points) positionally", () => {
    const target = { line_points: [{ Point: { x: 0 } }, { Point: { x: 1 } }] };
    assignInPlace(target, { line_points: [{ Point: { x: 5 } }] });
    expect(target.line_points).toEqual([{ Point: { x: 5 } }]);
  });

  // An STL mesh lives on the instance as an ArrayBuffer, which JSON flattens to `{}`.
  // Writing that back would leave the robot part with nothing to draw, so the key is
  // kept out of snapshots and left untouched by the apply.
  it("leaves engine-only live data (urdfVizRep) alone", () => {
    const mesh = { format: "stl", data: new ArrayBuffer(8), scale: [1, 1, 1] };
    const target: Record<string, unknown> = { uuid: "a", name: "before", urdfVizRep: mesh };

    assignInPlace(target, JSON.parse(serializeScene({ uuid: "a", name: "after", urdfVizRep: mesh } as never)));

    expect(target.urdfVizRep).toBe(mesh);
    expect(target.name).toBe("after");
  });

  it("keeps engine-only live data out of snapshots and therefore out of the diff", () => {
    const withMesh = (data: ArrayBuffer) =>
      scene({ class_instances: [classInstance("a", { urdfVizRep: { format: "stl", data, scale: [1] } })] });

    const before = JSON.parse(serializeScene(withMesh(new ArrayBuffer(8)) as never));
    const after = JSON.parse(serializeScene(withMesh(new ArrayBuffer(64)) as never));

    expect(before.class_instances[0].urdfVizRep).toBeUndefined();
    expect(touchedUuids(before, after)).toEqual([]);
  });
});
