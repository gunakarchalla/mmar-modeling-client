import { create } from "zustand";

// Every dialog in the app is opened and closed through this one store: components read
// `dialogs[name]` to decide whether to render open, and imperative code calls
// `openDialog(name, payload)` / `closeDialog(name)`.
//
// Dialogs that act on something (createNewScene, shareScene, copyScene, deleteScene,
// referenceAttribute, tableAttribute, upload*) stash it in `dialogPayloads[name]`, which
// the owning view reads with `getDialogPayload` — that is what lets a dialog be opened
// against the scene or attribute the user clicked, with nothing to re-select inside it.

export type DialogName =
  | "saveAs"
  | "importModel"
  | "importMetamodel"
  | "mapFromFile"
  | "algorithm"
  | "createNewScene"
  | "copyScene"
  | "deleteScene"
  | "shareScene"
  | "userInfo"
  | "referenceAttribute"
  | "tableAttribute"
  | "uploadFile"
  | "uploadGltf"
  | "uploadImage";

const DIALOG_NAMES: DialogName[] = [
  "saveAs",
  "importModel",
  "importMetamodel",
  "mapFromFile",
  "algorithm",
  "createNewScene",
  "copyScene",
  "deleteScene",
  "shareScene",
  "userInfo",
  "referenceAttribute",
  "tableAttribute",
  "uploadFile",
  "uploadGltf",
  "uploadImage",
];

function allClosed(): Record<DialogName, boolean> {
  return DIALOG_NAMES.reduce(
    (acc, name) => {
      acc[name] = false;
      return acc;
    },
    {} as Record<DialogName, boolean>,
  );
}

interface UiState {
  dialogs: Record<DialogName, boolean>;
  dialogPayloads: Partial<Record<DialogName, unknown>>;
  /** Drives the loading-window dialog (MUI LinearProgress). */
  loading: boolean;
  /** Reactive mirror of globalObject.autoSave (the engine field is authoritative). */
  autoSave: boolean;

  openDialog: (name: DialogName, payload?: unknown) => void;
  closeDialog: (name: DialogName) => void;
  getDialogPayload: <T = unknown>(name: DialogName) => T | undefined;
  setLoading: (value: boolean) => void;
  setAutoSave: (value: boolean) => void;
  /**
   * Back to the as-loaded state (logout — see `services/session-reset`). Dialog payloads
   * matter most here: they hold the SceneInstance the dialog was opened against, so a
   * dialog left open by the previous user would otherwise act on their scene.
   */
  reset: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  dialogs: allClosed(),
  dialogPayloads: {},
  loading: false,
  autoSave: true,

  openDialog: (name, payload) =>
    set((s) => ({
      dialogs: { ...s.dialogs, [name]: true },
      dialogPayloads: { ...s.dialogPayloads, [name]: payload },
    })),

  closeDialog: (name) =>
    set((s) => ({
      dialogs: { ...s.dialogs, [name]: false },
    })),

  getDialogPayload: <T = unknown>(name: DialogName) =>
    get().dialogPayloads[name] as T | undefined,

  setLoading: (value) => set({ loading: value }),
  setAutoSave: (value) => set({ autoSave: value }),

  reset: () =>
    set({ dialogs: allClosed(), dialogPayloads: {}, loading: false, autoSave: true }),
}));
