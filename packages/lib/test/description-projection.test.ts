import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type JsonObject,
} from "@cli-contract/lib";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { z } from "zod";

const draft202012 = { target: "draft-2020-12" as const };

function readObjectProperty(schema: JsonObject, key: string): JsonObject {
  const properties = schema.properties;
  assert.ok(
    typeof properties === "object" &&
      properties !== null &&
      !Array.isArray(properties),
  );
  const property = (properties as JsonObject)[key];
  assert.ok(
    typeof property === "object" &&
      property !== null &&
      !Array.isArray(property),
  );
  return property as JsonObject;
}

void test("CLI 描述覆盖 Zod 的复制 schema、wire 与 help，且不进入运行时结果", async () => {
  const input = z.object({ name: z.string().describe("vendor field") });
  const payload = z.object({ value: z.string() }).describe("vendor payload");
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(payload), false);
  const inputExported = input["~standard"].jsonSchema.input(draft202012);
  const payloadExported = payload["~standard"].jsonSchema.output(draft202012);
  const inputBefore = structuredClone(inputExported);
  const payloadBefore = structuredClone(payloadExported);
  const cli = defineCli()({
    root: "describe",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      describe: {
        kind: "rootCommand",
        name: "describe",
        description: "CLI command",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "CLI field",
          },
        },
        input,
        success: {
          kind: "data",
          variants: {
            found: { description: "CLI data", schema: payload, exitCode: 0 },
          },
        },
        failures: {
          unavailable: {
            description: "CLI failure",
            schema: payload,
            exitCode: 9,
          },
        },
        handler: ({ outcome }) => outcome.data.found({ value: "Ada" }),
      },
    },
  });

  const command = cli.manifest.commands.describe;
  assert.equal(cli.grammar.root.description, "CLI command");
  assert.equal(command.description, "CLI command");
  assert.equal(
    readObjectProperty(command.input.inputSchema, "name").description,
    "CLI field",
  );
  assert.equal(
    readObjectProperty(command.input.outputSchema, "name").description,
    "CLI field",
  );
  assert.equal(command.success.kind, "data");
  if (command.success.kind !== "data") assert.fail("应为 data command");
  assert.equal(
    command.success.variants.found?.inputSchema.description,
    "CLI data",
  );
  assert.equal(
    command.success.variants.found?.outputSchema.description,
    "CLI data",
  );
  assert.equal(
    command.failures.unavailable?.inputSchema.description,
    "CLI failure",
  );
  assert.equal(
    command.failures.unavailable?.outputSchema.description,
    "CLI failure",
  );
  assert.equal(
    readObjectProperty(cli.manifest.wire.data?.found ?? {}, "data").description,
    "CLI data",
  );
  assert.equal(
    readObjectProperty(cli.manifest.wire.failure?.unavailable ?? {}, "data")
      .description,
    "CLI failure",
  );
  assert.ok(Object.isFrozen(command.input.inputSchema));
  assert.ok(Object.isFrozen(command.success.variants.found?.outputSchema));
  assert.ok(Object.isFrozen(cli.grammar));
  assert.ok(Object.isFrozen(cli.manifest));
  assert.ok(Object.isFrozen(cli.manifest.wire));
  assert.notEqual(command.input.inputSchema, inputExported);
  assert.notEqual(
    command.success.variants.found?.outputSchema,
    payloadExported,
  );
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(payload), false);
  assert.deepEqual(inputExported, inputBefore);
  assert.deepEqual(payloadExported, payloadBefore);

  const helpWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      helpWrites.push(chunk);
    },
  });
  assert.match(helpWrites[0] ?? "", /CLI command/);
  assert.match(helpWrites[0] ?? "", /CLI field/);

  const writes: string[] = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "Ada"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    '{"schemaVersion":"1","command":"describe","kind":"data","variant":"found","data":{"value":"Ada"}}\n',
  ]);
  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "describe",
    result: {
      kind: "data",
      command: "describe",
      variant: "found",
      data: { value: "Ada" },
    },
    exitCode: 0,
  });
});

void test("Valibot 的公开 schema 投影同样被复制并由字段描述覆盖", () => {
  const input = toStandardJsonSchema(v.object({ name: v.string() }));
  assert.equal(Object.isFrozen(input), false);
  const inputExported = input["~standard"].jsonSchema.input(draft202012);
  const inputBefore = structuredClone(inputExported);
  const cli = defineCli()({
    root: "valibot",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      valibot: {
        kind: "rootCommand",
        name: "valibot",
        description: "Valibot command",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "Valibot field",
          },
        },
        input,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.equal(
    readObjectProperty(cli.manifest.commands.valibot.input.inputSchema, "name")
      .description,
    "Valibot field",
  );
  assert.deepEqual(inputExported, inputBefore);
  assert.notEqual(
    cli.manifest.commands.valibot.input.inputSchema,
    inputExported,
  );
  assert.equal(Object.isFrozen(input), false);
});

void test("层级 stream runtime 不冻结 Valibot schema 引用", () => {
  const input = toStandardJsonSchema(v.object({}));
  const payload = toStandardJsonSchema(v.object({ value: v.string() }));
  const inputExported = input["~standard"].jsonSchema.input(draft202012);
  const payloadExported = payload["~standard"].jsonSchema.output(draft202012);
  const inputBefore = structuredClone(inputExported);
  const payloadBefore = structuredClone(payloadExported);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(payload), false);

  const define = defineCli();
  const cli = define({
    root: "workspace",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        description: "Workspace",
      },
      ...define.command("watch")({
        kind: "command",
        parent: "workspace",
        name: "watch",
        description: "Watch",
        input,
        success: {
          kind: "stream",
          records: { item: { description: "Item", schema: payload } },
        },
        failures: {},
        async *handler() {
          yield undefined;
          return undefined;
        },
      } as never),
    },
  } as never);

  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(payload), false);
  assert.ok(Object.isFrozen(cli.grammar));
  assert.ok(Object.isFrozen(cli.manifest));
  assert.ok(Object.isFrozen(cli.manifest.wire));
  assert.deepEqual(inputExported, inputBefore);
  assert.deepEqual(payloadExported, payloadBefore);
});

