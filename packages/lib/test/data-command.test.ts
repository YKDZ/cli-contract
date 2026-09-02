import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
    invocation: parseCliInvocation(cli, []),
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
    /JSON object 必须是普通对象/,
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
    name: { type: "string", minLength: 1 },
  });
});

void test("定义期拒绝与 value option 不相容的 Input JSON Schema", () => {
  const driftingInputSchema: ContractSchema<RawGreetingInput, GreetingInput> = {
    "~standard": {
      ...greetingInputSchema["~standard"],
      jsonSchema: {
        ...greetingInputSchema["~standard"].jsonSchema,
        input: () => ({
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
    /必须接受 raw string/,
  );
});
