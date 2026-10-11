import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import unused from "eslint-plugin-unused-imports";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
      "review/**",
    ],
  },
  {
    files: ["src/**/*.{js,jsx}", "shared/**/*.js", "eslint.config.js"],
    ...js.configs.recommended,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": hooks, "unused-imports": unused },
    settings: { react: { version: "detect" } },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-no-undef": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["worker/**/*.ts", "vite.config.ts"],
  })),
  {
    files: ["worker/**/*.ts", "vite.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
];
