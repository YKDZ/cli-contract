import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  type CliContract,
  type ContractSchema,
  type JsonObject,
  type OutputExecutionFactory,
  type UsageConstraint,
} from "@boringparts/cli-contract";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";

import { englishHelpCapability, englishHelpWording } from "./english-help.ts";

function createConstrainedCli(handler = () => undefined) {
  const sharedInput0 = z.object({
    auth: z.string().optional(),
    token: z.string().optional(),
    output: z.string().optional(),
    quiet: z.boolean().optional(),
    format: z.string().optional(),
  });
  return defineCli()({
    root: "publish",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      publish: {
        kind: "rootCommand",
        name: "publish",
        description: "发布制品",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "认证方式",
          },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "认证令牌",
          },
          output: {
            kind: "valueOption",
            longOption: "--output-file",
            description: "输出文件",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            description: "静默输出",
          },
          format: {
            kind: "valueOption",
            longOption: "--format",
            description: "制品格式",
          },
        },
        usageConstraints: [
          { kind: "count", fields: ["output", "quiet"], max: 1 },
          {
            kind: "when",
            all: [{ kind: "present", field: "auth" }],
            onMatch: { require: ["token"], forbid: ["output", "quiet"] },
          },
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "format", value: "json" },
              { kind: "equals", field: "quiet", value: true },
            ],
          },
        ],
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
                handler: ({ outcome }) => {
                  handler();
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

function countCliDefinition<
  const Constraints extends readonly UsageConstraint[],
>(usageConstraints: Constraints, handler = () => undefined) {
  const sharedInput1 = z.object({
    auth: z.string().optional().default("匿名"),
    quiet: z.boolean().optional(),
    labels: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
  });
  return {
    root: "countInputs",
    help: englishHelpCapability({
      wording: {
        default: "{usage}（默认值 {value}）",
        countExactly: "{fields} 恰好出现 {count} 项",
        countAtLeast: "{fields} 至少出现 {min} 项",
        countAtMost: "{fields} 至多出现 {max} 项",
        countBetween: "{fields} 出现 {min} 到 {max} 项",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      countInputs: {
        kind: "rootCommand",
        name: "count-inputs",
        description: "数量输入",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "认证方式",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            negatedLongOption: "--no-quiet",
            description: "静默输出",
          },
          labels: {
            kind: "repeatableOption",
            longOption: "--label",
            description: "标签",
          },
          paths: {
            kind: "variadicPositional",
            description: "路径",
          },
        },
        usageConstraints,
        input: sharedInput1,

        outputs: (
          mode: OutputExecutionFactory<
            "countInputs",
            undefined,
            typeof sharedInput1
          >,
        ) => ({
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: () => {
                  handler();
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The case only verifies the parser failure path; the success handler never runs.
                  return undefined as never;
                },
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  } as const;
}

function createCountCli(handler = () => undefined) {
  return defineCli()(
    countCliDefinition(
      [
        {
          kind: "count",
          fields: ["auth", "quiet", "labels", "paths"],
          min: 2,
          max: 2,
        },
      ],
      handler,
    ),
  );
}

function createRequiredCountCli() {
  const sharedInput2 = z.object({
    target: z.string(),
    quiet: z.boolean().optional(),
  });
  return defineCli()({
    root: "requiredCount",
    help: englishHelpCapability({
      wording: { countExactly: "{fields} 恰好出现 {count} 项" },
    }),

    usageFailureExitCode: 64,
    commands: {
      requiredCount: {
        kind: "rootCommand",
        name: "required-count",
        description: "必填数量输入",
        fields: {
          target: {
            kind: "positional",
            description: "目标",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            description: "静默",
          },
        },
        usageConstraints: [
          { kind: "count", fields: ["target", "quiet"], min: 2, max: 2 },
        ],
        input: sharedInput2,

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
}

function createProjectedSchemaCountCli(input: ContractSchema) {
  return defineCli()({
    root: "countProjection",
    help: englishHelpCapability({
      wording: { countExactly: "{fields} 恰好出现 {count} 项" },
    }),

    usageFailureExitCode: 64,
    commands: {
      countProjection: {
        kind: "rootCommand",
        name: "count-projection",
        description: "数量模式投影",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "认证方式",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            negatedLongOption: "--no-quiet",
            description: "静默输出",
          },
        },
        usageConstraints: [
          { kind: "count", fields: ["auth", "quiet"], min: 1, max: 1 },
        ],
        input,

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
}

function createReferencedCountInputSchema(
  fields: readonly Readonly<{
    readonly name: string;
    readonly type: "boolean" | "string";
  }>[],
  id: string,
  includeCountDefinitionCollision = false,
): JsonObject {
  const referencedProperties = Object.fromEntries(
    fields.map(({ name, type }) => [name, { $ref: `#/$defs/${type}` }]),
  );
  const directProperties = Object.fromEntries(
    fields.map(({ name, type }) => [name, { type }]),
  );
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://example.test/${id}.schema.json`,
    $defs: {
      boolean: { type: "boolean" },
      string: { type: "string" },
      fields: {
        type: "object",
        properties: referencedProperties,
        additionalProperties: false,
      },
      ...(includeCountDefinitionCollision
        ? { __cliContract_count_0_state_0_0: false }
        : {}),
    },
    $ref: "#/$defs/fields",
    type: "object",
    properties: directProperties,
    additionalProperties: false,
  };
}

function createJsonSchemaContract(inputSchema: JsonObject): ContractSchema {
  return {
    "~standard": {
      version: 1,
      vendor: "count-schema-test",
      validate: (value) => ({ value }),
      jsonSchema: {
        input: () => inputSchema,
        output: () => inputSchema,
      },
    },
  };
}

function getObjectMember(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Reflect.get(value, key)
    : undefined;
}

function valueOptionField<const Name extends string>(
  name: Name,
): Readonly<{
  readonly kind: "valueOption";
  readonly longOption: `--${Name}`;
  readonly description: Name;
}> {
  return { kind: "valueOption", longOption: `--${name}`, description: name };
}

void test("count tallies raw own fields; false and repeated values count once and defaults do not fill in", async () => {
  let executions = 0;
  const cli = createCountCli(() => {
    executions += 1;
  });
  const expectedConstraint = {
    kind: "count",
    fields: ["auth", "quiet", "labels", "paths"],
    min: 2,
    max: 2,
  } as const;
  assert.deepEqual(cli.grammar.root.usageConstraints, [expectedConstraint]);
  assert.strictEqual(
    cli.grammar.root.usageConstraints,
    cli.manifest.commands.countInputs.usageConstraints,
  );

  const validInvocation = parseCliInvocation(cli, [
    "--no-quiet",
    "--label",
    "first",
    "--label",
    "second",
  ]);
  assert.equal(validInvocation.kind, "parsed", JSON.stringify(validInvocation));
  if (validInvocation.kind !== "parsed") return;
  assert.deepEqual(validInvocation.input, {
    quiet: false,
    labels: ["first", "second"],
  });
  assert.equal(executions, 0);

  const variadicInvocation = parseCliInvocation(cli, [
    "--no-quiet",
    "first",
    "second",
  ]);
  assert.equal(
    variadicInvocation.kind,
    "parsed",
    JSON.stringify(variadicInvocation),
  );
  if (variadicInvocation.kind !== "parsed") return;
  assert.deepEqual(variadicInvocation.input, {
    quiet: false,
    paths: ["first", "second"],
  });
  assert.equal(executions, 0);

  const invalidInvocation = parseCliInvocation(cli, ["--no-quiet"]);
  assert.deepEqual(invalidInvocation, {
    kind: "usageFailure",
    command: "countInputs",
    issues: [
      {
        code: "countConstraintViolation",
        min: 2,
        max: 2,
        presentFields: ["quiet"],
        absentFields: ["auth", "labels", "paths"],
      },
    ],
    usage: {
      command: "countInputs",
      synopsis:
        "count-inputs [--output <mode>] [--auth <auth>] [--quiet|--no-quiet] [--label <labels>]... [<paths...>]",
    },
  });
  const validateUsageWire = new Ajv2020({ strict: false }).compile(
    cli.manifest.usageFailure.wire,
  );
  const countFailureIssue = {
    code: "countConstraintViolation",
    min: 2,
    max: 2,
    presentFields: ["quiet"],
    absentFields: ["auth", "labels", "paths"],
  };
  const usageFailureWire = {
    schemaVersion: "3",
    command: "countInputs",
    kind: "usageFailure",
    issues: [countFailureIssue],
    usage:
      "count-inputs [--output <mode>] [--auth <auth>] [--quiet|--no-quiet] [--label <labels>]... [<paths...>]",
    helpArgv: ["count-inputs", "--help"],
  };
  assert.equal(validateUsageWire(usageFailureWire), true);
  assert.equal(
    validateUsageWire({
      ...usageFailureWire,
      issues: [{ ...countFailureIssue, presentFields: [], absentFields: [] }],
    }),
    false,
  );
  const termination = await executeCli(cli, {
    invocation: invalidInvocation,
    dependencies: undefined,
    write: () => undefined,
  });
  assert.equal(termination.kind, "usageFailure");
  assert.equal(executions, 0);

  const upperBoundCli = defineCli()(
    countCliDefinition([
      {
        kind: "count",
        fields: ["auth", "quiet", "labels", "paths"],
        max: 1,
      },
    ]),
  );
  const overLimitInvocation = parseCliInvocation(upperBoundCli, [
    "--auth",
    "basic",
    "--no-quiet",
  ]);
  assert.deepEqual(overLimitInvocation, {
    kind: "usageFailure",
    command: "countInputs",
    issues: [
      {
        code: "countConstraintViolation",
        min: 0,
        max: 1,
        presentFields: ["auth", "quiet"],
        absentFields: ["labels", "paths"],
      },
    ],
    usage: {
      command: "countInputs",
      synopsis:
        "count-inputs [--output <mode>] [--auth <auth>] [--quiet|--no-quiet] [--label <labels>]... [<paths...>]",
    },
  });
});

void test("the Draft 2020-12 count projection and the parser agree on valid raw input", () => {
  const cli = createCountCli();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validator = ajv.compile(
    cli.manifest.commands.countInputs.input.inputSchema,
  );
  const cases = [
    {
      argv: ["--no-quiet", "--label", "first", "--label", "second"],
      input: { quiet: false, labels: ["first", "second"] },
      accepted: true,
    },
    {
      argv: ["--no-quiet", "first", "second"],
      input: { quiet: false, paths: ["first", "second"] },
      accepted: true,
    },
    {
      argv: ["--auth", "secret"],
      input: { auth: "secret" },
      accepted: false,
    },
    {
      argv: ["--auth", "secret", "--no-quiet", "--label", "first"],
      input: { auth: "secret", quiet: false, labels: ["first"] },
      accepted: false,
    },
  ] as const;

  for (const { argv, input, accepted } of cases) {
    const invocation = parseCliInvocation(cli, argv);
    assert.equal(
      invocation.kind === "parsed",
      accepted,
      JSON.stringify(invocation),
    );
    assert.equal(validator(input), accepted, ajv.errorsText(validator.errors));
  }
});

void test("the count projection keeps schema references and avoids definition name collisions", () => {
  const inputSchema = createReferencedCountInputSchema(
    [
      { name: "auth", type: "string" },
      { name: "quiet", type: "boolean" },
    ],
    "count-reference-collision",
    true,
  );
  const cli = createProjectedSchemaCountCli(
    createJsonSchemaContract(inputSchema),
  );
  const projected = cli.manifest.commands.countProjection.input.inputSchema;
  assert.equal(projected.$id, inputSchema.$id);
  assert.equal(projected.$ref, inputSchema.$ref);
  assert.deepEqual(
    getObjectMember(projected.$defs, "fields"),
    getObjectMember(inputSchema.$defs, "fields"),
  );
  assert.equal(
    getObjectMember(projected.$defs, "__cliContract_count_0_state_0_0"),
    false,
  );

  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(
    projected,
  );
  for (const { input, accepted } of [
    { input: { auth: "secret" }, accepted: true },
    { input: { quiet: false }, accepted: true },
    { input: { auth: "secret", quiet: false }, accepted: false },
    { input: {}, accepted: false },
  ] as const) {
    assert.equal(validator(input), accepted);
  }
});

void test("the count projection schema stays usable in size for wider field groups", () => {
  const fields = [
    "field0",
    "field1",
    "field2",
    "field3",
    "field4",
    "field5",
    "field6",
    "field7",
    "field8",
    "field9",
    "field10",
    "field11",
    "field12",
    "field13",
    "field14",
    "field15",
  ] as const;
  const fieldDefinitions = {
    field0: valueOptionField("field0"),
    field1: valueOptionField("field1"),
    field2: valueOptionField("field2"),
    field3: valueOptionField("field3"),
    field4: valueOptionField("field4"),
    field5: valueOptionField("field5"),
    field6: valueOptionField("field6"),
    field7: valueOptionField("field7"),
    field8: valueOptionField("field8"),
    field9: valueOptionField("field9"),
    field10: valueOptionField("field10"),
    field11: valueOptionField("field11"),
    field12: valueOptionField("field12"),
    field13: valueOptionField("field13"),
    field14: valueOptionField("field14"),
    field15: valueOptionField("field15"),
  } as const;
  const inputSchema = createReferencedCountInputSchema(
    fields.map((name) => ({ name, type: "string" as const })),
    "count-projection-volume",
  );
  const input = createJsonSchemaContract(inputSchema);
  const cli = defineCli()({
    root: "countVolume",
    help: englishHelpCapability({
      wording: { countExactly: "{fields} 恰好出现 {count} 项" },
    }),

    usageFailureExitCode: 64,
    commands: {
      countVolume: {
        kind: "rootCommand",
        name: "count-volume",
        description: "数量模式体积",
        fields: fieldDefinitions,
        usageConstraints: [{ kind: "count", fields, min: 1, max: 1 }],
        input,

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
  const size = Buffer.byteLength(
    JSON.stringify(cli.manifest.commands.countVolume.input.inputSchema),
  );
  assert.ok(size < 100_000, `count projection is ${size} bytes`);
});

void test("count fills default endpoints and picks help templates in a fixed order", async () => {
  const minOnly = defineCli()(
    countCliDefinition([{ kind: "count", fields: ["auth", "quiet"], min: 1 }]),
  );
  const maxOnly = defineCli()(
    countCliDefinition([{ kind: "count", fields: ["auth", "quiet"], max: 1 }]),
  );
  const singleField = defineCli()(
    countCliDefinition([{ kind: "count", fields: ["auth"], min: 1 }]),
  );
  const redundantRange = defineCli()(
    countCliDefinition([
      { kind: "count", fields: ["auth", "quiet"], min: 0, max: 2 },
    ]),
  );
  const exactly = defineCli()(
    countCliDefinition([
      { kind: "count", fields: ["auth", "quiet"], min: 1, max: 1 },
    ]),
  );
  const between = defineCli()(
    countCliDefinition([
      {
        kind: "count",
        fields: ["auth", "quiet", "labels", "paths"],
        min: 1,
        max: 2,
      },
    ]),
  );
  assert.deepEqual(minOnly.grammar.root.usageConstraints, [
    { kind: "count", fields: ["auth", "quiet"], min: 1, max: 2 },
  ]);
  assert.deepEqual(maxOnly.grammar.root.usageConstraints, [
    { kind: "count", fields: ["auth", "quiet"], min: 0, max: 1 },
  ]);
  assert.deepEqual(singleField.grammar.root.usageConstraints, [
    { kind: "count", fields: ["auth"], min: 1, max: 1 },
  ]);
  assert.deepEqual(redundantRange.grammar.root.usageConstraints, [
    { kind: "count", fields: ["auth", "quiet"], min: 0, max: 2 },
  ]);

  const renderHelp = async (cli: CliContract<string, undefined>) => {
    const writes: string[] = [];
    await executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--help"]),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    });
    return writes.join("");
  };
  assert.match(await renderHelp(exactly), /--auth, --quiet 恰好出现 1 项/);
  assert.match(await renderHelp(singleField), /--auth 恰好出现 1 项/);
  assert.match(await renderHelp(minOnly), /--auth, --quiet 至少出现 1 项/);
  assert.match(await renderHelp(maxOnly), /--auth, --quiet 至多出现 1 项/);
  assert.match(
    await renderHelp(redundantRange),
    /--auth, --quiet 至少出现 0 项/,
  );
  assert.match(
    await renderHelp(between),
    /--auth, --quiet, --label, <paths\.\.\.> 出现 1 到 2 项/,
  );
});

void test("count does not pre-count declared-required but absent fields as present", () => {
  const invocation = parseCliInvocation(createRequiredCountCli(), ["--quiet"]);
  assert.deepEqual(invocation, {
    kind: "usageFailure",
    command: "requiredCount",
    issues: [
      { code: "missingRequiredField", field: "target" },
      {
        code: "countConstraintViolation",
        min: 2,
        max: 2,
        presentFields: ["quiet"],
        absentFields: ["target"],
      },
    ],
    usage: {
      command: "requiredCount",
      synopsis: "required-count [--output <mode>] <target> [--quiet]",
    },
  });
});

void test("dynamic count definitions give local reasons per endpoint and field issue", () => {
  const dynamicFields: string[] = ["auth", "quiet"];
  const emptyDynamicFields: string[] = [];
  const duplicateDynamicFields: string[] = ["auth", "auth"];
  const dynamicNegative: number = -1;
  const dynamicFraction: number = 0.5;
  const cases: readonly Readonly<{
    readonly constraint: unknown;
    readonly expected:
      | Readonly<Record<string, unknown>>
      | readonly Readonly<Record<string, unknown>>[];
  }>[] = [
    {
      constraint: {
        kind: "count",
        fields: ["auth", "quiet"],
        min: dynamicNegative,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "min",
        reason: "nonNegative",
        actual: -1,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: ["auth", "quiet"],
        min: dynamicFraction,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "min",
        reason: "integer",
        actual: 0.5,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: ["auth", "quiet"],
        min: Number.NaN,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "min",
        reason: "finite",
        actual: Number.NaN,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: ["auth", "quiet"],
        max: Number.POSITIVE_INFINITY,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "max",
        reason: "finite",
        actual: Number.POSITIVE_INFINITY,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: ["auth", "quiet"],
        min: Number.NEGATIVE_INFINITY,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "min",
        reason: "nonNegative",
        actual: Number.NEGATIVE_INFINITY,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: ["auth", "quiet"],
        min: 2,
        max: 1,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "min",
        reason: "ordered",
        actual: 2,
        maximum: 1,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: dynamicFields,
        max: 3,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "max",
        reason: "fieldCount",
        actual: 3,
        maximum: 2,
      },
    },
    {
      constraint: {
        kind: "count",
        fields: duplicateDynamicFields,
        min: 1,
      },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "fields",
        reason: "duplicateFields",
        fields: ["auth"],
      },
    },
    {
      constraint: {
        kind: "count",
        fields: emptyDynamicFields,
        min: -1,
        max: 0,
      },
      expected: [
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 0,
          member: "fields",
          reason: "nonEmpty",
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 0,
          member: "min",
          reason: "nonNegative",
          actual: -1,
        },
      ],
    },
    {
      constraint: { kind: "count", fields: ["auth", "auth"], min: 1 },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "fields",
        reason: "duplicateFields",
        fields: ["auth"],
      },
    },
    {
      constraint: { kind: "count", fields: ["missing"], min: 1 },
      expected: {
        code: "unknownUsageConstraintField",
        command: "countInputs",
        constraint: "count",
        index: 0,
        member: "fields",
        field: "missing",
      },
    },
    {
      constraint: { kind: "count", fields: [], min: 0 },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "fields",
        reason: "nonEmpty",
      },
    },
    {
      constraint: { kind: "count", fields: ["auth", "quiet"] },
      expected: {
        code: "invalidCountConstraint",
        command: "countInputs",
        index: 0,
        member: "min",
        reason: "endpointRequired",
      },
    },
    {
      constraint: {
        kind: "count",
        fields: ["auth"],
        min: 1,
        maximum: 1,
      },
      expected: {
        code: "unknownDefinitionProperty",
        path: ["commands", "countInputs", "usageConstraints", "0", "maximum"],
      },
    },
  ];

  for (const { constraint, expected } of cases) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic negative case bypasses the static contract to verify the definition-time boundary.
    const definition = countCliDefinition([constraint as UsageConstraint]);
    assert.throws(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic negative case bypasses the static contract to verify the definition-time boundary.
      () => defineCli()(definition as never),
      (error: unknown) => {
        assert(error instanceof ContractDefinitionError);
        assert.deepEqual(
          error.issues,
          Array.isArray(expected) ? expected : [expected],
        );
        return true;
      },
    );
  }
});

void test("dynamic count arrays still aggregate independently decidable member and endpoint issues", () => {
  const constraints: unknown = [
    {
      kind: "count",
      fields: ["missing", "auth", 7],
      min: -1,
      max: 4,
    },
    { kind: "count", fields: [], min: 1, max: 1 },
    { kind: "count", fields: null, min: -1, max: 0.5 },
    { kind: "count", fields: "not-a-fields-array", min: 2, max: 1 },
  ];
  const definition = countCliDefinition(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic array intentionally contains invalid members to verify definition-time aggregation.
    constraints as readonly UsageConstraint[],
  );
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic negative case bypasses the static contract to verify the definition-time boundary.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 0,
          member: "fields",
          reason: "fieldName",
        },
        {
          code: "unknownUsageConstraintField",
          command: "countInputs",
          constraint: "count",
          index: 0,
          member: "fields",
          field: "missing",
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 0,
          member: "min",
          reason: "nonNegative",
          actual: -1,
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 0,
          member: "max",
          reason: "fieldCount",
          actual: 4,
          maximum: 3,
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 1,
          member: "fields",
          reason: "nonEmpty",
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 1,
          member: "min",
          reason: "fieldCount",
          actual: 1,
          maximum: 0,
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 1,
          member: "max",
          reason: "fieldCount",
          actual: 1,
          maximum: 0,
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 2,
          member: "fields",
          reason: "nonEmpty",
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 2,
          member: "min",
          reason: "nonNegative",
          actual: -1,
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 2,
          member: "max",
          reason: "integer",
          actual: 0.5,
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 3,
          member: "fields",
          reason: "nonEmpty",
        },
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 3,
          member: "min",
          reason: "ordered",
          actual: 2,
          maximum: 1,
        },
      ]);
      return true;
    },
  );
});

void test("conditional and forbidden-combination rules aggregate in declaration order, and failures skip the handler", async () => {
  let executions = 0;
  const cli = createConstrainedCli(() => {
    executions += 1;
  });
  const invocation = parseCliInvocation(cli, [
    "--auth",
    "basic",
    "--output-file",
    "result.txt",
    "--quiet",
    "--format",
    "json",
  ]);
  assert.deepEqual(invocation, {
    kind: "usageFailure",
    command: "publish",
    issues: [
      {
        code: "countConstraintViolation",
        min: 0,
        max: 1,
        presentFields: ["output", "quiet"],
        absentFields: [],
      },
      {
        code: "conditionalConstraintViolation",
        branch: "onMatch",
        conditions: [{ kind: "present", field: "auth", present: true }],
        missingRequiredFields: ["token"],
        presentForbiddenFields: ["output", "quiet"],
      },
      {
        code: "forbiddenCombinationViolation",
        facts: [
          { kind: "equals", field: "format", value: "json" },
          { kind: "equals", field: "quiet", value: true },
        ],
      },
    ],
    usage: {
      command: "publish",
      synopsis:
        "publish [--output <mode>] [--auth <auth>] [--token <token>] [--output-file <output>] [--quiet] [--format <format>]",
    },
  });

  const writes: string[] = [];
  const termination = await executeCli(cli, {
    invocation,
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.equal(termination.kind, "usageFailure");
  assert.equal(executions, 0);
  assert.deepEqual(writes, [
    '{"schemaVersion":"3","command":"publish","kind":"usageFailure","issues":[{"code":"countConstraintViolation","min":0,"max":1,"presentFields":["output","quiet"],"absentFields":[]},{"code":"conditionalConstraintViolation","branch":"onMatch","conditions":[{"kind":"present","field":"auth","present":true}],"missingRequiredFields":["token"],"presentForbiddenFields":["output","quiet"]},{"code":"forbiddenCombinationViolation","facts":[{"kind":"equals","field":"format","value":"json"},{"kind":"equals","field":"quiet","value":true}]}],"usage":"publish [--output <mode>] [--auth <auth>] [--token <token>] [--output-file <output>] [--quiet] [--format <format>]","helpArgv":["publish","--help"]}\n',
  ]);
  const validateWire = new Ajv2020({ strict: false }).compile(
    cli.manifest.usageFailure.wire,
  );
  assert.equal(validateWire(JSON.parse(writes[0]!)), true);
  assert.equal(
    validateWire({
      schemaVersion: "3",
      command: "publish",
      kind: "usageFailure",
      issues: [
        {
          code: "conditionalConstraintViolation",
          branch: "onMatch",
          conditions: [
            {
              kind: "equals",
              field: "mode",
              expected: "replay",
              present: false,
              actual: "replay",
            },
          ],
          missingRequiredFields: [],
          presentForbiddenFields: [],
        },
      ],
      usage: cli.grammar.root.usage.synopsis,
      helpArgv: ["publish", "--help"],
    }),
    false,
  );
});

void test("unreachable conditional branches across rules do not trigger global satisfiability rejection", () => {
  const cli = defineCli()({
    ...countCliDefinition([
      { kind: "count", fields: ["auth", "quiet"], max: 1 },
      {
        kind: "when",
        all: [{ kind: "present", field: "auth" }],
        onMatch: { require: ["quiet"] },
      },
    ]),
    help: englishHelpCapability(),
  });
  const invocation = parseCliInvocation(cli, ["--auth", "token", "--quiet"]);
  assert.equal(invocation.kind, "usageFailure");
  if (invocation.kind !== "usageFailure") return;
  assert.deepEqual(invocation.issues, [
    {
      code: "countConstraintViolation",
      min: 0,
      max: 1,
      presentFields: ["auth", "quiet"],
      absentFields: [],
    },
  ]);
});

void test("forbidden field facts observe both presence and equality and keep declaration order", () => {
  const sharedInput3 = z.object({
    mode: z.enum(["json", "yaml"]).optional(),
    quiet: z.boolean().default(true),
  });
  const cli = defineCli()({
    root: "publish",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      publish: {
        kind: "rootCommand",
        name: "publish",
        description: "发布制品",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            negatedLongOption: "--no-quiet",
            description: "静默输出",
          },
        },
        input: sharedInput3,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "mode", value: "json" },
              { kind: "equals", field: "mode", value: "json" },
              { kind: "present", field: "quiet" },
              { kind: "equals", field: "quiet", value: false },
            ],
          },
        ],

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

  assert.deepEqual(parseCliInvocation(cli, ["--mode", "json", "--no-quiet"]), {
    kind: "usageFailure",
    command: "publish",
    issues: [
      {
        code: "forbiddenCombinationViolation",
        facts: [
          { kind: "equals", field: "mode", value: "json" },
          { kind: "equals", field: "mode", value: "json" },
          { kind: "present", field: "quiet" },
          { kind: "equals", field: "quiet", value: false },
        ],
      },
    ],
    usage: {
      command: "publish",
      synopsis:
        "publish [--output <mode>] [--mode <mode>] [--quiet|--no-quiet]",
    },
  });
  assert.deepEqual(parseCliInvocation(cli, ["--mode", "json"]), {
    kind: "parsed",
    command: "publish",
    input: { mode: "json" },
    outputMode: "structured",
  });
});

void test("equals facts observe the raw Input value before schema transforms", () => {
  const sharedInput4 = z.object({
    mode: z
      .string()
      .transform((value) => value.length)
      .pipe(z.number())
      .optional(),
    force: z.boolean().optional(),
  });
  const cli = defineCli()({
    root: "transformedInput",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      transformedInput: {
        kind: "rootCommand",
        name: "transformed-input",
        description: "原始输入",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          force: {
            kind: "flag",
            longOption: "--force",
            description: "强制执行",
          },
        },
        input: sharedInput4,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "mode", value: "json" },
              { kind: "present", field: "force" },
            ],
          },
        ],

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

  assert.deepEqual(parseCliInvocation(cli, ["--mode", "json", "--force"]), {
    kind: "usageFailure",
    command: "transformedInput",
    issues: [
      {
        code: "forbiddenCombinationViolation",
        facts: [
          { kind: "equals", field: "mode", value: "json" },
          { kind: "present", field: "force" },
        ],
      },
    ],
    usage: {
      command: "transformedInput",
      synopsis: "transformed-input [--output <mode>] [--mode <mode>] [--force]",
    },
  });
  assert.deepEqual(parseCliInvocation(cli, ["--mode", "json"]), {
    kind: "parsed",
    command: "transformedInput",
    input: { mode: "json" },
    outputMode: "structured",
  });
});

