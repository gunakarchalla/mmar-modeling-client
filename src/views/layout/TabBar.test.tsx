// @vitest-environment jsdom
//
// The tab bar: equal-width tabs, drag-to-reorder, and the close paths. tabActions is
// mocked (it drives the three.js engine); what is checked here is which tab index the
// bar hands it, and the order the bar keeps in tabsStore.
//
// jsdom has no layout, so the drag runs on TAB_WIDTH as its slot width (the hook's
// fallback when a tab measures 0 wide) and on a stubbed strip rect wide enough that the
// pointer never comes near the auto-scroll edges.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";

vi.mock("./tabActions", () => ({
  switchToTab: vi.fn(async () => {}),
  closeTab: vi.fn(async () => {}),
  renameTab: vi.fn(async () => {}),
}));

import TabBar, { TAB_WIDTH } from "./TabBar";
import { switchToTab, closeTab } from "./tabActions";
import { clampDragOffset, dropSlot, slideOffset } from "./useTabDrag";
import { useTabsStore, orderedTabIndices } from "@/resources/store/tabsStore";

const POINTER = { pointerId: 1, isPrimary: true, button: 0 };
const START_X = 100;

function openTabs(...names: string[]) {
  useTabsStore.setState({ tabs: [], selectedTab: -1, displayOrder: [] });
  for (const name of names) useTabsStore.getState().openTab({ name, uuid: `uuid-${name}`, isShared: false });
}

const shownNames = () => screen.getAllByRole("tab").map((el) => el.textContent);
const storeOrder = () => {
  const { tabs, displayOrder } = useTabsStore.getState();
  return orderedTabIndices(tabs, displayOrder).map((i) => tabs[i].name);
};
const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
/** The part of a tab that is drawn (and moved by a drag). */
const face = (name: string) => tab(name).firstElementChild as HTMLElement;

function press(name: string) {
  fireEvent.pointerDown(tab(name), { ...POINTER, clientX: START_X });
}
function moveBy(dx: number) {
  fireEvent.pointerMove(document, { ...POINTER, clientX: START_X + dx });
}
function release(dx: number) {
  fireEvent.pointerUp(document, { ...POINTER, clientX: START_X + dx });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, right: 2000, top: 0, bottom: 40, width: 2000, height: 40, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});

afterEach(async () => {
  vi.restoreAllMocks();
  // A drop arms a one-shot click swallower that a 0 ms timer disarms; let that timer
  // run so it cannot eat a click in the next test.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("TabBar layout", () => {
  it("gives every tab the same width, however long its name", () => {
    openTabs("A", "A much, much longer scene instance name than fits");
    render(<TabBar />);
    const widths = screen.getAllByRole("tab").map((el) => getComputedStyle(el).width);
    expect(widths).toEqual([`${TAB_WIDTH}px`, `${TAB_WIDTH}px`]);
  });
});

