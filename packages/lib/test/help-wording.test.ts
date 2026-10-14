import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  text,
  type HelpCapabilityDefinition,
} from "@ykdz/cli-contract";
import { z } from "zod";

void test("帮助事实模板表达候选值和默认值，保留 schema 中的值", async () => {
  const cli = defineCli()({
    root: "choose",
    help: helpCapability({
      wording: {
        choices: "（可选：{choices}）",
        default: "（预设：{value}）",
      },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "choose",
        description: "选择模式",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input: z.object({ mode: z.enum(["safe", "force"]).default("safe") }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
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
    /\[--mode <mode>\] （可选："safe", "force"） （预设："safe"）/,
  );
});

void test("提取的帮助事实未知槽位报告闭合定义问题", () => {
  const definition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"choises":"候选 {choices}","defalt":"默认 {value}"}}',
  );

  assert.throws(
    () => helpCapability(definition),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "choises"],
        },
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "defalt"],
        },
      ]);
      return true;
    },
  );
});

void test("帮助文案中未知槽位与已知模板问题同次聚合", () => {
  assert.throws(
    () =>
      helpCapability({
        wording: {
          choises: "候选 {choices}",
          choices: "候选 {choises}",
        } as never,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "choises"],
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "候选 {choises}",
          reason: "placeholder",
        },
      ]);
      return true;
    },
  );
});

void test("仅已知模板错误仍在根装配时与叶约束问题聚合", () => {
  const helpDefinition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"choices":"候选 {choises}"}}',
  );
  const definition = {
    root: "choose",
    help: helpCapability(helpDefinition),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "choose",
        description: "选择模式",
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
            all: [{ kind: "present", field: "missing" }],
          },
        ],
        success: { kind: "completion" },
        failures: {},
        handler() {},
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态闭合负例验证根级问题仍与叶约束问题聚合。
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "候选 {choises}",
          reason: "placeholder",
        },
        {
          code: "unknownUsageConstraintField",
          command: "choose",
          constraint: "forbiddenCombination",
          index: 0,
          member: "all.field",
          field: "missing",
        },
      ]);
      return true;
    },
  );
});

void test("已声明帮助事实缺少模板时在定义期报告命令与槽位", () => {
  assert.throws(
    () =>
      defineCli()({
        root: "choose",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          choose: {
            kind: "rootCommand",
            name: "choose",
            description: "选择模式",
            fields: {
              mode: {
                kind: "valueOption",
                longOption: "--mode",
                description: "模式",
              },
            },
            input: z.object({
              mode: z.enum(["safe", "force"]).default("safe"),
            }),
            usageConstraints: [
              {
                kind: "forbiddenCombination",
                all: [
                  { kind: "present", field: "mode" },
                  { kind: "equals", field: "mode", value: "force" },
                ],
              },
            ],
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "missingHelpFactTemplate", command: "choose", slot: "choices" },
        { code: "missingHelpFactTemplate", command: "choose", slot: "default" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "forbiddenCombination",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "present" },
        { code: "missingHelpFactTemplate", command: "choose", slot: "equals" },
      ]);
      return true;
    },
  );
});

void test("动态帮助事实模板在根装配时聚合报告非法槽位", () => {
  const wording: { readonly choices: string; readonly default: string } = {
    choices: "（可选值：{unknown}）",
    default: "默认值\n{value}",
  };
  assert.throws(
    () =>
      defineCli()({
        root: "choose",
        help: helpCapability({ wording }),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          choose: {
            kind: "rootCommand",
            name: "choose",
            description: "选择模式",
            fields: {
              mode: {
                kind: "valueOption",
                longOption: "--mode",
                description: "模式",
              },
            },
            input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "（可选值：{unknown}）",
          reason: "placeholder",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "default"],
          slot: "default",
          received: "默认值\n{value}",
          reason: "singleLine",
        },
      ]);
      return true;
    },
  );
});

void test("命令组占位词静态与动态判断同界", () => {
  const invalidTemplates = [
    { received: "   ", reason: "empty" },
    { received: "<命令组>", reason: "placeholder" },
  ] as const;

  for (const { received, reason } of invalidTemplates) {
    const wording: { readonly commandPlaceholder: string } = {
      commandPlaceholder: received,
    };
    assert.throws(
      () =>
        defineCli()({
          root: "choose",
          help: helpCapability({ wording }),
          output: outputCapability({ defaultFormat: "structured" }),
          usageFailureExitCode: 64,
          commands: {
            choose: {
              kind: "rootCommand",
              name: "choose",
              description: "选择模式",
              input: z.object({}),
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "invalidHelpFactTemplate",
            path: ["help", "wording", "commandPlaceholder"],
            slot: "commandPlaceholder",
            received,
            reason,
          },
        ]);
        return true;
      },
    );
  }
});

