import { EventAggregator } from "aurelia";
import { Procedure } from "../../../../mmar-global-data-structure";
import { GlobalDefinition } from "resources/global_definitions";
import { ProcedureUtility } from "resources/services/procedure_utility";

/**
 * Represents a dialog for selecting and executing algorithms.
 */
export class DialogAlgorithm {
    procedures: Procedure[] = [];
    procedureNames: String[] = [];
    assignedProcedureNames: String[] = [];
    independentAlgorithmChoice: string;
    dependentAlgorithmChoice: string;
    assignedProcedures: Procedure[] = [];
    sceneTypeName: string;

    /**
     * Constructs a new instance of the DialogAlgorithm class.
     * @param eventAggregator - The event aggregator used for subscribing to events.
     * @param globalObjectInstance - The global object instance.
     * @param procedureUtility - The utility class for working with procedures.
     */
    constructor(
        private eventAggregator: EventAggregator,
        private globalObjectInstance: GlobalDefinition,
        private procedureUtility: ProcedureUtility,
    ) {
    }

    /**
     * Attaches the dialog to the DOM.
     */
    async attached() {
        this.eventAggregator.subscribe("openAlgorithmDialog", async () => {
            await this.getProcedures();
        });
    }

    /**
     * Retrieves the procedures from the database.
     */
    async getProcedures() {
        this.procedures = await this.procedureUtility.getGeneralProcedures();
        if (this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab] != undefined) {
            this.assignedProcedures = await this.procedureUtility.getAssignedProcedures();
            this.sceneTypeName = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneType.get_name();
        }
        await this.getProcedureNames();
    }

    /**
     * Retrieves the names of the procedures.
     */
    async getProcedureNames() {
        this.procedureNames = [];
        this.assignedProcedureNames = [];
        for (let i in this.procedures) {
            this.procedureNames.push(this.procedures[i].name);
        }
        for (let j in this.assignedProcedures) {
            this.assignedProcedureNames.push(this.assignedProcedures[j].name);
        }
    }

    /**
     * Executes the dependent algorithm.
     */
    async executeDependent() {
        await this.procedureUtility.execute("", this.dependentAlgorithmChoice);
    }

    /**
     * Executes the independent algorithm.
     */
    async executeIndependent() {
        await this.procedureUtility.execute(this.independentAlgorithmChoice, "");
    }
}