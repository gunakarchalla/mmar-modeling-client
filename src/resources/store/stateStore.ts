import { create } from "zustand";

/**
 * Reactive, display-only mirror of the engine's interaction state.
 *
 * The authoritative state machine lives in the engine: `globalStateObject`
 * (engine/global-state-object.ts) holds `activeState` + `stateNames` and drives
 * the three.js controls in `onStateChange()`. React components must not read engine
 * fields directly, so `globalStateObject.setState` pushes the new state name here and
 * the state window subscribes to `activeState`.
 *
 * Keep this a thin mirror: the engine remains the single source of truth. Nothing
 * here mutates engine state — writing happens the other way (engine -> store).
 */
interface StateStore {
  /** Human-readable name of the active interaction mode, e.g. "SelectionMode (drag)". Empty before init. */
  activeState: string;
  setActiveState: (value: string) => void;
}

export const useStateStore = create<StateStore>((set) => ({
  activeState: "",
  setActiveState: (value) => set({ activeState: value }),
}));
