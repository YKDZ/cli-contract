import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@ykdz/cli-contract";
import { z } from "zod";

function createConstrainedCli(handler = () => undefined) {
  return defineCli()({
    root: "publish",
    help: helpCapability(),
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
    /auth requires token\nexclusive output, quiet\nforbidden format=json, quiet=true\n--help\n$/,
  );
});

void test("defineCli 以局部身份拒绝无效约束引用、字段种类、值和矛盾", () => {
  const definition = {
    root: "invalidConstraints",
    help: helpCapability(),
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
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
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
    help: helpCapability(),
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
    help: helpCapability(),
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
