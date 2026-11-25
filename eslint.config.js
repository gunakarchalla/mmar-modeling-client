// Flat config for ESLint 10, which no longer reads `.eslintrc.*`.
//
// This is a 1:1 port of the `.eslintrc.cjs` it replaces: same parser, same
// rules. `ignorePatterns` moved into the `ignores` block below - flat config
// reads neither `.eslintignore` nor `ignorePatterns`.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "node_modules"] },

  js.configs.recommended,
  // Supplies the @typescript-eslint plugin, its recommended rules, and the
  // `eslint-recommended` layer that switches off the core rules TypeScript
  // already covers (no-undef, core no-unused-vars, ...).
  ...tseslint.configs["flat/recommended"],

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
      // The old `env: { browser: true, es2020: true }`. Documentation of intent
      // more than enforcement today: `eslint-recommended` turns `no-undef` off
      // for TypeScript files, so nothing currently reads this list.
      globals: { ...globals.browser },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // The gds DTOs and the three.js/urdf-loader typings force a fair amount of `any`.
      "@typescript-eslint/no-explicit-any": "off",
      // Unused locals and imports are dead code; unused ARGUMENTS are not, since a
      // signature may be fixed by an interface or by stored code that calls it.
      "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
    },
  },
];
