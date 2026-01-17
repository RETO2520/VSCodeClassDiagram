import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import stylistic from '@stylistic/eslint-plugin';
export default defineConfig([
  {
    files: [
      "**/*.{js,mjs,cjs,ts,mts,cts}"
    ],
    plugins: {
      js,
      '@stylistic': stylistic
    },
    extends: [
      "js/recommended"
    ],
    rules: {
      "object-curly-newline": ["error", {
        "ObjectExpression": "always",
        "ObjectPattern": {
          "multiline": true
        },
        "ImportDeclaration": "never",
        "ExportDeclaration": {
          "multiline": true,
          "minProperties": 3
        }
      }],
      "object-property-newline": "error",
      "indent": ["error", 2, {
        "SwitchCase": 1
      }]
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  tseslint.configs.recommended,
]);
