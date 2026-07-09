import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import _import from "eslint-plugin-import";
import prettier from "eslint-plugin-prettier";
import { defineConfig } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import { includeIgnoreFile } from "@eslint/compat";
import globals from "globals";

const gitignorePath = fileURLToPath(new URL("../../.gitignore", import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
{
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
        prettier,
        "simple-import-sort": simpleImportSort,
        "@typescript-eslint": fixupPluginRules(typescriptEslint),
        import: fixupPluginRules(_import),
    },
    languageOptions: {
        parser: tsParser,
        sourceType: "module",
        parserOptions: {
            project: "./tsconfig.eslint.json",
        },
        globals: { ...globals.node, 'Hash': 'readonly' }
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs']
        }
      }
    },
    rules: {
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: fixupConfigRules(compat.extends(
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier",
        "./.eslint.rules.json"
    )),
    rules: {
        // You might need to add specific rules here if they are not covered by the extended configs
    }
  },
  // Configuration for JavaScript files
  {
    files: ["**/*.js", "**/*.mjs"], // Apply this config to JS files
    extends: [
        js.configs.recommended
    ],
    plugins: {
        prettier,
        "simple-import-sort": simpleImportSort,
        import: fixupPluginRules(_import),
    },
    languageOptions: {
        sourceType: "module",
        globals: { ...globals.node }
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs']
        }
      }
    }
  },
  // Top-level ignores for files that should never be linted by any config
  {
      ignores: ["eslint.config.mjs", "jest.config.cjs", "build.ci", "lib.d.ts"]
  }
]);