// P5 unit test for the selectionStore — the reactive mirror the interaction handler
// writes on every (de)selection and the P8 AttributeWindow reads. Small but load-
// bearing: if `revision` does not change, subscribers using it as a re-render trigger
// go stale after an in-place attribute edit.
import { describe, it, expect, beforeEach } from "vitest";
import { useSelectionStore } from "./selectionStore";

beforeEach(() => {
  useSelectionStore.setState({ selectedInstanceUuid: null, selectedType: null, revision: 0 });
});

describe("selectionStore", () => {
  it("records a selection and bumps the revision", () => {
    const before = useSelectionStore.getState().revision;
    useSelectionStore.getState().setSelection("ci-1", "class");

    const s = useSelectionStore.getState();
    expect(s.selectedInstanceUuid).toBe("ci-1");
    expect(s.selectedType).toBe("class");
    expect(s.revision).toBe(before + 1);
  });

  it("clears the selection and bumps the revision", () => {
    useSelectionStore.getState().setSelection("ci-1", "relationclass");
    const mid = useSelectionStore.getState().revision;

    useSelectionStore.getState().clearSelection();
    const s = useSelectionStore.getState();
    expect(s.selectedInstanceUuid).toBeNull();
    expect(s.selectedType).toBeNull();
    expect(s.revision).toBe(mid + 1);
  });

  it("bump() advances the revision without changing the selection", () => {
    useSelectionStore.getState().setSelection("ci-1", "port");
    const mid = useSelectionStore.getState();

    useSelectionStore.getState().bump();
    const s = useSelectionStore.getState();
    expect(s.revision).toBe(mid.revision + 1);
    expect(s.selectedInstanceUuid).toBe("ci-1");
    expect(s.selectedType).toBe("port");
  });
});
