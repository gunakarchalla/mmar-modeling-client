import { create } from "zustand";

/**
 * The reactive mirror of the current selection in the THREE scene.
 *
 * `globalSelectedObject` is the source of truth for what is selected (it owns the mesh,
 * the box helper and the instance behind them) and writes here ONE WAY from the
 * interaction handler; React components read the identity of the selection from the
 * store. Note `globalObject.current_class_instance` is NOT that source: it is the vizRep
 * pipeline's "instance being drawn" pointer, which merely happens to name the selection
 * some of the time. The
 * `updateAttributeGui` / `removeAttributeGui` bus channels still exist alongside it as
 * the coarse "re-render everything" signal.
 *
 * `revision` covers the case the uuid cannot: gds objects are mutated IN PLACE, so an
 * attribute edit changes nothing React can observe. Bump it after such a mutation and
 * subscribers re-render.
 */
export type SelectionType = "class" | "relationclass" | "port" | null;

export interface SelectionState {
  /** UUID of the selected class / relationclass / port instance, or null when nothing is selected. */
  selectedInstanceUuid: string | null;
  /** Which kind of instance `selectedInstanceUuid` refers to. */
  selectedType: SelectionType;
  /** Bumped on every in-place mutation of the selected instance so subscribers re-render. */
  revision: number;

  /** Record a new selection (engine -> store). */
  setSelection: (uuid: string | null, type: SelectionType) => void;
  /** Clear the selection (engine -> store). */
  clearSelection: () => void;
  /** Force subscribers to re-read the selected instance after an in-place mutation. */
  bump: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedInstanceUuid: null,
  selectedType: null,
  revision: 0,

  setSelection: (uuid, type) =>
    set((s) => ({
      selectedInstanceUuid: uuid,
      selectedType: type,
      revision: s.revision + 1,
    })),

  clearSelection: () =>
    set((s) => ({
      selectedInstanceUuid: null,
      selectedType: null,
      revision: s.revision + 1,
    })),

  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));
