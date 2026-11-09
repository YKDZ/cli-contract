import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  ContractExecutionError,
  defineCli,
  executeCli,
  parseCliInvocation,
  type ContractSchema,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";
import { omitPayloadRootResourceId } from "./schema-test-helpers.ts";

const emptyInput = z.object({});
const unavailableData = z.object({ service: z.string() });

void test("具名应用失败写入 stderr 并返回显式失败状态", async () => {
  const cli = defineCli()({
    root: "check",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查服务",
        input: emptyInput,

        outputs: defineCli().outputModes("check", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  const structuredMode = cli.manifest.commands.check.outputs.modes.structured;
  assert.ok(structuredMode);
  assert.deepEqual(structuredMode.failures, {
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
  const structuredWire = cli.manifest.wire.structured;
  assert.ok(structuredWire);
  const wireFailure = structuredWire.failure?.unavailable;
  assert.ok(wireFailure);
  assert.deepEqual(omitPayloadRootResourceId(wireFailure), {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {
      schemaVersion: { const: "3" },
      command: { const: "check" },
      outputMode: { const: "structured" },
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
    required: [
      "schemaVersion",
      "command",
      "outputMode",
      "kind",
      "variant",
      "data",
    ],
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
        '{"schemaVersion":"3","command":"check","outputMode":"structured","kind":"failure","variant":"unavailable","data":{"service":"billing"}}\n',
    },
  ]);
  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "check",
    outputMode: "structured",
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
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查服务",
        input: emptyInput,

        outputs: defineCli().outputModes("check", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意注入错误类型，以验证结果边界。
                  service: 1 as unknown as string,
                }),
            }),
          },
        })),
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

void test("failure 输出模式的空 issues 仍产生 outputSchemaRejected", async () => {
  const rejectedFailureSchema: ContractSchema<Readonly<{ service: string }>> = {
    "~standard": {
      ...unavailableData["~standard"],
      validate() {
        const failureWithValue = {
          issues: [],
          value: { service: "ignored" },
        };
        return failureWithValue;
      },
    },
  };
  const cli = defineCli()({
    root: "check",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "检查服务",
        input: emptyInput,

        outputs: defineCli().outputModes("check", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {
                unavailable: {
                  description: "服务暂不可用",
                  schema: rejectedFailureSchema,
                  exitCode: 9,
                },
              },
              handler: ({ outcome }) =>
                outcome.failure.unavailable({ service: "billing" }),
            }),
          },
        })),
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
        help: englishHelpCapability(),

        usageFailureExitCode: 64,
        commands: {
          check: {
            kind: "rootCommand",
            name: "check",
            description: "检查服务",
            input: emptyInput,

            outputs: defineCli().outputModes("check", emptyInput, (mode) => ({
              default: "structured",
              modes: {
                structured: mode.atomic({
                  description: "结构化输出",
                  format: "structured",
                  success: { kind: "completion" },
                  failures: {
                    unavailable: {
                      description: "",
                      schema: unavailableData,
                      exitCode: 0,
                    },
                  },
                  handler: ({ outcome }) => outcome.completion(),
                }),
              },
            })),
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
