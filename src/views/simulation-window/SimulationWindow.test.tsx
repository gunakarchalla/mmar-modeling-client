// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act, fireEvent } from "@testing-library/react";
import type { JointControl } from "@/views/simulation-window/simulationModel";

/**
 * P12 component tests for the SimulationWindow (plan §9 P12: "simulation window renders
 * sliders for a fixture robotic scene"). The data half is mocked here — it has its own
 * tests in simulationModel.test.ts — so these pin the parts only a render can show: that
 * a slider appears per joint, that the bus subscriptions rebuild the list, and that
 * moving a slider reaches the robot.
 *
 * The model module is mocked rather than the services beneath it, because importing the
 * real one transitively pulls the REAL @/engine/global-definition (WebGLRenderer at
 * module scope) — the rule three phases deep now (P9 persistency-handler, P10
 * shared-doc-service, P11 renderers).
 *
 * Testing-library facts this file depends on (P11 notes): vitest `globals` is off, so
 * cleanup() must be called by hand, and a store/bus write after render needs act().
 */

const mocks = vi.hoisted(() => ({
  buildSimulationState: vi.fn(async () => ({ isRoboticSystemSceneType: false, jointControls: [] as JointControl[] })),
  applyJointValue: vi.fn(async (_ctrl: JointControl, raw: unknown) => Number(raw)),
  instanceUtility: { getTabContextSceneInstance: vi.fn(async (): Promise<{ uuid: string } | undefined> => undefined) },
  logger: { log: vi.fn() },
}));
vi.mock("@/views/simulation-window/simulationModel", () => ({
  buildSimulationState: mocks.buildSimulationState,
  applyJointValue: mocks.applyJointValue,
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

const { default: SimulationWindow } = await import("@/views/simulation-window/SimulationWindow");
const { eventBus } = await import("@/resources/services/event-bus");

const ACTIVE_SCENE_UUID = "99999999-9999-4999-8999-999999999999";

function control(uuid: string, displayName: string, over: Partial<JointControl> = {}): JointControl {
  return {
    instance: { uuid } as JointControl["instance"],
    displayName,
    lower: -1,
    upper: 1,
    value: 0,
    step: 0.01,
    disabled: false,
    ...over,
  };
}

function roboticScene(...controls: JointControl[]) {
  mocks.buildSimulationState.mockResolvedValue({ isRoboticSystemSceneType: true, jointControls: controls });
}

describe("SimulationWindow", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.buildSimulationState.mockResolvedValue({ isRoboticSystemSceneType: false, jointControls: [] });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue({ uuid: ACTIVE_SCENE_UUID });
  });

  it("renders a slider per joint of a robotic scene, with its label and bounds", async () => {
    roboticScene(control("j1", "shoulder", { value: 0.25 }), control("j2", "elbow", { lower: 0, upper: 2 }));

    render(<SimulationWindow />);

    expect(await screen.findByText("shoulder")).toBeDefined();
    expect(screen.getByText("elbow")).toBeDefined();
    expect(screen.getByText("Value: 0.25")).toBeDefined();
    expect(screen.getByText("Max: 2")).toBeDefined();

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    expect(sliders[0].getAttribute("aria-valuenow")).toBe("0.25");
    expect(sliders[1].getAttribute("aria-valuemax")).toBe("2");
  });

  it("says so when a robotic scene has no joints", async () => {
    roboticScene();

    render(<SimulationWindow />);

    expect(await screen.findByText("No Joint instances found in the active scene.")).toBeDefined();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("renders no sliders and no empty-state for a non-robotic scene", async () => {
    render(<SimulationWindow />);

    // The heading always shows; the joint list simply is not there.
    expect(await screen.findByText("Simulation Controls")).toBeDefined();
    await waitFor(() => expect(mocks.buildSimulationState).toHaveBeenCalled());
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByText("No Joint instances found in the active scene.")).toBeNull();
  });

  it("rebuilds the joint list on tabChanged", async () => {
    roboticScene(control("j1", "shoulder"));
    render(<SimulationWindow />);
    expect(await screen.findByText("shoulder")).toBeDefined();

    roboticScene(control("j9", "wrist"));
    act(() => eventBus.publish("tabChanged"));

    expect(await screen.findByText("wrist")).toBeDefined();
    expect(screen.queryByText("shoulder")).toBeNull();
  });

  it("rebuilds on sceneInstanceMutated only for the ACTIVE scene instance", async () => {
    roboticScene(control("j1", "shoulder"));
    render(<SimulationWindow />);
    expect(await screen.findByText("shoulder")).toBeDefined();
    mocks.buildSimulationState.mockClear();

    // A mutation in some other open scene must not touch this panel.
    act(() => eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: "some-other-scene" }));
    await waitFor(() => expect(mocks.instanceUtility.getTabContextSceneInstance).toHaveBeenCalled());
    expect(mocks.buildSimulationState).not.toHaveBeenCalled();

    // The active one does.
    roboticScene(control("j1", "shoulder"), control("j2", "elbow"));
    act(() => eventBus.publish("sceneInstanceMutated", { sceneInstanceUuid: ACTIVE_SCENE_UUID }));
    expect(await screen.findByText("elbow")).toBeDefined();
  });

  it("coalesces a burst of refresh requests into one rebuild (the 100 ms timer)", async () => {
    roboticScene(control("j1", "shoulder"));
    render(<SimulationWindow />);
    expect(await screen.findByText("shoulder")).toBeDefined();
    mocks.buildSimulationState.mockClear();

    act(() => {
      eventBus.publish("tabChanged");
      eventBus.publish("tabChanged");
      eventBus.publish("tabChanged");
    });

    await waitFor(() => expect(mocks.buildSimulationState).toHaveBeenCalledTimes(1));
  });

  it("moving a slider forwards the value to the robot and shows the clamped result", async () => {
    const shoulder = control("j1", "shoulder");
    roboticScene(shoulder);
    render(<SimulationWindow />);
    await screen.findByText("shoulder");

    // MUI's Slider is a hidden native <input type="range"> (the element carrying
    // role="slider"). Pointer dragging needs real layout, and jsdom implements neither
    // that nor a range input's keyboard behaviour — firing `change` on the input is the
    // supported way to move it, and it is the same onChange the real widget calls.
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "0.25" } });

    await waitFor(() => expect(mocks.applyJointValue).toHaveBeenCalled());
    const [ctrlArg, rawArg] = mocks.applyJointValue.mock.calls[0];
    expect(ctrlArg.instance.uuid).toBe("j1");
    expect(rawArg).toBe(0.25);

    // The value shown comes back from applyJointValue (which clamps), not from the event.
    expect(await screen.findByText("Value: 0.25")).toBeDefined();
  });

  it("unsubscribes on unmount, so a later event cannot rebuild a dead component", async () => {
    roboticScene(control("j1", "shoulder"));
    const { unmount } = render(<SimulationWindow />);
    await screen.findByText("shoulder");
    mocks.buildSimulationState.mockClear();

    unmount();
    act(() => eventBus.publish("tabChanged"));

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(mocks.buildSimulationState).not.toHaveBeenCalled();
  });
});
