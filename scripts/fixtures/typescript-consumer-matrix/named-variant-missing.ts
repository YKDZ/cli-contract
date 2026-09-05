import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const textInput = z.object({ name: z.string().optional() });
const messagePayload = z.object({ message: z.string() });

defineCli()({
  root: "missingDataVariantText",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
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
      success: {
        kind: "data",
        variants: {
          accepted: {
            description: "已接受",
            schema: messagePayload,
            exitCode: 0,
            text: (payload) => text.line(payload.message),
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
    },
  },
});

defineCli()({
  root: "missingDataFailureText",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
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
      success: {
        kind: "data",
        variants: {
          accepted: {
            description: "已接受",
            schema: messagePayload,
            exitCode: 0,
            text: (payload) => text.line(payload.message),
          },
        },
      },
      failures: {
        unavailable: {
          description: "不可用",
          schema: messagePayload,
          exitCode: 9,
          text: (payload) => text.line(payload.message),
        },
        forbidden: {
          description: "禁止",
          schema: messagePayload,
          exitCode: 13,
        },
      },
      handler: ({ outcome }) =>
        outcome.data.accepted({ message: "已接受请求" }),
    },
  },
});

defineCli()({
  root: "missingCompletionFailureText",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingCompletionFailureText: {
      kind: "rootCommand",
      name: "missing-completion-failure-text",
      description: "completion 的遗漏 failure presenter",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: {
          description: "不可用",
          schema: messagePayload,
          exitCode: 9,
          text: (payload: MessagePayload) => text.line(payload.message),
        },
        forbidden: {
          description: "禁止",
          schema: messagePayload,
          exitCode: 13,
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
