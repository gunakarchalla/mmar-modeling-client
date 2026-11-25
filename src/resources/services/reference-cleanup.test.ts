import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: { tabContext: [] as unknown[], selectedTab: 0 },
  expressionUtility: { checkForVisualizationUpdateByAttributeUUID: vi.fn(async () => {}) },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("./expression-utility", () => ({ expressionUtility: mocks.expressionUtility }));

import { referencedTargets, removeReferencesDroppedBySave, removeReferencesTo } from "./reference-cleanup";

const role = (target: string) => ({ uuid: `role-${target}`, uuid_has_reference_class_instance: target });

const referenceCell = (table: string, row: number, target: string) => ({
  uuid: `cell-${table}-${row}`,
  uuid_attribute: "column-reference",
  table_attribute_reference: table,
  table_row: row,
  value: `name of ${target}`,
  role_instance_from: role(target),
});

const noteCell = (table: string, row: number, value: string) => ({
  uuid: `note-${table}-${row}`,
  uuid_attribute: "column-note",
  table_attribute_reference: table,
  table_row: row,
  value,
});

function sceneWith(attributes: object[]): SceneInstance {
  return SceneInstance.fromJS({
    uuid: "scene",
    name: "Scene",
    uuid_scene_type: "scene-type",
    class_instances: [{ uuid: "owner", uuid_class: "owner-class", attribute_instance: attributes }],
    relationclasses_instances: [],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

const firstAttributeOf = (scene: SceneInstance) => scene.class_instances[0].attribute_instance[0];
/** The table as [row, value, the class instance the cell's role instance points at]. */
const rowsOf = (scene: SceneInstance) =>
  firstAttributeOf(scene).table_attributes.map((cell) => [
    cell.table_row,
    cell.value,
    cell.role_instance_from?.uuid_has_reference_class_instance ?? null,
  ]);
const openTabs = (...scenes: SceneInstance[]) => {
  mocks.globalObject.tabContext = scenes.map((sceneInstance) => ({ sceneInstance }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.globalObject.selectedTab = 0;
  mocks.globalObject.tabContext = [];
});

describe("removeReferencesTo", () => {
  it("clears a table cell that referenced what was deleted, and keeps its row", async () => {
    const scene = sceneWith([
      {
        uuid: "table",
        table_attributes: [
          referenceCell("table", 0, "kept-1"),
          referenceCell("table", 1, "gone"),
          referenceCell("table", 2, "kept-2"),
        ],
      },
    ]);
    openTabs(scene);

    await removeReferencesTo(["gone"]);

    expect(rowsOf(scene)).toEqual([
      [0, "name of kept-1", "kept-1"],
      [1, "", null],
      [2, "name of kept-2", "kept-2"],
    ]);
  });

  it("leaves the other cells of the row alone", async () => {
    const scene = sceneWith([
      { uuid: "table", table_attributes: [referenceCell("table", 0, "gone"), noteCell("table", 0, "a note")] },
    ]);
    openTabs(scene);

    await removeReferencesTo(["gone"]);

    expect(rowsOf(scene)).toEqual([
      [0, "", null],
      [0, "a note", null],
    ]);
  });

  it("reaches every open tab, not just the one the delete happened in", async () => {
    const otherScene = sceneWith([]);
    const referencingScene = sceneWith([{ uuid: "table", table_attributes: [referenceCell("table", 0, "gone")] }]);
    openTabs(otherScene, referencingScene);

    await removeReferencesTo(["gone"]);

    expect(rowsOf(referencingScene)).toEqual([[0, "", null]]);
  });

  it("clears a reference in a table nested in a table", async () => {
    const nested = {
      uuid: "details",
      uuid_attribute: "column-details",
      table_attribute_reference: "table",
      table_row: 0,
      value: "",
      table_attributes: [referenceCell("details", 0, "gone")],
    };
    const scene = sceneWith([{ uuid: "table", table_attributes: [nested] }]);
    openTabs(scene);

    await removeReferencesTo(["gone"]);

    const [cell] = firstAttributeOf(scene).table_attributes[0].table_attributes;
    expect([cell.value, cell.role_instance_from]).toEqual(["", null]);
    expect(referencedTargets(scene).size).toBe(0);
  });

  const plainReference = () => ({
    uuid: "plain",
    uuid_attribute: "meta-plain",
    assigned_uuid_class_instance: "owner",
    value: "name of gone",
    role_instance_from: role("gone"),
  });

  it("clears a reference outside a table, and redraws it on the active tab", async () => {
    const scene = sceneWith([plainReference()]);
    openTabs(scene);

    await removeReferencesTo(["gone"]);

    expect(firstAttributeOf(scene).value).toBe("");
    expect(firstAttributeOf(scene).role_instance_from).toBeNull();
    expect(mocks.expressionUtility.checkForVisualizationUpdateByAttributeUUID).toHaveBeenCalledWith(
      "owner",
      "meta-plain",
    );
  });

  it("redraws the instance owning a table when a reference in one of its cells is cleared", async () => {
    const table = {
      uuid: "table",
      uuid_attribute: "meta-table",
      assigned_uuid_class_instance: "owner",
      value: "",
      table_attributes: [noteCell("table", 0, "kept as it is"), referenceCell("table", 1, "gone")],
    };
    const scene = sceneWith([table]);
    openTabs(scene);

    await removeReferencesTo(["gone"]);

    expect(rowsOf(scene)).toEqual([
      [0, "kept as it is", null],
      [1, "", null],
    ]);
    // Through the table attribute: that is what a vizRep drawing the table names.
    expect(mocks.expressionUtility.checkForVisualizationUpdateByAttributeUUID).toHaveBeenCalledExactlyOnceWith("owner", "meta-table");
  });

  it("clears a reference on a tab that is not active without redrawing it", async () => {
    const scene = sceneWith([plainReference()]);
    openTabs(sceneWith([]), scene);

    await removeReferencesTo(["gone"]);

    expect(firstAttributeOf(scene).role_instance_from).toBeNull();
    expect(mocks.expressionUtility.checkForVisualizationUpdateByAttributeUUID).not.toHaveBeenCalled();
  });

  it("leaves references to anything else alone", async () => {
    const scene = sceneWith([{ uuid: "table", table_attributes: [referenceCell("table", 0, "kept")] }]);
    openTabs(scene);

    await removeReferencesTo(["gone"]);

    expect(referencedTargets(scene)).toEqual(new Set(["kept"]));
  });
});

describe("removeReferencesDroppedBySave", () => {
  it("clears what the server cleared in its answer, and nothing else", async () => {
    const cells = [referenceCell("table", 0, "gone"), referenceCell("table", 1, "kept")];
    const scene = sceneWith([{ uuid: "table", table_attributes: cells }]);
    openTabs(scene);
    const sent = referencedTargets(scene);
    const saved = sceneWith([
      { uuid: "table", table_attributes: [{ ...referenceCell("table", 0, "gone"), value: "", role_instance_from: null }, referenceCell("table", 1, "kept")] },
    ]);

    await removeReferencesDroppedBySave(sent, saved);

    expect(rowsOf(scene)).toEqual([
      [0, "", null],
      [1, "name of kept", "kept"],
    ]);
  });
});
