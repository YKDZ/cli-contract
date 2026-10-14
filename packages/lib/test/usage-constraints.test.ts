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
  type UsageConstraint,
} from "@ykdz/cli-contract";
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
          { kind: "requires", field: "auth", requires: "token" },
          { kind: "exclusive", fields: ["output", "quiet"] },
          {
            kind: "forbiddenCombination",
            values: [
              { field: "format", value: "json" },
              { field: "quiet", value: true },
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
  const dynamicNegative: number = -1;
  const dynamicFraction: number = 0.5;
  const cases: readonly Readonly<{
    readonly constraint: unknown;
    readonly expected: Readonly<Record<string, unknown>>;
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
        assert.deepEqual(error.issues[0], expected);
        return true;
      },
    );
  }
});

void test("三类闭合关系在无歧义解析后按声明顺序聚合，失败不执行 handler", async () => {
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
      { code: "requiredByUsageConstraint", field: "auth", requires: "token" },
      { code: "exclusiveUsageConstraint", fields: ["output", "quiet"] },
      {
        code: "forbiddenUsageCombination",
        values: [
          { field: "format", value: "json" },
          { field: "quiet", value: true },
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
    '{"schemaVersion":"1","command":"publish","kind":"usageFailure","issues":[{"code":"requiredByUsageConstraint","field":"auth","requires":"token"},{"code":"exclusiveUsageConstraint","fields":["output","quiet"]},{"code":"forbiddenUsageCombination","values":[{"field":"format","value":"json"},{"field":"quiet","value":true}]}],"usage":"publish [--auth <auth>] [--token <token>] [--output <output>] [--quiet] [--format <format>]","helpArgv":["publish","--help"]}\n',
  ]);
});

void test("同一约束事实投影到 grammar、manifest、Draft 2020-12 与 help", async () => {
  const cli = createConstrainedCli();
  const constraints = [
    { kind: "requires", field: "auth", requires: "token" },
    { kind: "exclusive", fields: ["output", "quiet"] },
    {
      kind: "forbiddenCombination",
      values: [
        { field: "format", value: "json" },
        { field: "quiet", value: true },
      ],
    },
  ] as const;
  assert.deepEqual(cli.grammar.root.usageConstraints, constraints);
  assert.strictEqual(
    cli.grammar.root.usageConstraints,
    cli.manifest.commands.publish.usageConstraints,
  );
  assert.deepEqual(cli.manifest.commands.publish.input.inputSchema.allOf, [
    Object.fromEntries([
      ["if", { required: ["auth"] }],
      // oxlint-disable-next-line unicorn/no-thenable -- Draft 2020-12 固定关键字。
      ["then", { required: ["token"] }],
    ]),
    {
      not: {
        anyOf: [{ required: ["output", "quiet"] }],
      },
    },
    {
      not: {
        allOf: [
          { properties: { format: { const: "json" } }, required: ["format"] },
          { properties: { quiet: { const: true } }, required: ["quiet"] },
        ],
      },
    },
  ]);

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
    /--help\n\n  auth requires token\n  exclusive output, quiet\n  forbidden format="json", quiet=true\n$/,
  );
});

void test("defineCli 以局部身份拒绝无效约束引用、字段种类、值和矛盾", () => {
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
          source: { kind: "positional", description: "源" },
          tag: {
            kind: "repeatableOption",
            longOption: "--tag",
            description: "标签",
          },
          force: { kind: "flag", longOption: "--force", description: "强制" },
        },
        usageConstraints: [
          { kind: "requires", field: "missing", requires: "force" },
          { kind: "exclusive", fields: ["source", "force"] },
          {
            kind: "forbiddenCombination",
            values: [
              { field: "tag", value: "nightly" },
              { field: "force", value: "yes" },
            ],
          },
          { kind: "requires", field: "force", requires: "force" },
        ],
        input: z.object({
          source: z.string().optional(),
          tag: z.array(z.string()).optional(),
          force: z.boolean().optional(),
        }),
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
      assert.deepEqual(error.issues[0], {
        code: "unknownUsageConstraintField",
        command: "invalidConstraints",
        constraint: "requires",
        index: 0,
        member: "field",
        field: "missing",
      });
      assert.deepEqual(
        error.issues.map(({ code }) => code),
        [
          "unknownUsageConstraintField",
          "inapplicableUsageConstraintField",
          "inapplicableUsageConstraintField",
          "invalidUsageConstraintValue",
          "contradictoryUsageConstraint",
        ],
      );
      return true;
    },
  );
});

void test("defineCli 聚合拒绝动态空、单成员和非数组约束成员", () => {
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
          { kind: "exclusive", fields: [] },
          { kind: "exclusive", fields: ["force"] },
          {
            kind: "forbiddenCombination",
            values: [{ field: "force", value: true }],
          },
          { kind: "exclusive", fields: "force" },
          { kind: "forbiddenCombination", values: [] },
          { kind: "predicate" },
        ],
        input: z.object({
          force: z.boolean().optional(),
          mode: z.string().optional(),
        }),
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
          command: "invalidShapes",
          index: 0,
          aspect: "members",
          received: "exclusive",
        },
        {
          code: "invalidUsageConstraint",
          command: "invalidShapes",
          index: 1,
          aspect: "members",
          received: "exclusive",
        },
        {
          code: "invalidUsageConstraint",
          command: "invalidShapes",
          index: 2,
          aspect: "members",
          received: "forbiddenCombination",
        },
        {
          code: "invalidUsageConstraint",
          command: "invalidShapes",
          index: 3,
          aspect: "members",
          received: "exclusive",
        },
        {
          code: "invalidUsageConstraint",
          command: "invalidShapes",
          index: 4,
          aspect: "members",
          received: "forbiddenCombination",
        },
        {
          code: "invalidUsageConstraint",
          command: "invalidShapes",
          index: 5,
          aspect: "kind",
          received: "predicate",
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