void test("JSON Schema semantics agree with the parser and keep referenced definitions", () => {
  const source = z.object({
    format: z.enum(["json", "yaml"]).optional(),
    quiet: z.boolean().optional(),
  });
  const inputSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/publish-input",
    $defs: {
      format: { enum: ["json", "yaml"], type: "string" },
    },
    additionalProperties: false,
    properties: {
      format: { $ref: "#/$defs/format", type: "string" },
      quiet: { type: "boolean" },
    },
    type: "object",
  } as const;
  const schema = {
    "~standard": {
      ...source["~standard"],
      jsonSchema: {
        input: () => inputSchema,
        output: () => inputSchema,
      },
    },
  };
  const cli = defineCli()({
    root: "publish",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      publish: {
        kind: "rootCommand",
        name: "publish",
        description: "发布制品",
        fields: {
          format: {
            kind: "valueOption",
            longOption: "--format",
            description: "格式",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            negatedLongOption: "--no-quiet",
            description: "静默",
          },
        },
        input: schema,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "format", value: "json" },
              { kind: "present", field: "quiet" },
            ],
          },
        ],

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
  const projectedSchema = cli.manifest.commands.publish.input.inputSchema;
  assert.equal(projectedSchema.$id, inputSchema.$id);
  assert.deepEqual(projectedSchema.$defs, inputSchema.$defs);
  assert.deepEqual(projectedSchema.properties, {
    format: { ...inputSchema.properties.format, description: "格式" },
    quiet: { ...inputSchema.properties.quiet, description: "静默" },
  });
  const validate = new Ajv2020({ strict: false }).compile(projectedSchema);
  const forbidden = { format: "json", quiet: false };
  assert.equal(validate(forbidden), false);
  assert.equal(
    parseCliInvocation(cli, ["--format", "json", "--no-quiet"]).kind,
    "usageFailure",
  );
  assert.equal(validate({ format: "json" }), true);
  assert.equal(parseCliInvocation(cli, ["--format", "json"]).kind, "parsed");
  assert.equal(validate({ format: "yaml", quiet: false }), true);
  assert.equal(
    parseCliInvocation(cli, ["--format", "yaml", "--no-quiet"]).kind,
    "parsed",
  );
  const validateUsageWire = new Ajv2020({ strict: false }).compile(
    cli.manifest.usageFailure.wire,
  );
  const usageFailure = {
    schemaVersion: "3",
    command: "publish",
    kind: "usageFailure",
    issues: [
      {
        code: "forbiddenCombinationViolation",
        facts: [
          { kind: "equals", field: "format", value: "json" },
          { kind: "present", field: "quiet" },
        ],
      },
    ],
    usage: cli.grammar.root.usage.synopsis,
    helpArgv: ["publish", "--help"],
  };
  assert.equal(validateUsageWire(usageFailure), true);
  assert.equal(
    validateUsageWire({
      ...usageFailure,
      issues: [
        {
          code: "forbiddenCombinationViolation",
          values: [{ field: "format", value: "json" }],
        },
      ],
    }),
    false,
  );
});

