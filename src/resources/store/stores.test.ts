import { describe, it, expect, beforeEach } from "vitest";
import { useLogStore } from "./logStore";
import { useUiStore } from "./uiStore";
import { useTabsStore, orderedTabIndices } from "./tabsStore";

describe("logStore", () => {
  beforeEach(() => {
    useLogStore.setState({
      logArray: [],
      snackbar: { open: false, message: "", severity: "info" },
    });
  });

  it("prepends log entries (newest first)", () => {
    useLogStore.getState().log("first", "info");
    useLogStore.getState().log("second", "info");
    expect(useLogStore.getState().logArray.map((e) => e.value)).toEqual(["second", "first"]);
  });

  it("opens the snackbar on error", () => {
    useLogStore.getState().log("boom", "error");
    const { snackbar } = useLogStore.getState();
    expect(snackbar.open).toBe(true);
    expect(snackbar.message).toBe("boom");
    expect(snackbar.severity).toBe("error");
  });

  it("does not open the snackbar for non-error status", () => {
    useLogStore.getState().log("hi", "info");
    expect(useLogStore.getState().snackbar.open).toBe(false);
  });

  it("bounds the log array under bulk logging (keeps most-recent, newest first)", () => {
    // Bulk operations (e.g. a URDF import) log thousands of times. The array must not
    // grow without bound, otherwise each log becomes an O(n) copy + LogWindow re-render.
    const total = 5000;
    for (let i = 0; i < total; i++) {
      useLogStore.getState().log(`entry-${i}`, "info");
    }
    const { logArray } = useLogStore.getState();
    expect(logArray.length).toBeLessThanOrEqual(500);
    // newest-first: the last logged entry is at the head, oldest retained trails it.
    expect(logArray[0].value).toBe(`entry-${total - 1}`);
    expect(logArray[logArray.length - 1].value).toBe(`entry-${total - logArray.length}`);
  });
});

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.setState({ dialogs: { ...useUiStore.getState().dialogs }, dialogPayloads: {} });
  });

  it("opens and closes a dialog", () => {
    useUiStore.getState().openDialog("saveAs");
    expect(useUiStore.getState().dialogs.saveAs).toBe(true);
    useUiStore.getState().closeDialog("saveAs");
    expect(useUiStore.getState().dialogs.saveAs).toBe(false);
  });

  it("stashes and reads a dialog payload", () => {
    useUiStore.getState().openDialog("createNewScene", { uuid: "st-1" });
    expect(useUiStore.getState().getDialogPayload<{ uuid: string }>("createNewScene")).toEqual({
      uuid: "st-1",
    });
  });
});

