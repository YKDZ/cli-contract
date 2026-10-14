import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  outputCapability,
  parseCliInvocation,
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
          { kind: "requires", field: "auth", requires: "token" },
          { kind: "exclusive", fields: ["output", "quiet"] },
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
    '{"schemaVersion":"2","command":"publish","kind":"usageFailure","issues":[{"code":"requiredByUsageConstraint","field":"auth","requires":"token"},{"code":"exclusiveUsageConstraint","fields":["output","quiet"]},{"code":"forbiddenCombinationViolation","facts":[{"kind":"equals","field":"format","value":"json"},{"kind":"equals","field":"quiet","value":true}]}],"usage":"publish [--auth <auth>] [--token <token>] [--output <output>] [--quiet] [--format <format>]","helpArgv":["publish","--help"]}\n',
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

void test("同一约束事实投影到 grammar、manifest、Draft 2020-12 与 help", async () => {
  const cli = createConstrainedCli();
  const constraints = [
    { kind: "requires", field: "auth", requires: "token" },
    { kind: "exclusive", fields: ["output", "quiet"] },
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
          {
            properties: { format: { const: "json" } },
            required: ["format"],
          },
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
    /--help\n\n  auth requires token\n  exclusive output, quiet\n  forbidden combination of format="json", quiet=true\n$/,
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
            all: [
              { kind: "equals", field: "tag", value: "nightly" },
              { kind: "equals", field: "force", value: "yes" },
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

void test("defineCli 聚合拒绝无效成员形状与动态候选值", () => {
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
            all: [{ kind: "equals", field: "force", value: 42 }],
          },
          { kind: "exclusive", fields: "force" },
          { kind: "forbiddenCombination", all: [] },
          { kind: "predicate" },
          {
            kind: "forbiddenCombination",
            all: [{ kind: "equals", field: "mode", value: "toml" }],
          },
          {
            kind: "forbiddenCombination",
            all: [{ kind: "equals", field: "force", value: false }],
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
        {
          code: "invalidUsageConstraintValue",
          command: "invalidShapes",
          constraint: "forbiddenCombination",
          index: 6,
          member: "all.value",
          field: "mode",
          actual: "toml",
          expected: ["safe", "force"],
        },
        {
          code: "invalidUsageConstraintValue",
          command: "invalidShapes",
          constraint: "forbiddenCombination",
          index: 7,
          member: "all.value",
          field: "force",
          actual: false,
          expected: true,
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
