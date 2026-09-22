// @vitest-environment jsdom
//
// Component tests for the table-attribute dialog: the grid is built from the attribute
// type's column structure (in `sequence` order) by gds's table helpers, cell edits write
// through to the gds AttributeInstance, and the row actions — Create Row, move up / down,
// remove, and creating a missing cell — change the table by the table rules and are
// saved and recorded as one undo step each. Creating the cells themselves (defaults,
// nested tables) is the engine's, tested in instance-creation-handler.test.ts.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AttributeInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: { selectedTab: 0, doSceneInstancePatch: false, current_class_instance: undefined as any } as any,
  instanceCreationHandler: { createTableCell: vi.fn(), createTableRowCells: vi.fn() },
  instanceUtility: { getTabContextSceneInstance: vi.fn(async () => ({ uuid_scene_type: "st-1" })) },
  metaUtility: { getMetaClass: vi.fn(), getMetaAttribute: vi.fn() },
  // The undo/redo history service imports the @/engine/global-definition LEAF (a
  // WebGLRenderer at module scope), so it bypasses the `@/engine` barrel mock and has
  // to be mocked in its own right — same lesson as persistency-handler (P9),
  // shared-doc-service (P10) and hybrid-algorithms-service (P12).
  historyService: {
    record: vi.fn(),
    recordAfterTransformSync: vi.fn(async () => undefined),
    initScene: vi.fn(),
    setActiveScene: vi.fn(),
    dropScene: vi.fn(),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    reset: vi.fn(),
  },
}));
vi.mock("@/resources/services/history-service", () => ({ historyService: mocks.historyService }));

// P12: hybrid-algorithms-service imports the @/engine/global-definition LEAF directly,
// so it bypasses the `@/engine` barrel mock below and drags in a real WebGLRenderer at
// module scope — this whole file fails to load without this mock. (Same lesson as P9's
// persistency-handler, P10's shared-doc-service and P11's renderers.)
vi.mock("@/engine/hybrid-algorithms/hybrid-algorithms-service", () => ({
  hybridAlgorithmsService: { checkHybridAlgorithms: vi.fn(async () => undefined) },
}));
vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  instanceCreationHandler: mocks.instanceCreationHandler,
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));

import TableAttributeDialog from "./TableAttributeDialog";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { useLogStore } from "@/resources/store/logStore";
import { NOT_ALLOWED_MESSAGE } from "@/resources/services/metamodel-constraints";

/** The Float attribute type's regex, as the database ships it. */
const FLOAT_REGEX = "^[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$";

const TABLE_ATTRIBUTE_UUID = "attr-table";

function cellJson(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "cell-1",
    uuid_attribute: "col-attr-1",
    value: "cell value",
    name: "Cell",
    table_row: 0,
    table_attributes: [],
    ...overrides,
  };
}

/** The meta attribute of the table, carrying its two columns. */
function tableMetaAttribute() {
  return {
    uuid: TABLE_ATTRIBUTE_UUID,
    name: "BPMN Table",
    attribute_type: {
      uuid: "at-table",
      has_table_attribute: [
        {
          sequence: 1,
          ui_component: "text",
          attribute: {
            uuid: "col-attr-1",
            name: "Column A",
            default_value: "A default",
            facets: "",
            attribute_type: { uuid: "at-string", has_table_attribute: [] },
          },
        },
        {
          sequence: 2,
          ui_component: "dropdown",
          attribute: {
            uuid: "col-attr-2",
            name: "Column B",
            default_value: "x",
            facets: "x|y",
            attribute_type: { uuid: "at-enum", has_table_attribute: [] },
          },
        },
      ],
    },
  };
}

/** The same table with both columns plain text fields, so every cell renders a textbox. */
function textColumnsMetaAttribute() {
  const metaAttribute = tableMetaAttribute();
  metaAttribute.attribute_type.has_table_attribute[1].ui_component = "text";
  return metaAttribute;
}

