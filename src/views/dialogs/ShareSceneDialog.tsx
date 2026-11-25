import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { jwtDecode } from "jwt-decode";
import type { SceneInstance } from "@gds";
import { globalObject } from "@/engine";
import { backendService, type AccessEntry } from "@/resources/services/backend-service";
import { ApiError } from "@/resources/services/api";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { useUiStore } from "@/resources/store/uiStore";
import type { AccessLevel } from "@/resources/collaboration/shared-doc-service";

/**
 * Manages the access list of a SceneInstance through the `sceneAccess*` endpoints. A
 * scene with at least two entries is what makes the scene tree attach a shared yjs
 * session when it is opened.
 *
 * Opened from the scene tree's "Share" context-menu item, and the `{ sceneInstance }`
 * payload is REQUIRED: the dialog does not pick a scene, it opens straight onto the
 * access list of the one the user right-clicked.
 */

interface Payload {
  sceneInstance?: SceneInstance;
}

interface JwtPayload {
  uuid: string;
  username: string;
  exp?: number;
}

/** Pill colour per access level. */
const PILL_COLOURS: Record<string, { bg: string; fg: string }> = {
  read: { bg: "#e3f2fd", fg: "#1565c0" },
  edit: { bg: "#e8f5e9", fg: "#2e7d32" },
  delete: { bg: "#fff3e0", fg: "#e65100" },
};

/** The access flags collapse to the highest level granted. */
function levelLabel(entry: AccessEntry): string {
  if (entry.delete_access) return "delete";
  if (entry.edit_access) return "edit";
  return "read";
}

function AccessPill({ level }: { level: string }) {
  const colours = PILL_COLOURS[level] ?? { bg: "#e0e0e0", fg: "#333" };
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 0.9,
        py: "1px",
        borderRadius: "10px",
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        bgcolor: colours.bg,
        color: colours.fg,
      }}
    >
      {level}
    </Box>
  );
}

