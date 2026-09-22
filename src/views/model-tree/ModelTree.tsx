import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import type { ClassInstance, RelationclassInstance, SceneType } from "@gds";
import { interactionHandler } from "@/engine";
import { instanceUtility } from "@/resources/services/instance-utility";
import { metaUtility } from "@/resources/services/meta-utility";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useTabsStore } from "@/resources/store/tabsStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import { NAME_ATTRIBUTE_UUID } from "@/constants";

/**
 * The model tree: every object in the OPEN scene instance, grouped by its metaclass, with
 * relations in their own groups after the class groups. Clicking a row selects that
 * object on the canvas (gizmo + attribute window + selection box, exactly as a canvas
 * pick) and pans the camera to it — the point of the panel is to make objects in a large
 * scene reachable without hunting for their mesh.
 *
 * The list is derived from `instanceUtility.getTabContextSceneInstance()` — the same
 * in-place-mutated SceneInstance the engine holds — and rebuilt (debounced) on the bus
 * channels that signal its contents changed: `sceneInstanceMutated` (scene opened,
 * instance created or deleted, undo / redo), `remoteSceneInstanceChanged` for the active
 * tab (a collaborator's edit), `checkForVizRepUpdateByAttributeInstance` for the standard
 * Name attribute (a rename), `tabChanged` and `updateSceneGroup`. The active tab index is also
 * read reactively so switching tabs re-derives immediately. Selection and transforms are
 * deliberately NOT triggers: they fire on every click and drag and change no row.
 *
 * LeftNav keeps the panel mounted while its tab is hidden (`active` false). A trigger
 * then only marks the list stale, and it is rebuilt once the panel is shown again.
 *
 * Row labels are the value of the instance's standard Name attribute
 * (`NAME_ATTRIBUTE_UUID`, which every metamodel uses), falling back to the metaclass
 * name. Groups are keyed by metaclass uuid and named from the scene type, falling back
 * to the metaclass name `instanceCreationHandler` wrote into `instance.name`.
 */

interface TreeRow {
  uuid: string;
  label: string;
}

interface TreeGroup {
  /** Stable key for expand state + React — `class:<metaclass>` / `relation:<metaclass>`. */
  key: string;
  label: string;
  kind: "class" | "relation";
  rows: TreeRow[];
}

/** The value of the instance's standard Name attribute, or "" when it has none / it is blank. */
function nameAttributeValue(instance: ClassInstance | RelationclassInstance): string {
  const attributes = instance.attribute_instance ?? [];
  const nameAttribute = attributes.find((attribute) => attribute?.uuid_attribute === NAME_ATTRIBUTE_UUID);
  return nameAttribute?.value?.trim() ?? "";
}

