import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CliWriteError,
  defineCli,
  helpCapability,
  outputCapability,
  text,
  type ContractSchema,
  type EmptyCliInput,
} from "@cli-contract/lib";
import {
  defineCommandScenarios,
  defineFailureScenarios,
  runCliScenario,
  type CliScenario,
} from "@cli-contract/testing";

type ConsumerFixtureDependencies = Readonly<{
  readonly serviceAvailable: boolean;
}>;

type InspectInput = Readonly<{ readonly target: string }>;
type InspectData = Readonly<{ readonly message: string }>;
type WatchData = Readonly<{ readonly message: string }>;

function schema<Input, Output>(
  jsonSchema: Record<string, unknown>,
): ContractSchema<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "@cli-contract/testing",
      validate: (value) => ({ value: value as Output }),
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema,
      },
    },
  };
}

const emptyInputSchema = schema<EmptyCliInput, EmptyCliInput>({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: {},
  type: "object",
});

const inspectInputSchema = schema<InspectInput, InspectInput>({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: { target: { type: "string" } },
  required: ["target"],
  type: "object",
});

const inspectDataSchema = schema<InspectData, InspectData>({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: { message: { type: "string" } },
  required: ["message"],
  type: "object",
});

const watchDataSchema = schema<WatchData, WatchData>({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: { message: { type: "string" } },
  required: ["message"],
  type: "object",
});

const define = defineCli<ConsumerFixtureDependencies>();

const inspectCommand = define.command("inspect")({
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
  input: inspectInputSchema,
  success: {
    kind: "data",
    variants: {
      found: {
        description: "检查结果",
        schema: inspectDataSchema,
        exitCode: 0,
        text: (data: InspectData) => text.line(`已检查 ${data.message}`),
      },
    },
  },
  failures: {
    unavailable: {
      description: "服务不可用",
      schema: inspectDataSchema,
      exitCode: 9,
      text: (data: InspectData) => text.line(`服务不可用 ${data.message}`),
    },
    denied: {
      description: "拒绝检查",
      schema: inspectDataSchema,
      exitCode: 10,
      text: (data: InspectData) => text.line(`拒绝检查 ${data.message}`),
    },
  },
  handler: ({ dependencies, input, outcome }) => {
    if (input.target === "private") {
      return outcome.failure.denied({ message: input.target });
    }
    if (!dependencies.serviceAvailable) {
      return outcome.failure.unavailable({ message: input.target });
    }
    return outcome.data.found({ message: input.target });
  },
});

const watchCommand = define.command("watch")({
  kind: "command",
  parent: "consumer",
  name: "watch",
  description: "观察目标",
  fields: {},
  input: emptyInputSchema,
  success: {
    kind: "stream",
    records: {
      item: {
        description: "观察记录",
        schema: watchDataSchema,
        text: (data: WatchData) => text.line(data.message),
      },
    },
    text: () => text.silent,
  },
  failures: {
    interrupted: {
      description: "观察中断",
      schema: watchDataSchema,
      exitCode: 11,
      text: (data: WatchData) => text.line(`观察中断 ${data.message}`),
    },
  },
  async *handler({ dependencies, outcome }) {
    yield outcome.record.item({ message: "第一条" });
    if (!dependencies.serviceAvailable) {
      return outcome.failure.interrupted({ message: "服务不可用" });
    }
    yield outcome.record.item({ message: "第二条" });
    return outcome.streamSuccess();
  },
});

const statusCommand = define.command("status")({
  kind: "command",
  parent: "consumer",
  name: "status",
  description: "读取状态",
  fields: {},
  input: emptyInputSchema,
  success: { kind: "completion", text: () => text.silent },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});

/** 仓库唯一的正向 consumer fixture。 */
const consumerFixture = {
  cli: define({
    root: "consumer",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured", text: true }),
    usageFailureExitCode: 64,
    commands: {
      consumer: {
        kind: "rootGroup",
        name: "consumer",
        description: "消费者 fixture",
      },
      ...inspectCommand,
      ...watchCommand,
      ...statusCommand,
    },
  }),
} as const;

const commandScenarios = defineCommandScenarios(consumerFixture.cli, {
  inspect: {
    argv: ["inspect", "--target", "public"],
    dependencies: { serviceAvailable: true },
  },
  watch: {
    argv: ["watch"],
    dependencies: { serviceAvailable: true },
  },
  status: {
    argv: ["status"],
    dependencies: { serviceAvailable: true },
  },
});

const failureScenarios = defineFailureScenarios(consumerFixture.cli, {
  inspect: {
    unavailable: {
      argv: ["inspect", "--target", "remote"],
      dependencies: { serviceAvailable: false },
    },
    denied: {
      argv: ["inspect", "--target", "private"],
      dependencies: { serviceAvailable: true },
    },
  },
  watch: {
    interrupted: {
      argv: ["watch"],
      dependencies: { serviceAvailable: false },
    },
  },
});

