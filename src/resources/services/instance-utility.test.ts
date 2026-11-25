// P3 unit test for the "single mutation path" (plan §3.1 + P1 tabsStore note):
// instance-utility.createTabContextSceneInstance is the ONE place a tab is created,
// and it must drive the reactive tabsStore in lockstep with globalObject.tabContext.
//
// global-definition is faked (real one builds a WebGLRenderer at import time). The
// tabsStore is REAL — the whole point is to verify the two stay aligned.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));

import { instanceUtility } from "./instance-utility";
import { useTabsStore } from "@/resources/store/tabsStore";

const SCENE_TYPE = { uuid: "st-1", name: "Demo SceneType" };

function makeSceneInstance(uuid: string, name: string): SceneInstance {
  return SceneInstance.fromJS({
    uuid,
    name,
    uuid_scene_type: "st-1",
    class_instances: [],
    relationclasses_instances: [],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

beforeEach(() => {
  Object.assign(mocks.globalObject, {
    selectedTab: -1,
    tabContext: [],
    scene: { uuid: "" },
    sceneTypes: [SCENE_TYPE],
    dragObjects: [],
  });
  // Reset the real tabsStore between tests.
  useTabsStore.setState({ tabs: [], selectedTab: -1 });
});

describe("InstanceUtility.createTabContextSceneInstance — single mutation path", () => {
  it("creates the engine tab context AND the tabsStore entry in lockstep", async () => {
    const g = mocks.globalObject;
    const scene1 = makeSceneInstance("scene-1", "My Scene");

    const ctx = await instanceUtility.createTabContextSceneInstance(scene1);

    // Engine side
    expect(g.tabContext).toHaveLength(1);
    expect(g.tabContext[0].sceneInstance).toBe(scene1);
    expect(g.tabContext[0].sceneType).toBe(SCENE_TYPE);
    expect(g.tabContext[0].isShared).toBe(false);
    expect(g.selectedTab).toBe(0);
    // threeScene.uuid is stamped with the scene instance uuid.
    expect(g.scene.uuid).toBe("scene-1");
    expect(ctx.contextDragObjects).toBe(g.dragObjects);

    // Reactive store side — mirrors the same index/selection.
    const store = useTabsStore.getState();
    expect(store.tabs).toEqual([{ name: "My Scene", uuid: "scene-1", isShared: false }]);
    expect(store.selectedTab).toBe(0);
  });

  it("keeps store.selectedTab === globalObject.selectedTab across multiple opens", async () => {
    const g = mocks.globalObject;
    await instanceUtility.createTabContextSceneInstance(makeSceneInstance("scene-1", "One"));
    await instanceUtility.createTabContextSceneInstance(makeSceneInstance("scene-2", "Two"));

    expect(g.tabContext).toHaveLength(2);
    expect(g.selectedTab).toBe(1);
    const store = useTabsStore.getState();
    expect(store.tabs.map((t) => t.uuid)).toEqual(["scene-1", "scene-2"]);
    expect(store.selectedTab).toBe(g.selectedTab);
  });

  it("throws (and leaves stores untouched) when the scene type cannot be resolved", async () => {
    const g = mocks.globalObject;
    const orphan = makeSceneInstance("scene-x", "Orphan");
    orphan.uuid_scene_type = "does-not-exist";

    await expect(instanceUtility.createTabContextSceneInstance(orphan)).rejects.toThrow(
      /Could not resolve scene type/,
    );
    expect(g.tabContext).toHaveLength(0);
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });
});
