import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractExecutionError,
  ContractDefinitionError,
  CliWriteError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type CliInvocation,
  type OutputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

function createCompletionCli(onRun: () => Promise<void> | void) {
  return defineCli()({
    root: "fixture",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: async ({ outcome }) => {
          await onRun();
          return outcome.completion();
        },
      },
    },
  });
}

void test("错配契约的 invocation 以闭合执行问题拒绝", async () => {
  let runCount = 0;
  const first = createCompletionCli(() => {
    runCount += 1;
  });
  const second = createCompletionCli(() => {
    runCount += 1;
  });
  const invocation = parseCliInvocation(first, []) as unknown as CliInvocation<
    typeof second
  >;
  const writes: string[] = [];

  await assert.rejects(
    executeCli(second, {
      invocation,
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    }),
    (error) => {
      assert.ok(error instanceof ContractExecutionError);
      assert.deepEqual(error.issues, [
        {
          code: "invocationContractMismatch",
          expectedCommand: "fixture",
          receivedCommand: "fixture",
        },
      ]);
      return true;
    },
  );
  assert.equal(runCount, 0);
  assert.deepEqual(writes, []);
});

void test("伪造的 CLI 契约在读取公开结构前以闭合执行问题拒绝", async () => {
  const cli = createCompletionCli(() => undefined);
  const writes: string[] = [];

  await assert.rejects(
    executeCli({} as typeof cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    }),
    (error) => {
      assert.ok(error instanceof ContractExecutionError);
      assert.deepEqual(error.issues, [{ code: "invalidCliContract" }]);
      return true;
    },
  );
  assert.deepEqual(writes, []);
});

void test("输出端口拒绝时保留 destination 与原始 cause 且不重试", async () => {
  let runCount = 0;
  let writeCount = 0;
  const cli = createCompletionCli(() => {
    runCount += 1;
  });
  const cause = new Error("broken destination", {
    cause: new Error("host detail"),
  });

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: async () => {
        writeCount += 1;
        throw cause;
      },
    }),
    (error) => {
      assert.ok(error instanceof CliWriteError);
      assert.equal(error.destination, "stdout");
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.equal(runCount, 1);
  assert.equal(writeCount, 1);
});

void test("handler 抛出的开放异常保持原始身份", async () => {
  const cause = new TypeError("consumer handler defect", {
    cause: new Error("domain cause"),
  });
  const cli = createCompletionCli(async () => {
    throw cause;
  });
  const writes: string[] = [];

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    }),
    (error) => error === cause,
  );
  assert.deepEqual(writes, []);
});

void test("schema validate 抛出的开放异常保持原始身份", async () => {
  const cause = new RangeError("consumer schema defect", {
    cause: new Error("validator cause"),
  });
  const input = z.object({});
  const throwingInput = {
    "~standard": {
      ...input["~standard"],
      validate() {
        throw cause;
      },
    },
  };
  const cli = defineCli()({
    root: "fixture",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: throwingInput,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
  const writes: string[] = [];

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    }),
    (error) => error === cause,
  );
  assert.deepEqual(writes, []);
});

void test("handler 返回未签发对象时以核心执行问题拒绝且不写出", async () => {
  const cli = defineCli()({
    root: "fixture",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: () => ({ kind: "completion", command: "fixture" }) as never,
      },
    },
  });
  const writes: string[] = [];

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    }),
    (error) => {
      assert.ok(error instanceof ContractExecutionError);
      assert.deepEqual(error.issues, [
        { code: "invalidOutcomeFact", command: "fixture" },
      ]);
      return true;
    },
  );
  assert.deepEqual(writes, []);
});

void test("defineCli 一次报告当前声明中的动态无效值", () => {
  const definition = {
    root: "fixture",
    help: {},
    output: {},
    usageFailureExitCode: 0,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "",
        description: "",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--Bad_Name",
            description: "",
          },
        },
        input: z.object({ name: z.string() }),
        success: { kind: "data", variants: {} },
        failures: {},
        handler: () => undefined,
      },
    },
  };

  assert.throws(
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "invalidCapability", capability: "help" },
        { code: "invalidCapability", capability: "output" },
        {
          code: "invalidUsageFailureExitCode",
          received: 0,
          minimum: 1,
          maximum: 255,
        },
        {
          code: "missingCommandText",
          command: "fixture",
          field: "name",
        },
        {
          code: "invalidDescription",
          command: "fixture",
          location: "command",
          received: "",
        },
        { code: "missingDataVariant", command: "fixture" },
        {
          code: "invalidDescription",
          command: "fixture",
          location: "field",
          field: "name",
          received: "",
        },
        {
          code: "invalidFieldLongOption",
          command: "fixture",
          field: "name",
          received: "--Bad_Name",
        },
      ]);
      return true;
    },
  );
});

void test("defineCli 在动态启用 text 时仍要求 completion presenter", () => {
  assert.throws(
    () =>
      defineCli()({
        root: "fixture",
        help: helpCapability(),
        output: outputCapability({
          defaultFormat: "text",
        } as never) as OutputCapability,
        usageFailureExitCode: 64,
        commands: {
          fixture: {
            kind: "rootCommand",
            name: "fixture",
            description: "fixture command",
            input: z.object({}),
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingTextPresenter",
          command: "fixture",
          location: "completion",
        },
      ]);
      return true;
    },
  );
});

void test("defineCli 拒绝字段间重复的 canonical long option", () => {
  const definition = {
    root: "fixture",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        fields: {
          first: {
            kind: "valueOption",
            longOption: "--value",
            description: "first value",
          },
          second: {
            kind: "valueOption",
            longOption: "--value",
            description: "second value",
          },
        },
        input: z.object({ first: z.string(), second: z.string() }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };

  assert.throws(
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "duplicateFieldLongOption",
          command: "fixture",
          longOption: "--value",
          fields: ["first", "second"],
        },
      ]);
      return true;
    },
  );
});
