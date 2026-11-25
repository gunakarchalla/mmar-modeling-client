import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  add_table_cell,
  add_table_row,
  is_hidden_ui_component,
  is_multi_line_ui_component,
  is_read_only_ui_component,
  move_table_row,
  remove_table_row,
  table_columns_in_order,
  table_rows,
  UI_COMPONENT,
  type Attribute,
  type AttributeInstance,
  type Class,
  type ClassInstance,
  type PortInstance,
} from "@gds";
// ColumnStructure is not re-exported from the gds barrel, so it is deep-imported.
import type { ColumnStructure } from "@gds/models/meta/Metamodel_columns.structure";
import { globalObject, instanceCreationHandler } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { historyService } from "@/resources/services/history-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { numerise, stringifyNumber } from "@/resources/services/format";
import {
  attributeTypeName,
  attributeValueMatchesRegex,
  reportMetamodelViolation,
} from "@/resources/services/metamodel-constraints";
import { useUiStore } from "@/resources/store/uiStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { ROBOTIC_SYSTEM_SCENETYPE_UUID } from "@/constants";
import { READ_ONLY_FIELD_SX } from "./readOnlyField";

/**
 * Renders an attribute whose type declares `has_table_attribute` columns as an editable
 * grid. "Create Row" appends a row with a cell per column; each row can be moved up or
 * down and removed; a position without a cell (a column added to the type after the row
 * was created) offers to create it. The grid and every change to it go through the
 * table helpers of gds (Instance_tables), which hold the rules the server enforces.
 *
 * RECURSION: a column with `ui_component: 'button'` holds a nested table attribute and
 * opens another table dialog. uiStore can only express ONE open `tableAttribute` dialog,
 * so only the outermost is store-driven; nested levels are local state on the recursive
 * view component below. The demo metamodel really does nest — Robotic system → Joint has
 * button columns.
 *
 * A column whose attribute type carries a Role is a reference column, whatever its
 * `ui_component`, by the same rule the attribute window applies to attributes. Its cells
 * point at other instances through the attribute window's one reference dialog. That is
 * how an attribute holds several references: a reference attribute has room for one.
 *
 * UI COMPONENTS (see Metamodel_ui_components in gds): a column whose UI component is
 * "none" is not shown, though its cells still exist and new rows still get one. A
 * read-only column shows its cells greyed and unchangeable. A table ATTRIBUTE with a
 * read-only UI component opens the whole dialog read-only: every cell, the row
 * controls, "Create Row" and any nested table.
 */
interface TablePayload {
  attributeInstance: AttributeInstance;
  currentClassInstance?: ClassInstance | null;
  currentPortInstance?: PortInstance | null;
  readOnly?: boolean;
}

/** uiStore host for the outermost dialog. */
export default function TableAttributeDialog() {
  const open = useUiStore((s) => s.dialogs.tableAttribute);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.tableAttribute) as TablePayload | undefined;

  if (!payload?.attributeInstance) return null;

  return (
    <TableAttributeDialogView
      open={open}
      attributeInstance={payload.attributeInstance}
      currentClassInstance={payload.currentClassInstance ?? null}
      currentPortInstance={payload.currentPortInstance ?? null}
      readOnly={payload.readOnly ?? false}
      onClose={() => closeDialog("tableAttribute")}
    />
  );
}

interface TableAttributeDialogViewProps {
  open: boolean;
  attributeInstance: AttributeInstance;
  /** Old `@bindable attribute` — set for nested dialogs (`columns[j].attribute`). */
  attribute?: Attribute;
  currentClassInstance: ClassInstance | null;
  currentPortInstance: PortInstance | null;
  /** The table attribute is read-only: show the table, change nothing in it. */
  readOnly?: boolean;
  onClose: () => void;
}

