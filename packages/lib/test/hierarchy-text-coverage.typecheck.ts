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
      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
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
            })
            .structured({
              description: "结构化输出",
            }),
          text: mode
            .atomic({
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
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: payload,
                  exitCode: 9,
                },
              },
              handler: ({ input, outcome }) => {
                input.name satisfies number;
                return outcome.data.found({ message: String(input.name) });
              },
            })
            .text({
              description: "文本输出",
              success: {
                found: ({ message }) => text.line(message),
              },
              failures: {
                unavailable: ({ message }) => text.line(message),
              },
            }),
        },
      }),
    }),
    ...defineHierarchy.command("watch")({
      kind: "command",
      parent: "workspace",
      name: "watch",
      description: "监看",
      fields: {},
      input: emptyInput,
      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .stream({
              records: {
                update: {
                  description: "更新",
                  schema: payload,
                },
              },
              failures: {},
              async *handler({ dependencies, outcome }) {
                dependencies.requestId satisfies string;
                yield outcome.record.update({ message: "更新" });
                return outcome.streamSuccess();
              },
            })
            .structured({
              description: "结构化输出",
            }),
          text: mode
            .stream({
              records: {
                update: {
                  description: "更新",
                  schema: payload,
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.update({ message: "更新" });
                return outcome.streamSuccess();
              },
            })
            .text({
              description: "文本流",
              records: {
                update: ({ message }) => text.line(message),
              },
              failures: {},
              terminal: () => text.silent,
            }),
        },
      }),
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
      outputs: (mode) => ({
        default: "text",
        modes: {
          text: mode
            .atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            // @ts-expect-error [hierarchy-text-coverage] Completion needs a success presenter.
            .text({ description: "Text output", failures: {} }),
        },
      }),
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
      outputs: (mode) => ({
        default: "text",
        modes: {
          text: mode
            .atomic({
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
            })
            .text({
              description: "文本输出",
              // @ts-expect-error [hierarchy-text-coverage] The text mode must cover every data variant.
              success: {},
              failures: {},
            }),
        },
      }),
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
      outputs: (mode) => ({
        default: "text",
        modes: {
          text: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {
                unavailable: {
                  description: "不可用",
                  schema: payload,
                  exitCode: 9,
                },
              },
              handler: ({ outcome }) => outcome.completion(),
            })
            .text({
              description: "文本输出",
              success: () => text.silent,
              // @ts-expect-error [hierarchy-text-coverage] The text mode must cover every failure variant.
              failures: {},
            }),
        },
      }),
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
      outputs: (mode) => ({
        default: "text",
        modes: {
          text: mode
            .stream({
              records: {
                update: {
                  description: "更新",
                  schema: payload,
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.update({ message: "更新" });
                return outcome.streamSuccess();
              },
            })
            .text({
              description: "文本输出",
              // @ts-expect-error [hierarchy-text-coverage] The text mode must cover every record variant.
              records: {},
              failures: {},
              terminal: () => text.silent,
            }),
        },
      }),
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
      outputs: (mode) => ({
        default: "text",
        modes: {
          text: mode
            .stream({
              records: { update: { description: "Update", schema: payload } },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.update({ message: "Update" });
                return outcome.streamSuccess();
              },
            })
            // @ts-expect-error [hierarchy-text-coverage] Streams require a terminal presenter.
            .text({
              description: "Stream updates",
              records: { update: ({ message }) => text.line(message) },
              failures: {},
            }),
        },
      }),
    }),
  },
});

defineCli().command("leaf")({
  kind: "command",
  name: "leaf",
  parent: "workspace",
  description: "Run the command",
  input: emptyInput,
  outputs: ({ atomic }) => {
    const completion = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    const presentation = {
      description: "Structured output",
      success: () => text.silent,
    };
    // @ts-expect-error Structured modes only accept a description.
    const structured = completion.structured(presentation);
    return { modes: { structured } };
  },
});
