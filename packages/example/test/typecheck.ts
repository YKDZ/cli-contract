import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import {
  defineCommandScenarios,
  defineFailureScenarios,
} from "@ykdz/cli-contract-testing";
import { z } from "zod";

import { cli } from "../src/index.ts";

// 这些反例只参与编译；约束失效后，未使用的 @ts-expect-error 会报错。
export function rejectedDeclarations() {
  // @ts-expect-error 已声明的 lookup 缺少触发场景。
  defineCommandScenarios(cli, {});
  // @ts-expect-error 已声明的 notFound 缺少触发场景。
  defineFailureScenarios(cli, { lookup: {} });

  defineCli()({
    root: "check",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查类型",
        fields: {},
        input: z.object({}),
        success: {
          kind: "data",
          variants: {
            found: {
              description: "找到结果",
              schema: z.object({ name: z.string() }),
              exitCode: 0,
              text: ({ name }) => text.line(name),
            },
          },
        },
        failures: {
          notFound: {
            description: "结果不存在",
            schema: z.object({ id: z.string() }),
            exitCode: 1,
            text: ({ id }) => text.line(id),
          },
        },
        handler({ outcome }) {
          // @ts-expect-error 不能调用未声明的失败。
          outcome.failure.unknown({});
          // @ts-expect-error 变体载荷必须符合契约模式推导的类型。
          outcome.data.found({ name: 42 });
          return outcome.data.found({ name: "Alice" });
        },
      },
    },
  });

  defineCli()({
    root: "missingCompletion",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      missingCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "检查类型",
        input: z.object({}),
        // @ts-expect-error 启用 text 后不能遗漏成功的文本呈现器。
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  defineCli()({
    root: "validCompletion",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      validCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "检查类型",
        input: z.object({}),
        success: { kind: "completion", text: () => text.silent },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
}
