import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, LinearProgress } from "@mui/material";
import { useUiStore } from "@/resources/store/uiStore";

// A modal progress dialog driven by `uiStore.loading`, shown while the metamodel and
// models load. The bar is a gentle fake-progress curve capped at 99%, so it keeps
// moving through a load of unknown length, then snaps to 100% and unmounts when
// loading flips false.
export default function LoadingWindow() {
  const loading = useUiStore((s) => s.loading);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;

    // Fills faster early and slower near the end, so a long load still looks alive.
    const step = () => {
      if (current >= 0.99) {
        current = 0.99;
        setProgress(0.99);
        return;
      }
      let delay: number;
      if (current < 0.5) {
        current += 0.1;
        delay = 500;
      } else if (current < 0.8) {
        current += 0.05;
        delay = 1000;
      } else {
        current += 0.02 * (1 - current);
        delay = 1500;
      }
      setProgress(current);
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, 300);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <Dialog open={loading} maxWidth="sm" fullWidth>
      <DialogTitle>Please wait... your metamodels and models are being loaded.</DialogTitle>
      <DialogContent sx={{ py: 4 }}>
        <LinearProgress variant="determinate" value={Math.min(progress, 1) * 100} />
      </DialogContent>
    </Dialog>
  );
}
