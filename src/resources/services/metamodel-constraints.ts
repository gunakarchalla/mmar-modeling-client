import { value_matches_pattern, type Attribute } from "@gds";
import { logger } from "./logger";

/**
 * The metamodel constraints the client checks BEFORE the server does.
 *
 * Everything the user builds is validated again by the server's rule engine, which
 * answers a violation with a 403. For a scene edit that 403 is expensive: the whole
 * scene is rolled back to the last saved snapshot and re-imported, which pulls every
 * object out of the THREE scene and leaves the selection, the transform controls and
 * the relation lines pointing at meshes that are gone. Catching the violation here
 * keeps the refused value out of the model in the first place, and reports it the way
 * every other metamodel rejection is reported — the error snackbar.
 */

/** Message shown when the metamodel forbids what the user is doing. */
export const NOT_ALLOWED_MESSAGE = "This action is not allowed due to some restrictions in the metamodel!";

/**
 * Report a refused action: an "error" entry, which the log store raises as the
 * snackbar, and a "close" entry for the log window — which carries `detail` when there
 * is one, so the panel says WHICH value was refused while the snackbar stays short.
 */
export function reportMetamodelViolation(detail?: string): void {
  logger.log(NOT_ALLOWED_MESSAGE, "error");
  logger.log(detail ? `${NOT_ALLOWED_MESSAGE} ${detail}` : NOT_ALLOWED_MESSAGE, "close");
}

/**
 * Whether `value` satisfies the regular expression of the attribute type the meta
 * attribute belongs to — letters typed into a Float attribute do not.
 *
 * The verdict itself comes from `value_matches_pattern` in gds, which the server's
 * `regexExValidator` rule and the metamodeling client apply to the same values, so a
 * value accepted here cannot be refused there — which would cost the user the whole
 * scene, as described above. An attribute type that states no regex constrains nothing.
 *
 * An EMPTY value is checked like any other: whether an attribute may be left unset is
 * what its type's regex says.
 */
export function attributeValueMatchesRegex(
  value: string | null | undefined,
  metaAttribute: Attribute | null | undefined,
): boolean {
  return value_matches_pattern(value, metaAttribute?.attribute_type?.regex_value);
}

/** The attribute type's name ("Float"), for the log-window detail line. */
export function attributeTypeName(metaAttribute: Attribute | null | undefined): string {
  return metaAttribute?.attribute_type?.name ?? "attribute";
}