function TableAttributeDialogView({
  open,
  attributeInstance,
  attribute,
  currentClassInstance,
  currentPortInstance,
  readOnly = false,
  onClose,
}: TableAttributeDialogViewProps) {
  const [columns, setColumns] = useState<ColumnStructure[]>([]);
  // A cell is undefined where a row has no cell for that column.
  const [rows, setRows] = useState<(AttributeInstance | undefined)[][]>([]);
  const [facetsAll, setFacetsAll] = useState<string[][]>([]);
  const [currentAttribute, setCurrentAttribute] = useState<Attribute | null>(null);
  // The robotic-system hybrid algorithm dispatches on the meta CLASS and meta ATTRIBUTE
  // names ("joint" / "origin"), so a cell edit needs the class as well as the attribute.
  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [nestedCell, setNestedCell] = useState<{ row: number; col: number } | null>(null);
  const bump = useSelectionStore((s) => s.bump);
  const openDialog = useUiStore((s) => s.openDialog);
  // The reference dialog edits a cell in place and bumps the revision, so subscribing is
  // what makes a reference cell show the value it now holds.
  useSelectionStore((s) => s.revision);

  // Meta information and table rows are loaded together (one pass, one render; the
  // called reset() + load(), and load() called both in sequence).
  const load = useCallback(async () => {
    const attributeUUID = attributeInstance.uuid_attribute;
    const currentClass = globalObject.current_class_instance
      ? await metaUtility.getMetaClass(globalObject.current_class_instance.uuid_class)
      : undefined;
    // A table attribute of the open SCENE INSTANCE (shown when nothing is selected) has
    // no current class to resolve its columns from — and `current_class_instance` may
    // still hold the last selected element, which does not carry this attribute either.
    // metaUtility searches the scene type first, so it covers both. Only reached when
    // the class lookup found nothing, where the dialog used to render an empty grid.
    const metaAttribute =
      attribute ??
      currentClass?.attributes.find((candidate) => candidate.uuid === attributeUUID) ??
      (await metaUtility.getMetaAttribute(attributeUUID));
    setCurrentAttribute(metaAttribute ?? null);
    setCurrentClass(currentClass ?? null);

    // The columns come from the type, so a table without rows still shows them. A column
    // whose UI component is "none" is left out of the grid; `table_rows` matches cells to
    // columns by attribute, so its cells simply drop out with it. New rows are still made
    // from the full column list (see createRow), so they keep a cell for it.
    const nextColumns = table_columns_in_order(metaAttribute?.attribute_type.has_table_attribute ?? []).filter(
      (column) => !is_hidden_ui_component(column.ui_component),
    );

    const nextFacets: string[][] = nextColumns.map((column) => {
      const uiComponent = (column.ui_component ?? "").toLowerCase();
      if ((uiComponent === "dropdown" || uiComponent === "slider") && column.attribute) {
        return column.attribute.facets.split("|");
      }
      return [];
    });

    setColumns(nextColumns);
    setFacetsAll(nextFacets);
    setRows(table_rows(attributeInstance, nextColumns));
  }, [attributeInstance, attribute]);

  useEffect(() => {
    if (!open) return;
    void load().catch((err) => logger.log("table attribute load failed: " + describeError(err), "error"));
  }, [open, load]);

  // dialog-table-attribute.ts:228 — fieldChange
  async function fieldChange(cell: AttributeInstance) {
    //update attribute value
    cell.value = cell.value.toString();

    eventBus.publish("checkForVizRepUpdateByAttributeInstance", cell);

    // In a robotic system scene, a cell edit may re-pose the URDF robot.
    const sceneInstance = await instanceUtility.getTabContextSceneInstance();
    if (sceneInstance?.uuid_scene_type == ROBOTIC_SYSTEM_SCENETYPE_UUID) {
      // `null` rather than `[null]` when nothing is selected — the same outcome (the service
      // only reads `classInstances[0]` in this branch, then returns) without lying to
      // the type.
      await hybridAlgorithmsService.checkHybridAlgorithms(
        cell,
        currentClassInstance ? [currentClassInstance] : null,
        null,
        currentClass,
        currentAttribute,
      );
    } else if (currentClassInstance) {
      await hybridAlgorithmsService.checkHybridAlgorithms(null, [currentClassInstance]);
    } else if (currentPortInstance) {
      await hybridAlgorithmsService.checkHybridAlgorithms(null, null, [currentPortInstance]);
    }

    //patch attribute instance
    //---------------------------------
    // !!! endpoints with instances/attributesInstances are not working
    // instead set the globalObjectInstance.doSceneInstancePatch to true
    //---------------------------------
    globalObject.doSceneInstancePatch = true;

    // The cell was mutated in place, so nothing React observes has changed. Bump the
    // selection store's revision to make the attribute window re-render.
    bump();

    // Undo step, keyed per cell so re-editing the same one does not stack steps.
    historyService.record("edit table cell", { coalesceKey: `table-cell:${cell.uuid}` });
  }

  /**
   * Write an edited cell value and save it — unless the metamodel refuses it, in which
   * case nothing is written and the user gets the rejection snackbar.
   *
   * A cell is validated against the META ATTRIBUTE OF ITS COLUMN, which is where its
   * attribute type (and so its regex) comes from. Cells are saved as part of the scene
   * instance, so a refused value fails the same autosave with the same 403 as a plain
   * attribute — see the note on `commit` in PlainAttributeRow.
   *
   * Returns whether the value was accepted, so the cell can put its field back.
   */
  function commitCell(cell: AttributeInstance, next: string, columnAttribute?: Attribute): boolean {
    // A blur that changed nothing has neither a value to save nor a verdict to report.
    if (next === (cell.value ?? "")) return true;

    if (!attributeValueMatchesRegex(next, columnAttribute)) {
      reportMetamodelViolation(
        `"${next}" is not a valid ${attributeTypeName(columnAttribute)} value for ${cell.name}.`,
      );
      return false;
    }

    cell.value = next;
    void fieldChange(cell).catch((err) =>
      logger.log("table attribute change failed: " + describeError(err), "error"),
    );
    return true;
  }

  /**
   * What every change to the table's rows or cells is followed by: the grid is re-read,
   * a vizRep drawn from the table is brought up to date, the scene is saved, the
   * attribute window re-renders, and the change is one step of the undo history.
   */
  async function afterTableChanged(label: string) {
    await load();
    eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);
    globalObject.doSceneInstancePatch = true;
    bump();
    historyService.record(label);
  }

  /** Same two steps as the attribute window: the dialog's context, then its flag. */
  function openReferenceCell(cell: AttributeInstance, column: ColumnStructure) {
    const payload = { attributeInstance: cell, metaAttribute: column.attribute };
    eventBus.publish("openReferenceDialog", payload);
    openDialog("referenceAttribute", payload);
  }

  // dialog-table-attribute.ts:166 — createRow
  async function createRow() {
    if (!currentAttribute) return;
    add_table_row(attributeInstance, await instanceCreationHandler.createTableRowCells(currentAttribute));
    await afterTableChanged("add table row");
  }

  async function removeRow(row: number) {
    remove_table_row(attributeInstance, row);
    await afterTableChanged("remove table row");
  }

  async function moveRow(from: number, to: number) {
    if (!move_table_row(attributeInstance, from, to)) return;
    await afterTableChanged("move table row");
  }

  async function createMissingCell(row: number, column: ColumnStructure) {
    add_table_cell(attributeInstance, row, await instanceCreationHandler.createTableCell(column));
    await afterTableChanged("create table cell");
  }

  /** Runs a row operation from a click, logging rather than dropping a failure. */
  function run(operation: Promise<void>, what: string) {
    void operation.catch((err) => logger.log(`${what} failed: ` + describeError(err), "error"));
  }

  const nestedAttributeInstance =
    nestedCell !== null ? rows[nestedCell.row]?.[nestedCell.col] : undefined;
  const nestedAttribute = nestedCell !== null ? columns[nestedCell.col]?.attribute : undefined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Table Attribute: {attributeInstance.name}
        {readOnly ? " (read only)" : ""}
      </DialogTitle>
      <DialogContent>
        <Table sx={{ border: "1.5px solid", width: "100%", tableLayout: "fixed" }} aria-describedby="Table">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.attribute?.uuid ?? column.sequence}
                  sx={{ border: "0.75px solid", width: 120, textAlign: "center" }}
                >
                  {column.attribute?.name}
                </TableCell>
              ))}
              <TableCell sx={{ border: "0.75px solid", width: 112, textAlign: "center" }}>Row</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row[0]?.uuid ?? i}>
                {row.map((cell, j) => {
                  const uiComponent = (columns[j]?.ui_component ?? "").toLowerCase();
                  const isReference = columns[j]?.attribute?.attribute_type?.role != null;
                  return (
                    <TableCell
                      key={cell?.uuid ?? `${i}-${j}`}
                      sx={{ border: "0.75px solid", width: 120, textAlign: "center" }}
                    >
                      {cell ? (
                        <TableAttributeCell
                          cell={cell}
                          uiComponent={uiComponent}
                          isReference={isReference}
                          readOnly={readOnly || is_read_only_ui_component(uiComponent)}
                          facets={facetsAll[j] ?? []}
                          onCommit={(next) => commitCell(cell, next, columns[j]?.attribute)}
                          onOpenNested={() => setNestedCell({ row: i, col: j })}
                          onOpenReference={() => openReferenceCell(cell, columns[j])}
                        />
                      ) : (
                        <IconButton
                          size="small"
                          aria-label={`create the ${columns[j]?.attribute?.name} cell of row ${i + 1}`}
                          disabled={readOnly}
                          onClick={() => run(createMissingCell(i, columns[j]), "create table cell")}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell sx={{ border: "0.75px solid", width: 112, textAlign: "center", whiteSpace: "nowrap" }}>
                  <IconButton
                    size="small"
                    aria-label={`move row ${i + 1} up`}
                    disabled={readOnly || i === 0}
                    onClick={() => run(moveRow(i, i - 1), "move table row")}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`move row ${i + 1} down`}
                    disabled={readOnly || i === rows.length - 1}
                    onClick={() => run(moveRow(i, i + 1), "move table row")}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`remove row ${i + 1}`}
                    disabled={readOnly}
                    onClick={() => run(removeRow(i), "remove table row")}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Ok</Button>
        <Button onClick={onClose}>Close</Button>
        <Button
          disabled={readOnly}
          onClick={() => run(createRow(), "create row")}
        >
          Create Row
        </Button>
      </DialogActions>

      {/* Nested table dialog (a column with ui_component 'button'). Inside a read-only
          table it is read-only too. */}
      {nestedAttributeInstance && (
        <TableAttributeDialogView
          open={nestedCell !== null}
          attributeInstance={nestedAttributeInstance}
          attribute={nestedAttribute}
          currentClassInstance={currentClassInstance}
          currentPortInstance={currentPortInstance}
          readOnly={readOnly}
          onClose={() => setNestedCell(null)}
        />
      )}
    </Dialog>
  );
}

/**
 * One cell: a text field, a slider, a dropdown, a nested-table button or a reference.
 *
 * A read-only cell (its column's UI component is read-only, or the whole table is)
 * shows its value but offers no way to change it: text is greyed, the slider and the
 * reference button are disabled and the dropdown does not open. A nested-table button
 * still opens its table, which is then read-only as well.
 */
function TableAttributeCell({
  cell,
  uiComponent,
  isReference,
  readOnly,
  facets,
  onCommit,
  onOpenNested,
  onOpenReference,
}: {
  cell: AttributeInstance;
  uiComponent: string;
  isReference: boolean;
  readOnly: boolean;
  facets: string[];
  /** Returns false when the metamodel refused the value; the field then snaps back. */
  onCommit: (next: string) => boolean;
  onOpenNested: () => void;
  onOpenReference: () => void;
}) {
  const [value, setValue] = useState<string>(cell.value ?? "");

  // Skips its mount run for the same reason as PlainAttributeRow's resync: `useState`
  // already seeded `value`, and under React 19 this effect can land after the cell has
  // been typed into, where the redundant reset would discard that edit.
  const syncedRef = useRef<{ instance: typeof cell; value: string } | null>(null);
  useEffect(() => {
    const incoming = cell.value ?? "";
    const synced = syncedRef.current;
    syncedRef.current = { instance: cell, value: incoming };
    if (synced === null) return;
    if (synced.instance === cell && synced.value === incoming) return;
    setValue(incoming);
  }, [cell, cell.value]);

  // Put the field back to the stored value when a commit was refused. The cell was
  // never written to, so the stored value is the last accepted one.
  function commit(next: string) {
    if (!onCommit(next)) setValue(cell.value ?? "");
  }

  // Shown as the attribute window shows a reference attribute: the reference's name.
  if (isReference) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" sx={{ flex: 1, textAlign: "left" }}>
          {cell.role_instance_from?.name ?? ""}
        </Typography>
        <Button variant="outlined" size="small" disabled={readOnly} onClick={onOpenReference}>
          select
        </Button>
      </Box>
    );
  }

  // "text" and "multi-line", and their read-only variants.
  const multiline = is_multi_line_ui_component(uiComponent);
  if (multiline || uiComponent === UI_COMPONENT.TEXT || uiComponent === UI_COMPONENT.TEXT_READ_ONLY) {
    return (
      <TextField
        size="small"
        multiline={multiline}
        maxRows={multiline ? 8 : undefined}
        value={value}
        onChange={readOnly ? undefined : (e) => setValue(e.target.value)}
        onBlur={readOnly ? undefined : () => commit(value)}
        sx={readOnly ? READ_ONLY_FIELD_SX : undefined}
        slotProps={{ input: { readOnly }, htmlInput: { "aria-label": cell.name } }}
      />
    );
  }

  if (uiComponent === UI_COMPONENT.SLIDER) {
    return (
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", width: "100%" }}>
        <Typography component="span" sx={{ mr: "2.2rem", whiteSpace: "nowrap", width: 25 }}>
          Val:{numerise(value, undefined, Number(facets[0]))}
        </Typography>
        <Slider
          sx={{ width: "100%" }}
          min={Number(facets[0])}
          max={Number(facets[1])}
          step={Number(facets[2]) || 1}
          value={numerise(value, undefined, Number(facets[0]))}
          disabled={readOnly}
          onChange={(_e, next) => setValue(stringifyNumber(next as number))}
          onChangeCommitted={(_e, next) => commit(stringifyNumber(next as number))}
          aria-label={cell.name}
        />
      </Box>
    );
  }

  if (uiComponent === UI_COMPONENT.DROPDOWN) {
    return (
      <FormControl fullWidth required size="small" sx={readOnly ? READ_ONLY_FIELD_SX : undefined}>
        <InputLabel id={`cell-${cell.uuid}`}>{cell.name}</InputLabel>
        <Select
          labelId={`cell-${cell.uuid}`}
          label={cell.name}
          value={value}
          readOnly={readOnly}
          onChange={(e) => commit(e.target.value)}
        >
          {facets.map((facet) => (
            <MenuItem key={facet} value={facet}>
              {facet}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  if (uiComponent === UI_COMPONENT.BUTTON) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Button variant="outlined" sx={{ width: "100%" }} onClick={onOpenNested}>
          {cell.name}
        </Button>
      </Box>
    );
  }

  return null;
}
