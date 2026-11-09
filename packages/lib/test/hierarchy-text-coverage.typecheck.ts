import {
  defineCli,
  helpCapability,
  text,
  type CliContractDependencies,
  type CliContractRawInput,
  type CliContractResult,
} from "@ykdz/cli-contract";
import { z } from "zod";

const textCoverageHelp = helpCapability({
  wording: {
    commandPlaceholder: "command",
    choices: "(choices: {choices})",
    default: "(default: {value})",
  },
});

const emptyInput = z.object({});
const inspectInput = z.object({
  name: z
    .string()
    .transform((value) => value.length)
    .pipe(z.number()),
});
const payload = z.object({ message: z.string() });
type Dependencies = Readonly<{ readonly requestId: string }>;
const namedInput = z.object({ name: z.string() });

const defineHierarchy = defineCli<Dependencies>();
const hierarchy = defineHierarchy({
  root: "workspace",
  help: textCoverageHelp,
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...defineHierarchy.command("inspect")({
      kind: "command",
      parent: "workspace",
      name: "inspect",
      description: "检查",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: inspectInput,
      outputs: defineHierarchy.outputModes("inspect", inspectInput, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: {
              kind: "data",
              variants: {
                found: { description: "找到", schema: payload, exitCode: 0 },
              },
            },
            failures: {
              unavailable: {
                description: "不可用",
                schema: payload,
                exitCode: 9,
              },
            },
            handler: ({ input, dependencies, outcome }) => {
              input.name satisfies number;
              dependencies.requestId satisfies string;
              return outcome.data.found({ message: String(input.name) });
            },
          }),
          text: mode.atomic({
            description: "文本输出",
            format: "text",
            success: {
              kind: "data",
              variants: {
                found: {
                  description: "找到",
                  schema: payload,
                  exitCode: 0,
                  text: ({ message }) => text.line(message),
                },
              },
            },
            failures: {
              unavailable: {
                description: "不可用",
                schema: payload,
                exitCode: 9,
                text: ({ message }) => text.line(message),
              },
            },
            handler: ({ input, outcome }) => {
              input.name satisfies number;
              return outcome.data.found({ message: String(input.name) });
            },
          }),
        },
      })),
    }),
    ...defineHierarchy.command("watch")({
      kind: "command",
      parent: "workspace",
      name: "watch",
      description: "监看",
      fields: {},
      input: emptyInput,
      outputs: defineHierarchy.outputModes("watch", emptyInput, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.stream({
            description: "结构化输出",
            format: "structured",
            success: {
              kind: "stream",
              records: {
                update: { description: "更新", schema: payload },
              },
            },
            failures: {},
            async *handler({ dependencies, outcome }) {
              dependencies.requestId satisfies string;
              yield outcome.record.update({ message: "更新" });
              return outcome.streamSuccess();
            },
          }),
          text: mode.stream({
            description: "文本流",
            format: "text",
            success: {
              kind: "stream",
              text: () => text.silent,
              records: {
                update: {
                  description: "更新",
                  schema: payload,
                  text: ({ message }) => text.line(message),
                },
              },
            },
            failures: {},
            async *handler({ outcome }) {
              yield outcome.record.update({ message: "更新" });
              return outcome.streamSuccess();
            },
          }),
        },
      })),
    }),
  },
});

declare const dependencies: CliContractDependencies<typeof hierarchy>;
dependencies.requestId satisfies string;
declare const rawInput: CliContractRawInput<typeof hierarchy>;
rawInput satisfies Readonly<{ readonly name?: string }>;
declare const result: CliContractResult<typeof hierarchy>;
result.command satisfies "inspect" | "watch";