void test("when branch schemas checked against the parser keep root references and empty effects", () => {
  const source = z.object({
    mode: z.enum(["live", "replay"]).optional(),
    cursor: z.string().optional(),
    token: z.string().optional(),
    feedback: z.boolean().optional(),
  });
  const inputSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/conditional-input",
    $defs: {
      mode: { enum: ["live", "replay"], type: "string" },
    },
    additionalProperties: false,
    properties: {
      mode: { $ref: "#/$defs/mode", type: "string" },
      cursor: { type: "string" },
      token: { type: "string" },
      feedback: { type: "boolean" },
    },
    type: "object",
  } as const;
  const schema = {
    "~standard": {
      ...source["~standard"],
      jsonSchema: {
        input: () => inputSchema,
        output: () => inputSchema,
      },
    },
  };
  const cli = defineCli()({
    root: "conditional",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      conditional: {
        kind: "rootCommand",
        name: "conditional",
        description: "条件规则",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          cursor: {
            kind: "valueOption",
            longOption: "--cursor",
            description: "游标",
          },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "令牌",
          },
          feedback: {
            kind: "flag",
            longOption: "--feedback",
            description: "反馈",
          },
        },
        input: schema,
        usageConstraints: [
          {
            kind: "when",
            all: [
              { kind: "equals", field: "mode", value: "replay" },
              { kind: "present", field: "cursor" },
            ],
            onMatch: { require: ["token", "token"], forbid: ["feedback"] },
            otherwise: { require: ["token"], forbid: ["feedback"] },
          },
          {
            kind: "when",
            all: [{ kind: "equals", field: "mode", value: "live" }],
            onMatch: { require: ["cursor"] },
          },
          {
            kind: "when",
            all: [{ kind: "present", field: "cursor" }],
            otherwise: { require: ["token"] },
          },
          {
            kind: "when",
            all: [{ kind: "present", field: "token" }],
            onMatch: {},
            otherwise: { forbid: ["cursor"] },
          },
        ],

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
  const projectedSchema = cli.manifest.commands.conditional.input.inputSchema;
  assert.equal(projectedSchema.$id, inputSchema.$id);
  assert.deepEqual(projectedSchema.$defs, inputSchema.$defs);
  const validate = new Ajv2020({ strict: false }).compile(projectedSchema);
  const cases = [
    {
      argv: ["--mode", "replay", "--cursor", "c-7", "--token", "t"],
      input: { mode: "replay", cursor: "c-7", token: "t" },
    },
    {
      argv: ["--mode", "replay", "--token", "t"],
      input: { mode: "replay", token: "t" },
    },
    {
      argv: ["--mode", "live", "--cursor", "c-8", "--token", "t"],
      input: { mode: "live", cursor: "c-8", token: "t" },
    },
  ] as const;
  for (const scenario of cases) {
    assert.equal(validate(scenario.input), true);
    assert.equal(parseCliInvocation(cli, scenario.argv).kind, "parsed");
  }

  const invalidOnMatch = parseCliInvocation(cli, [
    "--mode",
    "replay",
    "--cursor",
    "c-7",
    "--feedback",
  ]);
  assert.equal(invalidOnMatch.kind, "usageFailure");
  assert.equal(
    validate({ mode: "replay", cursor: "c-7", feedback: true }),
    false,
  );
  if (invalidOnMatch.kind === "usageFailure") {
    assert.deepEqual(
      invalidOnMatch.issues.filter(
        (issue) => issue.code === "conditionalConstraintViolation",
      ),
      [
        {
          code: "conditionalConstraintViolation",
          branch: "onMatch",
          conditions: [
            {
              kind: "equals",
              field: "mode",
              expected: "replay",
              present: true,
              actual: "replay",
            },
            { kind: "present", field: "cursor", present: true },
          ],
          missingRequiredFields: ["token", "token"],
          presentForbiddenFields: ["feedback"],
        },
        {
          code: "conditionalConstraintViolation",
          branch: "otherwise",
          conditions: [{ kind: "present", field: "token", present: false }],
          missingRequiredFields: [],
          presentForbiddenFields: ["cursor"],
        },
      ],
    );
  }

  const invalidOtherwise = parseCliInvocation(cli, [
    "--mode",
    "replay",
    "--feedback",
  ]);
  assert.equal(invalidOtherwise.kind, "usageFailure");
  assert.equal(validate({ mode: "replay", feedback: true }), false);
  if (invalidOtherwise.kind === "usageFailure") {
    assert.ok(
      invalidOtherwise.issues.some(
        (issue) =>
          issue.code === "conditionalConstraintViolation" &&
          issue.branch === "otherwise" &&
          issue.conditions[0]?.kind === "present" &&
          !issue.conditions[0].present &&
          issue.missingRequiredFields.includes("token"),
      ),
    );
  }

  const invalidDifferentActual = parseCliInvocation(cli, ["--mode", "live"]);
  assert.equal(invalidDifferentActual.kind, "usageFailure");
  assert.equal(validate({ mode: "live" }), false);
  if (invalidDifferentActual.kind === "usageFailure") {
    assert.deepEqual(invalidDifferentActual.issues[0], {
      code: "conditionalConstraintViolation",
      branch: "otherwise",
      conditions: [
        {
          kind: "equals",
          field: "mode",
          expected: "replay",
          present: true,
          actual: "live",
        },
        { kind: "present", field: "cursor", present: false },
      ],
      missingRequiredFields: ["token"],
      presentForbiddenFields: [],
    });
  }
});

