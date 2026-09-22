import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { engine, resize, globalObject, rayHelper } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";

// Host element for the engine's canvas: it hands its container straight to
// `engine.mount()` and owns nothing about the 3D world itself.
//
// The engine is mounted once (ref + empty-dep effect), and mount/unmount are
// idempotent thanks to the mount-token pattern, so StrictMode's double-invoke and
// per-tab remounts are safe. A ResizeObserver keeps the renderer and cameras in step
// with the container.
//
// Two consequences of that lifecycle drive the cleanup:
//   1. the detach must wait for an in-flight `engine.mount()`, otherwise init finishes
//      after unmount and leaves a render loop running on a detached canvas;
//   2. a cleanup landing after a NEWER mount must not detach that mount's canvas —
//      which is what the mount token passed to `engine.unmount()` prevents.
//
// Two 1-second heartbeats run while the canvas is mounted; see the interval bodies.
export default function ThreeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let observer: ResizeObserver | undefined;

    // Deactivate the awareness cursor when the pointer leaves the canvas, so peers stop
    // drawing our arrow. A no-op when the active tab has no shared session.
    const onMouseLeave = () => rayHelper.clearCursor();
    el.addEventListener("mouseleave", onMouseLeave);

    const mounted = engine
      .mount(el)
      .then((token) => {
        if (disposed) return token;
        // Match the renderer/cameras to the actual container size, then keep them synced.
        resize.resize();
        observer = new ResizeObserver(() => resize.resize());
        observer.observe(el);
        return token;
      })
      .catch((err: unknown) => {
        // A failing init (e.g. no WebGL context) must surface as a log line, not as an
        // unhandled rejection that takes the canvas host down.
        logger.log(`3D canvas could not start: ${describeError(err)}`, "error");
        return undefined;
      });

    // Heartbeat #1 — "set steady rendering at least every second". The animator only
    // draws a frame when globalObject.render === true; some update paths mutate meshes
    // without setting it, so this tick guarantees the canvas keeps refreshing. It also
    // arms runMechanism so the animator ticks the scene's mechanism code strings.
    const steadyRender = setInterval(() => {
      globalObject.render = true;
      globalObject.runMechanism = true;
    }, 1000);

    // Heartbeat #2 — periodically refresh hybrid-algorithm attributes for the open
    // scene. Today this only does work for a Statechange scene, where it
    // reads each Reference object's three.js pose back into its pose attributes; for
    // every other scene type the service returns immediately.
    const hybridRefresh = setInterval(() => {
      if (globalObject.tabContext.length > 0) {
        void hybridAlgorithmsService
          .updateHybridAlgorithmAttributes()
          .catch((err) => logger.log(`Hybrid algorithm refresh failed: ${describeError(err)}`, "error"));
      }
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(steadyRender);
      clearInterval(hybridRefresh);
      el.removeEventListener("mouseleave", onMouseLeave);
      observer?.disconnect();
      // Detach only once the mount has settled, and only if this mount still owns the
      // engine (token check inside unmount).
      void mounted.then((token) => engine.unmount(token));
    };
  }, []);

  return (
    <Box
      ref={containerRef}
      className="three_canvas"
      id="container"
      sx={{ position: "relative", width: "100%", height: "100%", bgcolor: "#ffffff", overflow: "hidden" }}
    />
  );
}
