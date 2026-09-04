import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CliWriteError,
  defineCli,
  helpCapability,
  outputCapability,
  text,
  type CliContract,
  type ContractSchema,
  type EmptyCliInput,
} from "@cli-contract/lib";
import { runCliScenario } from "@cli-contract/testing";

type ProbeInput = Readonly<{ readonly target: string }>;
type ProbeData = Readonly<{ readonly message: string }>;
type ProbeDependencies = Readonly<{
  readonly mode: "data" | "failure" | "handlerError";
}>;

const handlerFailure = new Error("handler failure");
const schemaFailure = new Error("schema failure");
const presenterFailure = new Error("presenter failure");

function schema<Input, Output>(
  validate: (value: unknown) => Readonly<{ readonly value: Output }>,
  jsonSchema: Record<string, unknown>,
): ContractSchema<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "@cli-contract/testing",
      validate,
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema,
      },
    },
  };
}

const emptyInputSchema = schema<EmptyCliInput, EmptyCliInput>(
  () => ({ value: Object.freeze({}) as EmptyCliInput }),
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {},
    type: "object",
  },
);

const probeInputSchema = schema<ProbeInput, ProbeInput>(
  (value) => ({ value: value as ProbeInput }),
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: { target: { type: "string" } },
    required: ["target"],
    type: "object",
  },
);

function createProbeCli() {
  const controls = { throwSchema: false, throwPresenter: false };
  const dataSchema = schema<ProbeData, ProbeData>(
    (value) => {
      if (controls.throwSchema) throw schemaFailure;
      return { value: value as ProbeData };
    },
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
      properties: { message: { type: "string" } },
      required: ["message"],
      type: "object",
    },
  );
  const present = (data: ProbeData) => {
    if (controls.throwPresenter) throw presenterFailure;
    return text.line(data.message);
  };
  const cli = defineCli<ProbeDependencies>()({
    root: "probe",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured", text: true }),
    usageFailureExitCode: 64,
    commands: {
      probe: {
        kind: "rootCommand",
        name: "probe",
        description: "探测服务",
        fields: {
          target: {
            kind: "valueOption",
            longOption: "--target",
            description: "目标",
          },
        },
        input: probeInputSchema,
        success: {
          kind: "data",
          variants: {
            result: {
              description: "探测结果",
              schema: dataSchema,
              exitCode: 0,
              text: present,
            },
          },
        },
        failures: {
          unavailable: {
            description: "服务不可用",
            schema: dataSchema,
            exitCode: 9,
            text: present,
          },
        },
        handler({ dependencies, input, outcome }) {
          if (dependencies.mode === "handlerError") throw handlerFailure;
          if (dependencies.mode === "failure") {
            return outcome.failure.unavailable({
              message: `无法连接 ${input.target}`,
            });
          }
          return outcome.data.result({ message: `已连接 ${input.target}` });
        },
      },
    },
  });
  return { cli, controls };
}

function createMixedStreamCli(): CliContract {
  return defineCli()({
    root: "stream",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      stream: {
        kind: "rootCommand",
        name: "stream",
        description: "混合输出流",
        input: emptyInputSchema,
        success: {
          kind: "stream",
          records: {
            item: {
              description: "流记录",
              schema: schema<ProbeData, ProbeData>(
                (value) => ({ value: value as ProbeData }),
                {
                  $schema: "https://json-schema.org/draft/2020-12/schema",
                  additionalProperties: false,
                  properties: { message: { type: "string" } },
                  required: ["message"],
                  type: "object",
                },
              ),
            },
          },
        },
        failures: {
          unavailable: {
            description: "服务不可用",
            schema: schema<ProbeData, ProbeData>(
              (value) => ({ value: value as ProbeData }),
              {
                $schema: "https://json-schema.org/draft/2020-12/schema",
                additionalProperties: false,
                properties: { message: { type: "string" } },
                required: ["message"],
                type: "object",
              },
            ),
            exitCode: 9,
          },
        },
        async *handler({ outcome }) {
          yield outcome.record.item({ message: "第一条" });
          return outcome.failure.unavailable({ message: "服务中断" });
        },
      },
    },
  });
}