void test("an invalid count does not mask help template diagnostics required by a valid count", () => {
  const invalidMinimum: number = -1;
  const definition = {
    ...countCliDefinition([
      { kind: "count", fields: ["auth"], min: invalidMinimum },
      { kind: "count", fields: ["auth"], min: 1 },
    ]),
    help: helpCapability({
      wording: {
        outputModePlaceholder: englishHelpWording.outputModePlaceholder,
        choicesAndDefault: englishHelpWording.choicesAndDefault,
        default: "{usage} 默认值 {value}",
      },
    }),
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A dynamic invalid count must cross authoring-time static diagnostics.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidCountConstraint",
          command: "countInputs",
          index: 0,
          member: "min",
          reason: "nonNegative",
          actual: -1,
        },
        {
          code: "missingHelpFactTemplate",
          command: "countInputs",
          slot: "countExactly",
        },
      ]);
      return true;
    },
  );
});

void test("count definition diagnostics are still collected when the input schema projection is missing", () => {
  const input = z.object({ auth: z.string().optional() });
  const missingProjection = {
    "~standard": {
      validate: input["~standard"].validate,
      vendor: "fixture",
      version: 1,
    },
  } as unknown as ContractSchema<{ readonly auth?: string }>;
  const countDefinition = countCliDefinition([
    { kind: "count", fields: ["auth"], min: 1 },
  ]);
  const outputs = (
    mode: OutputExecutionFactory<
      "countInputs",
      undefined,
      typeof missingProjection
    >,
  ) => ({
    default: "structured" as const,
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
  });
  const definition = {
    ...countDefinition,
    commands: {
      ...countDefinition.commands,
      countInputs: {
        ...countDefinition.commands.countInputs,
        input: missingProjection,
        outputs,
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case lacking the JSON Schema seam must bypass static consumer types.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingSchemaCapability",
          command: "countInputs",
          location: "input",
          capability: "jsonSchema",
        },
        {
          code: "unknownUsageConstraintField",
          command: "countInputs",
          constraint: "count",
          index: 0,
          member: "fields",
          field: "auth",
        },
      ]);
      return true;
    },
  );
});

