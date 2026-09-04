import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractExecutionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  text,
} from "@cli-contract/lib";
import { z } from "zod";

const emptyInput = z.object({});
const item = z.object({ value: z.string() });

function createUncheckedStreamCli(handler: unknown) {
  return defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          records: { item: { description: "项目", schema: item } },
        },
        failures: {},
        handler: handler as never,
      },
    },
  });
}

void test("stream handler 在 header 前闭合验证 async iterator 协议", async () => {
  let synchronousGeneratorRan = false;
  function* synchronousGenerator() {
    synchronousGeneratorRan = true;
    yield undefined;
  }
  const invalidHandlers: readonly [string, unknown][] = [
    ["Promise", () => Promise.resolve(undefined)],
    ["同步 generator", synchronousGenerator],
    ["缺少 asyncIterator", () => ({ next() {}, return() {} })],
    ["缺少 next", () => ({ [Symbol.asyncIterator]() {}, return() {} })],
    ["缺少 return", () => ({ [Symbol.asyncIterator]() {}, next() {} })],
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

void test("structured stream 按 header、record、终态写出紧凑 NDJSON", async () => {
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          records: { item: { description: "一个项目", schema: item } },
        },
        failures: {},
        async *handler({ outcome }) {
          yield outcome.record.item({ value: "first" });
          yield outcome.record.item({ value: "second" });
          return outcome.streamSuccess();
        },
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
      chunk: '{"schemaVersion":"1","command":"list","kind":"stream"}\n',
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
    result: { kind: "streamSuccess", command: "list" },
    exitCode: 0,
  });
  assert.deepEqual(cli.manifest.commands.list.success, {
    kind: "stream",
    records: {
      item: {
        description: "一个项目",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
        outputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    },
  });
  assert.deepEqual(cli.manifest.wire.stream?.terminal, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: { kind: { const: "streamSuccess" } },
    required: ["kind"],
  });
  assert.deepEqual(Object.keys(cli.manifest.wire.stream ?? {}).sort(), [
    "header",
    "line",
    "records",
    "terminal",
  ]);
});

void test("stream 可在首帧后直接显式成功", async () => {
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          records: { item: { description: "项目", schema: item } },
        },
        failures: {},
        async *handler({ outcome }) {
          yield* [] as Iterable<never>;
          return outcome.streamSuccess();
        },
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
    '{"schemaVersion":"1","command":"list","kind":"stream"}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
});

void test("stream 失败保留 stdout 前缀且不写成功终态", async () => {
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          records: { item: { description: "项目", schema: item } },
        },
        failures: {
          stopped: { description: "中断", schema: item, exitCode: 8 },
        },
        async *handler({ outcome }) {
          yield outcome.record.item({ value: "first" });
          return outcome.failure.stopped({ value: "quota" });
        },
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
    '{"schemaVersion":"1","command":"list","kind":"failure","variant":"stopped","data":{"value":"quota"}}\n',
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

void test("record 验证拒绝与写入拒绝均停止拉取并清理 generator", async () => {
  let invalidCleanup = false;
  const invalidCli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          records: { item: { description: "项目", schema: item } },
        },
        failures: {},
        async *handler({ outcome }) {
          try {
            yield outcome.record.item({ value: 1 as unknown as string });
            yield outcome.record.item({ value: "never" });
            return outcome.streamSuccess();
          } finally {
            invalidCleanup = true;
          }
        },
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
    '{"schemaVersion":"1","command":"list","kind":"stream"}\n',
  ]);
  assert.equal(invalidCleanup, true);

  let pulled = 0;
  let cleanup = false;
  const gatedCli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          records: { item: { description: "项目", schema: item } },
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

void test("同一 stream handler 可投影为 structured NDJSON 或 text line、fragment 与 silent 终态", async () => {
  let executions = 0;
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured", text: true }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          text: () => text.silent,
          records: {
            item: {
              description: "项目",
              schema: item,
              text: (data: Readonly<{ readonly value: string }>) =>
                text.line(`项目 ${data.value}`),
            },
            delta: {
              description: "增量",
              schema: item,
              text: (data: Readonly<{ readonly value: string }>) =>
                text.fragment(data.value),
            },
          },
        },
        failures: {},
        async *handler({ outcome }) {
          executions += 1;
          yield outcome.record.item({ value: "one" });
          yield outcome.record.delta({ value: "two\nthree" });
          return outcome.streamSuccess();
        },
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
    invocation: parseCliInvocation(cli, ["--output-format", "text"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      textWrites.push(chunk);
    },
  });

  assert.equal(executions, 2);
  assert.deepEqual(structured, [
    '{"schemaVersion":"1","command":"list","kind":"stream"}\n',
    '{"kind":"record","variant":"item","data":{"value":"one"}}\n',
    '{"kind":"record","variant":"delta","data":{"value":"two\\nthree"}}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
  assert.deepEqual(textWrites, ["项目 one\n", "two\nthree"]);
  const manifestSuccess = cli.manifest.commands.list.success;
  assert.equal(manifestSuccess.kind, "stream");
  if (manifestSuccess.kind !== "stream") assert.fail("应为 stream manifest");
  assert.deepEqual(manifestSuccess.text, { recordFraming: "fragment" });
  assert.throws(() => text.fragment("a\0b"), TypeError);
});

void test("text stream success 以 text.lines 写出一个确定的终态 chunk", async () => {
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          text: () => text.lines(["完成", "", "没有更多项目"]),
          records: {
            item: {
              description: "项目",
              schema: item,
              text: (data: Readonly<{ readonly value: string }>) =>
                text.line(data.value),
            },
          },
        },
        failures: {},
        async *handler({ outcome }) {
          yield* [] as Iterable<never>;
          return outcome.streamSuccess();
        },
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
  assert.deepEqual(writes, ["完成\n\n没有更多项目\n"]);
});

void test("text stream failure 保留已写 record、稳定 identity 与 stderr，拒绝写入会停止拉取并清理", async () => {
  let pulled = 0;
  let cleaned = false;
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: emptyInput,
        success: {
          kind: "stream",
          text: () => text.silent,
          records: {
            item: {
              description: "项目",
              schema: item,
              text: (data: Readonly<{ readonly value: string }>) =>
                text.line(data.value),
            },
          },
        },
        failures: {
          stopped: {
            description: "中断",
            schema: item,
            exitCode: 8,
            text: (data: Readonly<{ readonly value: string }>) =>
              text.line(data.value),
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
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const failure = await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
      return undefined;
    },
  });
  assert.equal(failure.exitCode, 8);
  assert.deepEqual(writes, [
    { destination: "stdout", chunk: "first\n" },
    { destination: "stderr", chunk: "quota\n" },
  ]);

  pulled = 0;
  cleaned = false;
  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
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
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      invalidPresenter: {
        kind: "rootCommand",
        name: "invalid-presenter",
        description: "无效 presenter",
        input: emptyInput,
        success: {
          kind: "stream",
          text: () => text.silent,
          records: {
            item: {
              description: "项目",
              schema: item,
              text: () => text.lines(["不应", "作为 record"]) as never,
            },
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