describe("TabBar drag to reorder", () => {
  it("slides the tabs it passes aside while dragging", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    press("A");
    moveBy(TAB_WIDTH * 2 + 10);

    // A is held at the end of the strip (clamped); B and C each move one slot left.
    expect(face("A").style.transform).toBe(`translateX(${TAB_WIDTH * 2}px)`);
    expect(face("B").style.transform).toBe(`translateX(${-TAB_WIDTH}px)`);
    expect(face("C").style.transform).toBe(`translateX(${-TAB_WIDTH}px)`);
    // Nothing is committed until the drop.
    expect(storeOrder()).toEqual(["A", "B", "C"]);
  });

  it("drops the tab into the slot it is over and activates it", () => {
    openTabs("A", "B", "C"); // C (index 2) is active
    render(<TabBar />);

    press("A");
    moveBy(TAB_WIDTH * 2);
    release(TAB_WIDTH * 2);

    expect(storeOrder()).toEqual(["B", "C", "A"]);
    expect(shownNames()).toEqual(["B", "C", "A"]);
    // Open-order indices are untouched, so A is still index 0.
    expect(useTabsStore.getState().tabs.map((t) => t.name)).toEqual(["A", "B", "C"]);
    expect(switchToTab).toHaveBeenCalledTimes(1);
    expect(switchToTab).toHaveBeenCalledWith(0);
    // Nothing is left translated after the drop.
    for (const name of ["A", "B", "C"]) expect(face(name).style.transform).toBe("");
  });

  it("needs more than half a slot of travel to move a tab", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    press("C");
    moveBy(-(TAB_WIDTH / 2 - 10));
    release(-(TAB_WIDTH / 2 - 10));
    expect(storeOrder()).toEqual(["A", "B", "C"]);

    press("C");
    moveBy(-(TAB_WIDTH / 2 + 10));
    release(-(TAB_WIDTH / 2 + 10));
    expect(storeOrder()).toEqual(["A", "C", "B"]);
  });

  it("swallows the click that ends a drag, so the tab is activated only once", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    press("A");
    moveBy(TAB_WIDTH);
    release(TAB_WIDTH);
    fireEvent.click(tab("A"));

    expect(switchToTab).toHaveBeenCalledTimes(1);
  });

  it("treats a press without travel as a plain click", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    press("A");
    moveBy(2); // under the drag threshold
    release(2);
    fireEvent.click(tab("A"));

    expect(storeOrder()).toEqual(["A", "B", "C"]);
    expect(switchToTab).toHaveBeenCalledWith(0);
  });

  it("Escape cancels the drag and puts the tab back", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    press("A");
    moveBy(TAB_WIDTH * 2);
    fireEvent.keyDown(document, { key: "Escape" });
    release(TAB_WIDTH * 2);

    expect(storeOrder()).toEqual(["A", "B", "C"]);
    expect(face("A").style.transform).toBe("");
    expect(switchToTab).not.toHaveBeenCalled();
  });

  it("drops the drag if a tab closes underneath it", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    press("A");
    moveBy(TAB_WIDTH * 2);
    // A shared scene's access is revoked mid-drag, say.
    act(() => useTabsStore.getState().closeTab(1));
    release(TAB_WIDTH * 2);

    expect(storeOrder()).toEqual(["A", "C"]);
    expect(switchToTab).not.toHaveBeenCalled();
  });

  it("never starts a drag from the close button", () => {
    openTabs("A", "B", "C");
    render(<TabBar />);

    const closeA = within(tab("A")).getByRole("button", { name: "close A" });
    fireEvent.pointerDown(closeA, { ...POINTER, clientX: START_X });
    moveBy(TAB_WIDTH * 2);

    expect(face("A").style.transform).toBe("");
    release(TAB_WIDTH * 2);
    expect(storeOrder()).toEqual(["A", "B", "C"]);
  });
});

describe("TabBar closing", () => {
  it("closes by open-order index from a reordered bar", () => {
    openTabs("A", "B", "C");
    useTabsStore.getState().moveTab("uuid-C", 0); // bar: C A B
    render(<TabBar />);
    expect(shownNames()).toEqual(["C", "A", "B"]);

    fireEvent.click(within(tab("C")).getByRole("button", { name: "close C" }));

    expect(closeTab).toHaveBeenCalledWith(2);
    expect(switchToTab).not.toHaveBeenCalled();
  });

  it("closes a tab on middle click", () => {
    openTabs("A", "B");
    render(<TabBar />);

    fireEvent(tab("A"), new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

    expect(closeTab).toHaveBeenCalledWith(0);
  });
});

describe("slot arithmetic", () => {
  it("clampDragOffset keeps the tab between the first and last slot", () => {
    expect(clampDragOffset(1, -500, 100, 4)).toBe(-100);
    expect(clampDragOffset(1, 500, 100, 4)).toBe(200);
    expect(clampDragOffset(1, 42, 100, 4)).toBe(42);
  });

  it("dropSlot rounds to the nearest slot and clamps to the bar", () => {
    expect(dropSlot(1, 49, 100, 4)).toBe(1);
    expect(dropSlot(1, 51, 100, 4)).toBe(2);
    expect(dropSlot(1, -51, 100, 4)).toBe(0);
    expect(dropSlot(1, 900, 100, 4)).toBe(3);
    expect(dropSlot(1, 50, 0, 4)).toBe(1); // unmeasurable: stay put
  });

  it("slideOffset moves only the tabs between the old and new slot", () => {
    // Dragging slot 1 right to slot 3: slots 2 and 3 slide left.
    expect([0, 1, 2, 3].map((s) => slideOffset(s, 1, 3, 100))).toEqual([0, 0, -100, -100]);
    // Dragging slot 3 left to slot 1: slots 1 and 2 slide right.
    expect([0, 1, 2, 3].map((s) => slideOffset(s, 3, 1, 100))).toEqual([0, 100, 100, 0]);
  });
});