function verifyScenarioTypeErrors() {
  void defineCommandScenarios(
    consumerFixture.cli,
    // @ts-expect-error 新增的 "watch" 命令场景不能被遗漏。
    {
      inspect: {
        argv: ["inspect", "--target", "public"],
        dependencies: { serviceAvailable: true },
      },
      status: {
        argv: ["status"],
        dependencies: { serviceAvailable: true },
      },
    },
  );

  void defineFailureScenarios(consumerFixture.cli, {
    // @ts-expect-error "denied" 失败场景不能被遗漏。
    inspect: {
      unavailable: {
        argv: ["inspect", "--target", "remote"],
        dependencies: { serviceAvailable: false },
      },
    },
    watch: {
      interrupted: {
        argv: ["watch"],
        dependencies: { serviceAvailable: false },
      },
    },
  });

  void defineFailureScenarios(consumerFixture.cli, {
    inspect: {
      unavailable: {
        argv: ["inspect", "--target", "remote"],
        dependencies: { serviceAvailable: false },
      },
      denied: {
        argv: ["inspect", "--target", "private"],
        dependencies: { serviceAvailable: true },
      },
    },
    watch: {
      // @ts-expect-error "unavailable" 属于 inspect，不能跨命令合并到 watch。
      unavailable: {
        argv: ["watch"],
        dependencies: { serviceAvailable: false },
      },
    },
  });

  void defineCommandScenarios(consumerFixture.cli, {
    inspect: {
      argv: ["inspect", "--target", "public"],
      dependencies: { serviceAvailable: true },
    },
    watch: {
      argv: ["watch"],
      dependencies: { serviceAvailable: true },
    },
    status: {
      argv: ["status"],
      dependencies: { serviceAvailable: true },
    },
    // @ts-expect-error 场景映射不能用 default 绕过新增命令。
    default: {
      argv: [],
      dependencies: { serviceAvailable: true },
    },
  });

  const commandScenarioSink = null as unknown as Readonly<
    Record<string, CliScenario<typeof consumerFixture.cli>>
  >;
  // @ts-expect-error command 场景映射必须使用显式闭合键，不能使用索引签名 sink。
  void defineCommandScenarios(consumerFixture.cli, commandScenarioSink);

  const failureScenarioSink = null as unknown as Readonly<{
    readonly inspect: Readonly<
      Record<string, CliScenario<typeof consumerFixture.cli>>
    >;
  }>;
  // @ts-expect-error failure 场景映射的内层键必须显式闭合。
  void defineFailureScenarios(consumerFixture.cli, failureScenarioSink);
}
void verifyScenarioTypeErrors;

void test("唯一 consumer fixture 贯通 argv、输入、success、failure 与 text", async () => {
  const structuredSuccess = await runCliScenario({
    cliContract: consumerFixture.cli,
    ...commandScenarios.inspect,
  });
  assert.equal(structuredSuccess.termination.kind, "applicationResult");
  assert.equal(structuredSuccess.termination.exitCode, 0);
  assert.equal(
    structuredSuccess.stdout,
    '{"schemaVersion":"1","command":"inspect","kind":"data","variant":"found","data":{"message":"public"}}\n',
  );
  assert.equal(structuredSuccess.stderr, "");

  const structuredFailure = await runCliScenario({
    cliContract: consumerFixture.cli,
    ...failureScenarios.inspect.unavailable,
  });
  assert.equal(structuredFailure.termination.kind, "applicationResult");
  assert.equal(structuredFailure.termination.exitCode, 9);
  assert.equal(structuredFailure.stdout, "");
  assert.equal(
    structuredFailure.stderr,
    '{"schemaVersion":"1","command":"inspect","kind":"failure","variant":"unavailable","data":{"message":"remote"}}\n',
  );

  const textSuccess = await runCliScenario({
    cliContract: consumerFixture.cli,
    argv: ["inspect", "--output-format", "text", "--target", "public"],
    dependencies: { serviceAvailable: true },
  });
  assert.equal(textSuccess.stdout, "已检查 public\n");
  assert.equal(textSuccess.stderr, "");

  const textFailure = await runCliScenario({
    cliContract: consumerFixture.cli,
    argv: ["inspect", "--output-format", "text", "--target", "private"],
    dependencies: { serviceAvailable: true },
  });
  assert.equal(textFailure.stdout, "");
  assert.equal(textFailure.stderr, "inspect denied\n拒绝检查 private\n");
});

void test("capture 保留 structured 与 text stream 的生产事件顺序和终止事实", async () => {
  const structured = await runCliScenario({
    cliContract: consumerFixture.cli,
    ...commandScenarios.watch,
  });
  assert.deepEqual(structured.writes, [
    {
      destination: "stdout",
      chunk: '{"schemaVersion":"1","command":"watch","kind":"stream"}\n',
    },
    {
      destination: "stdout",
      chunk: '{"kind":"record","variant":"item","data":{"message":"第一条"}}\n',
    },
    {
      destination: "stdout",
      chunk: '{"kind":"record","variant":"item","data":{"message":"第二条"}}\n',
    },
    { destination: "stdout", chunk: '{"kind":"streamSuccess"}\n' },
  ]);
  assert.deepEqual(structured.termination, {
    kind: "applicationResult",
    command: "watch",
    result: { kind: "streamSuccess", command: "watch" },
    exitCode: 0,
  });

  const textStream = await runCliScenario({
    cliContract: consumerFixture.cli,
    argv: ["watch", "--output-format", "text"],
    dependencies: { serviceAvailable: true },
  });
  assert.deepEqual(textStream.writes, [
    { destination: "stdout", chunk: "第一条\n" },
    { destination: "stdout", chunk: "第二条\n" },
  ]);
  assert.deepEqual(textStream.termination, {
    kind: "applicationResult",
    command: "watch",
    result: { kind: "streamSuccess", command: "watch" },
    exitCode: 0,
  });
  assert.ok(Object.isFrozen(textStream));
  assert.ok(Object.isFrozen(textStream.writes));
  assert.ok(Object.isFrozen(textStream.writes[0]));
});

void test("写入异常保持 CliWriteError 原始 cause", async () => {
  const cause = new Error("write failure");
  await assert.rejects(
    runCliScenario({
      cliContract: consumerFixture.cli,
      ...commandScenarios.inspect,
      beforeWrite: () => {
        throw cause;
      },
    }),
    (error) => error instanceof CliWriteError && error.cause === cause,
  );
});
