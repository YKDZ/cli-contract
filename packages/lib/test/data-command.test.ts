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
  type ContractSchema,
} from "@cli-contract/lib";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { z } from "zod";

type RawGreetingInput = Readonly<{ readonly name: string }>;
type GreetingInput = Readonly<{ readonly name: string }>;
type GreetingData = Readonly<{ readonly message: string }>;

const greetingInputSchema = z
  .object({ name: z.string({ error: "name 不能为空" }).min(1) })
  .transform(({ name }) => ({ name: name.toUpperCase() }))
  .pipe(z.object({ name: z.string() }));

const greetingDataInputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  description: "生成的问候",
  properties: { message: { type: "string" } },
  required: ["message"],
  type: "object",
} as const;

const greetingDataOutputJsonSchema = {
  ...greetingDataInputJsonSchema,
  additionalProperties: false,
} as const;

const greetingDataSchema = z.object({ message: z.string() });

function createDataCli(
  onInput: (input: GreetingInput) => void,
  dataSchema: ContractSchema<GreetingData> = greetingDataSchema,
  inputSchema: ContractSchema<
    RawGreetingInput,
    GreetingInput
  > = greetingInputSchema,
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
        input: inputSchema,
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "生成的问候",
              schema: dataSchema,
              exitCode: 7,
            },
          },
        },
        failures: {},
        handler({ input, dependencies, outcome }) {
          onInput(input);
          assert.equal(dependencies, undefined);
          return outcome.data.greeting({ message: `Hello, ${input.name}!` });
        },
      },
    },
  });
}

void test("value option 经模式变换后产生具名 data 结果", async () => {
  const inputs: GreetingInput[] = [];
  const cli = createDataCli((input) => inputs.push(input));
  const invocation = parseCliInvocation(cli, ["--name", "Ada"]);
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  assert.deepEqual(cli.grammar.root, {
    kind: "rootCommand",
    id: "greet",
    name: "greet",
    description: "生成问候",
    fields: [
      {
        kind: "valueOption",
        key: "name",
        longOption: "--name",
        description: "问候对象",
        required: true,
      },
    ],
    usage: { command: "greet", synopsis: "greet --name <value>" },
  });
  assert.deepEqual(cli.manifest.commands.greet.success, {
    kind: "data",
    variants: {
      greeting: {
        description: "生成的问候",
        exitCode: 7,
        inputSchema: greetingDataInputJsonSchema,
        outputSchema: greetingDataOutputJsonSchema,
      },
    },
  });
  assert.deepEqual(cli.manifest.wire.data?.greeting, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {
      schemaVersion: { const: "1" },
      command: { const: "greet" },
      kind: { const: "data" },
      variant: { const: "greeting" },
      data: greetingDataOutputJsonSchema,
    },
    required: ["schemaVersion", "command", "kind", "variant", "data"],
    type: "object",
  });

  assert.deepEqual(invocation, {
    kind: "parsed",
    command: "greet",
    input: { name: "Ada" },
    outputFormat: "structured",
  });

  const termination = await executeCli(cli, {
    invocation,
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
    },
  });

  assert.deepEqual(inputs, [{ name: "ADA" }]);
  assert.deepEqual(writes, [
    {
      destination: "stdout",
      chunk:
        '{"schemaVersion":"1","command":"greet","kind":"data","variant":"greeting","data":{"message":"Hello, ADA!"}}\n',
    },
  ]);
  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "greet",
    result: {
      kind: "data",
      command: "greet",
      variant: "greeting",
      data: { message: "Hello, ADA!" },
    },
    exitCode: 7,
  });
});

void test("输入模式正常拒绝产生 inputRejected 且不执行 handler", async () => {
  let runCount = 0;
  const cli = createDataCli(() => {
    runCount += 1;
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name="]),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
    },
  });

  assert.equal(runCount, 0);
  assert.deepEqual(writes, [
    { destination: "stderr", chunk: "greet --name <value>\n" },
  ]);
  assert.deepEqual(termination, {
    kind: "usageFailure",
    command: "greet",
    issues: [
      {
        code: "inputRejected",
        evidence: [{ message: "name 不能为空", path: ["name"] }],
      },
    ],
    exitCode: 64,
  });
});