void test("通过生产路径捕获 help、用法失败、data 与具名失败", async () => {
  const { cli } = createProbeCli();
  const dependencies = { mode: "data" } as const;

  const help = await runCliScenario({
    cliContract: cli,
    argv: ["--help"],
    dependencies,
  });
  assert.equal(help.termination.kind, "help");
  assert.match(help.stdout, /probe --target <value>/);
  assert.equal(help.stderr, "");

  const usageFailure = await runCliScenario({
    cliContract: cli,
    argv: [],
    dependencies,
  });
  assert.deepEqual(usageFailure, {
    writes: [{ destination: "stderr", chunk: "probe --target <value>\n" }],
    stdoutChunks: [],
    stderrChunks: ["probe --target <value>\n"],
    stdout: "",
    stderr: "probe --target <value>\n",
    termination: {
      kind: "usageFailure",
      command: "probe",
      issues: [{ code: "missingRequiredField", field: "target" }],
      exitCode: 64,
    },
  });

  const data = await runCliScenario({
    cliContract: cli,
    argv: ["--target", "api"],
    dependencies,
  });
  assert.equal(data.termination.kind, "applicationResult");
  assert.equal(data.termination.exitCode, 0);
  assert.equal(
    data.stdout,
    '{"schemaVersion":"1","command":"probe","kind":"data","variant":"result","data":{"message":"已连接 api"}}\n',
  );
  assert.equal(data.stderr, "");

  const failure = await runCliScenario({
    cliContract: cli,
    argv: ["--target", "api"],
    dependencies: { mode: "failure" },
  });
  assert.equal(failure.termination.kind, "applicationResult");
  assert.equal(failure.termination.exitCode, 9);
  assert.equal(failure.stdout, "");
  assert.equal(
    failure.stderr,
    '{"schemaVersion":"1","command":"probe","kind":"failure","variant":"unavailable","data":{"message":"无法连接 api"}}\n',
  );
});

void test("保留跨通道发出顺序，并冻结捕获事实", async () => {
  const capture = await runCliScenario({
    cliContract: createMixedStreamCli(),
    argv: [],
    dependencies: undefined,
  });

  assert.deepEqual(
    capture.writes.map(({ destination }) => destination),
    ["stdout", "stdout", "stderr"],
  );
  assert.equal(capture.stdoutChunks.length, 2);
  assert.equal(capture.stderrChunks.length, 1);
  assert.ok(Object.isFrozen(capture));
  assert.ok(Object.isFrozen(capture.writes));
  assert.ok(Object.isFrozen(capture.writes[0]));
});

void test("写入、handler、schema 与 presenter 异常保持原样拒绝", async () => {
  const { cli, controls } = createProbeCli();
  const writeFailure = new Error("write failure");

  await assert.rejects(
    runCliScenario({
      cliContract: cli,
      argv: ["--target", "api"],
      dependencies: { mode: "data" },
      beforeWrite: () => {
        throw writeFailure;
      },
    }),
    (error) => error instanceof CliWriteError && error.cause === writeFailure,
  );
  await assert.rejects(
    runCliScenario({
      cliContract: cli,
      argv: ["--target", "api"],
      dependencies: { mode: "handlerError" },
    }),
    (error) => error === handlerFailure,
  );

  controls.throwSchema = true;
  await assert.rejects(
    runCliScenario({
      cliContract: cli,
      argv: ["--target", "api"],
      dependencies: { mode: "data" },
    }),
    (error) => error === schemaFailure,
  );
  controls.throwSchema = false;
  controls.throwPresenter = true;
  await assert.rejects(
    runCliScenario({
      cliContract: cli,
      argv: ["--output-format", "text", "--target", "api"],
      dependencies: { mode: "data" },
    }),
    (error) => error === presenterFailure,
  );
});
