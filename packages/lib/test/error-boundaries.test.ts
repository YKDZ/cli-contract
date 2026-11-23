import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractExecutionError,
  ContractDefinitionError,
  CliWriteError,
  TextValueError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  text,
  type OutputExecutionFactory,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

const invalidValueInput = z.object({ name: z.string() });

function createCompletionCli(onRun: () => Promise<void> | void) {
  const sharedInput0 = z.object({});
  return defineCli()({
    root: "fixture",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: sharedInput0,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: async ({ outcome }) => {
                  await onRun();
                  return outcome.completion();
                },
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
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
  const invocation = parseCliInvocation(first, []);
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
      assert.equal(error.message, "contractExecutionError");
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意伪造契约或返回值，以验证执行边界。
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
      assert.equal(error.message, "cliWriteError");
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

void test("文本呈现器中的非字符串构造错误保持原身份并不写出", async () => {
  const privateText = "包装文本不应泄漏";
  let constructionError: unknown;
  const sharedInput1 = z.object({});
  const cli = defineCli()({
    root: "fixture",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: sharedInput1,

        outputs: (mode) => ({
          default: "text",
          modes: {
            text: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .text({
                description: "文本输出",
                success: () => {
                  try {
                    return text.line(new String(privateText) as never);
                  } catch (error) {
                    constructionError = error;
                    throw error;
                  }
                },
                failures: {},
              }),
          },
        }),
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
    (error: unknown) =>
      error === constructionError &&
      error instanceof TextValueError &&
      error.message === "invalidTextLine" &&
      error.issue.code === "invalidTextLine" &&
      error.issue.reason === "notString",
  );
  assert.deepEqual(writes, []);
});

void test("文本呈现器抛出的异常保持原始身份", async () => {
  const cause = new RangeError("consumer text presenter defect");
  const sharedInput2 = z.object({});
  const cli = defineCli()({
    root: "fixture",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: sharedInput2,

        outputs: (mode) => ({
          default: "text",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .text({
                description: "文本输出",
                success: () => {
                  throw cause;
                },
                failures: {},
              }),
          },
        }),
      },
    },
  });

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: () => undefined,
    }),
    (error) => error === cause,
  );
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
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: throwingInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
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
  const sharedInput3 = z.object({});
  const cli = defineCli()({
    root: "fixture",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "fixture command",
        input: sharedInput3,

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意伪造契约或返回值，以验证执行边界。

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: () =>
                  ({ kind: "completion", command: "fixture" }) as never,
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
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
        input: invalidValueInput,

        outputs: (
          mode: OutputExecutionFactory<
            "fixture",
            undefined,
            typeof invalidValueInput
          >,
        ) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "data",
                  variants: {
                    found: {
                      description: "找到",
                      schema: z.object({ name: z.string() }),
                      exitCode: 0,
                    },
                  },
                },
                failures: {},
                handler: ({ outcome }) => outcome.data.found({ name: "结果" }),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意伪造契约或返回值，以验证执行边界。
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "invalidCapability", capability: "help" },
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
        {
          code: "missingHelpFactTemplate",
          command: "fixture",
          slot: "choices",
        },
        {
          code: "missingHelpFactTemplate",
          command: "fixture",
          slot: "default",
        },
      ]);
      return true;
    },
  );
});

void test("defineCli 拒绝缺少 presenter 的 text completion", () => {
  const sharedInput4 = z.object({});
  assert.throws(
    () =>
      defineCli()({
        root: "fixture",
        help: helpCapability({
          wording: {
            choices: "(choices: {choices})",
            default: "(default: {value})",
          },
        }),

        usageFailureExitCode: 64,
        commands: {
          fixture: {
            kind: "rootCommand",
            name: "fixture",
            description: "fixture command",
            input: sharedInput4,

            outputs: (mode) => ({
              default: "text",
              modes: {
                text: mode
                  .atomic({
                    success: { kind: "completion" },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  })
                  // @ts-expect-error Exercise the runtime diagnostic for a missing completion presenter.
                  .text({
                    description: "文本输出",
                    failures: {},
                  }),
              },
            }),
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
  const sharedInput5 = z.object({ first: z.string(), second: z.string() });
  const definition = {
    root: "fixture",
    help: englishHelpCapability(),

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
        input: sharedInput5,

        outputs: (
          mode: OutputExecutionFactory<
            "fixture",
            undefined,
            typeof sharedInput5
          >,
        ) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: () => undefined as never,
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意伪造契约或返回值，以验证执行边界。
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
