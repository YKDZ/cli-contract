import {
  defineCli,
  helpCapability,
  text,
  type CliContract,
  type CliContractResult,
  type CompletionFact,
} from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const textInput = z.object({ name: z.string().optional() });
const countInput = z.object({ count: z.number() });
const optionalCountInput = z.object({ count: z.number().optional() });
const eitherAcceptsEmptyInput = z.union([
  z.object({ count: z.number().optional() }),
  z.object({ name: z.string() }),
]);
const requiredEitherInput = z.union([
  z.object({ count: z.number() }),
  z.object({ name: z.string() }),
]);
const messagePayload = z.object({ message: z.string() });

const define = defineCli<Readonly<{}>>();
const contract = define({
  root: "consumer",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    consumer: {
      kind: "rootCommand",
      name: "consumer",
      description: "根入口",
      fields: {},
      input: emptyInput,

      outputs: define.outputModes("consumer", emptyInput, (mode) => ({
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
      })),
    },
  },
});

const publicContract: CliContract = contract;
void publicContract;

const textCompletionWithoutField = defineCli()({
  root: "emptyTextCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    emptyTextCompletion: {
      kind: "rootCommand",
      name: "empty-text-completion",
      description: "无字段的文本 completion",
      input: emptyInput,

      outputs: defineCli().outputModes(
        "emptyTextCompletion",
        emptyInput,
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
declare const textCompletionWithoutFieldResult: CliContractResult<
  typeof textCompletionWithoutField
>;
const textCompletionResult: CompletionFact<"emptyTextCompletion"> =
  textCompletionWithoutFieldResult;
void textCompletionResult;

const optionalCompletionWithoutField = defineCli()({
  root: "optionalTextCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    optionalTextCompletion: {
      kind: "rootCommand",
      name: "optional-text-completion",
      description: "可选字段的文本 completion",
      input: optionalCountInput,

      outputs: defineCli().outputModes(
        "optionalTextCompletion",
        optionalCountInput,
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
void optionalCompletionWithoutField;

const unionCompletionAcceptingEmpty = defineCli()({
  root: "unionTextCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    unionTextCompletion: {
      kind: "rootCommand",
      name: "union-text-completion",
      description: "可接受空对象的联合 completion",
      input: eitherAcceptsEmptyInput,

      outputs: defineCli().outputModes(
        "unionTextCompletion",
        eitherAcceptsEmptyInput,
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
void unionCompletionAcceptingEmpty;

const completeNamedVariants = defineCli()({
  root: "completeNamedVariants",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    completeNamedVariants: {
      kind: "rootCommand",
      name: "complete-named-variants",
      description: "完整具名变体",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,

      outputs: defineCli().outputModes(
        "completeNamedVariants",
        textInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: messagePayload,
                  exitCode: 9,
                },
              },
              handler: ({ outcome }) => {
                const accepted = outcome.data.accepted({
                  message: "已接受请求",
                });
                accepted.variant satisfies "accepted";
                const unavailable = outcome.failure.unavailable({
                  message: "暂不可用",
                });
                unavailable.variant satisfies "unavailable";
                return accepted;
              },
            }),
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: {
                kind: "data",
                variants: {
                  accepted: {
                    description: "已接受",
                    schema: messagePayload,
                    exitCode: 0,
                    text: (payload) => {
                      payload.message satisfies string;
                      return text.line(payload.message);
                    },
                  },
                  deferred: {
                    description: "已延后",
                    schema: messagePayload,
                    exitCode: 0,
                    text: (payload) => {
                      payload.message satisfies string;
                      return text.line(payload.message);
                    },
                  },
                },
              },
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: messagePayload,
                  exitCode: 9,
                  text: (payload) => {
                    payload.message satisfies string;
                    return text.line(payload.message);
                  },
                },
              },
              handler: ({ outcome }) => {
                const accepted = outcome.data.accepted({
                  message: "已接受请求",
                });
                accepted.variant satisfies "accepted";
                const unavailable = outcome.failure.unavailable({
                  message: "暂不可用",
                });
                unavailable.variant satisfies "unavailable";
                return accepted;
              },
            }),
          },
        }),
      ),
    },
  },
});
void completeNamedVariants;

