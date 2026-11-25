import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { logger } from "@/resources/services/logger";
import { eventBus } from "@/resources/services/event-bus";
import { useStateStore } from "@/resources/store/stateStore";

/**
 * The interaction state machine: which of the five modes the canvas is in, and what
 * each mode does to the controls and the cursor.
 *
 * Entering a mode always clears the current selection and detaches the transform
 * gizmo; `MODE_SETTINGS` then says how that mode configures the transform / orbit
 * controls and which cursor it shows. Selection mode is the only one that hands the
 * transform gizmo to the user, and the only one that locks orbit rotation.
 *
 * `stateNames` is indexed by the mode number used throughout the app (0 selection,
 * 1 view, 2 drawing, 3 drawing-relationclass, 4 simulation) and is also the label
 * shown in the state window.
 *
 * The engine stays the source of truth; `setState` additionally mirrors the active
 * state into `stateStore` so React can render it.
 */

/** How one interaction mode configures the controls and the canvas cursor. */
interface ModeSettings {
  transformControls: boolean;
  orbitRotate: boolean;
  cursor: string;
}

/** Indexed by mode number, parallel to `GlobalStateObject.stateNames`. */
const MODE_SETTINGS: ModeSettings[] = [
  // 0 SelectionMode (drag): the gizmo is the tool, so orbit rotation would fight it.
  { transformControls: true, orbitRotate: false, cursor: "grab" },
  // 1 ViewMode
  { transformControls: false, orbitRotate: true, cursor: "pointer" },
  // 2 DrawingMode (insert)
  { transformControls: false, orbitRotate: true, cursor: "copy" },
  // 3 DrawingModeRelationClass (line)
  { transformControls: false, orbitRotate: true, cursor: "copy" },
  // 4 SimulationMode
  { transformControls: false, orbitRotate: true, cursor: "help" },
];

export class GlobalStateObject {
  stateNames: string[];
  activeState: string;
  activeStateLine?: Line2;

  private globalObjectInstance = globalObject;
  private globalSelectedObject = globalSelectedObject;
  private logger = logger;
  private eventAggregator = eventBus;

  constructor() {
    this.stateNames = ["SelectionMode (drag)", "ViewMode", "DrawingMode (insert)", "DrawingModeRelationClass (line)", "SimulationMode"];
    this.activeState = "";
  }
  onStateChange() {
    this.logger.log(`The state has changed to ${this.getState()}`, "info");

    this.eventAggregator.publish("removeAttributeGui");

    this.globalSelectedObject.removeObject();
    if (this.globalObjectInstance.transformControls) {
      this.globalObjectInstance.transformControls.detach();
    }

    const settings = MODE_SETTINGS[this.stateNames.indexOf(this.activeState)];
    if (!settings) return;

    this.globalObjectInstance.transformControls.enabled = settings.transformControls;
    this.globalObjectInstance.orbitControls.enabled = true;
    // Zoom stays available in every mode; only rotation is mode-dependent.
    this.globalObjectInstance.orbitControls.enableZoom = true;
    this.globalObjectInstance.orbitControls.enableRotate = settings.orbitRotate;
    this.globalObjectInstance.elementContainer.style.cursor = settings.cursor;

    this.logger.log(`transformControls ${settings.transformControls ? "enabled" : "disabled"}`, "info");
    this.logger.log(`orbitControls rotation ${settings.orbitRotate ? "enabled" : "disabled"}`, "info");
  }

  getState() {
    return this.activeState;
  }
  setState(value: number) {
    this.activeState = this.stateNames[value];
    // Reactive mirror for the StateWindow (the engine stays the source of truth).
    useStateStore.getState().setActiveState(this.activeState);
    this.onStateChange();
  }

  setActiveStateLine(line: Line2) {
    this.activeStateLine = line;
  }
}

// Module singleton — one shared instance.
export const globalStateObject = new GlobalStateObject();
