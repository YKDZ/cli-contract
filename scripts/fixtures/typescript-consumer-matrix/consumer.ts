import type { Writable } from "node:stream";

import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
  type ContractSchema,
  type DataVariantDefinition,
  type EmptyCliInput,
  type FailureVariantDefinition,
  type InvalidFieldChoiceIssue,
  type StreamRecordDefinition,
  type UnknownCommandIssue,
  type UnknownOptionIssue,
} from "@ykdz/cli-contract";
import {
  defineCommandScenarios,
  defineFailureScenarios,
  type CliScenario,
} from "@ykdz/cli-contract-testing";
import { nodeCliOutput } from "@ykdz/cli-contract/node";

type Dependencies = Readonly<{ readonly available: boolean }>;
type InspectInput = Readonly<{ readonly target: string }>;
type Payload = Readonly<{ readonly message: string }>;

function schema<Input, Output>(): ContractSchema<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "typescript-consumer-matrix",
      validate: (value) => ({ value: value as Output }),
      jsonSchema: {
        input: () => ({ type: "object" }),
        output: () => ({ type: "object" }),
      },
    },
  };
}

const define = defineCli<Dependencies>();
const emptyInput = schema<EmptyCliInput, EmptyCliInput>();
const inspectInput = schema<InspectInput, InspectInput>();
const payload = schema<Payload, Payload>();

const complete = define.command("complete")({
  kind: "command",
  parent: "consumer",
  name: "complete",
  description: "完成任务",
  fields: {},
  input: emptyInput,
  success: { kind: "completion", text: () => text.lines(["完成", ""]) },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});

const inspect = define.command("inspect")({
  kind: "command",
  parent: "consumer",
  name: "inspect",
  description: "检查目标",
  fields: {
    target: {
      kind: "valueOption",
      longOption: "--target",
      description: "目标",
    },
  },
  input: inspectInput,
  success: {
    kind: "data",
    variants: {
      found: {
        description: "找到目标",
        schema: payload,
        exitCode: 0,
        text: (value: Payload) => text.lines(["找到", value.message]),
      },
    },
  },
  failures: {
    unavailable: {
      description: "服务不可用",
      schema: payload,
      exitCode: 9,
      text: (value: Payload) => text.lines(["不可用", value.message]),
    },
  },
  handler: ({ dependencies, outcome }) =>
    dependencies.available
      ? outcome.data.found({ message: "public" })
      : outcome.failure.unavailable({ message: "remote" }),
});

const watch = define.command("watch")({
  kind: "command",
  parent: "consumer",
  name: "watch",
  description: "观察目标",
  fields: {},
  input: emptyInput,
  success: {
    kind: "stream",
    records: {
      item: {
        description: "观察记录",
        schema: payload,
        text: (value: Payload) => text.line(value.message),
      },
    },
    text: () => text.lines(["观察完成", ""]),
  },
  failures: {},
  async *handler({ outcome }) {
    yield outcome.record.item({ message: "第一条" });
    return outcome.streamSuccess();
  },
});

const cli = define({
  root: "consumer",
  help: helpCapability({ shortAlias: "-h" }),
  output: outputCapability({ defaultFormat: "structured", text: true }),
  usageFailureExitCode: 64,
  commands: {
    consumer: {
      kind: "rootGroup",
      name: "consumer",
      description: "消费者",
      helpSupplement: text.lines(["使用 -h 查看帮助", ""]),
    },
    ...complete,
    ...inspect,
    ...watch,
  },
});

void nodeCliOutput({
  stdout: null as unknown as Writable,
  stderr: null as unknown as Writable,
});

const commandScenarios = defineCommandScenarios(cli, {
  complete: { argv: ["complete"], dependencies: { available: true } },
  inspect: {
    argv: ["inspect", "--target", "public"],
    dependencies: { available: true },
  },
  watch: { argv: ["watch"], dependencies: { available: true } },
});

const failureScenarios = defineFailureScenarios(cli, {
  inspect: {
    unavailable: {
      argv: ["inspect", "--target", "remote"],
      dependencies: { available: false },
    },
  },
});

void commandScenarios;
void failureScenarios;

function positiveIssueShapes(
  choice: InvalidFieldChoiceIssue,
  command: UnknownCommandIssue,
  option: UnknownOptionIssue,
): void {
  const choices: readonly string[] = choice.choices;
  const suggestedCommand: string | undefined = command.suggestedCommand;
  const suggestedOption: string | undefined = option.suggestedOption;
  void choices;
  void suggestedCommand;
  void suggestedOption;
}
void positiveIssueShapes;

function negativeContractShapes(): void {
  void defineCommandScenarios(
    cli,
    // @ts-expect-error 每个命令都必须有场景。
    {
      complete: { argv: ["complete"], dependencies: { available: true } },
      inspect: {
        argv: ["inspect", "--target", "public"],
        dependencies: { available: true },
      },
    },
  );

  void defineFailureScenarios(cli, {
    // @ts-expect-error 已声明失败不能遗漏场景。
    inspect: {},
  });

  void defineFailureScenarios(cli, {
    inspect: {
      unavailable: {
        argv: ["inspect"],
        // @ts-expect-error 场景依赖必须和契约依赖一致。
        dependencies: { missing: true },
      },
    },
  });

  void defineCommandScenarios(cli, {
    complete: { argv: ["complete"], dependencies: { available: true } },
    inspect: {
      argv: ["inspect", "--target", "public"],
      dependencies: { available: true },
    },
    watch: { argv: ["watch"], dependencies: { available: true } },
    // @ts-expect-error 结果位置不能伪造为命令场景。
    result: { argv: [], dependencies: { available: true } },
  });

  const scenarioSink = null as unknown as Readonly<
    Record<string, CliScenario<typeof cli>>
  >;
  // @ts-expect-error 场景映射不能用索引签名逃避闭集。
  void defineCommandScenarios(cli, scenarioSink);

  const invalidDataPresenter: DataVariantDefinition<Payload, true> = {
    description: "错误 data",
    schema: payload,
    exitCode: 0,
    // @ts-expect-error data presenter 不接受 silentText。
    text: () => text.silent,
  };
  void invalidDataPresenter;

  const invalidFailurePresenter: FailureVariantDefinition<Payload, true> = {
    description: "错误 failure",
    schema: payload,
    exitCode: 9,
    // @ts-expect-error failure presenter 不接受 silentText。
    text: () => text.silent,
  };
  void invalidFailurePresenter;

  const invalidRecordPresenter: StreamRecordDefinition<Payload, true> = {
    description: "错误 record",
    schema: payload,
    // @ts-expect-error stream record presenter 不接受 TextLines。
    text: () => text.lines(["错误位置"]),
  };
  void invalidRecordPresenter;
}
void negativeContractShapes;