function groupInstances(
  instances: (ClassInstance | RelationclassInstance)[],
  kind: "class" | "relation",
  metaclassNames: Map<string, string>,
): TreeGroup[] {
  const groups = new Map<string, TreeGroup>();
  for (const instance of instances) {
    const metaclassUuid = kind === "relation" ? (instance.uuid_relationclass ?? instance.uuid_class) : instance.uuid_class;
    const metaclassName = (metaclassUuid && metaclassNames.get(metaclassUuid)) || instance.name?.trim() || "";
    const key = `${kind}:${metaclassUuid || metaclassName}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: metaclassName || "(unnamed type)", kind, rows: [] };
      groups.set(key, group);
    }
    group.rows.push({
      uuid: instance.uuid,
      label: nameAttributeValue(instance) || metaclassName || `(${instance.uuid.slice(0, 8)})`,
    });
  }
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  for (const group of groups.values()) group.rows.sort(byLabel);
  return [...groups.values()].sort(byLabel);
}

// Hoisted so the memoised row below is not handed a new object on every render.
const rowSx = { pl: 4 } as const;
const labelStyle = { fontSize: "10pt" } as const;

/**
 * One object row. Memoised on primitive props, so a row is skipped both when a new
 * selection does not involve it and when a rebuild — which creates every TreeRow afresh,
 * and runs on every edit a collaborator makes — leaves its uuid and label as they were.
 */
const ModelTreeRow = memo(function ModelTreeRow({
  uuid,
  label,
  selected,
  onSelect,
}: {
  uuid: string;
  label: string;
  selected: boolean;
  onSelect: (uuid: string) => void;
}) {
  return (
    <ListItemButton sx={rowSx} selected={selected} onClick={() => onSelect(uuid)} data-uuid={uuid}>
      <ListItemText primary={<span style={labelStyle}>{label}</span>} />
    </ListItemButton>
  );
});

export default function ModelTree({ active = true }: { active?: boolean }) {
  const selectedTab = useTabsStore((s) => s.selectedTab);
  const selectedUuid = useSelectionStore((s) => s.selectedInstanceUuid);

  const [groups, setGroups] = useState<TreeGroup[]>([]);
  const [hasScene, setHasScene] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");

  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow rebuild landing after a newer one.
  const runIdRef = useRef(0);
  // Read by the bus handlers, which outlive the render that subscribed them.
  const activeRef = useRef(active);
  // Set when a trigger arrives while the panel is hidden.
  const staleRef = useRef(false);

  const rebuild = useCallback(async () => {
    const runId = ++runIdRef.current;
    // No tab open is answered here rather than by getTabContextSceneInstance, which adds
    // a log line every time it finds no scene.
    const sceneInstance =
      useTabsStore.getState().selectedTab < 0 ? undefined : await instanceUtility.getTabContextSceneInstance();
    if (!mountedRef.current || runId !== runIdRef.current) return;
    if (!sceneInstance) {
      setHasScene(false);
      setGroups([]);
      return;
    }

    // The scene type names the metaclasses. It also identifies the bendpoints, which live
    // in `class_instances` but are line geometry, not model objects: their metaclass
    // uuids are the `bendpoint` field of the scene type's relation classes.
    let sceneType: SceneType | undefined;
    try {
      sceneType = await metaUtility.getTabContextSceneType();
    } catch (err) {
      logger.log(`ModelTree: could not resolve scene type — ${describeError(err)}`, "info");
    }
    if (!mountedRef.current || runId !== runIdRef.current) return;

    const metaclassNames = new Map<string, string>();
    const bendpointClassUuids = new Set<string>();
    for (const metaclass of sceneType?.classes ?? []) metaclassNames.set(metaclass.uuid, metaclass.name);
    for (const relationclass of sceneType?.relationclasses ?? []) {
      metaclassNames.set(relationclass.uuid, relationclass.name);
      if (relationclass.bendpoint) bendpointClassUuids.add(relationclass.bendpoint);
    }

    const classInstances = (sceneInstance.class_instances ?? []).filter(
      (classInstance) => !bendpointClassUuids.has(classInstance.uuid_class),
    );
    const relationInstances = sceneInstance.relationclasses_instances ?? [];

    setHasScene(true);
    setGroups([
      ...groupInstances(classInstances, "class", metaclassNames),
      ...groupInstances(relationInstances, "relation", metaclassNames),
    ]);
  }, []);

  const scheduleRebuild = useCallback(() => {
    if (!activeRef.current) {
      staleRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void rebuild().catch((err) =>
        logger.log(`ModelTree rebuild failed: ${describeError(err)}`, "error"),
      );
    }, 50);
  }, [rebuild]);

  // Rebuild on mount and on the channels that signal the open scene's contents changed.
  // Handlers are never async — the bus does not await them.
  useEffect(() => {
    mountedRef.current = true;
    scheduleRebuild();

    const subs = [
      eventBus.subscribe("sceneInstanceMutated", scheduleRebuild),
      eventBus.subscribe("tabChanged", scheduleRebuild),
      eventBus.subscribe("updateSceneGroup", scheduleRebuild),
      eventBus.subscribe("remoteSceneInstanceChanged", ({ tabIndex }) => {
        if (tabIndex === useTabsStore.getState().selectedTab) scheduleRebuild();
      }),
      // Every committed attribute value, local or remote, is announced here.
      eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (attributeInstance) => {
        if (attributeInstance?.uuid_attribute === NAME_ATTRIBUTE_UUID) scheduleRebuild();
      }),
    ];
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      subs.forEach((sub) => sub.dispose());
    };
  }, [scheduleRebuild]);

  // Tab switches swap the scene without always publishing on the channels above.
  useEffect(() => {
    scheduleRebuild();
  }, [selectedTab, scheduleRebuild]);

  // Shown again: catch up on whatever changed while hidden.
  useEffect(() => {
    activeRef.current = active;
    if (active && staleRef.current) {
      staleRef.current = false;
      scheduleRebuild();
    }
  }, [active, scheduleRebuild]);

  const trimmedFilter = filter.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (!trimmedFilter) return groups;
    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.label.toLowerCase().includes(trimmedFilter)),
      }))
      .filter((group) => group.rows.length > 0);
  }, [groups, trimmedFilter]);

  const totalRows = useMemo(
    () => groups.reduce((sum, group) => sum + group.rows.length, 0),
    [groups],
  );

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Stable, so the memoised rows are not re-rendered by a new handler.
  const selectRow = useCallback((uuid: string) => {
    void interactionHandler
      .selectInstanceByUuid(uuid, { focusCamera: true })
      .catch((err) => logger.log(`ModelTree select failed: ${describeError(err)}`, "error"));
  }, []);

  if (!hasScene) {
    return (
      <Box sx={{ p: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Model tree
        </Typography>
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          Open a scene to see its objects here.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Model tree
      </Typography>
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mb: 0.5 }}>
        {totalRows} object{totalRows === 1 ? "" : "s"} — click one to select it on the canvas.
      </Typography>

      <TextField
        size="small"
        fullWidth
        placeholder="Filter objects…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 1 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: filter ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="clear filter" onClick={() => setFilter("")}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      {visibleGroups.length === 0 && (
        <Typography variant="caption" sx={{ fontStyle: "italic", opacity: 0.7 }}>
          {totalRows === 0 ? "This scene has no objects yet." : "No objects match the filter."}
        </Typography>
      )}

      <List dense disablePadding>
        {visibleGroups.map((group) => {
          const isOpen = expanded.has(group.key) || trimmedFilter.length > 0;
          return (
            <Fragment key={group.key}>
              <ListItemButton onClick={() => toggleExpand(group.key)} data-group={group.key}>
                <IconButton
                  size="small"
                  edge="start"
                  aria-label={isOpen ? "collapse" : "expand"}
                  sx={{ mr: 0.5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(group.key);
                  }}
                >
                  {isOpen ? <ExpandLess fontSize="inherit" /> : <ExpandMore fontSize="inherit" />}
                </IconButton>
                <ListItemText
                  primary={
                    <span style={labelStyle}>
                      {group.label}
                      {group.kind === "relation" && (
                        <span style={{ fontSize: "7pt", color: "#888", marginLeft: 4 }}>
                          relation
                        </span>
                      )}
                    </span>
                  }
                />
                <Chip label={group.rows.length} size="small" sx={{ height: 18, fontSize: "8pt" }} />
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {group.rows.map((row) => (
                    <ModelTreeRow
                      key={row.uuid}
                      uuid={row.uuid}
                      label={row.label}
                      selected={selectedUuid === row.uuid}
                      onSelect={selectRow}
                    />
                  ))}
                </List>
              </Collapse>
            </Fragment>
          );
        })}
      </List>
    </Box>
  );
}
