import { defineCli } from "@ykdz/cli-contract";
import { z } from "zod";

const define = defineCli();
const countInput = z.object({ count: z.number() });
const requiredEitherInput = z.union([
  z.object({ count: z.number() }),
  z.object({ name: z.string() }),
]);

const missingRawField = define.command("missingRawField")({
  kind: "command",
  parent: "workspace",
  name: "missing-raw-field",
  description: "缺少 raw 字段",
  input: countInput,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      default: "structured",
      modes: {
        structured: operation.structured({ description: "结构化输出" }),
      },
    };
  },
});
void missingRawField;

const missingUnionRawField = define.command("missingUnionRawField")({
  kind: "command",
  parent: "workspace",
  name: "missing-union-raw-field",
  description: "互异必需字段的联合输入",
  input: requiredEitherInput,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      default: "structured",
      modes: {
        structured: operation.structured({ description: "结构化输出" }),
      },
    };
  },
});
void missingUnionRawField;
