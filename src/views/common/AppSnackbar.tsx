import { Snackbar, Alert } from "@mui/material";
import { useLogStore } from "@/resources/store/logStore";

// The app's single transient message bar. Bound to `logStore.snackbar`, which opens
// on any `logger.log()` call with a status of "error".
export default function AppSnackbar() {
  const snackbar = useLogStore((s) => s.snackbar);
  const closeSnackbar = useLogStore((s) => s.closeSnackbar);

  return (
    <Snackbar
      open={snackbar.open}
      autoHideDuration={5000}
      onClose={(_e, reason) => {
        if (reason === "clickaway") return;
        closeSnackbar();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        onClose={closeSnackbar}
        severity={snackbar.severity}
        variant="filled"
        sx={{ width: "100%" }}
      >
        {snackbar.message}
      </Alert>
    </Snackbar>
  );
}