void test("动态非法描述按声明位置聚合为闭合定义问题", () => {
  const lineBreak: string = "bad\ntext";
  const nul: string = "bad\0text";
  const payload = z.object({ value: z.string() });

  assert.throws(
    () =>
      defineCli()({
        root: "invalid",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          invalid: {
            kind: "rootCommand",
            name: "invalid",
            description: lineBreak,
            fields: {
              name: {
                kind: "valueOption",
                longOption: "--name",
                description: lineBreak,
              },
            },
            input: z.object({ name: z.string() }),
            success: {
              kind: "data",
              variants: {
                value: { description: nul, schema: payload, exitCode: 0 },
              },
            },
            failures: {
              unavailable: {
                description: lineBreak,
                schema: payload,
                exitCode: 0,
              },
            },
            handler: ({ outcome }) => outcome.data.value({ value: "unused" }),
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidDescription",
          command: "invalid",
          location: "command",
          received: lineBreak,
        },
        {
          code: "invalidDescription",
          command: "invalid",
          location: "data",
          variant: "value",
          received: nul,
        },
        {
          code: "invalidVariantExitCode",
          command: "invalid",
          location: "failure",
          variant: "unavailable",
          received: 0,
          minimum: 1,
          maximum: 255,
        },
        {
          code: "invalidDescription",
          command: "invalid",
          location: "failure",
          variant: "unavailable",
          received: lineBreak,
        },
        {
          code: "invalidDescription",
          command: "invalid",
          location: "field",
          field: "name",
          received: lineBreak,
        },
      ]);
      return true;
    },
  );

  assert.throws(
    () =>
      defineCli()({
        root: "invalidStream",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          invalidStream: {
            kind: "rootCommand",
            name: "invalid-stream",
            description: "valid command",
            input: z.object({}),
            success: {
              kind: "stream",
              records: {
                item: { description: lineBreak, schema: payload },
              },
            },
            failures: {},
            async *handler({ outcome }) {
              yield outcome.record.item({ value: "unused" });
              return outcome.streamSuccess();
            },
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidDescription",
          command: "invalidStream",
          location: "record",
          variant: "item",
          received: lineBreak,
        },
      ]);
      return true;
    },
  );
});

void test("字段 description 在 schema 兼容性和 kind 早退前独立聚合", () => {
  const invalidDescription: string = "bad\ntext";
  const cases = [
    {
      name: "compatibility",
      field: {
        kind: "flag",
        longOption: "--enabled",
        description: invalidDescription,
      },
      input: z.object({ enabled: z.string() }),
      expected: {
        code: "schemaFieldDoesNotAcceptRawValue",
        command: "invalidField",
        location: "input",
        fields: [{ field: "enabled", expected: "boolean" }],
      },
    },
    {
      name: "kind",
      field: { kind: "forged", description: invalidDescription },
      input: z.object({ enabled: z.string() }),
      expected: {
        code: "invalidFieldKind",
        command: "invalidField",
        field: "enabled",
        expected: [
          "positional",
          "variadicPositional",
          "flag",
          "valueOption",
          "repeatableOption",
        ],
        received: "forged",
      },
    },
  ] as const;

  for (const candidate of cases) {
    assert.throws(
      () =>
        defineCli()({
          root: "invalidField",
          help: helpCapability(),
          output: outputCapability({ defaultFormat: "structured" }),
          usageFailureExitCode: 64,
          commands: {
            invalidField: {
              kind: "rootCommand",
              name: "invalid-field",
              description: "Invalid field",
              fields: { enabled: candidate.field },
              input: candidate.input,
              success: { kind: "completion" },
              failures: {},
              handler: () => undefined,
            },
          },
        } as never),
      (error) => {
        assert.ok(error instanceof ContractDefinitionError, candidate.name);
        assert.deepEqual(error.issues, [
          {
            code: "invalidDescription",
            command: "invalidField",
            location: "field",
            field: "enabled",
            received: invalidDescription,
          },
          candidate.expected,
        ]);
        return true;
      },
    );
  }
});

void test("stream record 描述覆盖 payload wire，且 frame 不重复描述", async () => {
  const payload = z.object({ value: z.string() }).describe("vendor record");
  const cli = defineCli()({
    root: "stream",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      stream: {
        kind: "rootCommand",
        name: "stream",
        description: "Stream command",
        input: z.object({}),
        success: {
          kind: "stream",
          records: {
            item: { description: "CLI record", schema: payload },
          },
        },
        failures: {},
        async *handler({ outcome }) {
          yield outcome.record.item({ value: "one" });
          return outcome.streamSuccess();
        },
      },
    },
  });
  const success = cli.manifest.commands.stream.success;
  assert.equal(success.kind, "stream");
  if (success.kind !== "stream") assert.fail("应为 stream command");
  assert.equal(success.records.item?.inputSchema.description, "CLI record");
  assert.equal(success.records.item?.outputSchema.description, "CLI record");
  assert.equal(
    readObjectProperty(cli.manifest.wire.stream?.records.item ?? {}, "data")
      .description,
    "CLI record",
  );

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    '{"schemaVersion":"1","command":"stream","kind":"stream"}\n',
    '{"kind":"record","variant":"item","data":{"value":"one"}}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
});
