import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CliWriteError,
  defineCli,
  helpCapability,
  text,
  type ContractSchema,
  type EmptyCliInput,
} from "@ykdz/cli-contract";
import {
  defineCommandScenarios,
  defineFailureScenarios,
  runCliScenario,
  type CliScenario,
} from "@ykdz/cli-contract-testing";

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
      vendor: "@ykdz/cli-contract-testing",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Fixture callers supply values that match the output type.
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
  description: "Inspect the target",
  fields: {
    target: {
      kind: "valueOption",
      longOption: "--target",
      description: "Target",
    },
  },
  input: inspectInputSchema,

  outputs: ({ atomic }) => {
    const inspect = atomic({
      success: {
        kind: "data",
        variants: {
          found: {
            description: "Inspection result",
            schema: inspectDataSchema,
            exitCode: 0,
          },
        },
      },
      failures: {
        unavailable: {
          description: "Service unavailable",
          schema: inspectDataSchema,
          exitCode: 9,
        },
        denied: {
          description: "Inspection denied",
          schema: inspectDataSchema,
          exitCode: 10,
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
    return {
      default: "structured",
      modes: {
        structured: inspect.structured({ description: "Structured output" }),
        text: inspect.text({
          description: "Text output",
          success: {
            found: ({ message }) => text.line(`Inspected ${message}`),
          },
          failures: {
            unavailable: ({ message }) =>
              text.line(`Service unavailable for ${message}`),
            denied: ({ message }) =>
              text.line(`Inspection denied for ${message}`),
          },
        }),
      },
    };
  },
});

const watchCommand = define.command("watch")({
  kind: "command",
  parent: "consumer",
  name: "watch",
  description: "Watch the target",
  fields: {},
  input: emptyInputSchema,

  outputs: ({ stream }) => {
    const watch = stream({
      records: {
        item: {
          description: "Observation",
          schema: watchDataSchema,
        },
      },
      failures: {
        interrupted: {
          description: "Watch interrupted",
          schema: watchDataSchema,
          exitCode: 11,
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
    return {
      default: "structured",
      modes: {
        structured: watch.structured({ description: "Structured output" }),
        text: watch.text({
          description: "Text stream",
          records: { item: ({ message }) => text.line(message) },
          failures: {
            interrupted: ({ message }) =>
              text.line(`Watch interrupted: ${message}`),
          },
          terminal: () => text.silent,
        }),
      },
    };
  },
});

const statusCommand = define.command("status")({
  kind: "command",
  parent: "consumer",
  name: "status",
  description: "Read status",
  fields: {},
  input: emptyInputSchema,

  outputs: ({ atomic }) => ({
    modes: {
      structured: atomic({
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }).structured({ description: "Structured output" }),
    },
  }),
});

const consumerFixture = {
  cli: define({
    root: "consumer",
    help: helpCapability({
      wording: {
        commandPlaceholder: "命令",
        choices: "（候选：{choices}）",
        default: "（默认：{value}）",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      consumer: {
        kind: "rootGroup",
        name: "consumer",
        description: "Consumer fixture",
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
    // @ts-expect-error the watch command needs a scenario.
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
    // @ts-expect-error the denied failure needs a scenario.
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
      // @ts-expect-error unavailable belongs to inspect.
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
    // @ts-expect-error a default scenario cannot stand in for a command.
    default: {
      argv: [],
      dependencies: { serviceAvailable: true },
    },
  });

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Widen the scenario map to exercise the closed-key requirement.
  const commandScenarioSink = null as unknown as Readonly<
    Record<string, CliScenario<typeof consumerFixture.cli>>
  >;
  // @ts-expect-error a command scenario map must name the commands explicitly.
  void defineCommandScenarios(consumerFixture.cli, commandScenarioSink);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Widen the scenario map to exercise the closed-key requirement.
  const failureScenarioSink = null as unknown as Readonly<{
    readonly inspect: Readonly<
      Record<string, CliScenario<typeof consumerFixture.cli>>
    >;
  }>;
  // @ts-expect-error a failure scenario map must name the failures explicitly.
  void defineFailureScenarios(consumerFixture.cli, failureScenarioSink);
}
void verifyScenarioTypeErrors;

void test("scenario capture includes structured and text successes and failures", async () => {
  const structuredSuccess = await runCliScenario({
    cliContract: consumerFixture.cli,
    ...commandScenarios.inspect,
  });
  assert.equal(structuredSuccess.termination.kind, "applicationResult");
  assert.equal(structuredSuccess.termination.exitCode, 0);
  assert.equal(
    structuredSuccess.stdout,
    '{"schemaVersion":"3","command":"inspect","outputMode":"structured","kind":"data","variant":"found","data":{"message":"public"}}\n',
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
    '{"schemaVersion":"3","command":"inspect","outputMode":"structured","kind":"failure","variant":"unavailable","data":{"message":"remote"}}\n',
  );

  const textSuccess = await runCliScenario({
    cliContract: consumerFixture.cli,
    argv: ["inspect", "--output", "text", "--target", "public"],
    dependencies: { serviceAvailable: true },
  });
  assert.equal(textSuccess.stdout, "Inspected public\n");
  assert.equal(textSuccess.stderr, "");

  const textFailure = await runCliScenario({
    cliContract: consumerFixture.cli,
    argv: ["inspect", "--output", "text", "--target", "private"],
    dependencies: { serviceAvailable: true },
  });
  assert.equal(textFailure.stdout, "");
  assert.equal(textFailure.stderr, "Inspection denied for private\n");
});

void test("scenario capture preserves stream writes in order and reports termination", async () => {
  const structured = await runCliScenario({
    cliContract: consumerFixture.cli,
    ...commandScenarios.watch,
  });
  assert.deepEqual(structured.writes, [
    {
      destination: "stdout",
      chunk:
        '{"schemaVersion":"3","command":"watch","outputMode":"structured","kind":"stream"}\n',
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
    outputMode: "structured",
    result: { kind: "streamSuccess", command: "watch" },
    exitCode: 0,
  });

  const textStream = await runCliScenario({
    cliContract: consumerFixture.cli,
    argv: ["watch", "--output", "text"],
    dependencies: { serviceAvailable: true },
  });
  assert.deepEqual(textStream.writes, [
    { destination: "stdout", chunk: "第一条\n" },
    { destination: "stdout", chunk: "第二条\n" },
  ]);
  assert.deepEqual(textStream.termination, {
    kind: "applicationResult",
    command: "watch",
    outputMode: "text",
    result: { kind: "streamSuccess", command: "watch" },
    exitCode: 0,
  });
  assert.ok(Object.isFrozen(textStream));
  assert.ok(Object.isFrozen(textStream.writes));
  assert.ok(Object.isFrozen(textStream.writes[0]));
});

void test("a failed write preserves the original cause in CliWriteError", async () => {
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
