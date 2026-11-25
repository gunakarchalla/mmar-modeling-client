// P10 wiring test — guards a LOAD-BEARING IMPORT, the same class of hazard P4 flagged
// for vizrep-update-checker.
//
// The engine handlers (interaction / deletion / transform-control-events /
// global-selected-object / ray-helper) deliberately do NOT import shared-doc-service:
// they reach it through `globalObject.sharedDocServiceRef`, which is how the old client
// broke its circular DI. That ref is only set as a side effect of CONSTRUCTING the
// SharedDocService singleton, i.e. only if some module in the engine's import graph
// imports it. `engine/coordinates-updater` is that module (mirroring the old file's
// `SharedDocService` injection), and `engine/index.ts` imports coordinates-updater.
//
// So if a later refactor drops that import as "unused", every engine-side collaboration
// hook silently becomes a no-op — no error, no failing type, edits just stop syncing.
// This test fails loudly instead.
import { describe, it, expect, vi } from "vitest";

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    selectedTab: 0,
    dragObjects: [],
    doSceneInstancePatchLocal: false,
    sharedDocServiceRef: null as unknown,
    accessToken: "",
  },
}));
// The real global-definition builds a WebGLRenderer at module scope (P3 note).
vi.mock("@/engine/global-definition", () => fakeGlobal);

describe("collaboration wiring", () => {
  it("sets globalObject.sharedDocServiceRef when the engine's import graph is loaded", async () => {
    expect(fakeGlobal.globalObject.sharedDocServiceRef).toBeNull();

    // Importing the engine module is the ONLY action here — the ref must appear purely
    // as a side effect of the import chain reaching shared-doc-service.
    await import("@/engine/coordinates-updater");

    const ref = fakeGlobal.globalObject.sharedDocServiceRef as { forTab?: unknown } | null;
    expect(ref).not.toBeNull();
    // It is the real service: the engine handlers call forTab(...) through this ref.
    expect(typeof ref!.forTab).toBe("function");

    const { sharedDocService } = await import("./shared-doc-service");
    expect(ref).toBe(sharedDocService);
  });
});
