import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Flags valid guard-clause and mount-effect patterns used throughout the codebase.
      // These patterns (e.g. `if (!x) { setState(false); return; }`) are intentional
      // and do not cause the cascading render issues the rule is designed to prevent.
      "react-hooks/set-state-in-effect": "off",

      // Flags hoisted async function declarations called from useEffect. JavaScript
      // hoisting makes these work correctly at runtime; the rule is a style preference.
      "react-hooks/immutability": "off",

      // Noisy for Polish UI text which uses typographic quotes („…").
      // The rule flags some Unicode quote characters as unescaped entities.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
