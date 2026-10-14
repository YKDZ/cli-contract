/* oxlint-disable unicorn/no-thenable -- then 是 when 条件的公开分支名。 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type CliContract,
  type ContractSchema,
  type JsonObject,
  type UsageConstraint,
} from "@ykdz/cli-contract";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

function createConstrainedCli(handler = () => undefined) {
  return defineCli()({
    root: "publish",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
            longOption: "--output",
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
            then: { require: ["token"], forbid: ["output", "quiet"] },
          },
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "format", value: "json" },
              { kind: "equals", field: "quiet", value: true },
            ],
          },
        ],
        input: z.object({
          auth: z.string().optional(),
          token: z.string().optional(),
          output: z.string().optional(),
          quiet: z.boolean().optional(),
          format: z.string().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => {
          handler();
          return outcome.completion();
        },
      },
    },
  });
}

function countCliDefinition<
  const Constraints extends readonly UsageConstraint[],
>(usageConstraints: Constraints, handler = () => undefined) {
  return {
    root: "countInputs",
    help: helpCapability({
      wording: {
        default: "（默认值 {value}）",
        countExactly: "{fields} 恰好出现 {count} 项",
        countAtLeast: "{fields} 至少出现 {min} 项",
        countAtMost: "{fields} 至多出现 {max} 项",
        countBetween: "{fields} 出现 {min} 到 {max} 项",
      },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({
          auth: z.string().optional().default("匿名"),
          quiet: z.boolean().optional(),
          labels: z.array(z.string()).optional(),
          paths: z.array(z.string()).optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: () => {
          handler();
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 用例只验证 parser 失败路径，成功 handler 不会执行。
          return undefined as never;
        },
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
  return defineCli()({
    root: "requiredCount",
    help: helpCapability({
      wording: { countExactly: "{fields} 恰好出现 {count} 项" },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({
          target: z.string(),
          quiet: z.boolean().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
}

function createProjectedSchemaCountCli(input: ContractSchema) {
  return defineCli()({
    root: "countProjection",
    help: helpCapability({
      wording: { countExactly: "{fields} 恰好出现 {count} 项" },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
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
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
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

void test("count 按 raw 自有字段计数，false 与重复值只计一项且默认不补", async () => {
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
        "count-inputs [--auth <auth>] [--quiet|--no-quiet] [--label <labels>]... [<paths...>]",
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
    schemaVersion: "2",
    command: "countInputs",
    kind: "usageFailure",
    issues: [countFailureIssue],
    usage:
      "count-inputs [--auth <auth>] [--quiet|--no-quiet] [--label <labels>]... [<paths...>]",
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
        "count-inputs [--auth <auth>] [--quiet|--no-quiet] [--label <labels>]... [<paths...>]",
    },
  });
});

void test("count 的 Draft 2020-12 投影与 parser 在有效 raw 输入上判定一致", () => {
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

void test("count 投影保留模式引用并避免定义名碰撞", () => {
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

void test("count 投影的模式体积在较宽字段组下保持可用", () => {
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
  const cli = defineCli()({
    root: "countVolume",
    help: helpCapability({
      wording: { countExactly: "{fields} 恰好出现 {count} 项" },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      countVolume: {
        kind: "rootCommand",
        name: "count-volume",
        description: "数量模式体积",
        fields: fieldDefinitions,
        usageConstraints: [{ kind: "count", fields, min: 1, max: 1 }],
        input: createJsonSchemaContract(inputSchema),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
  const size = Buffer.byteLength(
    JSON.stringify(cli.manifest.commands.countVolume.input.inputSchema),
  );
  assert.ok(size < 100_000, `count 投影为 ${size} 字节`);
});

void test("count 补齐默认端点并按固定顺序选择帮助模板", async () => {
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
  assert.match(await renderHelp(exactly), /auth, quiet 恰好出现 1 项/);
  assert.match(await renderHelp(singleField), /auth 恰好出现 1 项/);
  assert.match(await renderHelp(minOnly), /auth, quiet 至少出现 1 项/);
  assert.match(await renderHelp(maxOnly), /auth, quiet 至多出现 1 项/);
  assert.match(await renderHelp(redundantRange), /auth, quiet 至少出现 0 项/);
  assert.match(
    await renderHelp(between),
    /auth, quiet, labels, paths 出现 1 到 2 项/,
  );
});

void test("count 不会把声明必需但缺席的字段预先算作出现", () => {
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
      synopsis: "required-count <target> [--quiet]",
    },
  });
});

void test("动态 count 定义按端点和字段问题给出局部原因", () => {
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态负例绕过静态契约，以验证定义期边界。
    const definition = countCliDefinition([constraint as UsageConstraint]);
    assert.throws(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态负例绕过静态契约，以验证定义期边界。
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

void test("动态 count 数组聚合仍可独立判定的成员和端点问题", () => {
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态数组故意含非法成员，以验证定义期聚合。
    constraints as readonly UsageConstraint[],
  );
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态负例绕过静态契约，以验证定义期边界。
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

void test("条件规则与禁配规则按声明顺序聚合，失败不执行 handler", async () => {
  let executions = 0;
  const cli = createConstrainedCli(() => {
    executions += 1;
  });
  const invocation = parseCliInvocation(cli, [
    "--auth",
    "basic",
    "--output",
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
        branch: "then",
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
        "publish [--auth <auth>] [--token <token>] [--output <output>] [--quiet] [--format <format>]",
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
    '{"schemaVersion":"2","command":"publish","kind":"usageFailure","issues":[{"code":"countConstraintViolation","min":0,"max":1,"presentFields":["output","quiet"],"absentFields":[]},{"code":"conditionalConstraintViolation","branch":"then","conditions":[{"kind":"present","field":"auth","present":true}],"missingRequiredFields":["token"],"presentForbiddenFields":["output","quiet"]},{"code":"forbiddenCombinationViolation","facts":[{"kind":"equals","field":"format","value":"json"},{"kind":"equals","field":"quiet","value":true}]}],"usage":"publish [--auth <auth>] [--token <token>] [--output <output>] [--quiet] [--format <format>]","helpArgv":["publish","--help"]}\n',
  ]);
  const validateWire = new Ajv2020({ strict: false }).compile(
    cli.manifest.usageFailure.wire,
  );
  assert.equal(validateWire(JSON.parse(writes[0]!)), true);
  assert.equal(
    validateWire({
      schemaVersion: "2",
      command: "publish",
      kind: "usageFailure",
      issues: [
        {
          code: "conditionalConstraintViolation",
          branch: "then",
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

void test("跨规则的不可达条件分支不会触发全局可满足性拒绝", () => {
  const cli = defineCli()({
    ...countCliDefinition([
      { kind: "count", fields: ["auth", "quiet"], max: 1 },
      {
        kind: "when",
        all: [{ kind: "present", field: "auth" }],
        then: { require: ["quiet"] },
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

void test("禁配字段事实同时观察出现与等值，并保留声明顺序", () => {
  const cli = defineCli()({
    root: "publish",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({
          mode: z.enum(["json", "yaml"]).optional(),
          quiet: z.boolean().default(true),
        }),
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
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
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
      synopsis: "publish [--mode <mode>] [--quiet|--no-quiet]",
    },
  });
  assert.deepEqual(parseCliInvocation(cli, ["--mode", "json"]), {
    kind: "parsed",
    command: "publish",
    input: { mode: "json" },
    outputFormat: "structured",
  });
});

void test("等值事实观察 schema transform 前的 raw Input 值", () => {
  const cli = defineCli()({
    root: "transformedInput",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({
          mode: z
            .string()
            .transform((value) => value.length)
            .pipe(z.number())
            .optional(),
          force: z.boolean().optional(),
        }),
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "mode", value: "json" },
              { kind: "present", field: "force" },
            ],
          },
        ],
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
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
      synopsis: "transformed-input [--mode <mode>] [--force]",
    },
  });
  assert.deepEqual(parseCliInvocation(cli, ["--mode", "json"]), {
    kind: "parsed",
    command: "transformedInput",
    input: { mode: "json" },
    outputFormat: "structured",
  });
});

void test("JSON Schema 语义与 parser 一致并保留引用定义", () => {
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
    output: outputCapability({ defaultFormat: "structured" }),
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
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
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
    schemaVersion: "2",
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

void test("when 的分支 schema 与 parser 对照保留根引用及空效果", () => {
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
    output: outputCapability({ defaultFormat: "structured" }),
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
            then: { require: ["token", "token"], forbid: ["feedback"] },
            otherwise: { require: ["token"], forbid: ["feedback"] },
          },
          {
            kind: "when",
            all: [{ kind: "equals", field: "mode", value: "live" }],
            then: { require: ["cursor"] },
          },
          {
            kind: "when",
            all: [{ kind: "present", field: "cursor" }],
            otherwise: { require: ["token"] },
          },
          {
            kind: "when",
            all: [{ kind: "present", field: "token" }],
            then: {},
            otherwise: { forbid: ["cursor"] },
          },
        ],
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
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

  const invalidThen = parseCliInvocation(cli, [
    "--mode",
    "replay",
    "--cursor",
    "c-7",
    "--feedback",
  ]);
  assert.equal(invalidThen.kind, "usageFailure");
  assert.equal(
    validate({ mode: "replay", cursor: "c-7", feedback: true }),
    false,
  );
  if (invalidThen.kind === "usageFailure") {
    assert.deepEqual(
      invalidThen.issues.filter(
        (issue) => issue.code === "conditionalConstraintViolation",
      ),
      [
        {
          code: "conditionalConstraintViolation",
          branch: "then",
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
          issue.conditions[0].present === false &&
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

void test("同一约束事实投影到 grammar、manifest、Draft 2020-12 与 help", async () => {
  const cli = createConstrainedCli();
  const constraints = [
    { kind: "count", fields: ["output", "quiet"], min: 0, max: 1 },
    {
      kind: "when",
      all: [{ kind: "present", field: "auth" }],
      then: { require: ["token"], forbid: ["output", "quiet"] },
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
    /--help\n\n  output, quiet at most 1\n  when all of auth is present, require token, forbid output, quiet\n  forbidden combination of format="json", quiet=true\n$/,
  );
});

void test("动态 when 校验复用事实和值域规则，并检查分支局部矛盾", () => {
  const definition = {
    root: "invalidConstraints",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
            then: { require: ["mode", "absent"], forbid: ["mode"] },
            otherwise: { forbid: ["missing"] },
          },
        ],
        input: z.object({
          mode: z.enum(["safe", "force"]).optional(),
          tags: z.array(z.string()).optional(),
          force: z.boolean().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态定义负例绕过静态限制，以验证定义期事实与分支检查。
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
          member: "then",
          fields: ["mode"],
        },
      );
      return true;
    },
  );
});

void test("动态 when 聚合空分支、畸形成员及闭合属性诊断", () => {
  const definition = {
    root: "invalidShapes",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
            then: { require: [] },
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
            then: { require: "mode", other: true },
            otherwise: null,
          },
          { kind: "predicate" },
          { kind: "forbiddenCombination", all: [] },
          {
            kind: "when",
            all: [{ kind: "present", field: "mode" }],
          },
        ],
        input: z.object({
          force: z.boolean().optional(),
          mode: z.enum(["safe", "force"]).optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态定义负例绕过静态限制，验证闭合检查完整聚合。
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
            "then",
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
            issue.member === "then.require",
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

void test("层级定义继续聚合叶命令中的独立约束错误", () => {
  const define = defineCli();
  const definition = {
    root: "workspace",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
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
        success: { kind: "completion" },
        failures: {},
        handler() {},
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态边界负例绕过静态检查，验证层级定义仍聚合叶约束错误。
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

void test("defineCli 拒绝同字段上互相矛盾的等值事实", () => {
  const definition = {
    root: "contradictoryFacts",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({ mode: z.string().optional() }),
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "mode", value: "safe" },
              { kind: "equals", field: "mode", value: "force" },
            ],
          },
        ],
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证定义期检查。
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

void test("defineCli 将禁配规则与事实上的未知属性报告为统一身份", () => {
  const definition = {
    root: "unknownUsageProperties",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({ force: z.boolean().optional() }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例绕过静态约束，以验证动态定义期诊断身份。
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

void test("defineCli 将显式 null 交给 usage constraint collection 守卫", () => {
  const definition = {
    root: "nullConstraints",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      nullConstraints: {
        kind: "rootCommand",
        name: "null-constraints",
        description: "空约束",
        fields: {},
        usageConstraints: null,
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证用法约束拒绝。
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

void test("when 成立时按一条规则报告完整条件与全部失败效果", async () => {
  let executions = 0;
  const cli = defineCli()({
    root: "replay",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({
          mode: z.enum(["live", "replay"]).optional(),
          cursor: z.string().optional(),
          token: z.string().optional(),
          feedback: z.boolean().optional(),
        }),
        usageConstraints: [
          {
            kind: "when",
            all: [
              { kind: "equals", field: "mode", value: "replay" },
              { kind: "present", field: "cursor" },
            ],
            then: { require: ["token"], forbid: ["feedback"] },
            otherwise: { forbid: ["token"] },
          },
        ],
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => {
          executions += 1;
          return outcome.completion();
        },
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
  if (invocation.kind !== "usageFailure") assert.fail("应拒绝缺少令牌的调用");
  assert.deepEqual(invocation.issues, [
    {
      code: "conditionalConstraintViolation",
      branch: "then",
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

void test("动态效果字段数组只在运行值实际重叠时产生条件失败", () => {
  const required: readonly ("mode" | "token")[] = ["token"];
  const forbidden: readonly ("mode" | "token")[] = ["mode"];
  const cli = defineCli()({
    root: "dynamicEffects",
    help: englishHelpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
        input: z.object({
          mode: z.string().optional(),
          token: z.string().optional(),
        }),
        usageConstraints: [
          {
            kind: "when",
            all: [{ kind: "present", field: "mode" }],
            then: { require: required, forbid: forbidden },
          },
        ],
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.deepEqual(parseCliInvocation(cli, ["--mode", "live"]), {
    kind: "usageFailure",
    command: "dynamicEffects",
    issues: [
      {
        code: "conditionalConstraintViolation",
        branch: "then",
        conditions: [{ kind: "present", field: "mode", present: true }],
        missingRequiredFields: ["token"],
        presentForbiddenFields: ["mode"],
      },
    ],
    usage: {
      command: "dynamicEffects",
      synopsis: "dynamic-effects [--mode <mode>] [--token <token>]",
    },
  });
});

void test("动态 when 效果保留混合数组中可知的错字段定位", () => {
  const constraints: readonly UsageConstraint[] = [
    {
      kind: "when",
      all: [{ kind: "present", field: "auth" }],
      then: { require: ["missing", "quiet"] },
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
          member: "then.require",
          field: "missing",
        },
      ]);
      return true;
    },
  );
});
