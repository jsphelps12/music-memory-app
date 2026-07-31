import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "**/.expo/**",
      "**/node_modules/**",
      "ios/**",
      "android/**",
      "web/**",
      "modules/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  // Disable no-undef globally — TypeScript's compiler already catches undefined
  // variables, and no-undef produces false positives for React Native globals
  // (__DEV__, require, module, etc.) in both .ts and .js files
  {
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Use only the two core hooks rules — react-hooks v7 adds strict React
      // Compiler rules in its recommended spread that are too aggressive for
      // an existing codebase
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // TypeScript handles undefined-variable checking — no-undef causes false
      // positives for globals like `require`, `__DEV__`, etc. in React Native
      "no-undef": "off",
      // Empty catch blocks are common in RN for try/catch error handling
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Turn off for now — existing codebase has many `any` types; re-enable
      // and fix incrementally once the rest of the codebase is clean
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
];