void test("one constraint fact projects into grammar, manifest, Draft 2020-12, and help", async () => {
  const cli = createConstrainedCli();
  const constraints = [
    { kind: "count", fields: ["output", "quiet"], min: 0, max: 1 },
    {
      kind: "when",
      all: [{ kind: "present", field: "auth" }],
      onMatch: { require: ["token"], forbid: ["output", "quiet"] },
    },
    {
      kind: "forbiddenCombination",
      all: [
        { kind: "equals", field: "format", value: "json" },
        { kind: "equals", field: "quiet", value: true },
      ],
    },
  ] as const;
  assert.deepEqual(cli.grammar.root.usageConstraints, constraints);
  assert.strictEqual(
    cli.grammar.root.usageConstraints,
    cli.manifest.commands.publish.usageConstraints,
  );
  const projectedSchema = cli.manifest.commands.publish.input.inputSchema;
  assert.ok(Array.isArray(projectedSchema.allOf));
  assert.equal(projectedSchema.allOf.length, 3);
  const validate = new Ajv2020({ strict: false }).compile(projectedSchema);
  assert.equal(validate({ output: "result.txt" }), true);
  assert.equal(validate({ output: "result.txt", quiet: false }), false);
  assert.equal(
    typeof (projectedSchema.allOf[0] as { $ref?: unknown }).$ref,
    "string",
  );
  assert.deepEqual(projectedSchema.allOf[1], {
    if: { allOf: [{ required: ["auth"] }] },
    // oxlint-disable-next-line unicorn/no-thenable -- A fixed Draft 2020-12 keyword.
    then: {
      required: ["token"],
      not: {
        anyOf: [{ required: ["output"] }, { required: ["quiet"] }],
      },
    },
  });
  assert.deepEqual(projectedSchema.allOf[2], {
    not: {
      allOf: [
        {
          properties: { format: { const: "json" } },
          required: ["format"],
        },
        { properties: { quiet: { const: true } }, required: ["quiet"] },
      ],
    },
  });

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(
    writes.join(""),
    /--help\n  --output <mode> \(choices: "structured"\) \(default: "structured"\)\n  structured\n    结构化输出\n\n  --output-file, --quiet at most 1\n  when all of --auth is present, require --token, forbid --output-file, --quiet\n  forbidden combination of --format="json", --quiet=true\n$/,
  );
});

