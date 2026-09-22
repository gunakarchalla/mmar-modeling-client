import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { engine } from "@/engine";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";

// The WebXR entry button, overlaid on the canvas.
//
// It waits for the engine's one-time init — three's XRButton reads the renderer, which
// only exists afterwards — and then appends the button into a positioned overlay div.
// `engine.createXRButton()` also enables XR idempotently, which is what keeps XR
// working across canvas remounts.
//
// StrictMode's double-mount and per-tab canvas remounts are safe: the effect removes
// its own button on cleanup, and a superseded mount skips the append.
export default function XrButton() {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let button: HTMLElement | undefined;

    void engine
      .whenReady()
      .then(() => {
        const host = overlayRef.current;
        if (disposed || !host) return;
        button = engine.createXRButton();
        // Lift the button clear of the app footer — three positions it absolutely at
        // bottom:20px, which would sit behind it.
        button.style.bottom = "60px";
        host.appendChild(button);
      })
      .catch((err: unknown) => {
        // A device without WebXR still surfaces a disabled "XR NOT SUPPORTED" button
        // from three itself; a genuine failure here just means no button — log, do not
        // crash the canvas host.
        logger.log(`XR button could not be created: ${describeError(err)}`, "error");
      });

    return () => {
      disposed = true;
      button?.parentElement?.removeChild(button);
    };
  }, []);

  // A transparent, non-interactive overlay pinned to the MiddleBody; only the button
  // it hosts is clickable (pointerEvents re-enabled on the child by three's styles).
  return (
    <Box
      ref={overlayRef}
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 5,
        "& > *": { pointerEvents: "auto" },
      }}
    />
  );
}