void test("输出模式产生非 JSON 值时拒绝且不写出字节", async () => {
  const invalidOutputSchema: ContractSchema<GreetingData> = {
    "~standard": {
      ...greetingDataSchema["~standard"],
      validate() {
        return { value: new Date() as unknown as GreetingData };
      },
    },
  };
  const cli = createDataCli(() => undefined, invalidOutputSchema);
  const writes: string[] = [];

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--name=Ada"]),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    }),
    (error) => {
      assert.ok(error instanceof ContractExecutionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidJsonValue",
          command: "greet",
          location: "data",
          variant: "greeting",
          expected: "jsonValue",
          received: "nonJsonValue",
        },
      ]);
      return true;
    },
  );
  assert.deepEqual(writes, []);
});

void test("Valibot combined schema 可沿同一接缝定义并执行", async () => {
  const valibotInputSchema = toStandardJsonSchema(
    v.object({ name: v.pipe(v.string(), v.nonEmpty()) }),
  );
  const inputs: GreetingInput[] = [];
  const cli = createDataCli(
    (input) => inputs.push(input),
    greetingDataSchema,
    valibotInputSchema,
  );

  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "Grace"]),
    dependencies: undefined,
    write: () => undefined,
  });

  assert.deepEqual(inputs, [{ name: "Grace" }]);
  assert.deepEqual(cli.manifest.commands.greet.input.inputSchema.properties, {
    name: { description: "问候对象", type: "string", minLength: 1 },
  });
});

void test("定义期拒绝与 value option 不相容的 Input JSON Schema", () => {
  const driftingInputSchema: ContractSchema<RawGreetingInput, GreetingInput> = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      jsonSchema: {
        ...greetingInputSchema["~standard"].jsonSchema,
        input: () => ({
          $schema: "https://json-schema.org/draft/2020-12/schema",
          properties: { name: { type: "number" } },
          required: ["name"],
          type: "object",
        }),
      },
    },
  };

  assert.throws(
    () =>
      createDataCli(() => undefined, greetingDataSchema, driftingInputSchema),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "schemaFieldDoesNotAcceptRawValue",
          command: "greet",
          location: "input",
          fields: [{ field: "name", expected: "string" }],
        },
      ]);
      return true;
    },
  );
});

void test("定义期以闭合问题拒绝缺少标准 JSON Schema 能力的模式", () => {
  const missingJsonSchema = {
    "~standard": {
      validate: greetingInputSchema["~standard"].validate,
      vendor: "fixture",
      version: 1,
    },
  } as unknown as ContractSchema<RawGreetingInput, GreetingInput>;

  assert.throws(
    () => createDataCli(() => undefined, greetingDataSchema, missingJsonSchema),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingSchemaCapability",
          command: "greet",
          location: "input",
          capability: "jsonSchema",
        },
      ]);
      return true;
    },
  );
});

void test("执行期拒绝 Standard Schema 返回的异步 validation", async () => {
  const asynchronousSchema = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      validate() {
        return Promise.resolve({ value: { name: "Ada" } });
      },
    },
  } as unknown as ContractSchema<RawGreetingInput, GreetingInput>;

  const cli = createDataCli(
    () => undefined,
    greetingDataSchema,
    asynchronousSchema,
  );
  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--name", "Ada"]),
      dependencies: undefined,
      write: () => undefined,
    }),
    (error) => {
      assert.ok(error instanceof ContractExecutionError);
      assert.deepEqual(error.issues, [
        {
          code: "asynchronousSchemaValidation",
          command: "greet",
          location: "input",
          expected: "synchronousStandardResult",
          received: "promise",
        },
      ]);
      return true;
    },
  );
});

void test("定义期拒绝没有忠实返回 Draft 2020-12 方言的投影", () => {
  const wrongDialectSchema: ContractSchema<RawGreetingInput, GreetingInput> = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      jsonSchema: {
        ...greetingInputSchema["~standard"].jsonSchema,
        input: () => ({
          $schema: "http://json-schema.org/draft-07/schema#",
          properties: { name: { type: "string" } },
          required: ["name"],
          type: "object",
        }),
      },
    },
  };

  assert.throws(
    () =>
      createDataCli(() => undefined, greetingDataSchema, wrongDialectSchema),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "schemaDialectMismatch",
          command: "greet",
          location: "input",
          projection: "input",
          received: "http://json-schema.org/draft-07/schema#",
        },
      ]);
      return true;
    },
  );
});

