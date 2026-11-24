import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractExecutionError,
  defineCli,
  executeCli,
  parseCliInvocation,
  text,
  type ContractSchema,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

const emptyInput = z.object({});
const item = z.object({ value: z.string() });

function createUncheckedStreamCli(handler: unknown) {
  return defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally crosses static types to verify the streaming result boundary.

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                handler: handler as never,
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

void test("the stream handler validates the async iterator protocol as a closed check before the header", async () => {
  let synchronousGeneratorRan = false;
  function* synchronousGenerator() {
    synchronousGeneratorRan = true;
    yield undefined;
  }
  const invalidHandlers: readonly [string, unknown][] = [
    ["Promise", () => Promise.resolve(undefined)],
    ["synchronous generator", synchronousGenerator],
    ["missing asyncIterator", () => ({ next() {}, return() {} })],
    ["missing next", () => ({ [Symbol.asyncIterator]() {}, return() {} })],
    ["missing return", () => ({ [Symbol.asyncIterator]() {}, next() {} })],
  ];
  for (const [label, handler] of invalidHandlers) {
    const cli = createUncheckedStreamCli(handler);
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
        assert.ok(error instanceof ContractExecutionError, label);
        assert.deepEqual(error.issues, [
          { code: "streamHandlerMustReturnAsyncGenerator", command: "list" },
        ]);
        return true;
      },
    );
    assert.deepEqual(writes, [], label);
  }
  assert.equal(synchronousGeneratorRan, false);
});

void test("a structured stream writes compact NDJSON as header, records, and terminal fact", async () => {
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "一个项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  yield outcome.record.item({ value: "first" });
                  yield outcome.record.item({ value: "second" });
                  return outcome.streamSuccess();
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
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
    },
  });

  assert.deepEqual(writes, [
    {
      destination: "stdout",
      chunk:
        '{"schemaVersion":"3","command":"list","outputMode":"structured","kind":"stream"}\n',
    },
    {
      destination: "stdout",
      chunk: '{"kind":"record","variant":"item","data":{"value":"first"}}\n',
    },
    {
      destination: "stdout",
      chunk: '{"kind":"record","variant":"item","data":{"value":"second"}}\n',
    },
    { destination: "stdout", chunk: '{"kind":"streamSuccess"}\n' },
  ]);
  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "list",
    outputMode: "structured",
    result: { kind: "streamSuccess", command: "list" },
    exitCode: 0,
  });
  const structuredMode = cli.manifest.commands.list.outputs.modes.structured;
  assert.ok(structuredMode);
  assert.deepEqual(structuredMode.success, {
    kind: "stream",
    records: {
      item: {
        description: "一个项目",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          description: "一个项目",
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
        outputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          description: "一个项目",
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    },
  });
  const structuredWire = cli.manifest.wire.structured;
  assert.ok(structuredWire);
  assert.deepEqual(structuredWire.stream?.terminal, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: { kind: { const: "streamSuccess" } },
    required: ["kind"],
  });
  // oxlint-disable-next-line unicorn/no-array-sort -- Object.keys creates a fresh array for the assertion; sorting does not modify the manifest.
  assert.deepEqual(Object.keys(structuredWire.stream ?? {}).sort(), [
    "header",
    "line",
    "records",
    "terminal",
  ]);
});

void test("empty issues from a record output schema still produce outputSchemaRejected", async () => {
  const rejectedRecordSchema: ContractSchema<Readonly<{ value: string }>> = {
    "~standard": {
      ...item["~standard"],
      validate() {
        const failureWithValue = {
          issues: [],
          value: { value: "ignored" },
        };
        return failureWithValue;
      },
    },
  };
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "一个项目",
                    schema: rejectedRecordSchema,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  yield outcome.record.item({ value: "first" });
                  return outcome.streamSuccess();
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
        {
          code: "outputSchemaRejected",
          command: "list",
          location: "record",
          variant: "item",
          expected: "schemaAccepted",
          received: "schemaRejected",
        },
      ]);
      return true;
    },
  );
  assert.deepEqual(writes, [
    '{"schemaVersion":"3","command":"list","outputMode":"structured","kind":"stream"}\n',
  ]);
});

void test("a stream may explicitly succeed right after the first frame", async () => {
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  yield* [] as Iterable<never>;
                  return outcome.streamSuccess();
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
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    '{"schemaVersion":"3","command":"list","outputMode":"structured","kind":"stream"}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
});

