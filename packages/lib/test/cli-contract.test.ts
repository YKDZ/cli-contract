import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type ContractSchema,
  type EmptyCliInput,
} from "@ykdz/cli-contract";

const emptyJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: {},
  required: [],
  type: "object",
} as const;

function emptyInputSchema(
  requestedTargets: string[] = [],
): ContractSchema<EmptyCliInput> {
  return {
    "~standard": {
      version: 1,
      vendor: "cli-contract-test",
      validate(value) {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0
        ) {
          return { value: Object.freeze({}) as EmptyCliInput };
        }

        return { issues: [{ message: "输入必须是空对象" }] };
      },
      jsonSchema: {
        input({ target }) {
          requestedTargets.push(`input:${target}`);
          return emptyJsonSchema;
        },
        output({ target }) {
          requestedTargets.push(`output:${target}`);
          return emptyJsonSchema;
        },
      },
    },
  };
}

function createFixtureCli(onRun: () => void = () => undefined) {
  return defineCli()({
    root: "fixture",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "演示最小 CLI",
        input: emptyInputSchema(),
        success: { kind: "completion" },
        failures: {},
        handler({ input, dependencies, outcome }) {
          assert.deepEqual(input, {});
          assert.equal(dependencies, undefined);
          onRun();
          return outcome.completion();
        },
      },
    },
  });
}

void test("空调用执行 completion 契约并写出规范 JSON", async () => {
  let runCount = 0;
  const cli = createFixtureCli(() => {
    runCount += 1;
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  assert.equal(runCount, 1);
  assert.deepEqual(writes, [
    {
      destination: "stdout",
      chunk: '{"schemaVersion":"1","command":"fixture","kind":"completion"}\n',
    },
  ]);
  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "fixture",
    result: { kind: "completion", command: "fixture" },
    exitCode: 0,
  });
});

void test("帮助从契约机械产生且不执行 handler", async () => {
  let runCount = 0;
  const cli = createFixtureCli(() => {
    runCount += 1;
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help", "ignored"]),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  assert.equal(runCount, 0);
  assert.deepEqual(writes, [
    {
      destination: "stdout",
      chunk: "fixture\n演示最小 CLI\n--help\n",
    },
  ]);
  assert.deepEqual(termination, {
    kind: "help",
    command: "fixture",
    exitCode: 0,
  });
});

void test("多余 positional 产生结构化用法失败和简短 usage", async () => {
  let runCount = 0;
  const cli = createFixtureCli(() => {
    runCount += 1;
  });
  const invocation = parseCliInvocation(cli, ["extra", "ignored"]);
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  assert.deepEqual(invocation, {
    kind: "usageFailure",
    command: "fixture",
    issues: [
      {
        code: "unexpectedPositional",
        position: 0,
        value: "extra",
      },
    ],
    usage: {
      command: "fixture",
      synopsis: "fixture",
    },
  });

  const termination = await executeCli(cli, {
    invocation,
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  assert.equal(runCount, 0);
  assert.deepEqual(writes, [
    {
      destination: "stderr",
      chunk:
        '{"schemaVersion":"1","command":"fixture","kind":"usageFailure","issues":[{"code":"unexpectedPositional","position":0,"value":"extra"}],"usage":"fixture","helpArgv":["fixture","--help"]}\n',
    },
  ]);
  assert.deepEqual(termination, {
    kind: "usageFailure",
    command: "fixture",
    issues: invocation.issues,
    exitCode: 64,
  });
});

void test("usage failure manifest 闭合全部问题 wire 形状", () => {
  const wire = JSON.stringify(createFixtureCli().manifest.usageFailure.wire);
  for (const code of [
    "conflictingFlag",
    "conflictingOutputFormat",
    "exclusiveUsageConstraint",
    "forbiddenUsageCombination",
    "inputRejected",
    "invalidFieldChoice",
    "invalidOutputFormat",
    "missingOptionValue",
    "missingRequiredField",
    "repeatedOption",
    "requiredByUsageConstraint",
    "unexpectedOptionValue",
    "unexpectedPositional",
    "unknownCommand",
    "unknownOption",
  ]) {
    assert.match(wire, new RegExp(`\\"const\\":\\"${code}\\"`));
  }
  assert.match(wire, /"command":\{"const":"fixture"\}/);
  assert.match(wire, /"usage":\{"const":"fixture"\}/);
  assert.match(wire, /"helpArgv":\{"const":\["fixture","--help"\]\}/);
  assert.doesNotMatch(wire, /"exitCode"/);
});

void test("inputRejected wire evidence 至少保留一个执行期 schema issue", () => {
  const wire = JSON.stringify(createFixtureCli().manifest.usageFailure.wire);
  assert.match(
    wire,
    /"code":\{"const":"inputRejected"\}.*?"evidence":\{.*?"minItems":1,"type":"array"\}\},"required":\["code","evidence"\]/,
  );
});

void test("定义期请求两侧 Draft 2020-12 并公开不可变投影", () => {
  const requestedTargets: string[] = [];
  const schema = emptyInputSchema(requestedTargets);
  const cli = defineCli()({
    root: "fixture",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "演示最小 CLI",
        input: schema,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.deepEqual(requestedTargets, [
    "input:draft-2020-12",
    "output:draft-2020-12",
  ]);
  assert.deepEqual(cli.grammar, {
    root: {
      kind: "rootCommand",
      id: "fixture",
      name: "fixture",
      description: "演示最小 CLI",
      fields: [],
      usage: {
        command: "fixture",
        synopsis: "fixture",
      },
    },
    nodes: [],
    controls: {
      help: { longOption: "--help" },
      output: { defaultFormat: "structured", formats: ["structured"] },
    },
  });
  assert.equal(cli.manifest.root, "fixture");
  assert.equal(cli.manifest.schemaVersion, "1");
  assert.deepEqual(cli.manifest.commands.fixture.input, {
    inputSchema: emptyJsonSchema,
    outputSchema: emptyJsonSchema,
  });
  assert.equal(Object.isFrozen(cli.grammar), true);
  assert.equal(Object.isFrozen(cli.grammar.root), true);
  assert.equal(Object.isFrozen(cli.manifest), true);
  assert.equal(
    Object.isFrozen(cli.manifest.commands.fixture.input.inputSchema),
    true,
  );
});

void test("执行等待输出端口完成且契约可以重复执行", async () => {
  let releaseWrite: (() => void) | undefined;
  let writeStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    writeStarted = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const cli = createFixtureCli();
  let completed = false;

  const firstExecution = executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write() {
      writeStarted?.();
      return blocked;
    },
  }).then(() => {
    completed = true;
  });

  await started;
  assert.equal(completed, false);
  releaseWrite?.();
  await firstExecution;

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write({ chunk }) {
      writes.push(chunk);
    },
  });

  assert.equal(writes.length, 1);
});
