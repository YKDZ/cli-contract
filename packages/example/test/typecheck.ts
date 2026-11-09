import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
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

  const sharedInput0 = z.object({});
  defineCli()({
    root: "check",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查类型",
        fields: {},
        input: sharedInput0,

        outputs: defineCli().outputModes("check", sharedInput0, (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "data",
                variants: {
                  found: {
                    description: "找到结果",
                    schema: z.object({ name: z.string() }),
                    exitCode: 0,
                  },
                },
              },
              failures: {
                notFound: {
                  description: "结果不存在",
                  schema: z.object({ id: z.string() }),
                  exitCode: 1,
                },
              },
              handler({ outcome }) {
                // @ts-expect-error 不能调用未声明的失败。
                outcome.failure.unknown({});
                // @ts-expect-error 变体载荷必须符合契约模式推导的类型。
                outcome.data.found({ name: 42 });
                return outcome.data.found({ name: "Alice" });
              },
            }),
            text: mode.atomic({
              description: "文本输出",
              format: "text",
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
            }),
          },
        })),
      },
    },
  });

  const sharedInput1 = z.object({});
  defineCli()({
    root: "missingCompletion",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      missingCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "检查类型",
        input: sharedInput1,

        outputs: defineCli().outputModes(
          "missingCompletion",
          sharedInput1,
          (mode) => ({
            default: "text",
            modes: {
              structured: mode.atomic({
                description: "结构化输出",
                format: "structured",
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }),
              // @ts-expect-error 文本完成方式必须声明当前 mode 的 presenter。
              text: mode.atomic({
                description: "文本输出",
                format: "text",
                success: { kind: "completion" },
                failures: {},
                handler: () => undefined as never,
              }),
            },
          }),
        ),
      },
    },
  });

  const sharedInput2 = z.object({});
  defineCli()({
    root: "validCompletion",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      validCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "检查类型",
        input: sharedInput2,

        outputs: defineCli().outputModes(
          "validCompletion",
          sharedInput2,
          (mode) => ({
            default: "text",
            modes: {
              structured: mode.atomic({
                description: "结构化输出",
                format: "structured",
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }),
              text: mode.atomic({
                description: "文本输出",
                format: "text",
                success: { kind: "completion", text: () => text.silent },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }),
            },
          }),
        ),
      },
    },
  });
}
