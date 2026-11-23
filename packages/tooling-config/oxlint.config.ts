import { defineConfig } from "oxlint";

// OXC's erasing-op rule cannot reject enums, runtime namespaces, or parameter properties yet;
// TypeScript 7's erasableSyntaxOnly check remains the gate for erasable syntax.
export default defineConfig({
  options: { typeAware: true },
  categories: { correctness: "error", suspicious: "warn" },
});
