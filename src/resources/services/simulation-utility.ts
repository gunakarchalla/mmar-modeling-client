import { ObjectInstance } from "@gds";
import { metaUtility } from "./meta-utility";
import { expressionUtility } from "./expression-utility";

/**
 * Runs a stored simulation code string. The code is compiled by `meta-utility` and
 * called with the expression API and the instance it belongs to, which is what lets a
 * simulation read and write model values. Triggered by clicking a button object in
 * simulation mode and by the simulation window's sliders.
 */
export class SimulationUtility {
  private metaUtility = metaUtility;
  private expression = expressionUtility;

  /**
   * Runs a simulation function.
   * @param simulationCode - The code of the simulation function to run.
   * @returns A promise that resolves when the simulation function has finished running.
   */
  async runSimulationFunction(simulationCode: string, instance: ObjectInstance): Promise<void> {
    const simulationFunction = await this.metaUtility.parseMetaFunction(simulationCode);
    await simulationFunction(this.expression, instance);
  }
}

// Module singleton — one shared instance.
export const simulationUtility = new SimulationUtility();
