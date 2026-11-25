// Unit tests for the client-side copy of the server's attribute-value rule.
//
// The point of these is drift: `attributeValueMatchesRegex` exists to answer the same
// way the server's `regexExValidator` answers, so the cases below use the REAL regexes
// the database ships for the pre-defined attribute types (mmar-database/init.sql).
// A value this accepts and the server refuses comes back as a 403 that rolls the whole
// scene back — the failure this check was added to prevent.
import { describe, it, expect, vi, beforeEach } from "vitest";

const logCalls: Array<[string, string]> = [];
vi.mock("./logger", () => ({
  logger: { log: (value: string, status: string) => logCalls.push([value, status]) },
}));

import {
  NOT_ALLOWED_MESSAGE,
  attributeTypeName,
  attributeValueMatchesRegex,
  reportMetamodelViolation,
} from "./metamodel-constraints";

const FLOAT_REGEX = "^[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$";
const INTEGER_REGEX = "^([0-9])*$";

/** A meta attribute of the given attribute type, shaped as the API sends it. */
function metaAttribute(regex_value: string | null, name = "Float") {
  return { attribute_type: { uuid: "at-1", name, regex_value } } as never;
}

beforeEach(() => {
  logCalls.length = 0;
});

describe("attributeValueMatchesRegex", () => {
  it("accepts a value that matches its attribute type's regex", () => {
    expect(attributeValueMatchesRegex("1.5", metaAttribute(FLOAT_REGEX))).toBe(true);
    expect(attributeValueMatchesRegex("-2", metaAttribute(FLOAT_REGEX))).toBe(true);
    expect(attributeValueMatchesRegex("1e-3", metaAttribute(FLOAT_REGEX))).toBe(true);
    expect(attributeValueMatchesRegex("42", metaAttribute(INTEGER_REGEX, "Integer"))).toBe(true);
  });

  it("refuses letters typed into a Float attribute — the reported case", () => {
    expect(attributeValueMatchesRegex("abc", metaAttribute(FLOAT_REGEX))).toBe(false);
    // Anchored: a value that only STARTS as a number is refused too.
    expect(attributeValueMatchesRegex("12abc", metaAttribute(FLOAT_REGEX))).toBe(false);
    expect(attributeValueMatchesRegex("1.5", metaAttribute(INTEGER_REGEX, "Integer"))).toBe(false);
  });

  it("holds an unset value to the regex, as the server does", () => {
    // "" is the value an attribute holds until someone fills it in - there is no
    // placeholder for an unset value any more - and null is the same value arriving
    // from an older record. Whether an attribute may be left unset is what its type's
    // regex says: the Float regex needs a digit, the Integer regex ends in `*`.
    expect(attributeValueMatchesRegex("", metaAttribute(FLOAT_REGEX))).toBe(false);
    expect(attributeValueMatchesRegex(null, metaAttribute(FLOAT_REGEX))).toBe(false);
    expect(attributeValueMatchesRegex("", metaAttribute(INTEGER_REGEX, "Integer"))).toBe(true);
    expect(attributeValueMatchesRegex(null, metaAttribute(INTEGER_REGEX, "Integer"))).toBe(true);
  });

  it("accepts without testing when there is no rule to apply", () => {
    // An attribute type that states no regex constrains nothing, and neither does an
    // attribute nobody could resolve. `undefined` is not the empty value but a field
    // that was not sent, which a write keeps as it is stored.
    expect(attributeValueMatchesRegex("anything", metaAttribute(null))).toBe(true);
    expect(attributeValueMatchesRegex("anything", undefined)).toBe(true);
    expect(attributeValueMatchesRegex(undefined, metaAttribute(FLOAT_REGEX))).toBe(true);
  });

  it("matches the whole value, in the case it was written in", () => {
    // The check used to apply "gmi". "m" anchored per line, so a value with a newline
    // passed as long as one of its lines did, and "i" made every pattern case-blind.
    expect(attributeValueMatchesRegex("hello\n12", metaAttribute(FLOAT_REGEX))).toBe(false);
    expect(attributeValueMatchesRegex("tcp", metaAttribute("^(TCP|UDP)$", "Protocol"))).toBe(false);
    expect(attributeValueMatchesRegex("TCP", metaAttribute("^(TCP|UDP)$", "Protocol"))).toBe(true);
    // A pattern an author left the anchors off still describes the whole value.
    expect(attributeValueMatchesRegex("abc12", metaAttribute("[0-9]+", "Digits"))).toBe(false);
    expect(attributeValueMatchesRegex("12", metaAttribute("[0-9]+", "Digits"))).toBe(true);
  });

  it("accepts when the pattern will not compile, leaving the verdict to the server", () => {
    expect(attributeValueMatchesRegex("anything", metaAttribute("([unclosed"))).toBe(true);
  });

  it("answers the same way on repeated calls", () => {
    const meta = metaAttribute(FLOAT_REGEX);
    expect(attributeValueMatchesRegex("1", meta)).toBe(true);
    expect(attributeValueMatchesRegex("2", meta)).toBe(true);
    expect(attributeValueMatchesRegex("3", meta)).toBe(true);
  });
});

describe("reportMetamodelViolation", () => {
  it("raises the snackbar and writes the detail to the log window", () => {
    reportMetamodelViolation('"abc" is not a valid Float value for Speed.');

    // "error" is what logStore turns into the snackbar; "close" is log-window only.
    expect(logCalls[0]).toEqual([NOT_ALLOWED_MESSAGE, "error"]);
    expect(logCalls[1][1]).toBe("close");
    expect(logCalls[1][0]).toContain('"abc" is not a valid Float value for Speed.');
  });

  it("logs the bare message when there is no detail", () => {
    reportMetamodelViolation();

    expect(logCalls).toEqual([
      [NOT_ALLOWED_MESSAGE, "error"],
      [NOT_ALLOWED_MESSAGE, "close"],
    ]);
  });
});

describe("attributeTypeName", () => {
  it("names the attribute type, falling back for an unresolved meta attribute", () => {
    expect(attributeTypeName(metaAttribute(FLOAT_REGEX))).toBe("Float");
    expect(attributeTypeName(undefined)).toBe("attribute");
  });
});