const completeCompletionFailures = defineCli()({
  root: "completeCompletionFailures",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    completeCompletionFailures: {
      kind: "rootCommand",
      name: "complete-completion-failures",
      description: "completion 的完整 failure presenter",
      input: emptyInput,

      outputs: defineCli().outputModes(
        "completeCompletionFailures",
        emptyInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: messagePayload,
                  exitCode: 9,
                },
              },
              handler: ({ outcome }) => {
                const completion = outcome.completion();
                completion.kind satisfies "completion";
                const unavailable = outcome.failure.unavailable({
                  message: "暂不可用",
                });
                unavailable.variant satisfies "unavailable";
                return completion;
              },
            }),
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion", text: () => text.silent },
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: messagePayload,
                  exitCode: 9,
                  text: (payload) => {
                    payload.message satisfies string;
                    return text.line(payload.message);
                  },
                },
              },
              handler: ({ outcome }) => {
                const completion = outcome.completion();
                completion.kind satisfies "completion";
                const unavailable = outcome.failure.unavailable({
                  message: "暂不可用",
                });
                unavailable.variant satisfies "unavailable";
                return completion;
              },
            }),
          },
        }),
      ),
    },
  },
});
void completeCompletionFailures;

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

      outputs: defineCli().outputModes(
        "missingDataVariantText",
        textInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
            }),
            // @ts-expect-error 文本方式的每个 data 变体都必须声明 presenter。
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: {
                kind: "data",
                variants: {
                  accepted: {
                    description: "已接受",
                    schema: messagePayload,
                    exitCode: 0,
                    text: (payload: z.output<typeof messagePayload>) => {
                      payload.message satisfies string;
                      return text.line(payload.message);
                    },
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
            }),
          },
        }),
      ),
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

      outputs: defineCli().outputModes(
        "missingDataFailureText",
        textInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
            }),
            // @ts-expect-error 文本方式的 failure 变体必须声明 presenter。
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: {
                kind: "data",
                variants: {
                  accepted: {
                    description: "已接受",
                    schema: messagePayload,
                    exitCode: 0,
                    text: (payload: z.output<typeof messagePayload>) => {
                      payload.message satisfies string;
                      return text.line(payload.message);
                    },
                  },
                },
              },
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: messagePayload,
                  exitCode: 9,
                  text: (payload: z.output<typeof messagePayload>) => {
                    payload.message satisfies string;
                    return text.line(payload.message);
                  },
                },
                forbidden: {
                  description: "禁止",
                  schema: messagePayload,
                  exitCode: 13,
                },
              },
              handler: ({ outcome }) =>
                outcome.data.accepted({ message: "已接受请求" }),
            }),
          },
        }),
      ),
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

      outputs: defineCli().outputModes(
        "missingCompletionFailureText",
        emptyInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
            }),
            // @ts-expect-error 文本方式的 completion failure 变体必须声明 presenter。
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion", text: () => text.silent },
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: messagePayload,
                  exitCode: 9,
                  text: (payload) => {
                    payload.message satisfies string;
                    return text.line(payload.message);
                  },
                },
                forbidden: {
                  description: "禁止",
                  schema: messagePayload,
                  exitCode: 13,
                },
              },
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        }),
      ),
    },
  },
});

defineCli()({
  root: "missingRawField",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    // @ts-expect-error 没有 raw 字段时输入模式不能要求 count。
    missingRawField: {
      kind: "rootCommand",
      name: "missing-raw-field",
      description: "缺少 raw 字段",
      input: countInput,

      outputs: defineCli().outputModes(
        "missingRawField",
        countInput,
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

defineCli()({
  root: "missingCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingCompletion: {
      kind: "rootCommand",
      name: "missing-completion",
      description: "缺少 completion presenter",
      input: emptyInput,

      outputs: defineCli().outputModes(
        "missingCompletion",
        emptyInput,
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
            // @ts-expect-error 文本 completion 必须声明当前方式的 presenter。
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        }),
      ),
    },
  },
});

defineCli()({
  root: "missingUnionRawField",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    // @ts-expect-error 没有对应 raw 字段时联合输入不能要求 count 或 name。
    missingUnionRawField: {
      kind: "rootCommand",
      name: "missing-union-raw-field",
      description: "互异必需字段的联合输入",
      input: requiredEitherInput,

      outputs: defineCli().outputModes(
        "missingUnionRawField",
        requiredEitherInput,
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

const textCompletionWithField = defineCli()({
  root: "textCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    textCompletion: {
      kind: "rootCommand",
      name: "text-completion",
      description: "带字段的 completion",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,

      outputs: defineCli().outputModes("textCompletion", textInput, (mode) => ({
        default: "text",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ input, outcome }) => {
              input.name satisfies string | undefined;
              return outcome.completion();
            },
          }),
          text: mode.atomic({
            description: "文本输出",
            format: "text",
            success: { kind: "completion", text: () => text.silent },
            failures: {},
            handler: ({ input, outcome }) => {
              input.name satisfies string | undefined;
              return outcome.completion();
            },
          }),
        },
      })),
    },
  },
});
void textCompletionWithField;

defineCli()({
  root: "completionCannotReturnData",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    completionCannotReturnData: {
      kind: "rootCommand",
      name: "completion-cannot-return-data",
      description: "completion 结果闭合",
      input: emptyInput,

      outputs: defineCli().outputModes(
        "completionCannotReturnData",
        emptyInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => {
                // @ts-expect-error completion handler 不接受 data 结果类别。
                return outcome.data.value({ value: "nope" });
              },
            }),
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion", text: () => text.silent },
              failures: {},
              handler: ({ outcome }) => {
                // @ts-expect-error completion handler 不接受 data 结果类别。
                return outcome.data.value({ value: "nope" });
              },
            }),
          },
        }),
      ),
    },
  },
});

defineCli()({
  root: "missingCompletionWithField",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingCompletionWithField: {
      kind: "rootCommand",
      name: "missing-completion-with-field",
      description: "带字段但缺少 completion presenter",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,

      outputs: defineCli().outputModes(
        "missingCompletionWithField",
        textInput,
        (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ input, outcome }) => {
                input.name satisfies string | undefined;
                return outcome.completion();
              },
            }),
            // @ts-expect-error 文本 completion 必须声明当前方式的 presenter。
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion" },
              failures: {},
              handler: ({ input, outcome }) => {
                input.name satisfies string | undefined;
                return outcome.completion();
              },
            }),
          },
        }),
      ),
    },
  },
});