void test("dynamic when validation reuses fact and value-domain rules and checks branch-local contradictions", () => {
  const sharedInput5 = z.object({
    mode: z.enum(["safe", "force"]).optional(),
    tags: z.array(z.string()).optional(),
    force: z.boolean().optional(),
  });
  const definition = {
    root: "invalidConstraints",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      invalidConstraints: {
        kind: "rootCommand",
        name: "invalid-constraints",
        description: "无效约束",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          tags: {
            kind: "repeatableOption",
            longOption: "--tag",
            description: "标签",
          },
          force: { kind: "flag", longOption: "--force", description: "强制" },
        },
        usageConstraints: [
          {
            kind: "when",
            all: [
              { kind: "equals", field: "mode", value: "outside" },
              { kind: "equals", field: "force", value: "yes" },
              { kind: "equals", field: "tags", value: "nightly" },
              { kind: "present", field: "missing" },
            ],
            onMatch: { require: ["mode", "absent"], forbid: ["mode"] },
            otherwise: { forbid: ["missing"] },
          },
        ],
        input: sharedInput5,

        outputs: (
          mode: OutputExecutionFactory<
            "invalidConstraints",
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic definition negative case bypasses static restrictions to verify definition-time fact and branch checks.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(
        error.issues.map(({ code }) => code),
        [
          "invalidUsageConstraintValue",
          "invalidUsageConstraintValue",
          "inapplicableUsageConstraintField",
          "unknownUsageConstraintField",
          "unknownUsageConstraintField",
          "contradictoryUsageConstraint",
          "unknownUsageConstraintField",
        ],
      );
      assert.deepEqual(error.issues[0], {
        code: "invalidUsageConstraintValue",
        command: "invalidConstraints",
        constraint: "when",
        index: 0,
        member: "all.value",
        field: "mode",
        actual: "outside",
        expected: ["safe", "force"],
      });
      assert.deepEqual(
        error.issues.find(
          (issue) => issue.code === "contradictoryUsageConstraint",
        ),
        {
          code: "contradictoryUsageConstraint",
          command: "invalidConstraints",
          constraint: "when",
          index: 0,
          member: "onMatch",
          fields: ["mode"],
        },
      );
      return true;
    },
  );
});

