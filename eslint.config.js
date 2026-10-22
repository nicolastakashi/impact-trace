// Names: no one-letter identifiers, and no little-known abbreviations. See docs/glossary.md.
import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules", "qa/.data", "qa/report", "test-results", "data", "skills"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "id-length": ["error", { min: 2, exceptions: ["_"], properties: "never" }],
    },
  },
];
