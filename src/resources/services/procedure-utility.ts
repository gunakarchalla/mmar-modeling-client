import { Procedure } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { backendService } from "./backend-service";
import { metaUtility } from "./meta-utility";
import { expressionUtility } from "./expression-utility";

/**
 * The data half of the "Algorithms" feature: fetches the procedures stored in the
 * metamodel — the server-wide independent ones, and those assigned to a scene type —
 * and runs a chosen procedure's code string against the expression API.
 *
 * The dialog owns the UI; this module owns the fetching and the execution.
 */
export class ProcedureUtility {
  procedureCode!: string;
  procedures: Procedure[] = [];
  assignedProcedures: Procedure[] = [];

  private globalObjectInstance = globalObject;
  private metaUtility = metaUtility;
  private expression = expressionUtility;

  /**
   * Retrieves general procedures.
   * @returns A promise that resolves to an array of general procedures.
   */
  async getGeneralProcedures(): Promise<Procedure[]> {
    const response = await backendService.getProcedures();
    if (Array.isArray(response)) {
      this.procedures = response.map((item) => Procedure.fromJS(item) as Procedure);
    }
    return this.procedures;
  }

  /**
   * Retrieves assigned procedures.
   * @returns A promise that resolves to an array of assigned procedures.
   */
  async getAssignedProcedures(): Promise<Procedure[]> {
    const activeSceneType =
      this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab].sceneType.get_uuid();
    const response = await backendService.getAssignedProcedures(activeSceneType);
    if (Array.isArray(response)) {
      this.assignedProcedures = response.map((item) => Procedure.fromJS(item) as Procedure);
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
      const generalProcedureCode = await this.getProcedureCodeByName(
        this.procedures,
        generalAlgorithmName,
      );
      if (generalProcedureCode) {
        // run the general procedure
        await this.runProcedureFunction(generalProcedureCode);
      }
    }

    if (await this.isValidAlgorithmName(specificAlgorithmName)) {
      const specificProcedureCode = await this.getProcedureCodeByName(
        this.assignedProcedures,
        specificAlgorithmName,
      );
      if (specificProcedureCode) {
        // run the specific procedure
        await this.runProcedureFunction(specificProcedureCode);
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
    const procedure = procedures.find((proc) => proc.name === name);
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
}

// Module singleton — one shared instance.
export const procedureUtility = new ProcedureUtility();
