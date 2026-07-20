import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "com.alxbra.codex-status-actions.sdPlugin/bin/**",
      "release/**",
      "eslint.config.js",
      "rollup.config.mjs"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }]
    }
  },
  {
    files: ["scripts/**/*.mjs", "marketplace/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { console: "readonly" }
    }
  },
  {
    files: ["marketplace/**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      sourceType: "script",
      globals: {
        document: "readonly",
        URLSearchParams: "readonly",
        window: "readonly"
      }
    }
  },
  {
    files: ["com.alxbra.codex-status-actions.sdPlugin/ui/**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      sourceType: "script",
      globals: {
        WebSocket: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        navigator: "readonly",
        propertyInspectorHost: "readonly",
        setTimeout: "readonly"
      }
    }
  }
);
