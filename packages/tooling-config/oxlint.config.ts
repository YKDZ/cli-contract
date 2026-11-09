import { defineConfig } from "oxlint";

// OXC 目前的 erasing-op 规则不能拒绝枚举、运行时命名空间和参数属性；
// 可擦除语法仍以 TypeScript 7 的 erasableSyntaxOnly 检查为准。
export default defineConfig({
  options: { typeAware: true },
  categories: { correctness: "error", suspicious: "warn" },
});
