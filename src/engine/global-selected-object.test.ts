// @vitest-environment jsdom
//
// Regression tests for GlobalSelectedObject. global-definition builds a
// THREE.WebGLRenderer at module scope (needs a GL canvas), so it is replaced with a
// light fake that only carries the fields GlobalSelectedObject touches. THREE itself
// stays REAL — Mesh / Scene / BoxHelper work fine under jsdom (no WebGL needed).
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

const fakeGlobalObject = vi.hoisted(() => ({
  scene: undefined as unknown as THREE.Scene,
  boxHelper: undefined as unknown as THREE.BoxHelper,
  sharedDocServiceRef: undefined as any,
  selectedTab: 0,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: fakeGlobalObject }));

import { globalSelectedObject } from "./global-selected-object";

beforeEach(() => {
  fakeGlobalObject.scene = new THREE.Scene();
  fakeGlobalObject.boxHelper = undefined as unknown as THREE.BoxHelper;
  globalSelectedObject.removeObject();
});

describe("GlobalSelectedObject", () => {
  it("does not throw from getObject() after the selection is cleared", () => {
    // Select something, then clear it (the empty-space click path). getObject() used to
    // call boxHelper.setFromObject() unconditionally -> "Cannot read properties of
    // undefined (reading 'setFromObject')" once removeObject() nulled the boxHelper.
    globalSelectedObject.setObject(new THREE.Mesh());
    globalSelectedObject.removeObject();

    expect(() => globalSelectedObject.getObject()).not.toThrow();
    expect(globalSelectedObject.getObject()).toBeUndefined();
  });

  it("still refreshes the box helper for a live selection", () => {
    const mesh = new THREE.Mesh();
    globalSelectedObject.setObject(mesh);

    expect(fakeGlobalObject.boxHelper).toBeDefined();
    expect(globalSelectedObject.getObject()).toBe(mesh);
  });
});
