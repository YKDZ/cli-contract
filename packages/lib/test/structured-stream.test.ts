import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractExecutionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@cli-contract/lib";
import { z } from "zod";

const emptyInput = z.object({});
const item = z.object({ value: z.string() });

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