void test("dynamic when aggregates empty branches, malformed members, and closed property diagnostics", () => {
  const sharedInput6 = z.object({
    force: z.boolean().optional(),
    mode: z.enum(["safe", "force"]).optional(),
  });
  const definition = {
    root: "invalidShapes",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      invalidShapes: {
        kind: "rootCommand",
        name: "invalid-shapes",
        description: "无效形状",
        fields: {
          force: { kind: "flag", longOption: "--force", description: "强制" },
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [{ kind: "equals", field: "force", value: 42 }],
          },
          { kind: "forbiddenCombination", all: [] },
          { kind: "predicate" },
          {
            kind: "forbiddenCombination",
            all: [{ kind: "equals", field: "mode", value: "toml" }],
          },
          {
            kind: "when",
            all: [],
            onMatch: { require: [] },
            otherwise: { forbid: [] },
          },
          {
            kind: "when",
            typo: true,
            all: [
              42,
              { kind: "equals", field: "mode", value: 42 },
              { kind: "present", field: "mode", typo: true },
              { kind: "equals", field: "mode" },
            ],
            onMatch: { require: "mode", other: true },
            otherwise: null,
          },
          { kind: "predicate" },
          { kind: "forbiddenCombination", all: [] },
          {
            kind: "when",
            all: [{ kind: "present", field: "mode" }],
          },
        ],
        input: sharedInput6,

        outputs: (
          mode: OutputExecutionFactory<
            "invalidShapes",
            undefined,
            typeof sharedInput6
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic definition negative case bypasses static restrictions to verify the closed check aggregates completely.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(
        error.issues.map(({ code }) => code),
        [
          "unknownDefinitionProperty",
          "unknownDefinitionProperty",
          "unknownDefinitionProperty",
          "invalidUsageConstraintValue",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraintValue",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraintValue",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
          "invalidUsageConstraint",
        ],
      );
      const unknownProperties = error.issues.filter(
        (issue) => issue.code === "unknownDefinitionProperty",
      );
      assert.deepEqual(
        unknownProperties.map(({ path }) => path),
        [
          ["commands", "invalidShapes", "usageConstraints", "5", "typo"],
          [
            "commands",
            "invalidShapes",
            "usageConstraints",
            "5",
            "all",
            "2",
            "typo",
          ],
          [
            "commands",
            "invalidShapes",
            "usageConstraints",
            "5",
            "onMatch",
            "other",
          ],
        ],
      );
      assert.deepEqual(
        error.issues.find(
          (issue) =>
            issue.code === "invalidUsageConstraintValue" && issue.index === 0,
        ),
        {
          code: "invalidUsageConstraintValue",
          command: "invalidShapes",
          constraint: "forbiddenCombination",
          index: 0,
          member: "all.value",
          field: "force",
          actual: 42,
          expected: true,
        },
      );
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.code === "invalidUsageConstraint" &&
            issue.index === 4 &&
            issue.member === "all",
        ),
      );
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.code === "invalidUsageConstraint" &&
            issue.index === 4 &&
            issue.member === "effects",
        ),
      );
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.code === "invalidUsageConstraint" &&
            issue.index === 5 &&
            issue.member === "onMatch.require",
        ),
      );
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.code === "invalidUsageConstraint" &&
            issue.index === 8 &&
            issue.member === "effects",
        ),
      );
      return true;
    },
  );
});

void test("hierarchical definitions keep aggregating independent constraint errors in leaf commands", () => {
  const define = defineCli();
  const sharedInput0 = z.object({ mode: z.enum(["safe", "force"]).optional() });
  const definition = {
    root: "workspace",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        description: "工作区",
      },
      probe: {
        kind: "command",
        parent: "workspace",
        name: "probe",
        description: "检查约束",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input: sharedInput0,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [{ kind: "present", field: "mode", typo: true }],
          },
          {
            kind: "forbiddenCombination",
            all: [{ kind: "equals", field: "mode", value: "outside" }],
          },
        ],

        outputs: (
          mode: OutputExecutionFactory<"probe", undefined, typeof sharedInput0>,
        ) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler() {
                  return undefined as never;
                },
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic boundary negative case bypasses static checks to verify hierarchical definitions still aggregate leaf constraint errors.
    () => define(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: [
            "commands",
            "probe",
            "usageConstraints",
            "0",
            "all",
            "0",
            "typo",
          ],
        },
        {
          code: "invalidUsageConstraintValue",
          command: "probe",
          constraint: "forbiddenCombination",
          index: 1,
          member: "all.value",
          field: "mode",
          actual: "outside",
          expected: ["safe", "force"],
        },
      ]);
      return true;
    },
  );
});