describe("tabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], selectedTab: -1 });
  });

  it("opens tabs and selects the newest", () => {
    const s = useTabsStore.getState();
    expect(s.openTab({ name: "A", uuid: "a", isShared: false })).toBe(0);
    expect(s.openTab({ name: "B", uuid: "b", isShared: false })).toBe(1);
    expect(useTabsStore.getState().selectedTab).toBe(1);
    expect(useTabsStore.getState().tabs.length).toBe(2);
  });

  it("closing the selected tab clamps the selection", () => {
    const s = useTabsStore.getState();
    s.openTab({ name: "A", uuid: "a", isShared: false });
    s.openTab({ name: "B", uuid: "b", isShared: false });
    s.openTab({ name: "C", uuid: "c", isShared: false }); // selected = 2
    s.closeTab(2);
    expect(useTabsStore.getState().selectedTab).toBe(1);
    expect(useTabsStore.getState().tabs.map((t) => t.uuid)).toEqual(["a", "b"]);
  });

  it("closing a tab before the selection shifts the selected index down", () => {
    const s = useTabsStore.getState();
    s.openTab({ name: "A", uuid: "a", isShared: false });
    s.openTab({ name: "B", uuid: "b", isShared: false });
    s.selectTab(1); // selected = 1 (B)
    s.closeTab(0); // remove A
    expect(useTabsStore.getState().selectedTab).toBe(0);
    expect(useTabsStore.getState().tabs.map((t) => t.uuid)).toEqual(["b"]);
  });

  it("closing the last remaining tab resets to -1", () => {
    const s = useTabsStore.getState();
    s.openTab({ name: "A", uuid: "a", isShared: false });
    s.closeTab(0);
    expect(useTabsStore.getState().selectedTab).toBe(-1);
    expect(useTabsStore.getState().tabs).toEqual([]);
  });

  describe("display order", () => {
    beforeEach(() => {
      useTabsStore.setState({ tabs: [], selectedTab: -1, displayOrder: [] });
    });

    function open(...uuids: string[]) {
      for (const uuid of uuids) useTabsStore.getState().openTab({ name: uuid, uuid, isShared: false });
    }
    const shown = () => {
      const { tabs, displayOrder } = useTabsStore.getState();
      return orderedTabIndices(tabs, displayOrder).map((i) => tabs[i].uuid);
    };

    it("shows tabs in open order, new tabs at the end", () => {
      open("a", "b", "c");
      expect(shown()).toEqual(["a", "b", "c"]);
    });

    it("moveTab reorders the bar only: indices and the selection stay put", () => {
      open("a", "b", "c"); // selected = 2 (c)
      useTabsStore.getState().moveTab("c", 0);
      expect(shown()).toEqual(["c", "a", "b"]);
      expect(useTabsStore.getState().tabs.map((t) => t.uuid)).toEqual(["a", "b", "c"]);
      expect(useTabsStore.getState().selectedTab).toBe(2);

      useTabsStore.getState().moveTab("a", 99); // clamped to the last slot
      expect(shown()).toEqual(["c", "b", "a"]);
    });

    it("moveTab ignores an unknown uuid", () => {
      open("a", "b");
      const before = useTabsStore.getState();
      useTabsStore.getState().moveTab("nope", 0);
      expect(useTabsStore.getState()).toBe(before);
    });

    it("closing the active tab selects the tab that slides into its slot on the bar", () => {
      open("a", "b", "c");
      useTabsStore.getState().moveTab("c", 0); // bar: c a b
      useTabsStore.getState().selectTab(2); // c, leftmost on the bar
      useTabsStore.getState().closeTab(2);
      // Its right-hand neighbour on the bar is a (index 0), not the open-order clamp (b).
      const s = useTabsStore.getState();
      expect(s.tabs[s.selectedTab].uuid).toBe("a");
      expect(shown()).toEqual(["a", "b"]);
    });

    it("closing the active rightmost tab selects the new rightmost", () => {
      open("a", "b", "c");
      useTabsStore.getState().moveTab("a", 2); // bar: b c a
      useTabsStore.getState().selectTab(0); // a, rightmost on the bar
      useTabsStore.getState().closeTab(0);
      const s = useTabsStore.getState();
      expect(s.tabs[s.selectedTab].uuid).toBe("c");
    });

    it("a newly opened tab goes to the end of a reordered bar", () => {
      open("a", "b");
      useTabsStore.getState().moveTab("b", 0);
      open("c");
      expect(shown()).toEqual(["b", "a", "c"]);
    });

    it("reset clears the order", () => {
      open("a", "b");
      useTabsStore.getState().moveTab("b", 0);
      useTabsStore.getState().reset();
      expect(useTabsStore.getState().displayOrder).toEqual([]);
    });
  });

  describe("orderedTabIndices", () => {
    const tab = (uuid: string) => ({ name: uuid, uuid, isShared: false });

    it("skips stale uuids and duplicates, and appends unlisted tabs in open order", () => {
      const tabs = [tab("a"), tab("b"), tab("c")];
      expect(orderedTabIndices(tabs, ["gone", "c", "c", "a"])).toEqual([2, 0, 1]);
    });

    it("falls back to open order with no display order at all", () => {
      expect(orderedTabIndices([tab("a"), tab("b")], [])).toEqual([0, 1]);
    });
  });
});
