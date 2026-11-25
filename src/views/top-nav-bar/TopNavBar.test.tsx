// @vitest-environment jsdom
//
// TopNavBar renders the five menus + the Algorithms button + the Simulation menu,
// and menu items either open a uiStore dialog or run an action. `@/engine` is mocked
// (the real barrel builds a WebGLRenderer at module scope); uiStore/eventBus/logger
// are the real singletons so we can assert the dialog wiring end-to-end.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  engine: { isInitialized: false },
  globalSelectedObject: { removeObject: vi.fn() },
  globalStateObject: { setState: vi.fn() },
  persistencyHandler: {
    saveToTextfile: vi.fn(async (): Promise<void> => undefined),
    saveAllOpenModelInstancesToTextfile: vi.fn(async (): Promise<void> => undefined),
  },
}));
vi.mock("@/engine", () => ({
  engine: mocks.engine,
  globalSelectedObject: mocks.globalSelectedObject,
  globalStateObject: mocks.globalStateObject,
}));
// P9 wired the two Export entries to persistency-handler, which imports the REAL
// global-definition (a WebGLRenderer at module scope) unless it is mocked here.
vi.mock("@/resources/services/persistency-handler", () => ({
  persistencyHandler: mocks.persistencyHandler,
}));

import TopNavBar from "./TopNavBar";
import { useUiStore } from "@/resources/store/uiStore";

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ dialogs: useUiStore.getState().dialogs, dialogPayloads: {} });
  cleanup();
});

describe("TopNavBar", () => {
  it("renders every top-level menu button", () => {
    render(<TopNavBar />);
    for (const name of ["File", "View", "Edit", "Diagram", "Settings", "Algorithms", "Simulation"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it("opens the File menu with all its entries", () => {
    render(<TopNavBar />);
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    const menu = screen.getByRole("menu");
    for (const label of [
      "Save Model",
      "Export Model as .json",
      "Import Model",
      "Import Metamodel",
      "Map file to SceneInstance",
      "Export Open Models",
    ]) {
      expect(within(menu).getByText(label)).toBeTruthy();
    }
  });

  it("opens the saveAs dialog when Save Model is selected", () => {
    render(<TopNavBar />);
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    fireEvent.click(screen.getByText("Save Model"));
    expect(useUiStore.getState().dialogs.saveAs).toBe(true);
  });

  it("opens the algorithm dialog from the Algorithms button", () => {
    render(<TopNavBar />);
    fireEvent.click(screen.getByRole("button", { name: /Algorithms/ }));
    expect(useUiStore.getState().dialogs.algorithm).toBe(true);
  });

  // P9: the old client dispatched these two by label in menu-entry.onItemClick.
  it("exports the open model via persistency-handler (File > Export Model as .json)", () => {
    render(<TopNavBar />);
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    fireEvent.click(screen.getByText("Export Model as .json"));
    expect(mocks.persistencyHandler.saveToTextfile).toHaveBeenCalledTimes(1);
  });

  it("exports all open models via persistency-handler (File > Export Open Models)", () => {
    render(<TopNavBar />);
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    fireEvent.click(screen.getByText("Export Open Models"));
    expect(mocks.persistencyHandler.saveAllOpenModelInstancesToTextfile).toHaveBeenCalledTimes(1);
  });

  it("opens each P9 File-menu dialog through the uiStore", () => {
    render(<TopNavBar />);
    for (const [label, dialog] of [
      ["Import Model", "importModel"],
      ["Import Metamodel", "importMetamodel"],
      ["Map file to SceneInstance", "mapFromFile"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: /File/ }));
      fireEvent.click(screen.getByText(label));
      expect(useUiStore.getState().dialogs[dialog]).toBe(true);
    }
  });

  it("guards Simulation entries behind engine init (no crash before mount)", () => {
    render(<TopNavBar />);
    fireEvent.click(screen.getByRole("button", { name: /Simulation/ }));
    fireEvent.click(screen.getByText("Enter Simulation Mode"));
    // engine.isInitialized is false -> setState is NOT called (guard held).
    expect(mocks.globalStateObject.setState).not.toHaveBeenCalled();
  });
});