/** Three full rows of the two-text-column table, stored last row first. */
function threeRows() {
  return [2, 1, 0].flatMap((row) => [
    cellJson({ uuid: `r${row}-a`, uuid_attribute: "col-attr-1", value: `row${row}-A`, table_row: row }),
    cellJson({ uuid: `r${row}-b`, uuid_attribute: "col-attr-2", value: `row${row}-B`, table_row: row }),
  ]);
}

/** The value of every cell text field, in document (row, then column) order. */
function cellValues(): string[] {
  return screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value);
}

/** The same table, but with a single column of the Float attribute type. */
function floatColumnMetaAttribute() {
  return {
    uuid: TABLE_ATTRIBUTE_UUID,
    name: "BPMN Table",
    attribute_type: {
      uuid: "at-table",
      has_table_attribute: [
        {
          sequence: 1,
          ui_component: "text",
          attribute: {
            uuid: "col-attr-1",
            name: "Column A",
            default_value: "0",
            facets: "",
            attribute_type: { uuid: "at-float", name: "Float", regex_value: FLOAT_REGEX, has_table_attribute: [] },
          },
        },
      ],
    },
  };
}

/** Open the dialog on a table attribute holding `cells`. */
function openWith(cells: Record<string, unknown>[]): AttributeInstance {
  const attributeInstance = AttributeInstance.fromJS({
    uuid: "ai-table",
    uuid_attribute: TABLE_ATTRIBUTE_UUID,
    name: "BPMN Table",
    value: "",
    table_attributes: cells,
  }) as AttributeInstance;
  useUiStore.setState({
    dialogs: { ...useUiStore.getState().dialogs, tableAttribute: true },
    dialogPayloads: { tableAttribute: { attributeInstance, currentClassInstance: null, currentPortInstance: null } },
  });
  return attributeInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    doSceneInstancePatch: false,
    current_class_instance: { uuid: "ci-1", uuid_class: "class-1" },
  });
  mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [tableMetaAttribute()] });
  mocks.metaUtility.getMetaAttribute.mockResolvedValue(undefined);
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue({ uuid_scene_type: "st-1" });
  let created = 0;
  const newCell = (column: any) => {
    created++;
    return AttributeInstance.fromJS({
      uuid: `new-cell-${created}`,
      uuid_attribute: column.attribute.uuid,
      name: column.attribute.name,
      value: `new ${column.attribute.name}`,
      table_attributes: [],
    }) as AttributeInstance;
  };
  mocks.instanceCreationHandler.createTableCell.mockImplementation(async (column: any) => newCell(column));
  mocks.instanceCreationHandler.createTableRowCells.mockImplementation(async (attribute: any) =>
    [...attribute.attribute_type.has_table_attribute].sort((a: any, b: any) => a.sequence - b.sequence).map(newCell),
  );
  useUiStore.setState({
    dialogs: Object.fromEntries(
      Object.keys(useUiStore.getState().dialogs).map((n) => [n, false]),
    ) as never,
    dialogPayloads: {},
  });
  useLogStore.setState({ logArray: [], snackbar: { open: false, message: "", severity: "info" } });
});

