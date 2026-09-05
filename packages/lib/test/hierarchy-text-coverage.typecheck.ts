import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
  type CliContractDependencies,
  type CliContractResult,
} from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const namedInput = z.object({ name: z.string() });
const payload = z.object({ message: z.string() });

type Dependencies = Readonly<{ readonly requestId: string }>;

const defineHierarchy = defineCli<Dependencies>();
const completeHierarchy = defineHierarchy({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    packages: {
      kind: "commandGroup",
      parent: "workspace",
      name: "packages",
      description: "包命令",
    },
    ...defineHierarchy.command("complete")({
      kind: "command",
      parent: "packages",
      name: "complete",
      description: "完成",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: {
          description: "不可用",
          schema: payload,
          exitCode: 9,
          text: (value) => text.line(value.message),
        },
      },
      handler: ({ dependencies, outcome }) => {
        dependencies.requestId satisfies string;
        return outcome.completion();
      },
    }),
    ...defineHierarchy.command("inspect")({
      kind: "command",
      parent: "packages",
      name: "inspect",
      description: "检查",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          found: {
            description: "找到",
            schema: payload,
            exitCode: 0,
            text: (value) => text.line(value.message),
          },
        },
      },
      failures: {},
      handler: ({ input, dependencies, outcome }) => {
        input.name satisfies string;
        dependencies.requestId satisfies string;
        return outcome.data.found({ message: input.name });
      },
    }),
    ...defineHierarchy.command("watch")({
      kind: "command",
      parent: "packages",
      name: "watch",
      description: "监看",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: namedInput,
      success: {
        kind: "stream",
        text: () => text.silent,
        records: {
          update: {
            description: "更新",
            schema: payload,
            text: (value) => text.line(value.message),
          },
        },
      },
      failures: {},
      async *handler({ input, dependencies, outcome }) {
        input.name satisfies string;
        dependencies.requestId satisfies string;
        yield outcome.record.update({ message: input.name });
        return outcome.streamSuccess();
      },
    }),
  },
});

declare const hierarchyDependencies: CliContractDependencies<
  typeof completeHierarchy
>;
hierarchyDependencies.requestId satisfies string;
declare const hierarchyResult: CliContractResult<typeof completeHierarchy>;
hierarchyResult.command satisfies
  | "workspace"
  | "complete"
  | "inspect"
  | "watch";

const defineMissingCompletion = defineCli();
defineMissingCompletion({
  root: "missingCompletion",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  // @ts-expect-error [hierarchy-text-coverage] 层级 completion 缺少 presenter 必须在根装配时拒绝。
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
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineMissingData = defineCli();
defineMissingData({
  root: "missingData",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  // @ts-expect-error [hierarchy-text-coverage] 层级 data 变体缺少 presenter 必须在根装配时拒绝。
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
      success: {
        kind: "data",
        variants: {
          found: { description: "找到", schema: payload, exitCode: 0 },
        },
      },
      failures: {},
      handler: ({ outcome }) => outcome.data.found({ message: "结果" }),
    }),
  },
});

const defineMissingFailure = defineCli();
defineMissingFailure({
  root: "missingFailure",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  // @ts-expect-error [hierarchy-text-coverage] 层级 failure 变体缺少 presenter 必须在根装配时拒绝。
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
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: { description: "不可用", schema: payload, exitCode: 9 },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineMissingRecord = defineCli();
defineMissingRecord({
  root: "missingRecord",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  // @ts-expect-error [hierarchy-text-coverage] 层级 stream record 缺少 presenter 必须在根装配时拒绝。
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
      success: {
        kind: "stream",
        text: () => text.silent,
        records: { update: { description: "更新", schema: payload } },
      },
      failures: {},
      async *handler({ outcome }) {
        yield outcome.record.update({ message: "更新" });
        return outcome.streamSuccess();
      },
    }),
  },
});

const defineMissingStreamSuccess = defineCli();
defineMissingStreamSuccess({
  root: "missingStreamSuccess",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  // @ts-expect-error [hierarchy-text-coverage] 层级 stream success 缺少 presenter 必须在根装配时拒绝。
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
});