void test("命令组缺少占位词时在定义期报告根身份", () => {
  const define = defineCli();
  assert.throws(
    () =>
      define({
        root: "tool",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          tool: { kind: "rootGroup", name: "tool", description: "工具" },
          ...define.command("run")({
            kind: "command",
            parent: "tool",
            name: "run",
            description: "运行",
            input: z.object({}),
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingHelpFactTemplate",
          command: "tool",
          slot: "commandPlaceholder",
        },
      ]);
      return true;
    },
  );
});

void test("命令组占位词贯穿帮助、用法失败和契约清单", async () => {
  const define = defineCli();
  const cli = define({
    root: "tool",
    help: helpCapability({ wording: { commandPlaceholder: "命令" } }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      tool: { kind: "rootGroup", name: "tool", description: "工具" },
      jobs: {
        kind: "commandGroup",
        parent: "tool",
        name: "jobs",
        description: "任务",
      },
      ...define.command("run")({
        kind: "command",
        parent: "jobs",
        name: "run",
        description: "运行任务",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
    },
  });

  assert.equal(cli.grammar.root.usage.synopsis, "tool <命令>");
  assert.equal(cli.manifest.schemaVersion, "4");
  assert.ok(
    JSON.stringify(cli.manifest.usageFailure.wire).includes("tool <命令>"),
  );
  const failed = parseCliInvocation(cli, ["missing"]);
  assert.equal(failed.kind, "usageFailure");
  if (failed.kind === "usageFailure") {
    assert.equal(failed.usage.synopsis, "tool <命令>");
  }

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(writes.join(""), /tool <命令>/);
  assert.match(writes.join(""), /jobs <命令>/);
});

void test("三类用法约束模板保留关系并允许调整词序", async () => {
  const cli = defineCli()({
    root: "publish",
    help: helpCapability({
      wording: {
        requires: "{requires} 是 {field} 的前提",
        exclusive: "不能同时使用 {fields}",
        present: "存在 {field}",
        equals: "{field} 等于 {value}",
        forbiddenCombination: "禁止同时出现 {facts}",
      },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      publish: {
        kind: "rootCommand",
        name: "publish",
        description: "发布",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "认证",
          },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "令牌",
          },
          quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
          force: { kind: "flag", longOption: "--force", description: "强制" },
        },
        usageConstraints: [
          { kind: "requires", field: "auth", requires: "token" },
          { kind: "exclusive", fields: ["token", "quiet"] },
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "quiet", value: true },
              { kind: "equals", field: "force", value: true },
            ],
          },
        ],
        input: z.object({
          auth: z.string().optional(),
          token: z.string().optional(),
          quiet: z.boolean().optional(),
          force: z.boolean().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
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
  const help = writes.join("");
  assert.match(help, /token 是 auth 的前提/);
  assert.match(help, /不能同时使用 token, quiet/);
  assert.match(help, /禁止同时出现 quiet 等于 true, force 等于 true/);
});

void test("输出格式控制复用候选值和默认值模板", async () => {
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        choices: "（候选：{choices}）",
        default: "（默认：{value}）",
      },
    }),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      show: {
        kind: "rootCommand",
        name: "show",
        description: "显示",
        input: z.object({}),
        success: { kind: "completion", text: () => text.silent },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
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
    /--output-format <structured\|text> （候选："structured", "text"） （默认："text"）/,
  );
});

void test("输出格式控制需要的模板缺失时定义失败", () => {
  assert.throws(
    () =>
      defineCli()({
        root: "show",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "text" }),
        usageFailureExitCode: 64,
        commands: {
          show: {
            kind: "rootCommand",
            name: "show",
            description: "显示",
            input: z.object({}),
            success: { kind: "completion", text: () => text.silent },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "missingHelpFactTemplate", command: "show", slot: "choices" },
        { code: "missingHelpFactTemplate", command: "show", slot: "default" },
      ]);
      return true;
    },
  );
});
