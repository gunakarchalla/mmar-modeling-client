import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Divider, TextField, Typography } from "@mui/material";
import { globalObject, globalSelectedObject } from "@/engine";
import { eventBus } from "@/resources/services/event-bus";

/**
 * The "Position" tab of the attribute window: the X / Y / Z of the selected class or
 * port instance, shown and edited as plain number fields.
 *
 * The three.js mesh is the source of truth — the same value a gizmo drag writes. So a
 * commit here sets `mesh.position[axis]` and asks for a render; the animator's
 * coordinates-updater pass then copies the new position onto the gds instance, pushes
 * it to collaborators and marks the scene dirty, exactly as it does for a drag. The
 * `historyRecord` publish mirrors `transform-control-events` (one undo step per commit,
 * flushed after the transform sync).
 *
 * Only a field the user has typed into is ever committed. The mesh also moves under the
 * panel — a gizmo drag, an undo, a collaborator — so an untouched field can be stale,
 * and committing it on blur would move the object back. The fields are re-read from the
 * mesh whenever one of those announces itself, leaving any field being typed into alone.
 *
 * `coordinates_2d` is passed in only as the fallback display value for the frame before
 * the mesh is reachable (or in a non-engine test render); once the mesh is found its
 * `position` wins.
 */

type Axis = "x" | "y" | "z";
const AXES: Axis[] = ["x", "y", "z"];

interface PositionPanelProps {
  /** uuid of the selected class / port instance — also the uuid of its mesh. */
  instanceUuid: string;
  instanceName: string;
  /** The instance's stored `coordinates_2d`, used until the live mesh is resolved. */
  fallbackCoordinates: { x: number; y: number; z: number };
}

/** The selected mesh, but only when it is the one this panel is editing. */
function selectedMeshFor(instanceUuid: string) {
  // The field rather than getObject(), which also rebuilds the selection box.
  const mesh = globalSelectedObject.object;
  return mesh && mesh.uuid === instanceUuid ? mesh : null;
}

export default function PositionPanel({ instanceUuid, instanceName, fallbackCoordinates }: PositionPanelProps) {
  const readPosition = useCallback((): Record<Axis, number> => {
    const source = selectedMeshFor(instanceUuid)?.position ?? fallbackCoordinates;
    return { x: Number(source.x) || 0, y: Number(source.y) || 0, z: Number(source.z) || 0 };
  }, [instanceUuid, fallbackCoordinates]);

  // One draft string per axis so the field stays controlled while typing; the commit
  // parses it back to a number.
  const [draft, setDraft] = useState<Record<Axis, string>>(() => stringifyAll(readPosition()));
  // The axes typed into since they were last read from or written to the mesh.
  const editedRef = useRef(new Set<Axis>());

  /** Re-read the fields from the mesh. `discardEdits` also drops what is being typed. */
  const refresh = useCallback(
    (discardEdits: boolean) => {
      if (discardEdits) editedRef.current.clear();
      const position = stringifyAll(readPosition());
      const edited = new Set(editedRef.current);
      setDraft((previous) => ({
        x: edited.has("x") ? previous.x : position.x,
        y: edited.has("y") ? previous.y : position.y,
        z: edited.has("z") ? previous.z : position.z,
      }));
    },
    [readPosition],
  );

  // The channels that follow a move of the mesh from elsewhere: a finished gizmo drag or
  // nudge (and this panel's own commits) record a history step, undo / redo re-apply one,
  // and a collaborator's edit arrives as a remote change.
  useEffect(() => {
    const onMoved = () => refresh(false);
    const subs = [
      eventBus.subscribe("historyRecord", onMoved),
      eventBus.subscribe("sceneInstanceMutated", onMoved),
      eventBus.subscribe("remoteSceneInstanceChanged", onMoved),
    ];
    return () => subs.forEach((sub) => sub.dispose());
  }, [refresh]);

  function commit(axis: Axis) {
    if (!editedRef.current.has(axis)) return;
    editedRef.current.delete(axis);

    const raw = draft[axis].trim();
    const next = Number(raw);
    const mesh = selectedMeshFor(instanceUuid);
    if (raw !== "" && Number.isFinite(next) && mesh && mesh.position[axis] !== next) {
      mesh.position[axis] = next;
      // A port keeps itself inside its parent (the animator runs this every frame); apply
      // it now so the field shows where the port actually ends up.
      mesh.userData.update?.();

      // Keep the red selection box on the moved object, then let the render loop pick up
      // the delta: the animator writes it back onto the gds instance, syncs it to
      // collaborators and flags the scene dirty (see coordinates-updater).
      globalSelectedObject.getObject();
      globalObject.render = true;

      // One undo step per commit, flushed after the three.js -> gds transform sync so the
      // snapshot holds the new position rather than the old one.
      eventBus.publish("historyRecord", {
        label: "position",
        afterTransformSync: true,
        coalesceKey: `position:${instanceUuid}`,
      });
    }
    // Not a number, nothing selected, or no change: show the mesh's value again.
    setDraft((d) => ({ ...d, [axis]: stringifyAxis(readPosition()[axis]) }));
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1rem", fontWeight: 600 }}>
        Position
      </Typography>
      <Typography variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
        {instanceName}
      </Typography>

      {AXES.map((axis) => (
        <TextField
          key={axis}
          fullWidth
          size="small"
          type="number"
          label={axis.toUpperCase()}
          value={draft[axis]}
          onChange={(e) => {
            editedRef.current.add(axis);
            setDraft((d) => ({ ...d, [axis]: e.target.value }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(axis);
            }
          }}
          onBlur={() => commit(axis)}
          sx={{ mb: 1 }}
        />
      ))}

      <Button variant="outlined" size="small" onClick={() => refresh(true)} sx={{ mt: 0.5 }}>
        Refresh from canvas
      </Button>
      <Divider sx={{ borderColor: "silver", mt: 1 }} />
    </Box>
  );
}

function stringifyAxis(value: number): string {
  // Trim the float noise a drag leaves behind without forcing decimals on round values.
  return String(Math.round(value * 1e6) / 1e6);
}

function stringifyAll(position: Record<Axis, number>): Record<Axis, string> {
  return { x: stringifyAxis(position.x), y: stringifyAxis(position.y), z: stringifyAxis(position.z) };
}
