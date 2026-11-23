import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const textInput = z.object({ name: z.string().optional() });
const messagePayload = z.object({ message: z.string() });

defineCli()({
  root: "missingDataVariantText",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingDataVariantText: {
      kind: "rootCommand",
      name: "missing-data-variant-text",
      description: "遗漏 data presenter",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              accepted: {
                description: "已接受",
                schema: messagePayload,
                exitCode: 0,
              },
              deferred: {
                description: "已延后",
                schema: messagePayload,
                exitCode: 0,
              },
            },
          },
          failures: {},
          handler: ({ outcome }) =>
            outcome.data.accepted({ message: "已接受请求" }),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text({
              description: "文本输出",
              success: {
                accepted: (payload) => text.line(payload.message),
              },
              failures: {},
            }),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "missingDataFailureText",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingDataFailureText: {
      kind: "rootCommand",
      name: "missing-data-failure-text",
      description: "data 的遗漏 failure presenter",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              accepted: {
                description: "已接受",
                schema: messagePayload,
                exitCode: 0,
              },
            },
          },
          failures: {
            unavailable: {
              description: "不可用",
              schema: messagePayload,
              exitCode: 9,
            },
            forbidden: {
              description: "禁止",
              schema: messagePayload,
              exitCode: 13,
            },
          },
          handler: ({ outcome }) =>
            outcome.data.accepted({ message: "已接受请求" }),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text({
              description: "文本输出",
              success: {
                accepted: (payload) => text.line(payload.message),
              },
              failures: {
                unavailable: (payload) => text.line(payload.message),
              },
            }),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "missingCompletionFailureText",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingCompletionFailureText: {
      kind: "rootCommand",
      name: "missing-completion-failure-text",
      description: "completion 的遗漏 failure presenter",
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            unavailable: {
              description: "不可用",
              schema: messagePayload,
              exitCode: 9,
            },
            forbidden: {
              description: "禁止",
              schema: messagePayload,
              exitCode: 13,
            },
          },
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text({
              description: "文本输出",
              success: () => text.silent,
              failures: {
                unavailable: (payload) => text.line(payload.message),
              },
            }),
          },
        };
      },
    },
  },
});