describe("TableAttributeDialog", () => {
  it("renders nothing when no table attribute is in the payload", () => {
    const { container } = render(<TableAttributeDialog />);
    expect(container.firstChild).toBeNull();
  });

  it("builds the grid from the column structure, in sequence order", async () => {
    openWith([cellJson({ uuid: "cell-1", value: "row1-A" }), cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" })]);

    render(<TableAttributeDialog />);

    await waitFor(() => expect(screen.getByText("Column A")).toBeTruthy());
    expect(screen.getByText("Column B")).toBeTruthy();
    expect(screen.getByText("Table Attribute: BPMN Table")).toBeTruthy();
    // one row of two cells: a text field and a dropdown
    expect(screen.getByDisplayValue("row1-A")).toBeTruthy();
  });

  it("places every cell under its own column, whatever order the cells arrive in", async () => {
    mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [textColumnsMetaAttribute()] });
    openWith([
      cellJson({ uuid: "r2-a", uuid_attribute: "col-attr-1", value: "row2-A", table_row: 1 }),
      cellJson({ uuid: "r1-b", uuid_attribute: "col-attr-2", value: "row1-B", table_row: 0 }),
      cellJson({ uuid: "r1-a", uuid_attribute: "col-attr-1", value: "row1-A", table_row: 0 }),
      cellJson({ uuid: "r2-b", uuid_attribute: "col-attr-2", value: "row2-B", table_row: 1 }),
    ]);

    render(<TableAttributeDialog />);

    await waitFor(() => expect(cellValues()).toEqual(["row1-A", "row1-B", "row2-A", "row2-B"]));
  });

  it("offers to create a missing cell, and creates it in its row and column", async () => {
    mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [textColumnsMetaAttribute()] });
    const attributeInstance = openWith([
      cellJson({ uuid: "r1-b", uuid_attribute: "col-attr-2", value: "row1-B", table_row: 0 }),
      cellJson({ uuid: "r2-a", uuid_attribute: "col-attr-1", value: "row2-A", table_row: 1 }),
      cellJson({ uuid: "r2-b", uuid_attribute: "col-attr-2", value: "row2-B", table_row: 1 }),
    ]);

    render(<TableAttributeDialog />);

    // Row 1's only cell stays in the second column, behind the button for the first.
    await waitFor(() => expect(cellValues()).toEqual(["row1-B", "row2-A", "row2-B"]));
    fireEvent.click(screen.getByRole("button", { name: "create the Column A cell of row 1" }));

    await waitFor(() => expect(cellValues()).toEqual(["new Column A", "row1-B", "row2-A", "row2-B"]));
    const created = attributeInstance.table_attributes.find((cell) => cell.value === "new Column A")!;
    expect([created.table_row, created.table_attribute_reference]).toEqual([0, attributeInstance.uuid]);
    expect(mocks.historyService.record).toHaveBeenCalledWith("create table cell");
  });

  it("removes a row and moves the rows below it up", async () => {
    mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [textColumnsMetaAttribute()] });
    const attributeInstance = openWith(threeRows());

    render(<TableAttributeDialog />);
    await waitFor(() => expect(cellValues()).toHaveLength(6));
    fireEvent.click(screen.getByRole("button", { name: "remove row 2" }));

    await waitFor(() => expect(cellValues()).toEqual(["row0-A", "row0-B", "row2-A", "row2-B"]));
    expect(attributeInstance.table_attributes.map((cell) => [cell.uuid, cell.table_row])).toEqual([
      ["r0-a", 0], ["r0-b", 0], ["r2-a", 1], ["r2-b", 1],
    ]);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    expect(mocks.historyService.record).toHaveBeenCalledWith("remove table row");
  });

  it("moves a row down and up", async () => {
    mocks.metaUtility.getMetaClass.mockResolvedValue({ uuid: "class-1", attributes: [textColumnsMetaAttribute()] });
    const attributeInstance = openWith(threeRows());

    render(<TableAttributeDialog />);
    await waitFor(() => expect(cellValues()).toHaveLength(6));
    // The first row cannot move up, nor the last down.
    expect((screen.getByRole("button", { name: "move row 1 up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "move row 3 down" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "move row 1 down" }));
    await waitFor(() => expect(cellValues()).toEqual(["row1-A", "row1-B", "row0-A", "row0-B", "row2-A", "row2-B"]));

    fireEvent.click(screen.getByRole("button", { name: "move row 3 up" }));
    await waitFor(() => expect(cellValues()).toEqual(["row1-A", "row1-B", "row2-A", "row2-B", "row0-A", "row0-B"]));

    expect(attributeInstance.table_attributes.find((cell) => cell.uuid === "r0-a")!.table_row).toBe(2);
    expect(mocks.historyService.record).toHaveBeenCalledWith("move table row");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("shows the columns of a table without rows, and adds a row to it", async () => {
    const attributeInstance = openWith([]);

    render(<TableAttributeDialog />);
    await waitFor(() => expect(screen.getByText("Column A")).toBeTruthy());
    expect(screen.getByText("Column B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create Row" }));

    await waitFor(() => expect(attributeInstance.table_attributes).toHaveLength(2));
    expect(attributeInstance.table_attributes.map((cell) => cell.table_row)).toEqual([0, 0]);
  });

  it("builds the grid from the meta attribute when no class owns it (a scene table attribute)", async () => {
    // Nothing selected: the attribute window is showing the open scene instance, so the
    // columns come from the scene type's attribute rather than a selected class.
    mocks.globalObject.current_class_instance = undefined;
    mocks.metaUtility.getMetaAttribute.mockResolvedValue(tableMetaAttribute());
    openWith([cellJson({ uuid: "cell-1", value: "row1-A" }), cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" })]);

    render(<TableAttributeDialog />);

    await waitFor(() => expect(screen.getByText("Column A")).toBeTruthy());
    expect(screen.getByDisplayValue("row1-A")).toBeTruthy();
    expect(mocks.metaUtility.getMetaAttribute).toHaveBeenCalledWith(TABLE_ATTRIBUTE_UUID);
  });

  it("commits a cell edit to the AttributeInstance and publishes the vizrep channel", async () => {
    const attributeInstance = openWith([
      cellJson({ uuid: "cell-1", value: "row1-A" }),
      cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" }),
    ]);
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<TableAttributeDialog />);
    const input = await screen.findByDisplayValue("row1-A");
    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.blur(input);

    await waitFor(() => expect(published).toHaveLength(1));
    sub.dispose();

    expect(attributeInstance.table_attributes[0].value).toBe("edited");
    expect(published[0].uuid).toBe("cell-1");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  // Cells are saved as part of the scene instance, so a cell value the rule engine
  // refuses fails the same autosave with the same 403 as a plain attribute. The cell is
  // checked against the attribute type of ITS COLUMN.
  it("refuses a cell value that breaks its column's regex, with the metamodel snackbar", async () => {
    mocks.metaUtility.getMetaClass.mockResolvedValue({
      uuid: "class-1",
      attributes: [floatColumnMetaAttribute()],
    });
    const attributeInstance = openWith([cellJson({ uuid: "cell-1", value: "1.5" })]);
    const published: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (p) => published.push(p));

    render(<TableAttributeDialog />);
    const input = await screen.findByDisplayValue("1.5");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    sub.dispose();

    expect(attributeInstance.table_attributes[0].value).toBe("1.5");
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
    expect(published).toHaveLength(0);
    expect((input as HTMLInputElement).value).toBe("1.5");
    expect(useLogStore.getState().snackbar.message).toBe(NOT_ALLOWED_MESSAGE);
  });

  it("Create Row appends a row of new cells, numbered after the last row", async () => {
    const attributeInstance = openWith([
      cellJson({ uuid: "cell-1", value: "row1-A" }),
      cellJson({ uuid: "cell-2", uuid_attribute: "col-attr-2", value: "x" }),
    ]);

    render(<TableAttributeDialog />);
    await screen.findByText("Column A");
    fireEvent.click(screen.getByRole("button", { name: "Create Row" }));

    await waitFor(() => expect(attributeInstance.table_attributes).toHaveLength(4));
    expect(mocks.instanceCreationHandler.createTableRowCells).toHaveBeenCalledTimes(1);
    expect(mocks.instanceCreationHandler.createTableRowCells.mock.calls[0][0].uuid).toBe(TABLE_ATTRIBUTE_UUID);

    // The new cells follow the first row, point at the table, and show in the grid.
    const [cellA, cellB] = attributeInstance.table_attributes.slice(2);
    expect([cellA.table_row, cellB.table_row]).toEqual([1, 1]);
    expect(cellA.table_attribute_reference).toBe(attributeInstance.uuid);
    await waitFor(() => expect(screen.getByDisplayValue("new Column A")).toBeTruthy());
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    expect(mocks.historyService.record).toHaveBeenCalledWith("add table row");
  });
});
