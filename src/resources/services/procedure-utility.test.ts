import { describe, it, expect, beforeEach, vi } from "vitest";
import { Procedure } from "@gds";

/**
 * P12 tests for procedure-utility — the Algorithms dialog's engine (plan §9 P12:
 * "procedure execution sandbox runs a trivial script"). The data half landed in P3 but
 * was never tested; P12 wires the UI onto it, so the contract the dialog depends on gets
 * pinned here.
 *
 * The "sandbox" is real: `metaUtility.parseMetaFunction` does
 * `new Function('"use strict";return (' + code + ')')()`, i.e. the procedure's stored
 * DEFINITION is a JS function expression evaluated against `expressionUtility`. These
 * tests run genuine (trivial) procedure code strings through it, because that eval is
 * the whole feature — mocking it would test nothing.
 *
 * global-definition is faked (WebGLRenderer at module scope — P3 note); backend-service
 * is mocked (no live server needed for the execute() dispatch logic).
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    tabContext: [] as { sceneType: { get_uuid: () => string } }[],
    selectedTab: 0,
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const mocks = vi.hoisted(() => ({
  backendService: {
    getProcedures: vi.fn(async (): Promise<unknown[]> => []),
    getAssignedProcedures: vi.fn(async (): Promise<unknown[]> => []),
  },
  // The object every procedure code string is handed as its first argument.
  expressionUtility: { marker: "expression-utility" },
}));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
vi.mock("@/resources/services/expression-utility", () => ({ expressionUtility: mocks.expressionUtility }));

// meta-utility is NOT mocked: parseMetaFunction is the sandbox under test.
const { ProcedureUtility } = await import("@/resources/services/procedure-utility");
type ProcedureUtilityType = InstanceType<typeof ProcedureUtility>;

function procedureJson(name: string, definition: string) {
  return { uuid: `uuid-${name}`, name, definition };
}

describe("procedure-utility", () => {
  let utility: ProcedureUtilityType;

  beforeEach(() => {
    vi.clearAllMocks();
    utility = new ProcedureUtility();
    fakeGlobal.globalObject.tabContext = [{ sceneType: { get_uuid: () => "scene-type-uuid" } }];
    fakeGlobal.globalObject.selectedTab = 0;
  });

  describe("fetching", () => {
    it("revives the independent procedures into real gds Procedures", async () => {
      mocks.backendService.getProcedures.mockResolvedValue([procedureJson("Trivial", "async () => {}")]);

      const procedures = await utility.getGeneralProcedures();

      expect(procedures).toHaveLength(1);
      // P3's rule: gds data must revive through fromJS, so instanceof holds downstream.
      expect(procedures[0]).toBeInstanceOf(Procedure);
      expect(procedures[0].name).toBe("Trivial");
    });

    it("fetches the assigned procedures for the OPEN tab's scene type", async () => {
      mocks.backendService.getAssignedProcedures.mockResolvedValue([procedureJson("Specific", "async () => {}")]);

      const procedures = await utility.getAssignedProcedures();

      expect(mocks.backendService.getAssignedProcedures).toHaveBeenCalledWith("scene-type-uuid");
      expect(procedures[0]).toBeInstanceOf(Procedure);
    });
  });

  describe("the execution sandbox", () => {
    it("runs a trivial procedure code string, handing it the expression utility", async () => {
      const calls: unknown[] = [];
      (globalThis as unknown as { __probe: (arg: unknown) => void }).__probe = (arg) => calls.push(arg);

      // A REAL procedure definition: a function expression, exactly as stored in the DB.
      await utility.runProcedureFunction("async (expression) => { globalThis.__probe(expression); }");

      expect(calls).toEqual([mocks.expressionUtility]);
      delete (globalThis as unknown as { __probe?: unknown }).__probe;
    });

    it("awaits the procedure, so an async body completes before execute() returns", async () => {
      const state = { done: false };
      (globalThis as unknown as { __state: typeof state }).__state = state;

      await utility.runProcedureFunction(
        "async () => { await new Promise(r => setTimeout(r, 5)); globalThis.__state.done = true; }",
      );

      expect(state.done).toBe(true);
      delete (globalThis as unknown as { __state?: unknown }).__state;
    });

    it("propagates a throwing procedure to the caller (the dialog logs it)", async () => {
      await expect(utility.runProcedureFunction("async () => { throw new Error('bad algorithm'); }")).rejects.toThrow(
        "bad algorithm",
      );
    });

    it("rejects on a syntactically broken definition rather than failing silently", async () => {
      await expect(utility.runProcedureFunction("this is not javascript (")).rejects.toBeInstanceOf(SyntaxError);
    });
  });

  describe("execute() dispatch (what the Algorithms dialog calls)", () => {
    const RECORDER = "async () => { globalThis.__ran.push('NAME'); }";

    beforeEach(() => {
      (globalThis as unknown as { __ran: string[] }).__ran = [];
      mocks.backendService.getProcedures.mockResolvedValue([
        procedureJson("General A", RECORDER.replace("NAME", "General A")),
        procedureJson("General B", RECORDER.replace("NAME", "General B")),
      ]);
      mocks.backendService.getAssignedProcedures.mockResolvedValue([
        procedureJson("Specific A", RECORDER.replace("NAME", "Specific A")),
      ]);
    });

    const ran = () => (globalThis as unknown as { __ran: string[] }).__ran;

    it("runs only the named independent procedure ('' means skip this group)", async () => {
      await utility.getGeneralProcedures();

      await utility.execute("General B", "");

      expect(ran()).toEqual(["General B"]);
    });

    it("runs only the named assigned procedure", async () => {
      await utility.getGeneralProcedures();
      await utility.getAssignedProcedures();

      await utility.execute("", "Specific A");

      expect(ran()).toEqual(["Specific A"]);
    });

    it("runs both groups when both are named, independent first", async () => {
      await utility.getGeneralProcedures();
      await utility.getAssignedProcedures();

      await utility.execute("General A", "Specific A");

      expect(ran()).toEqual(["General A", "Specific A"]);
    });

    it("does nothing for '', undefined or 'none' (the dialog's empty selection)", async () => {
      await utility.getGeneralProcedures();
      await utility.getAssignedProcedures();

      await utility.execute("", "");
      await utility.execute(undefined as unknown as string, "none");
      await utility.execute("none", undefined as unknown as string);

      expect(ran()).toEqual([]);
    });

    it("does nothing for a name that matches no procedure", async () => {
      await utility.getGeneralProcedures();

      await utility.execute("No Such Algorithm", "");

      expect(ran()).toEqual([]);
    });
  });
});
