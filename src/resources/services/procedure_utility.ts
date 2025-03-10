import { MetaUtility } from './meta_utility';
import { singleton } from "aurelia";
import { AttributeInstance, Procedure } from "../../../../mmar-global-data-structure";
import { FetchHelper } from "./fetchHelper";
import { GlobalDefinition } from "resources/global_definitions";
import { ExpressionUtility } from 'resources/expression_utility';
import { VizrepUpdateChecker } from './vizrep_update_checker';
import { InstanceUtility } from './instance_utility';

/**
 * Utility class for handling procedures.
 */
@singleton
export class ProcedureUtility {
    procedureCode: string;
    procedures: Procedure[] = [];
    assignedProcedures: Procedure[] = [];

    /**
     * Creates an instance of ProcedureUtility.
     * @param globalObjectInstance - The global object instance.
     * @param fetchHelper - The fetch helper.
     * @param metaUtility - The meta utility.
     * @param expression - The expression utility.
     */
    constructor(
        private globalObjectInstance: GlobalDefinition,
        private fetchHelper: FetchHelper,
        private metaUtility: MetaUtility,
        private expression: ExpressionUtility,
        private updateChecker: VizrepUpdateChecker,
        private instanceUtility: InstanceUtility) { }

    /**
     * Retrieves general procedures.
     * @returns A promise that resolves to an array of general procedures.
     */
    async getGeneralProcedures(): Promise<Procedure[]> {
        const response = await this.fetchHelper.getProcedures();
        if (Array.isArray(response)) {
            this.procedures = response.map(item => Procedure.fromJS(item) as Procedure);
        }
        return this.procedures;
    }

    /**
     * Retrieves assigned procedures.
     * @returns A promise that resolves to an array of assigned procedures.
     */
    async getAssignedProcedures(): Promise<Procedure[]> {
        const activeSceneType = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneType.get_uuid();
        const response = await this.fetchHelper.getAssignedProcedures(activeSceneType);
        if (Array.isArray(response)) {
            this.assignedProcedures = response.map(item => Procedure.fromJS(item) as Procedure);
        }
        return this.assignedProcedures;
    }

    /**
     * Executes a procedure.
     * @param generalAlgorithmName - The name of the general algorithm.
     * @param specificAlgorithmName - The name of the specific algorithm.
     */
    async execute(generalAlgorithmName: string, specificAlgorithmName: string): Promise<void> {
        if (await this.isValidAlgorithmName(generalAlgorithmName)) {
            const generalProcedureCode = await this.getProcedureCodeByName(this.procedures, generalAlgorithmName);
            if (generalProcedureCode) {
                // run the general procedure
                await this.runProcedureFunction(generalProcedureCode);
                // after running the general procedure, check for visualization updates
                await this.CheckForVisualizationUpdate();
            }
        }

        if (await this.isValidAlgorithmName(specificAlgorithmName)) {
            const specificProcedureCode = await this.getProcedureCodeByName(this.assignedProcedures, specificAlgorithmName);
            if (specificProcedureCode) {
                // run the specific procedure
                await this.runProcedureFunction(specificProcedureCode);
                // after running the specific procedure, check for visualization updates
                await this.CheckForVisualizationUpdate();
            }
        }
    }

    /**
     * Checks if an algorithm name is valid.
     * @param name - The algorithm name to check.
     * @returns A promise that resolves to a boolean indicating if the algorithm name is valid.
     */
    async isValidAlgorithmName(name: string): Promise<boolean> {
        return name !== undefined && name !== "" && name !== "none";
    }

    /**
     * Retrieves the procedure code by name.
     * @param procedures - The array of procedures to search in.
     * @param name - The name of the procedure to retrieve.
     * @returns A promise that resolves to the procedure code, or undefined if not found.
     */
    async getProcedureCodeByName(procedures: Procedure[], name: string): Promise<string | undefined> {
        const procedure = procedures.find(proc => proc.name === name);
        return procedure?.definition;
    }

    /**
     * Runs a procedure function.
     * @param procedureCode - The code of the procedure function to run.
     * @returns A promise that resolves when the procedure function has finished running.
     */
    async runProcedureFunction(procedureCode: string): Promise<void> {
        const procedureFunction = await this.metaUtility.parseMetaFunction(procedureCode);
        await procedureFunction(this.expression);
    }

    /**
     * Checks for visualization updates.
     */
    async CheckForVisualizationUpdate() {
        //get all attributeInstances that are assigned to the current sceneInstance, its classInstances, relationclassInstances and portInstances
        const sceneInstance = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneInstance;
        let attributeInstances: AttributeInstance[] = sceneInstance.attribute_instances;

        attributeInstances = [...attributeInstances, ...(await this.instanceUtility.getAllAttributeInstancesFromObjectInstanceRecursively(sceneInstance))];

        //-----------------------------------------
        // this would be more performant but with the risk that some changes are not detected
        //----------------------------------------

        //filter the attributeInstances to make sure that there is always only one attributeIstance with the same uuid_class_instance, uuid_port_instance and uuid_scene_instance
        // attributeInstances = attributeInstances.filter((attributeInstance, index, self) =>
        //     index === self.findIndex((t) => (
        //         t.assigned_uuid_class_instance === attributeInstance.assigned_uuid_class_instance &&
        //         t.assigned_uuid_port_instance === attributeInstance.assigned_uuid_port_instance &&
        //         t.assigned_uuid_scene_instance === attributeInstance.assigned_uuid_scene_instance
        //     ))
        // );


        //for each attribute run the checkForVizRepUpdate function
        //not ideal, since some class_instances might be checked multiple times
        for (const attributeInstance of attributeInstances) {
            if (attributeInstance.assigned_uuid_class_instance) {
                await this.updateChecker.checkForVizRepUpdate(attributeInstance);
            }
        }
    }
}