const defineUndeclaredCompletionFailure = defineCli();
const undeclaredCompletionFailure = defineUndeclaredCompletionFailure.command(
  "completionLeaf",
)({
  kind: "command",
  parent: "failureRoot",
  name: "completion",
  description: "completion failure",
  input: emptyInput,
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => {
    // @ts-expect-error hierarchy completion 的空 failure 表不提供未知构造器。
    return outcome.failure.undeclared({});
  },
});
defineUndeclaredCompletionFailure({
  root: "failureRoot",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    failureRoot: {
      kind: "rootGroup",
      name: "failures",
      description: "failures",
    },
    ...undeclaredCompletionFailure,
  },
});

const defineUndeclaredDataFailure = defineCli();
const undeclaredDataFailure = defineUndeclaredDataFailure.command("dataLeaf")({
  kind: "command",
  parent: "dataFailureRoot",
  name: "data",
  description: "data failure",
  fields: {},
  input: emptyInput,
  success: {
    kind: "data",
    variants: { found: { description: "found", schema: payload, exitCode: 0 } },
  },
  failures: {},
  handler: ({ outcome }) => {
    // @ts-expect-error hierarchy data 的空 failure 表不提供未知构造器。
    return outcome.failure.undeclared({});
  },
});
defineUndeclaredDataFailure({
  root: "dataFailureRoot",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    dataFailureRoot: {
      kind: "rootGroup",
      name: "failures",
      description: "failures",
    },
    ...undeclaredDataFailure,
  },
});

const defineUndeclaredStreamFailure = defineCli();
const undeclaredStreamFailure = defineUndeclaredStreamFailure.command(
  "streamLeaf",
)({
  kind: "command",
  parent: "streamFailureRoot",
  name: "stream",
  description: "stream failure",
  fields: {},
  input: emptyInput,
  success: {
    kind: "stream",
    records: { update: { description: "update", schema: payload } },
  },
  failures: {},
  async *handler({ outcome }) {
    yield outcome.record.update({ message: "update" });
    // @ts-expect-error hierarchy stream 的空 failure 表不提供未知构造器。
    return outcome.failure.undeclared({});
  },
});
defineUndeclaredStreamFailure({
  root: "streamFailureRoot",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    streamFailureRoot: {
      kind: "rootGroup",
      name: "failures",
      description: "failures",
    },
    ...undeclaredStreamFailure,
  },
});

const defineDataWithoutFields = defineCli();
const dataWithFields = defineDataWithoutFields.command("dataLeaf")({
  kind: "command",
  parent: "dataWithoutFields",
  name: "data",
  description: "data",
  fields: {},
  input: emptyInput,
  success: {
    kind: "data",
    variants: {
      found: { description: "found", schema: payload, exitCode: 0 },
    },
  },
  failures: {},
  handler: ({ outcome }) => outcome.data.found({ message: "found" }),
});
const { fields: _dataFields, ...dataWithoutFieldsDefinition } =
  dataWithFields.dataLeaf;
const dataWithoutFields = defineDataWithoutFields.command("dataLeaf")(
  // @ts-expect-error hierarchy data 命令必须显式声明 fields。
  dataWithoutFieldsDefinition,
);
defineDataWithoutFields({
  root: "dataWithoutFields",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    dataWithoutFields: { kind: "rootGroup", name: "data", description: "data" },
    ...dataWithoutFields,
  },
});

const defineStreamWithoutFields = defineCli();
const streamWithFields = defineStreamWithoutFields.command("streamLeaf")({
  kind: "command",
  parent: "streamWithoutFields",
  name: "stream",
  description: "stream",
  fields: {},
  input: emptyInput,
  success: {
    kind: "stream",
    records: { update: { description: "update", schema: payload } },
  },
  failures: {},
  async *handler({ outcome }) {
    yield outcome.record.update({ message: "update" });
    return outcome.streamSuccess();
  },
});
const { fields: _streamFields, ...streamWithoutFieldsDefinition } =
  streamWithFields.streamLeaf;
const streamWithoutFields = defineStreamWithoutFields.command("streamLeaf")(
  // @ts-expect-error hierarchy stream 命令必须显式声明 fields。
  streamWithoutFieldsDefinition,
);
defineStreamWithoutFields({
  root: "streamWithoutFields",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    streamWithoutFields: {
      kind: "rootGroup",
      name: "stream",
      description: "stream",
    },
    ...streamWithoutFields,
  },
});