void test("defineCli rejects mutually contradictory equals facts on the same field", () => {
  const sharedInput1 = z.object({ mode: z.string().optional() });
  const definition = {
    root: "contradictoryFacts",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      contradictoryFacts: {
        kind: "rootCommand",
        name: "contradictory-facts",
        description: "矛盾事实",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input: sharedInput1,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "mode", value: "safe" },
              { kind: "equals", field: "mode", value: "force" },
            ],
          },
        ],

        outputs: (
          mode: OutputExecutionFactory<
            "contradictoryFacts",
            undefined,
            typeof sharedInput1
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally bypasses static restrictions to verify definition-time checks.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(
        error.issues.filter(
          (issue) => issue.code === "contradictoryUsageConstraint",
        ),
        [
          {
            code: "contradictoryUsageConstraint",
            command: "contradictoryFacts",
            constraint: "forbiddenCombination",
            index: 0,
            member: "all",
            fields: ["mode"],
          },
        ],
      );
      return true;
    },
  );
});

void test("defineCli reports unknown properties on forbidden rules and facts under a unified identity", () => {
  const sharedInput2 = z.object({ force: z.boolean().optional() });
  const definition = {
    root: "unknownUsageProperties",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      unknownUsageProperties: {
        kind: "rootCommand",
        name: "unknown-usage-properties",
        description: "未知禁配属性",
        fields: {
          force: { kind: "flag", longOption: "--force", description: "强制" },
        },
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            typo: true,
            all: [{ kind: "present", field: "force", typo: true }],
          },
        ],
        input: sharedInput2,

        outputs: (
          mode: OutputExecutionFactory<
            "unknownUsageProperties",
            undefined,
            typeof sharedInput2
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case bypasses static constraints to verify dynamic definition-time diagnostic identities.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: [
            "commands",
            "unknownUsageProperties",
            "usageConstraints",
            "0",
            "typo",
          ],
        },
        {
          code: "unknownDefinitionProperty",
          path: [
            "commands",
            "unknownUsageProperties",
            "usageConstraints",
            "0",
            "all",
            "0",
            "typo",
          ],
        },
      ]);
      return true;
    },
  );
});

void test("defineCli hands explicit null to the usage constraint collection guard", () => {
  const sharedInput3 = z.object({});
  const definition = {
    root: "nullConstraints",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      nullConstraints: {
        kind: "rootCommand",
        name: "null-constraints",
        description: "空约束",
        fields: {},
        usageConstraints: null,
        input: sharedInput3,

        outputs: (
          mode: OutputExecutionFactory<
            "nullConstraints",
            undefined,
            typeof sharedInput3
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally bypasses static restrictions to verify usage constraint rejection.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidUsageConstraint",
          command: "nullConstraints",
          index: null,
          aspect: "collection",
          received: null,
        },
      ]);
      return true;
    },
  );
});

void test("a satisfied when reports the full condition and every failed effect as one rule", async () => {
  let executions = 0;
  const sharedInput7 = z.object({
    mode: z.enum(["live", "replay"]).optional(),
    cursor: z.string().optional(),
    token: z.string().optional(),
    feedback: z.boolean().optional(),
  });
  const cli = defineCli()({
    root: "replay",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      replay: {
        kind: "rootCommand",
        name: "replay",
        description: "重放",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          cursor: {
            kind: "valueOption",
            longOption: "--cursor",
            description: "游标",
          },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "令牌",
          },
          feedback: {
            kind: "flag",
            longOption: "--feedback",
            description: "反馈",
          },
        },
        input: sharedInput7,
        usageConstraints: [
          {
            kind: "when",
            all: [
              { kind: "equals", field: "mode", value: "replay" },
              { kind: "present", field: "cursor" },
            ],
            onMatch: { require: ["token"], forbid: ["feedback"] },
            otherwise: { forbid: ["token"] },
          },
        ],

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => {
                  executions += 1;
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

  const invocation = parseCliInvocation(cli, [
    "--mode",
    "replay",
    "--cursor",
    "c-7",
    "--feedback",
  ]);
  assert.equal(invocation.kind, "usageFailure");
  if (invocation.kind !== "usageFailure")
    assert.fail("the invocation missing the token must be rejected");
  assert.deepEqual(invocation.issues, [
    {
      code: "conditionalConstraintViolation",
      branch: "onMatch",
      conditions: [
        {
          kind: "equals",
          field: "mode",
          expected: "replay",
          present: true,
          actual: "replay",
        },
        { kind: "present", field: "cursor", present: true },
      ],
      missingRequiredFields: ["token"],
      presentForbiddenFields: ["feedback"],
    },
  ]);

  const writes: string[] = [];
  const termination = await executeCli(cli, {
    invocation,
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.equal(termination.kind, "usageFailure");
  assert.equal(executions, 0);
  assert.deepEqual(termination.issues, invocation.issues);
  assert.equal(writes.length, 1);
});

void test("dynamic effect field arrays produce conditional failures only when runtime values actually overlap", () => {
  const required: readonly ("mode" | "token")[] = ["token"];
  const forbidden: readonly ("mode" | "token")[] = ["mode"];
  const sharedInput8 = z.object({
    mode: z.string().optional(),
    token: z.string().optional(),
  });
  const cli = defineCli()({
    root: "dynamicEffects",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      dynamicEffects: {
        kind: "rootCommand",
        name: "dynamic-effects",
        description: "动态分支效果",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "令牌",
          },
        },
        input: sharedInput8,
        usageConstraints: [
          {
            kind: "when",
            all: [{ kind: "present", field: "mode" }],
            onMatch: { require: required, forbid: forbidden },
          },
        ],

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

  assert.deepEqual(parseCliInvocation(cli, ["--mode", "live"]), {
    kind: "usageFailure",
    command: "dynamicEffects",
    issues: [
      {
        code: "conditionalConstraintViolation",
        branch: "onMatch",
        conditions: [{ kind: "present", field: "mode", present: true }],
        missingRequiredFields: ["token"],
        presentForbiddenFields: ["mode"],
      },
    ],
    usage: {
      command: "dynamicEffects",
      synopsis:
        "dynamic-effects [--output <mode>] [--mode <mode>] [--token <token>]",
    },
  });
});

void test("dynamic when effects keep the decidable bad-field locations inside mixed arrays", () => {
  const constraints: readonly UsageConstraint[] = [
    {
      kind: "when",
      all: [{ kind: "present", field: "auth" }],
      onMatch: { require: ["missing", "quiet"] },
    },
  ];
  assert.throws(
    () => defineCli()(countCliDefinition(constraints) as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownUsageConstraintField",
          command: "countInputs",
          constraint: "when",
          index: 0,
          member: "onMatch.require",
          field: "missing",
        },
      ]);
      return true;
    },
  );
});