void test("stream failure keeps the stdout prefix and writes no success terminal fact", async () => {
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {
                  stopped: {
                    description: "中断",
                    schema: item,
                    exitCode: 8,
                  },
                },
                async *handler({ outcome }) {
                  yield outcome.record.item({ value: "first" });
                  return outcome.failure.stopped({ value: "quota" });
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
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
    },
  });
  assert.deepEqual(
    writes.map((write) => write.destination),
    ["stdout", "stdout", "stderr"],
  );
  assert.equal(
    writes.at(-1)?.chunk,
    '{"schemaVersion":"3","command":"list","outputMode":"structured","kind":"failure","variant":"stopped","data":{"value":"quota"}}\n',
  );
  assert.equal(termination.kind, "applicationResult");
  assert.deepEqual(termination.result, {
    kind: "failure",
    command: "list",
    variant: "stopped",
    data: { value: "quota" },
  });
  assert.equal(termination.exitCode, 8);
});

void test("record validation rejection and write rejection both stop pulling and clean up the generator", async () => {
  let invalidCleanup = false;
  const invalidCli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  try {
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally crosses static types to verify the streaming result boundary.
                    yield outcome.record.item({
                      value: 1 as unknown as string,
                    });
                    yield outcome.record.item({ value: "never" });
                    return outcome.streamSuccess();
                  } finally {
                    invalidCleanup = true;
                  }
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
  const invalidWrites: string[] = [];
  await assert.rejects(
    executeCli(invalidCli, {
      invocation: parseCliInvocation(invalidCli, []),
      dependencies: undefined,
      write: ({ chunk }) => {
        invalidWrites.push(chunk);
      },
    }),
    ContractExecutionError,
  );
  assert.deepEqual(invalidWrites, [
    '{"schemaVersion":"3","command":"list","outputMode":"structured","kind":"stream"}\n',
  ]);
  assert.equal(invalidCleanup, true);

  let pulled = 0;
  let cleanup = false;
  const gatedCli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  try {
                    pulled += 1;
                    yield outcome.record.item({ value: "first" });
                    pulled += 1;
                    yield outcome.record.item({ value: "never" });
                    return outcome.streamSuccess();
                  } finally {
                    cleanup = true;
                  }
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
  await assert.rejects(
    executeCli(gatedCli, {
      invocation: parseCliInvocation(gatedCli, []),
      dependencies: undefined,
      write: ({ chunk }) => {
        if (chunk.includes('"record"'))
          return Promise.reject(new Error("closed"));
        return undefined;
      },
    }),
  );
  assert.equal(pulled, 1);
  assert.equal(cleanup, true);
});

void test("one stream handler projects to structured NDJSON or text line, fragment, and silent terminal facts", async () => {
  let executions = 0;
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                  delta: {
                    description: "增量",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  executions += 1;
                  yield outcome.record.item({ value: "one" });
                  yield outcome.record.delta({ value: "two\nthree" });
                  return outcome.streamSuccess();
                },
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                  delta: {
                    description: "增量",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  executions += 1;
                  yield outcome.record.item({ value: "one" });
                  yield outcome.record.delta({ value: "two\nthree" });
                  return outcome.streamSuccess();
                },
              })
              .text({
                description: "文本输出",
                records: {
                  item: (data: Readonly<{ readonly value: string }>) =>
                    text.line(`项目 ${data.value}`),
                  delta: (data: Readonly<{ readonly value: string }>) =>
                    text.fragment(data.value),
                },
                failures: {},
                terminal: () => text.silent,
              }),
          },
        }),
      },
    },
  });
  const structured: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      structured.push(chunk);
    },
  });
  const textWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--output", "text"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      textWrites.push(chunk);
    },
  });

  assert.equal(executions, 2);
  assert.deepEqual(structured, [
    '{"schemaVersion":"3","command":"list","outputMode":"structured","kind":"stream"}\n',
    '{"kind":"record","variant":"item","data":{"value":"one"}}\n',
    '{"kind":"record","variant":"delta","data":{"value":"two\\nthree"}}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
  assert.deepEqual(textWrites, ["项目 one\n", "two\nthree"]);
  const textMode = cli.manifest.commands.list.outputs.modes.text;
  assert.ok(textMode);
  const manifestSuccess = textMode.success;
  assert.equal(manifestSuccess.kind, "stream");
  if (manifestSuccess.kind !== "stream")
    assert.fail("expected a stream manifest");
  assert.deepEqual(manifestSuccess.text, { recordFraming: "fragment" });
  assert.throws(() => text.fragment("a\0b"), TypeError);
});

