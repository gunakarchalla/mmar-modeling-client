// @vitest-environment jsdom
//
// LeftNav renders a tab strip over the scene panel and the model-tree panel; both stay
// mounted (the inactive one hidden) so SceneGroup's effects survive a tab switch.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/views/scenegroup/SceneGroup", () => ({ default: () => <div>scene-group-stub</div> }));
vi.mock("@/views/model-tree/ModelTree", () => ({
  default: ({ active }: { active: boolean }) => <div data-active={String(active)}>model-tree-stub</div>,
}));
vi.mock("@/views/palette/ClassButtonGroup", () => ({ default: () => <div>class-palette</div> }));
vi.mock("@/views/palette/RelationclassButtonGroup", () => ({ default: () => <div>relation-palette</div> }));

import LeftNav from "./LeftNav";
import { useTabsStore } from "@/resources/store/tabsStore";

/** The nearest ancestor that carries the panel's `hidden` toggle. */
function panelHidden(text: string): boolean {
  let el: HTMLElement | null = screen.getByText(text);
  while (el && !el.hasAttribute("hidden") && el.parentElement) el = el.parentElement;
  return !!el?.hasAttribute("hidden");
}

beforeEach(() => {
  cleanup();
  useTabsStore.setState({ tabs: [], selectedTab: -1 });
});

describe("LeftNav", () => {
  it("shows the Scenes panel by default and keeps the model tree mounted but hidden", () => {
    render(<LeftNav />);

    expect(screen.getByText("scene-group-stub")).toBeTruthy();
    expect(screen.getByText("model-tree-stub")).toBeTruthy();
    expect(panelHidden("scene-group-stub")).toBe(false);
    expect(panelHidden("model-tree-stub")).toBe(true);
    // ...and told so, so it does not rebuild unseen.
    expect(screen.getByText("model-tree-stub").getAttribute("data-active")).toBe("false");
  });

  it("switches to the model tree when its tab is clicked", () => {
    render(<LeftNav />);

    fireEvent.click(screen.getByRole("tab", { name: "Model tree" }));

    expect(panelHidden("model-tree-stub")).toBe(false);
    expect(panelHidden("scene-group-stub")).toBe(true);
    expect(screen.getByText("model-tree-stub").getAttribute("data-active")).toBe("true");
  });
});
