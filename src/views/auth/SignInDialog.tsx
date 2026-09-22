import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { useAuthStore } from "@/resources/store/authStore";
import { useLogStore } from "@/resources/store/logStore";
import { DEV_USERNAME, DEV_PASSWORD } from "@/config";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The sign-in form. Logs in through `authStore`; on success the store publishes the
 * `login` event, which is what makes the scene tree build itself, and this dialog
 * closes. AppLayout decides when to show it: whenever no user is authenticated.
 *
 * The fields seed from `VITE_USERNAME` / `VITE_PASSWORD` when those are set, which
 * saves typing during development. Both are unset in production.
 */
export default function SignInDialog({ open, onClose }: Props) {
  const [username, setUsername] = useState(DEV_USERNAME ?? "");
  const [password, setPassword] = useState(DEV_PASSWORD ?? "");
  const [errorMessage, setErrorMessage] = useState("");

  const login = useAuthStore((s) => s.login);
  const log = useLogStore((s) => s.log);

  async function handleSignIn() {
    if (!username || !password) {
      setErrorMessage("Please enter username and password");
      return;
    }
    setErrorMessage("");
    const success = await login(username, password);
    if (success) {
      onClose();
    } else {
      setErrorMessage("Invalid username or password");
      log("Invalid username or password", "error");
    }
  }

  return (
    // Non-dismissable until logged in: no `onClose` is passed, so neither a
    // backdrop click nor Escape has anything to call.
    <Dialog open={open} maxWidth="xs" fullWidth>
      <DialogTitle>User Management</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSignIn();
            }}
            autoComplete="current-password"
            fullWidth
          />
          {errorMessage && (
            <Typography color="error" variant="body2">
              {errorMessage}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={() => void handleSignIn()}>
          Login
        </Button>
      </DialogActions>
    </Dialog>
  );
}
