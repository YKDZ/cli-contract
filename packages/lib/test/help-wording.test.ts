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
      ]);
      return true;
    },
  );
});

void test("帮助事实模板拒绝缺失或未知占位符及非法单行文本", () => {
  for (const wording of [
    { choices: "（可选值）" },
    { choices: "（{choices}、{other}）" },
    { requires: "{field} 是前提" },
    { default: "默认\n{value}" },
  ]) {
    assert.throws(() => helpCapability({ wording }), TypeError);
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
  assert.equal(cli.manifest.schemaVersion, "3");
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
        forbiddenCombination: "禁止组合 {values}",
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
            values: [
              { field: "quiet", value: true },
              { field: "force", value: true },
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
  assert.match(help, /禁止组合 quiet=true, force=true/);
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
