import { describe, it, expect, beforeEach } from "vitest";
import { VizRepReads, readKeys } from "./vizrep-reads";

const SELF = { uuid: "self" } as never;

/** An expression API whose calls answer with their method name. */
function fakeExpression() {
  const calls: string[] = [];
  const method = (name: string) => async (...args: unknown[]) => {
    calls.push(`${name}(${args.join(",")})`);
    return name;
  };
  return {
    calls,
    expression: {
      attrval: method("attrval"),
      attrvalByName: method("attrvalByName"),
      attrvalByInst: method("attrvalByInst"),
      getOutgoingRelationsByInstanceUUID: method("getOutgoingRelationsByInstanceUUID"),
      setAttrvalByInstanceUUID: method("setAttrvalByInstanceUUID"),
      self: async () => "the plain answer",
      version: 3,
    },
  };
}

let reads: VizRepReads;
beforeEach(() => {
  reads = new VizRepReads();
});

describe("VizRepReads.tracking", () => {
  it("passes every call on unchanged", async () => {
    const { calls, expression } = fakeExpression();
    const run = reads.tracking(expression, SELF);

    expect(await run.expression.attrvalByInst("attr", "other")).toBe("attrvalByInst");
    expect(run.expression.version).toBe(3);
    expect(calls).toEqual(["attrvalByInst(attr,other)"]);
  });

  it("records what the run read, under the instance the data belongs to", async () => {
    const run = reads.tracking(fakeExpression().expression, SELF);
    await run.expression.attrval("attr-1");
    await run.expression.attrvalByName("Name");
    await run.expression.attrvalByInst("attr-2", "other");
    await run.expression.getOutgoingRelationsByInstanceUUID("other", "meta-rel");
    // A write is not a read.
    await run.expression.setAttrvalByInstanceUUID("other", "attr-3", "v");
    run.done();

    expect(reads.readers([readKeys.attribute("self", "attr-1")])).toEqual(new Set(["self"]));
    expect(reads.readers([readKeys.attributeNamed("self", "Name")])).toEqual(new Set(["self"]));
    expect(reads.readers([readKeys.attribute("other", "attr-2")])).toEqual(new Set(["self"]));
    expect(reads.readers([readKeys.relations("other")])).toEqual(new Set(["self"]));
    expect(reads.readers([readKeys.attribute("other", "attr-3")]).size).toBe(0);
  });

  it("answers self() with the instance being drawn", async () => {
    const run = reads.tracking(fakeExpression().expression, SELF);

    expect(await run.expression.self()).toBe(SELF);
  });

  it("lets a run's reads replace the previous run's", async () => {
    const first = reads.tracking(fakeExpression().expression, SELF);
    await first.expression.attrval("old");
    first.done();
    const second = reads.tracking(fakeExpression().expression, SELF);
    await second.expression.attrval("new");
    second.done();

    expect(reads.readers([readKeys.attribute("self", "old")]).size).toBe(0);
    expect(reads.readers([readKeys.attribute("self", "new")])).toEqual(new Set(["self"]));
  });

  it("ignores what is read after the run ended", async () => {
    const run = reads.tracking(fakeExpression().expression, SELF);
    run.done();
    await run.expression.attrval("late");

    expect(reads.hasRecord("self")).toBe(true);
    expect(reads.readers([readKeys.attribute("self", "late")]).size).toBe(0);
  });

  it("keeps the runs of two instances apart", async () => {
    const a = reads.tracking(fakeExpression().expression, { uuid: "a" } as never);
    const b = reads.tracking(fakeExpression().expression, { uuid: "b" } as never);
    await a.expression.attrval("x");
    await b.expression.attrval("x");
    a.done();
    b.done();

    expect(reads.readers([readKeys.attribute("a", "x")])).toEqual(new Set(["a"]));
    expect(reads.readers([readKeys.attribute("b", "x")])).toEqual(new Set(["b"]));
  });
});

describe("VizRepReads.forget", () => {
  it("drops an instance and every read it made", async () => {
    const run = reads.tracking(fakeExpression().expression, SELF);
    await run.expression.attrval("attr");
    run.done();

    reads.forget("self");

    expect(reads.hasRecord("self")).toBe(false);
    expect(reads.readers([readKeys.attribute("self", "attr")]).size).toBe(0);
  });
});
