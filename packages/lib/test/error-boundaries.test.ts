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
} from "@boringparts/cli-contract";
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

void test("an invocation mismatched with the contract is rejected with a closed execution issue", async () => {
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

void test("a forged CLI contract is rejected with a closed execution issue before reading public structure", async () => {
  const cli = createCompletionCli(() => undefined);
  const writes: string[] = [];

  await assert.rejects(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally forges a contract or return value to verify the execution boundary.
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

void test("an output-seam rejection preserves destination and the original cause without retrying", async () => {
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

void test("open exceptions thrown by the handler keep their original identity", async () => {
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

void test("a non-string construction error in a text presenter keeps its identity and writes nothing", async () => {
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

void test("exceptions thrown by a text presenter keep their original identity", async () => {
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

void test("open exceptions thrown by schema validate keep their original identity", async () => {
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

void test("a handler returning an unissued object is rejected with a core execution issue without writing", async () => {
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

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally forges a contract or return value to verify the execution boundary.

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

void test("defineCli reports dynamic invalid values in the current declaration in one pass", () => {
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally forges a contract or return value to verify the execution boundary.
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

void test("defineCli rejects a text completion missing its presenter", () => {
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

void test("defineCli rejects a canonical long option duplicated across fields", () => {
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally forges a contract or return value to verify the execution boundary.
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
