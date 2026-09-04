import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  ContractExecutionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const unavailableData = z.object({ service: z.string() });

void test("具名应用失败写入 stderr 并返回显式失败状态", async () => {
  const cli = defineCli()({
    root: "check",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查服务",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {
          unavailable: {
            description: "服务暂不可用",
            schema: unavailableData,
            exitCode: 9,
          },
        },
        handler: ({ outcome }) =>
          outcome.failure.unavailable({ service: "billing" }),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  assert.deepEqual(cli.manifest.commands.check.failures, {
    unavailable: {
      description: "服务暂不可用",
      exitCode: 9,
      inputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        description: "服务暂不可用",
        type: "object",
        properties: { service: { type: "string" } },
        required: ["service"],
      },
      outputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        description: "服务暂不可用",
        type: "object",
        properties: { service: { type: "string" } },
        required: ["service"],
        additionalProperties: false,
      },
    },
  });
  assert.deepEqual(cli.manifest.wire.failure?.unavailable, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {
      schemaVersion: { const: "1" },
      command: { const: "check" },
      kind: { const: "failure" },
      variant: { const: "unavailable" },
      data: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        description: "服务暂不可用",
        type: "object",
        properties: { service: { type: "string" } },
        required: ["service"],
        additionalProperties: false,
      },
    },
    required: ["schemaVersion", "command", "kind", "variant", "data"],
    type: "object",
  });

  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
    },
  });

  assert.deepEqual(writes, [
    {
      destination: "stderr",
      chunk:
        '{"schemaVersion":"1","command":"check","kind":"failure","variant":"unavailable","data":{"service":"billing"}}\n',
    },
  ]);
  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "check",
    result: {
      kind: "failure",
      command: "check",
      variant: "unavailable",
      data: { service: "billing" },
    },
    exitCode: 9,
  });
});

void test("非法失败 payload 在任何写出前被拒绝", async () => {
  const cli = defineCli()({
    root: "check",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查服务",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {
          unavailable: {
            description: "服务暂不可用",
            schema: unavailableData,
            exitCode: 9,
          },
        },
        handler: ({ outcome }) =>
          outcome.failure.unavailable({
            service: 1 as unknown as string,
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
          command: "check",
          location: "failure",
          variant: "unavailable",
          expected: "schemaAccepted",
          received: "schemaRejected",
        },
      ]);
      return true;
    },
  );
  assert.deepEqual(writes, []);
});

void test("定义期聚合失败变体的无效描述与退出码", () => {
  assert.throws(
    () =>
      defineCli()({
        root: "check",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          check: {
            kind: "rootCommand",
            name: "check",
            description: "检查服务",
            input: emptyInput,
            success: { kind: "completion" },
            failures: {
              unavailable: {
                description: "",
                schema: unavailableData,
                exitCode: 0,
              },
            },
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidVariantExitCode",
          command: "check",
          location: "failure",
          variant: "unavailable",
          received: 0,
          minimum: 1,
          maximum: 255,
        },
        {
          code: "invalidDescription",
          command: "check",
          location: "failure",
          variant: "unavailable",
          received: "",
        },
      ]);
      return true;
    },
  );
});
