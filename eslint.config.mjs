import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: [
      "main.js",
      "node_modules/",
      "node_modules.bak/",
      ".obsidian-cache/",
      "test/",
      "*.mjs",
      "wdio.conf.mts"
    ]
  },

  // The same ruleset the Obsidian plugin-review scanner runs
  ...[obsidianmd.configs.recommended].flat(),

  {
    files: ["src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",

      // Warn, matching the review scanner: the deprecated display() and
      // setDynamicTooltip() calls are deliberate fallbacks for Obsidian
      // versions before 1.13, and the plugin config forbids inline disables
      "@typescript-eslint/no-deprecated": "warn",

      // UI copy stays as originally written; renaming commands and settings
      // is a UX decision, and the rule's suggestions mangle brand names like
      // LanguageTool
      "obsidianmd/ui/sentence-case": "off"
    }
  }
);
