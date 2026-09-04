import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type ContractSchema,
} from "@cli-contract/lib";
import { z } from "zod";

type RawDefaultInput = Readonly<{ readonly name?: string }>;
type DefaultedInput = Readonly<{ readonly name: string }>;

function createDefaultingCli(
  input: ContractSchema<RawDefaultInput, DefaultedInput>,
  received: DefaultedInput[],
) {
  return defineCli()({
    root: "greet",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      greet: {
        kind: "rootCommand",
        name: "greet",
        description: "生成问候",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "问候对象",
          },
        },
        input,
        success: { kind: "completion" },
        failures: {},
        handler({ input, outcome }) {
          received.push(input);
          return outcome.completion();
        },
      },
    },
  });
}

void test("Zod 默认只由 validation 施加，并同源投影到 grammar、manifest 与 help", async () => {
  const vendorSchema = z.object({ name: z.string().default("Ada") });
  let validationCalls = 0;
  const input = {
    "~standard": {
      ...vendorSchema["~standard"],
      validate(value: unknown) {
        validationCalls += 1;
        return vendorSchema["~standard"].validate(value);
      },
    },
  } as ContractSchema<RawDefaultInput, DefaultedInput>;
  const received: DefaultedInput[] = [];
  const cli = createDefaultingCli(input, received);
  const invocation = parseCliInvocation(cli, []);

  assert.equal(invocation.kind, "parsed");
  assert.deepEqual(invocation.input, {});
  assert.deepEqual(cli.grammar.root.fields, [
    {
      kind: "valueOption",
      key: "name",
      longOption: "--name",
      description: "问候对象",
      required: false,
      default: "Ada",
    },
  ]);
  assert.deepEqual(cli.manifest.commands.greet.input, {
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { name: { default: "Ada", type: "string" } },
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { name: { default: "Ada", type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  });

  const helpWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      helpWrites.push(chunk);
    },
  });
  assert.equal(validationCalls, 0);
  assert.deepEqual(helpWrites, [
    'greet [--name <value>]\n生成问候\n[--name <value>] (default: "Ada")\t问候对象\n--help\n',
  ]);

  await executeCli(cli, {
    invocation,
    dependencies: undefined,
    write: () => undefined,
  });
  assert.equal(validationCalls, 1);
  assert.deepEqual(received, [{ name: "Ada" }]);
});

void test("输出保证存在而输入可缺席时，缺少 input default 注解在定义期拒绝", () => {
  const implicitDefault = z
    .object({ name: z.string().optional() })
    .transform(({ name }) => ({ name: name ?? "Ada" }))
    .pipe(z.object({ name: z.string() }));

  assert.throws(
    () =>
      createDefaultingCli(
        implicitDefault as unknown as ContractSchema<
          RawDefaultInput,
          DefaultedInput
        >,
        [],
      ),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingInputDefault",
          command: "greet",
          location: "input",
          field: "name",
        },
      ]);
      return true;
    },
  );
});

void test("默认检查拒绝畸形 output 投影和未映射的 output required 字段", () => {
  const vendorSchema = z.object({ name: z.string().default("Ada") });
  const standard = vendorSchema["~standard"];
  const invalidOutputSchemas = [
    {
      outputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: [],
        required: ["name"],
      },
      issue: {
        code: "invalidOutputSchemaShape",
        command: "greet",
        location: "input",
        aspect: "properties",
      },
    },
    {
      outputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { name: { default: "Ada", type: "string" } },
        required: [0],
      },
      issue: {
        code: "invalidOutputSchemaShape",
        command: "greet",
        location: "input",
        aspect: "required",
      },
    },
    {
      outputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          name: { default: "Ada", type: "string" },
          greeting: { type: "string" },
        },
        required: ["greeting"],
      },
      issue: {
        code: "outputRequiredFieldMissingFromInput",
        command: "greet",
        location: "input",
        field: "greeting",
      },
    },
  ] as const;

  for (const { outputSchema, issue } of invalidOutputSchemas) {
    const input = {
      "~standard": {
        ...standard,
        jsonSchema: {
          ...standard.jsonSchema,
          output: () => outputSchema,
        },
      },
    } as ContractSchema<RawDefaultInput, DefaultedInput>;
    assert.throws(
      () => createDefaultingCli(input, []),
      (error) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [issue]);
        return true;
      },
    );
  }
});
