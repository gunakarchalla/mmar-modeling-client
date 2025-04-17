import { MetaUtility } from './meta_utility';
import { singleton } from "aurelia";
import { ExpressionUtility } from 'resources/expression_utility';
import { ObjectInstance } from '../../../../mmar-global-data-structure';

/**
 * Utility class for handling simulations.
 */
@singleton
export class SimulationUtility {
    
    /**
     * Creates an instance of SimulationUtility.
     * @param globalObjectInstance - The global object instance.
     * @param fetchHelper - The fetch helper.
     * @param metaUtility - The meta utility.
     * @param expression - The expression utility.
     */
    constructor(
        private metaUtility: MetaUtility,
        private expression: ExpressionUtility) { }

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