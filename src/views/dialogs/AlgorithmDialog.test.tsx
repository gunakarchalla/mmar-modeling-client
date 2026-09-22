// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act, fireEvent } from "@testing-library/react";

/**
 * P12 component tests for the Algorithms dialog. procedure-utility is mocked (its own
 * fetch/sandbox behaviour is tested in procedure-utility.test.ts, and importing the real
 * one pulls the REAL @/engine/global-definition -> a WebGLRenderer at module scope).
 *
 * Test traps this file obeys, all learned in earlier phases: uiStore dialog flags are
 * module-global and leak between tests, so every dialog is closed in beforeEach (P8);
 * MUI's Select is not reachable by label — go through role="combobox" + role="listbox"
 * (P9); testing-library's auto-cleanup never registers because vitest `globals` is off,
 * so cleanup() is manual (P11).
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    tabContext: [] as { sceneType: { get_name: () => string; get_uuid: () => string } }[],
    selectedTab: 0,
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  procedureUtility: {
    getGeneralProcedures: vi.fn(async (): Promise<{ name: string }[]> => []),
    getAssignedProcedures: vi.fn(async (): Promise<{ name: string }[]> => []),
    execute: vi.fn(async (_independent: string, _dependent: string) => undefined),
  },
  logger: { log: vi.fn() },
}));
vi.mock("@/resources/services/procedure-utility", () => ({ procedureUtility: mocks.procedureUtility }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

const { default: AlgorithmDialog } = await import("@/views/dialogs/AlgorithmDialog");
const { useUiStore } = await import("@/resources/store/uiStore");

function closeEveryDialog() {
  const dialogs = useUiStore.getState().dialogs;
  useUiStore.setState({
    dialogs: Object.fromEntries(Object.keys(dialogs).map((name) => [name, false])) as typeof dialogs,
  });
}

const openTab = () => {
  fakeGlobal.globalObject.tabContext = [
    { sceneType: { get_name: () => "Robotic system", get_uuid: () => "scene-type-uuid" } },
  ];
};

/** MUI Select: click the combobox, then read the options out of the popup listbox. */
async function openSelect(index: number) {
  const comboboxes = await screen.findAllByRole("combobox");
  fireEvent.mouseDown(comboboxes[index]);
  return screen.findByRole("listbox");
}

describe("AlgorithmDialog", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    closeEveryDialog();
    fakeGlobal.globalObject.tabContext = [];
    mocks.procedureUtility.getGeneralProcedures.mockResolvedValue([]);
    mocks.procedureUtility.getAssignedProcedures.mockResolvedValue([]);
  });

  it("renders nothing until the uiStore flag opens it, and fetches only then", async () => {
    render(<AlgorithmDialog />);

    expect(screen.queryByText("Choose your algorithm:")).toBeNull();
    expect(mocks.procedureUtility.getGeneralProcedures).not.toHaveBeenCalled();

    act(() => useUiStore.getState().openDialog("algorithm"));

    expect(await screen.findByText("Choose your algorithm:")).toBeDefined();
    await waitFor(() => expect(mocks.procedureUtility.getGeneralProcedures).toHaveBeenCalledTimes(1));
  });

  it("lists the independent procedures by name", async () => {
    mocks.procedureUtility.getGeneralProcedures.mockResolvedValue([{ name: "Layout" }, { name: "Validate" }]);
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await waitFor(() => expect(mocks.procedureUtility.getGeneralProcedures).toHaveBeenCalled());

    const listbox = await openSelect(0);

    expect(screen.getByText("Layout")).toBeDefined();
    expect(screen.getByText("Validate")).toBeDefined();
    // The blank first entry (the old <mdc-list-item> with no value) lets the user clear.
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it("only fetches assigned procedures when a tab is open", async () => {
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await waitFor(() => expect(mocks.procedureUtility.getGeneralProcedures).toHaveBeenCalled());
    expect(mocks.procedureUtility.getAssignedProcedures).not.toHaveBeenCalled();

    // Re-open with a tab open.
    act(() => useUiStore.getState().closeDialog("algorithm"));
    openTab();
    mocks.procedureUtility.getAssignedProcedures.mockResolvedValue([{ name: "Robot check" }]);
    act(() => useUiStore.getState().openDialog("algorithm"));

    await waitFor(() => expect(mocks.procedureUtility.getAssignedProcedures).toHaveBeenCalledTimes(1));
    await openSelect(1);
    expect(screen.getByText("Robot check")).toBeDefined();
  });

  it("runs the selected independent procedure, and only that group", async () => {
    mocks.procedureUtility.getGeneralProcedures.mockResolvedValue([{ name: "Layout" }]);
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await waitFor(() => expect(mocks.procedureUtility.getGeneralProcedures).toHaveBeenCalled());

    await openSelect(0);
    fireEvent.click(screen.getByText("Layout"));

    const runButtons = screen.getAllByRole("button", { name: "run" });
    fireEvent.click(runButtons[0]);

    // "" is procedureUtility.execute's "skip this group" sentinel.
    await waitFor(() => expect(mocks.procedureUtility.execute).toHaveBeenCalledWith("Layout", ""));
  });

  it("runs the selected assigned procedure through the dependent slot", async () => {
    openTab();
    mocks.procedureUtility.getAssignedProcedures.mockResolvedValue([{ name: "Robot check" }]);
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await waitFor(() => expect(mocks.procedureUtility.getAssignedProcedures).toHaveBeenCalled());

    await openSelect(1);
    fireEvent.click(screen.getByText("Robot check"));
    fireEvent.click(screen.getAllByRole("button", { name: "run" })[1]);

    await waitFor(() => expect(mocks.procedureUtility.execute).toHaveBeenCalledWith("", "Robot check"));
  });

  it("cannot run with nothing selected", async () => {
    mocks.procedureUtility.getGeneralProcedures.mockResolvedValue([{ name: "Layout" }]);
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await screen.findByText("Choose your algorithm:");

    for (const button of screen.getAllByRole("button", { name: "run" })) {
      expect(button).toHaveProperty("disabled", true);
      fireEvent.click(button);
    }

    expect(mocks.procedureUtility.execute).not.toHaveBeenCalled();
  });

  it("reports a failing algorithm instead of throwing", async () => {
    mocks.procedureUtility.getGeneralProcedures.mockResolvedValue([{ name: "Layout" }]);
    mocks.procedureUtility.execute.mockRejectedValueOnce(new Error("bad algorithm"));
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await waitFor(() => expect(mocks.procedureUtility.getGeneralProcedures).toHaveBeenCalled());

    await openSelect(0);
    fireEvent.click(screen.getByText("Layout"));
    fireEvent.click(screen.getAllByRole("button", { name: "run" })[0]);

    await waitFor(() =>
      expect(mocks.logger.log).toHaveBeenCalledWith(expect.stringContaining("bad algorithm"), "error"),
    );
  });

  it("surfaces a failed fetch as an error log", async () => {
    mocks.procedureUtility.getGeneralProcedures.mockRejectedValueOnce(new Error("server down"));
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));

    await waitFor(() =>
      expect(mocks.logger.log).toHaveBeenCalledWith(expect.stringContaining("server down"), "error"),
    );
  });

  it("closes via the close button", async () => {
    render(<AlgorithmDialog />);
    act(() => useUiStore.getState().openDialog("algorithm"));
    await screen.findByText("Choose your algorithm:");

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    await waitFor(() => expect(useUiStore.getState().dialogs.algorithm).toBe(false));
  });
});
