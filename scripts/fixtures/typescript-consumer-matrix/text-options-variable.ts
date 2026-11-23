import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({});
const payload = z.object({ message: z.string() });

defineCli()({
  root: "extractedMissingFailure",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    extractedMissingFailure: {
      kind: "rootCommand",
      name: "extracted-missing-failure",
      description: "提取变量后遗漏 failure presenter",
      input,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            unavailable: {
              description: "不可用",
              schema: payload,
              exitCode: 9,
            },
          },
          handler: ({ outcome }) => outcome.completion(),
        });
        const presentation = {
          description: "文本输出",
          success: () => text.silent,
          failures: {},
        };
        return {
          default: "text",
          modes: {
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text(presentation),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "extractedMissingData",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    extractedMissingData: {
      kind: "rootCommand",
      name: "extracted-missing-data",
      description: "提取变量后遗漏 data presenter",
      input,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              found: {
                description: "找到",
                schema: payload,
                exitCode: 0,
              },
            },
          },
          failures: {},
          handler: ({ outcome }) => outcome.data.found({ message: "结果" }),
        });
        const presentation = {
          description: "文本输出",
          success: {},
          failures: {},
        };
        return {
          default: "text",
          modes: {
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text(presentation),
          },
        };
      },
    },
  },
});