export default function ShareSceneDialog() {
  const open = useUiStore((s) => s.dialogs.shareScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstance, setSceneInstance] = useState<SceneInstance | null>(null);
  const [existingAccess, setExistingAccess] = useState<AccessEntry[]>([]);
  const [levelChoice, setLevelChoice] = useState<AccessLevel>("read");
  const [usernameInput, setUsernameInput] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [currentUserUuid, setCurrentUserUuid] = useState("");
  const [loading, setLoading] = useState(false);

  const loadAccessList = useCallback(async (sceneInstanceUuid: string) => {
    setLoading(true);
    try {
      const [list, me] = await Promise.all([
        backendService.sceneAccessListGET(sceneInstanceUuid),
        backendService.sceneAccessMeGET(sceneInstanceUuid),
      ]);
      setExistingAccess(list ?? []);
      // Only a 'delete'-level holder may manage the list.
      setCanManage(me?.level === "delete");
    } catch {
      setExistingAccess([]);
      setCanManage(false);
    }
    setLoading(false);
  }, []);

  // Decode our own uuid (so we cannot revoke our own access), then
  // load the payload scene's access list. Re-runs per open, which is what the old
  // dialog's attached() + treeChanged() achieved between openings.
  useEffect(() => {
    if (!open) return;
    try {
      const token = globalObject.accessToken;
      if (token) setCurrentUserUuid(jwtDecode<JwtPayload>(token).uuid);
    } catch {
      // ignore decode errors
    }
    setExistingAccess([]);
    setCanManage(false);
    setErrorMsg("");
    setUsernameInput("");

    const payload = useUiStore.getState().getDialogPayload<Payload>("shareScene");
    const target = payload?.sceneInstance ?? null;
    setSceneInstance(target);
    if (!target) {
      logger.log("Share dialog opened without a SceneInstance — nothing to share", "error");
      return;
    }
    void loadAccessList(target.uuid);
  }, [open, loadAccessList]);

  // The status branches are why backend-service throws ApiError for
  // these endpoints rather than swallowing (see api.ts → ApiError).
  async function add() {
    if (!usernameInput.trim() || !sceneInstance) {
      setErrorMsg("Username is required");
      return;
    }
    setErrorMsg("");
    try {
      const user = await backendService.userByUsernameGET(usernameInput.trim());
      const entry = await backendService.sceneAccessPOST(sceneInstance.uuid, {
        uuid_user: user.uuid,
        access: levelChoice,
      });
      setExistingAccess((prev) => {
        const index = prev.findIndex((a) => a.uuid_user === user.uuid);
        if (index >= 0) {
          const next = [...prev];
          next[index] = entry;
          return next;
        }
        return [...prev, entry];
      });
      setUsernameInput("");
      logger.log(
        `Granted ${levelChoice} access to ${user.username} on scene ${sceneInstance.uuid}`,
        "info",
      );
      // Tell an already-open tab for this scene to (re)check shared mode, so the collab
      // session attaches and the presence icon appears without a window reload. Harmless
      // when the scene isn't open, or when it's already shared (the handler no-ops).
      eventBus.publish("sceneAccessGranted", { sceneInstanceUuid: sceneInstance.uuid });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      if (status === 404) setErrorMsg("User not found");
      else if (status === 409) setErrorMsg("Cannot remove the last delete owner");
      else setErrorMsg("An error occurred while granting access");
    }
  }

  // Revoke one user's access.
  async function removeAccess(entry: AccessEntry) {
    if (!sceneInstance) return;
    try {
      await backendService.sceneAccessDELETE(sceneInstance.uuid, entry.uuid_user);
      setExistingAccess((prev) => prev.filter((a) => a.uuid_user !== entry.uuid_user));
      logger.log(`Revoked access for ${entry.username} on scene ${sceneInstance.uuid}`, "info");
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      if (status === 409) setErrorMsg("Cannot remove the last delete owner");
      else setErrorMsg("An error occurred while revoking access");
    }
  }

  // Clear the form, then close (the button also carries
  // data-mdc-dialog-action="cancel", which is what actually dismissed the dialog).
  function cancel() {
    setUsernameInput("");
    setErrorMsg("");
    closeDialog("shareScene");
  }

  // Without a scene there is nothing to share — the opener is at fault, and the effect
  // above has logged it.
  return (
    <Dialog open={open && sceneInstance !== null} onClose={cancel} fullWidth maxWidth="sm">
      <DialogTitle>Share Scene Instance</DialogTitle>
      <DialogContent>
        {/* The scene is the one that was right-clicked, so it is named rather than
            picked (and no scene list was ever fetched). */}
        <Typography sx={{ mt: 1, fontSize: 13 }}>
          Sharing <strong>{sceneInstance?.name}</strong>
        </Typography>

        {sceneInstance && (
          <Box sx={{ mt: 2 }}>
            {loading && (
              <Typography sx={{ color: "grey.600", fontSize: 12 }}>Loading access list…</Typography>
            )}

            {!loading && (
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: "bold", mb: 0.5 }}>
                  Users with access:
                </Typography>
                {existingAccess.length === 0 && (
                  <Typography sx={{ color: "grey.600", fontSize: 12, mb: 1 }}>
                    No access entries found or you don&apos;t have permission to view them.
                  </Typography>
                )}
                {existingAccess.map((a) => (
                  <Box
                    key={a.uuid_user}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      py: 0.5,
                      borderBottom: "1px solid #eee",
                      fontSize: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <Box component="span" sx={{ fontWeight: 500, flex: 1, minWidth: 80 }}>
                      {a.username}
                    </Box>
                    {a.displayname && a.displayname !== a.username && (
                      <Box component="span" sx={{ color: "#666", fontSize: 11 }}>
                        ({a.displayname})
                      </Box>
                    )}
                    <AccessPill level={levelLabel(a)} />
                    {canManage && a.uuid_user !== currentUserUuid && (
                      <IconButton
                        size="small"
                        aria-label={`Revoke access for ${a.username}`}
                        sx={{ color: "#c00", p: 0.25 }}
                        onClick={() => void removeAccess(a)}
                      >
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {canManage && !loading && (
              <Box>
                <Divider sx={{ my: 1.5 }} />
                <Typography sx={{ fontSize: 11, fontWeight: "bold", mb: 0.5 }}>Add user:</Typography>
                <TextField
                  label="Username"
                  size="small"
                  fullWidth
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <FormControl fullWidth size="small">
                  <InputLabel id="share-level-select-label">Access level</InputLabel>
                  <Select
                    labelId="share-level-select-label"
                    label="Access level"
                    value={levelChoice}
                    onChange={(e) => setLevelChoice(e.target.value as AccessLevel)}
                  >
                    <MenuItem value="read">Read</MenuItem>
                    <MenuItem value="edit">Edit</MenuItem>
                    <MenuItem value="delete">Delete</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}

            {errorMsg && (
              <Typography sx={{ color: "#c00", fontSize: 12, mt: 0.5 }}>{errorMsg}</Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        {canManage && sceneInstance && !loading && (
          <Button variant="contained" onClick={() => void add()}>
            Add user
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