void test("text stream success writes one deterministic terminal chunk via text.lines", async () => {
  let handlerInput: unknown;
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        fields: { label: { kind: "positional", description: "Stream label" } },
        input: z.object({ label: z.string() }),

        outputs: (mode) => ({
          default: "text",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  yield* [] as Iterable<never>;
                  return outcome.streamSuccess();
                },
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ input, outcome }) {
                  handlerInput = input;
                  yield outcome.record.item({ value: "one" });
                  return outcome.streamSuccess();
                },
              })
              .text({
                description: "文本输出",
                records: {
                  item: ({ value }, { input }) => {
                    assert.equal(input, handlerInput);
                    return text.line(`${input.label}: ${value}`);
                  },
                },
                failures: {},
                terminal: ({ input }) => {
                  assert.equal(input, handlerInput);
                  return text.lines([input.label, "", "Done"]);
                },
              }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["batch"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, ["batch: one\n", "batch\n\nDone\n"]);
});

void test("text stream failure keeps written records, stable identity, and stderr; a write rejection stops pulling and cleans up", async () => {
  let pulled = 0;
  let cleaned = false;
  const cli = defineCli()({
    root: "list",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        fields: { label: { kind: "positional", description: "Stream label" } },
        input: z.object({ label: z.string() }),

        outputs: (mode) => ({
          default: "text",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {
                  stopped: {
                    description: "中断",
                    schema: item,
                    exitCode: 8,
                  },
                },
                async *handler({ outcome }) {
                  try {
                    pulled += 1;
                    yield outcome.record.item({ value: "first" });
                    return outcome.failure.stopped({ value: "quota" });
                  } finally {
                    cleaned = true;
                  }
                },
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {
                  stopped: {
                    description: "中断",
                    schema: item,
                    exitCode: 8,
                  },
                },
                async *handler({ outcome }) {
                  try {
                    pulled += 1;
                    yield outcome.record.item({ value: "first" });
                    return outcome.failure.stopped({ value: "quota" });
                  } finally {
                    cleaned = true;
                  }
                },
              })
              .text({
                description: "文本输出",
                records: {
                  item: (data: Readonly<{ readonly value: string }>) =>
                    text.line(data.value),
                },
                failures: {
                  stopped: ({ value }, { input }) =>
                    text.line(`${input.label}: ${value}`),
                },
                terminal: () => text.silent,
              }),
          },
        }),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const failure = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["batch"]),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
      return undefined;
    },
  });
  assert.equal(failure.exitCode, 8);
  assert.deepEqual(writes, [
    { destination: "stdout", chunk: "first\n" },
    { destination: "stderr", chunk: "batch: quota\n" },
  ]);

  pulled = 0;
  cleaned = false;
  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, ["batch"]),
      dependencies: undefined,
      write: ({ chunk }) => {
        if (chunk === "first\n") return Promise.reject(new Error("closed"));
        return undefined;
      },
    }),
  );
  assert.equal(pulled, 1);
  assert.equal(cleaned, true);

  let presenterPulled = 0;
  let presenterCleaned = false;
  const invalidPresenterCli = defineCli()({
    root: "invalidPresenter",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      invalidPresenter: {
        kind: "rootCommand",
        name: "invalid-presenter",
        description: "无效 presenter",
        input: emptyInput,

        outputs: (mode) => ({
          default: "text",
          modes: {
            structured: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  try {
                    presenterPulled += 1;
                    yield outcome.record.item({ value: "first" });
                    presenterPulled += 1;
                    yield outcome.record.item({ value: "never" });
                    return outcome.streamSuccess();
                  } finally {
                    presenterCleaned = true;
                  }
                },
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .stream({
                records: {
                  item: {
                    description: "项目",
                    schema: item,
                  },
                },
                failures: {},
                async *handler({ outcome }) {
                  try {
                    presenterPulled += 1;
                    yield outcome.record.item({ value: "first" });
                    presenterPulled += 1;
                    yield outcome.record.item({ value: "never" });
                    return outcome.streamSuccess();
                  } finally {
                    presenterCleaned = true;
                  }
                },
              })
              .text({
                description: "文本输出",
                records: {
                  item: () => text.lines(["不应", "作为 record"]) as never,
                },
                failures: {},
                terminal: () => text.silent,
              }),
          },
        }),
      },
    },
  });
  await assert.rejects(
    executeCli(invalidPresenterCli, {
      invocation: parseCliInvocation(invalidPresenterCli, []),
      dependencies: undefined,
      write: () => undefined,
    }),
    ContractExecutionError,
  );
  assert.equal(presenterPulled, 1);
  assert.equal(presenterCleaned, true);
});
