import type { SxProps, Theme } from "@mui/material";

/**
 * The look of a field whose attribute has a read-only UI component ("text-readonly",
 * "multi-line-readonly").
 *
 * The field is made `readOnly`, not `disabled`, and greyed by these styles instead: a
 * disabled input cannot be focused, its text cannot be selected or copied, and in
 * Firefox a disabled textarea does not scroll — which a long multi-line value, such as
 * a mechanism's code, needs. The focus outline is left alone, so keyboard users still
 * see where they are.
 */
export const READ_ONLY_FIELD_SX: SxProps<Theme> = {
  "& .MuiInputBase-root": { bgcolor: "action.hover" },
  "& .MuiInputBase-input": { color: "text.secondary" },
  "& .MuiInputLabel-root:not(.Mui-focused)": { color: "text.disabled" },
  "& .MuiOutlinedInput-root:not(.Mui-focused) .MuiOutlinedInput-notchedOutline, & .MuiOutlinedInput-root:not(.Mui-focused):hover .MuiOutlinedInput-notchedOutline":
    { borderColor: "action.disabled" },
};
