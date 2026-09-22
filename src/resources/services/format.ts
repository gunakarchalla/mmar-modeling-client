// Display formatting for attribute values. Attribute values are stored as strings;
// `numerise` turns one into a number for a numeric input, and `stringifyNumber` turns
// it back on edit. Used by the attribute window and the table-attribute dialog.

/**
 * Parse a stored attribute string into a number for display.
 *
 * Anything that is not a number falls back to `defaultValue` (or `fallbackValue` when
 * no default is given): an attribute nobody has filled in holds "", and older models
 * carry the "not defined" / "undefined" placeholders that unset values were written as
 * before. A slider handed NaN renders nothing and cannot be dragged back, so the
 * fallback is what such a value is worth.
 */
export function numerise(
  value: string,
  defaultValue?: number,
  fallbackValue?: number,
): number {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return defaultValue ?? (fallbackValue as number);
  return parsed;
}

/** Inverse of `numerise` (NumeriseConverter.fromView): number back to string. */
export function stringifyNumber(value: number): string {
  return value.toString();
}