const defineMissingCompletion = defineCli();
defineMissingCompletion({
  root: "missingCompletion",
  help: textCoverageHelp,
  usageFailureExitCode: 64,
  commands: {
    missingCompletion: {
      kind: "rootGroup",
      name: "missing-completion",
      description: "遗漏 completion",
    },
    ...defineMissingCompletion.command("leaf")({
      kind: "command",
      parent: "missingCompletion",
      name: "leaf",
      description: "叶命令",
      input: emptyInput,
      outputs: defineMissingCompletion.outputModes(
        "leaf",
        emptyInput,
        (mode) => ({
          default: "text",
          modes: {
            // @ts-expect-error [hierarchy-text-coverage] 文本完成方式缺少呈现器。
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
    }),
  },
});

const defineMissingData = defineCli();
defineMissingData({
  root: "missingData",
  help: textCoverageHelp,
  usageFailureExitCode: 64,
  commands: {
    missingData: {
      kind: "rootGroup",
      name: "missing-data",
      description: "遗漏 data",
    },
    ...defineMissingData.command("leaf")({
      kind: "command",
      parent: "missingData",
      name: "leaf",
      description: "叶命令",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: namedInput,
      outputs: defineMissingData.outputModes("leaf", namedInput, (mode) => ({
        default: "text",
        modes: {
          // @ts-expect-error [hierarchy-text-coverage] 文本结果变体缺少呈现器。
          text: mode.atomic({
            description: "文本输出",
            format: "text",
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
          }),
        },
      })),
    }),
  },
});

const defineMissingFailure = defineCli();
defineMissingFailure({
  root: "missingFailure",
  help: textCoverageHelp,
  usageFailureExitCode: 64,
  commands: {
    missingFailure: {
      kind: "rootGroup",
      name: "missing-failure",
      description: "遗漏 failure",
    },
    ...defineMissingFailure.command("leaf")({
      kind: "command",
      parent: "missingFailure",
      name: "leaf",
      description: "叶命令",
      input: emptyInput,
      outputs: defineMissingFailure.outputModes("leaf", emptyInput, (mode) => ({
        default: "text",
        modes: {
          // @ts-expect-error [hierarchy-text-coverage] 文本失败变体缺少呈现器。
          text: mode.atomic({
            description: "文本输出",
            format: "text",
            success: { kind: "completion", text: () => text.silent },
            failures: {
              unavailable: {
                description: "不可用",
                schema: payload,
                exitCode: 9,
              },
            },
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
    }),
  },
});

const defineMissingRecord = defineCli();
defineMissingRecord({
  root: "missingRecord",
  help: textCoverageHelp,
  usageFailureExitCode: 64,
  commands: {
    missingRecord: {
      kind: "rootGroup",
      name: "missing-record",
      description: "遗漏 record",
    },
    ...defineMissingRecord.command("leaf")({
      kind: "command",
      parent: "missingRecord",
      name: "leaf",
      description: "叶命令",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: namedInput,
      outputs: defineMissingRecord.outputModes("leaf", namedInput, (mode) => ({
        default: "text",
        modes: {
          // @ts-expect-error [hierarchy-text-coverage] 文本流记录缺少呈现器。
          text: mode.stream({
            description: "文本输出",
            format: "text",
            success: {
              kind: "stream",
              text: () => text.silent,
              records: {
                update: { description: "更新", schema: payload },
              },
            },
            failures: {},
            async *handler({ outcome }) {
              yield outcome.record.update({ message: "更新" });
              return outcome.streamSuccess();
            },
          }),
        },
      })),
    }),
  },
});

const defineMissingStreamSuccess = defineCli();
defineMissingStreamSuccess({
  root: "missingStreamSuccess",
  help: textCoverageHelp,
  usageFailureExitCode: 64,
  commands: {
    missingStreamSuccess: {
      kind: "rootGroup",
      name: "missing-stream-success",
      description: "遗漏 stream success",
    },
    ...defineMissingStreamSuccess.command("leaf")({
      kind: "command",
      parent: "missingStreamSuccess",
      name: "leaf",
      description: "叶命令",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: namedInput,
      outputs: defineMissingStreamSuccess.outputModes(
        "leaf",
        namedInput,
        (mode) => ({
          default: "text",
          modes: {
            // @ts-expect-error [hierarchy-text-coverage] 文本流终态缺少呈现器。
            text: mode.stream({
              description: "文本输出",
              format: "text",
              success: {
                kind: "stream",
                records: {
                  update: {
                    description: "更新",
                    schema: payload,
                    text: (value: Readonly<{ readonly message: string }>) =>
                      text.line(value.message),
                  },
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.update({ message: "更新" });
                return outcome.streamSuccess();
              },
            }),
          },
        }),
      ),
    }),
  },
});

function rejectedModes() {
  const define = defineCli();
  const input = z.object({});
  const badModes = define.outputModes("bad", input, (mode) => ({
    default: "structured",
    modes: {
      structured: mode.atomic({
        description: "结构化输出",
        format: "structured",
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
      // @ts-expect-error 文本完成方式必须在当前方式内声明呈现器。
      text: mode.atomic({
        description: "文本输出",
        format: "text",
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined as never,
      }),
    },
  }));
  void badModes;

  const modes = define.outputModes("structured", input, (mode) => ({
    default: "structured",
    modes: {
      // @ts-expect-error structured 方式不接受呈现器。
      structured: mode.atomic({
        description: "结构化输出",
        format: "structured",
        success: {
          kind: "completion",
          text: () => text.silent,
        },
        failures: {},
        handler: () => undefined as never,
      }),
    },
  }));
  void modes;
}

void rejectedModes;