void test("定义期把无法导出的模式归入闭合问题而不泄漏 vendor 错误", () => {
  const exportFailureSchema: ContractSchema<RawGreetingInput, GreetingInput> = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      jsonSchema: {
        ...greetingInputSchema["~standard"].jsonSchema,
        output() {
          throw new Error("vendor-private export detail");
        },
      },
    },
  };

  assert.throws(
    () =>
      createDataCli(() => undefined, greetingDataSchema, exportFailureSchema),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "schemaExportFailed",
          command: "greet",
          location: "input",
          projection: "output",
        },
      ]);
      assert.doesNotMatch(error.message, /vendor-private/);
      return true;
    },
  );
});

void test("定义期拒绝不能忠实形成 JSON 值的 schema 投影", () => {
  const invalidProjectionSchema = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      jsonSchema: {
        ...greetingInputSchema["~standard"].jsonSchema,
        output: () => new Date(),
      },
    },
  } as unknown as ContractSchema<RawGreetingInput, GreetingInput>;

  assert.throws(
    () =>
      createDataCli(
        () => undefined,
        greetingDataSchema,
        invalidProjectionSchema,
      ),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidSchemaProjection",
          command: "greet",
          location: "input",
          projection: "output",
        },
      ]);
      return true;
    },
  );
});

void test("defineCli 一次报告输入与 data 模式的全部定义问题", () => {
  const missingInputCapability = {
    "~standard": {
      validate: greetingInputSchema["~standard"].validate,
      vendor: "fixture",
      version: 1,
    },
  } as unknown as ContractSchema<RawGreetingInput, GreetingInput>;
  const wrongDataDialect: ContractSchema<GreetingData> = {
    "~standard": {
      ...greetingDataSchema["~standard"],
      jsonSchema: {
        ...greetingDataSchema["~standard"].jsonSchema,
        output: () => ({
          $schema: "http://json-schema.org/draft-07/schema#",
          properties: { message: { type: "string" } },
          required: ["message"],
          type: "object",
        }),
      },
    },
  };

  assert.throws(
    () =>
      createDataCli(() => undefined, wrongDataDialect, missingInputCapability),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingSchemaCapability",
          command: "greet",
          location: "input",
          capability: "jsonSchema",
        },
        {
          code: "schemaDialectMismatch",
          command: "greet",
          location: "data",
          variant: "greeting",
          projection: "output",
          received: "http://json-schema.org/draft-07/schema#",
        },
      ]);
      return true;
    },
  );
});

void test("定义期拒绝没有声明 object 根类型的输入投影", () => {
  const scalarRootSchema: ContractSchema<RawGreetingInput, GreetingInput> = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      jsonSchema: {
        ...greetingInputSchema["~standard"].jsonSchema,
        input: () => ({
          $schema: "https://json-schema.org/draft/2020-12/schema",
          properties: { name: { type: "string" } },
          required: ["name"],
          type: "string",
        }),
      },
    },
  };

  assert.throws(
    () => createDataCli(() => undefined, greetingDataSchema, scalarRootSchema),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidInputSchemaShape",
          command: "greet",
          location: "input",
          aspect: "type",
        },
      ]);
      return true;
    },
  );
});

void test("执行期拒绝非法 Standard Result 且不调用 handler", async () => {
  let runCount = 0;
  const invalidResultSchema = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      validate: () => ({}),
    },
  } as unknown as ContractSchema<RawGreetingInput, GreetingInput>;
  const cli = createDataCli(
    () => {
      runCount += 1;
    },
    greetingDataSchema,
    invalidResultSchema,
  );

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--name", "Ada"]),
      dependencies: undefined,
      write: () => undefined,
    }),
    (error) => {
      assert.ok(error instanceof ContractExecutionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidStandardResult",
          command: "greet",
          location: "input",
          expected: "standardResult",
          received: "object",
        },
      ]);
      return true;
    },
  );
  assert.equal(runCount, 0);
});
