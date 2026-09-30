// global-class-object: `getIcon`, the palette button's image taken from a vizRep
// code string without running it.
//
// The metamodeling client's object lists apply the same rule (vizrep-icon.ts), so
// both clients show the same image for the same vizRep: an inline `icon` first,
// then a file referenced with `getImageByUUID`, then the LAST inline `map`.
//
// `global-definition` is mocked so `three` never loads: importing it for real
// constructs a WebGLRenderer at module scope, which has no WebGL context in tests.
import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: new Map<string, [unknown, string]>([["file-1", [{}, "data:image/png;base64,FILE"]]]),
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: {} }));
vi.mock("@/resources/services/logger", () => ({ logger: { log: vi.fn() } }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: { Files: mocks.files } }));

import { globalClassObject } from "./global-class-object";

describe("globalClassObject.getIcon", () => {
  it("prefers an inline icon over the map", async () => {
    const vizRep = "async function vizRep(gc) { let map = 'data:MAP'; let icon = 'data:ICON'; }";
    expect(await globalClassObject.getIcon(vizRep)).toBe("data:ICON");
  });

  it("resolves an icon loaded with getImageByUUID from the file cache", async () => {
    const vizRep = "async function vizRep(gc) { let icon = await gc.expression.getImageByUUID('file-1'); }";
    expect(await globalClassObject.getIcon(vizRep)).toBe("data:image/png;base64,FILE");
  });

  it("falls back to the last inline map when no icon is defined", async () => {
    const vizRep = "async function vizRep(gc) { let map = 'data:FIRST'; map = 'data:LAST'; }";
    expect(await globalClassObject.getIcon(vizRep)).toBe("data:LAST");
  });

  it("returns an empty string when the vizRep holds no image", async () => {
    expect(await globalClassObject.getIcon("async function vizRep(gc) {}")).toBe("");
  });
});
