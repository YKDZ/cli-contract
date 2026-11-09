import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  text,
  type HelpCapabilityDefinition,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpWording } from "./english-help.ts";

void test("帮助事实模板表达候选值和默认值，保留 schema 中的值", async () => {
  const sharedInput0 = z.object({
    mode: z.enum(["safe", "force"]).default("safe"),
  });
  const cli = defineCli()({
    root: "choose",
    help: helpCapability({
      wording: {
        choices: "（可选：{choices}）",
        default: "（预设：{value}）",
      },
    }),

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
        input: sharedInput0,

        outputs: defineCli().outputModes("choose", sharedInput0, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
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
    '{"wording":{"choices":"候选 {choises}","default":"默认 {value}"}}',
  );
  const sharedInput1 = z.object({ mode: z.enum(["safe", "force"]).optional() });
  const definition = {
    root: "choose",
    help: helpCapability(helpDefinition),

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
        input: sharedInput1,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [{ kind: "present", field: "missing" }],
          },
        ],

        outputs: defineCli().outputModes("choose", sharedInput1, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler() {
                return undefined as never;
              },
            }),
          },
        })),
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
  const sharedInput0 = z.object({
    mode: z.enum(["safe", "force"]).default("safe"),
  });
  assert.throws(
    () =>
      defineCli()({
        root: "choose",
        help: helpCapability(),

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
            input: sharedInput0,
            usageConstraints: [
              {
                kind: "when",
                all: [{ kind: "present", field: "mode" }],
                onMatch: { require: ["mode"] },
              },
              {
                kind: "when",
                all: [{ kind: "present", field: "mode" }],
                otherwise: { forbid: ["mode"] },
              },
              {
                kind: "when",
                all: [{ kind: "equals", field: "mode", value: "force" }],
                onMatch: { require: ["mode"] },
                otherwise: { forbid: ["mode"] },
              },
              {
                kind: "forbiddenCombination",
                all: [
                  { kind: "present", field: "mode" },
                  { kind: "equals", field: "mode", value: "force" },
                ],
              },
            ],

            outputs: defineCli().outputModes(
              "choose",
              sharedInput0,
              (mode) => ({
                default: "structured",
                modes: {
                  structured: mode.atomic({
                    description: "结构化输出",
                    format: "structured",
                    success: { kind: "completion" },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  }),
                },
              }),
            ),
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
          slot: "whenOnMatch",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "present" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "require",
        },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "whenOtherwise",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "forbid" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "whenOnMatchOtherwise",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "equals" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "forbiddenCombination",
        },
      ]);
      return true;
    },
  );
});

void test("输出方式的候选与默认事实缺少作者模板时在定义期报告", () => {
  const define = defineCli();
  const input = z.object({});

  assert.throws(
    () =>
      define({
        root: "show",
        help: helpCapability(),
        usageFailureExitCode: 64,
        commands: {
          show: {
            kind: "rootCommand",
            name: "show",
            description: "显示",
            input,
            outputs: define.outputModes("show", input, (mode) => ({
              default: "json",
              modes: {
                json: mode.atomic({
                  description: "结构化输出",
                  format: "structured",
                  success: { kind: "completion" },
                  failures: {},
                  handler: ({ outcome }) => outcome.completion(),
                }),
              },
            })),
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

void test("空效果分支不要求对应帮助槽位", async () => {
  const sharedInput2 = z.object({ mode: z.string().optional() });
  const cli = defineCli()({
    root: "choose",
    help: helpCapability({
      wording: {
        ...englishHelpWording,
        whenOtherwise: "当并非全部满足 {facts} 时，{otherwise}",
        forbid: "不能提供 {fields}",
        present: "存在 {field}",
      },
    }),

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
        input: sharedInput2,
        usageConstraints: [
          {
            kind: "when",
            all: [{ kind: "present", field: "mode" }],
            onMatch: {},
            otherwise: { forbid: ["mode"] },
          },
        ],

        outputs: defineCli().outputModes("choose", sharedInput2, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
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
  assert.match(writes.join(""), /当并非全部满足 存在 mode 时，不能提供 mode/);
});

void test("动态帮助事实模板在根装配时聚合报告非法槽位", () => {
  const wording: { readonly choices: string; readonly default: string } = {
    choices: "（可选值：{unknown}）",
    default: "默认值\n{value}",
  };
  const sharedInput3 = z.object({ mode: z.enum(["safe", "force"]).optional() });
  assert.throws(
    () =>
      defineCli()({
        root: "choose",
        help: helpCapability({ wording }),

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
            input: sharedInput3,

            outputs: defineCli().outputModes(
              "choose",
              sharedInput3,
              (mode) => ({
                default: "structured",
                modes: {
                  structured: mode.atomic({
                    description: "结构化输出",
                    format: "structured",
                    success: { kind: "completion" },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  }),
                },
              }),
            ),
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

void test("帮助模板错误保留非法原值并继续聚合定义期问题", () => {
  const helpDefinition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"choices":42,"default":null,"countExactly":{},"whenOnMatch":"满足 {unknown}"}}',
  );
  const sharedInput4 = z.object({});
  const definition = {
    root: "choose",
    help: helpCapability(helpDefinition),

    usageFailureExitCode: 0,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "选择模式",
        description: "选择模式",
        input: sharedInput4,

        outputs: defineCli().outputModes("choose", sharedInput4, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
      },
    },
  };

  assert.throws(
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: 42,
          reason: "singleLine",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "default"],
          slot: "default",
          received: null,
          reason: "singleLine",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "countExactly"],
          slot: "countExactly",
          received: {},
          reason: "singleLine",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "whenOnMatch"],
          slot: "whenOnMatch",
          received: "满足 {unknown}",
          reason: "placeholder",
        },
        {
          code: "invalidUsageFailureExitCode",
          received: 0,
          minimum: 1,
          maximum: 255,
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
    const wording: {
      readonly commandPlaceholder: string;
      readonly choices: string;
      readonly default: string;
    } = {
      commandPlaceholder: received,
      choices: englishHelpWording.choices,
      default: englishHelpWording.default,
    };
    const sharedInput5 = z.object({});
    assert.throws(
      () =>
        defineCli()({
          root: "choose",
          help: helpCapability({ wording }),

          usageFailureExitCode: 64,
          commands: {
            choose: {
              kind: "rootCommand",
              name: "choose",
              description: "选择模式",
              input: sharedInput5,

              outputs: defineCli().outputModes(
                "choose",
                sharedInput5,
                (mode) => ({
                  default: "structured",
                  modes: {
                    structured: mode.atomic({
                      description: "结构化输出",
                      format: "structured",
                      success: { kind: "completion" },
                      failures: {},
                      handler: ({ outcome }) => outcome.completion(),
                    }),
                  },
                }),
              ),
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
  const sharedInput6 = z.object({});
  assert.throws(
    () =>
      define({
        root: "tool",
        help: helpCapability({
          wording: {
            choices: englishHelpWording.choices,
            default: englishHelpWording.default,
          },
        }),

        usageFailureExitCode: 64,
        commands: {
          tool: { kind: "rootGroup", name: "tool", description: "工具" },
          ...define.command("run")({
            kind: "command",
            parent: "tool",
            name: "run",
            description: "运行",
            input: sharedInput6,

            outputs: define.outputModes("run", sharedInput6, (mode) => ({
              default: "structured",
              modes: {
                structured: mode.atomic({
                  description: "结构化输出",
                  format: "structured",
                  success: { kind: "completion" },
                  failures: {},
                  handler: ({ outcome }) => outcome.completion(),
                }),
              },
            })),
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
  const sharedInput7 = z.object({});
  const cli = define({
    root: "tool",
    help: helpCapability({
      wording: {
        commandPlaceholder: "命令",
        choices: englishHelpWording.choices,
        default: englishHelpWording.default,
      },
    }),

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
        input: sharedInput7,

        outputs: define.outputModes("run", sharedInput7, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
      }),
    },
  });

  assert.equal(cli.grammar.root.usage.synopsis, "tool <命令>");
  assert.equal(cli.manifest.schemaVersion, "5");
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

void test("条件分支模板表达全称条件，并允许各槽位调整词序", async () => {
  const sharedInput1 = z.object({
    auth: z.string().optional(),
    token: z.string().optional(),
    quiet: z.boolean().optional(),
    force: z.boolean().optional(),
  });
  const cli = defineCli()({
    root: "publish",
    help: helpCapability({
      wording: {
        ...englishHelpWording,
        whenOnMatch: "当全部满足 {facts} 时，{onMatch}",
        whenOtherwise: "当并非全部满足 {facts} 时，{otherwise}",
        whenOnMatchOtherwise:
          "当全部满足 {facts} 时，{onMatch}；否则，{otherwise}",
        require: "必须提供 {fields}",
        forbid: "不能提供 {fields}",
        present: "存在 {field}",
        equals: "{field} 等于 {value}",
        forbiddenCombination: "禁止同时出现 {facts}",
        countAtMost: "{fields} 的数量不超过 {max}",
      },
    }),

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
          { kind: "count", fields: ["token", "quiet"], max: 1 },
          {
            kind: "when",
            all: [{ kind: "present", field: "auth" }],
            onMatch: { require: ["token"] },
          },
          {
            kind: "when",
            all: [{ kind: "present", field: "quiet" }],
            otherwise: { forbid: ["force"] },
          },
          {
            kind: "when",
            all: [{ kind: "equals", field: "quiet", value: true }],
            onMatch: { require: ["auth"] },
            otherwise: { forbid: ["token"] },
          },
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "quiet", value: true },
              { kind: "equals", field: "force", value: true },
            ],
          },
        ],
        input: sharedInput1,

        outputs: defineCli().outputModes("publish", sharedInput1, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
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
  assert.match(help, /token, quiet 的数量不超过 1/);
  assert.match(help, /当全部满足 存在 auth 时，必须提供 token/);
  assert.match(help, /当并非全部满足 存在 quiet 时，不能提供 force/);
  assert.match(
    help,
    /当全部满足 quiet 等于 true 时，必须提供 auth；否则，不能提供 token/,
  );
  assert.match(help, /禁止同时出现 quiet 等于 true, force 等于 true/);
});

void test("输出格式控制复用候选值和默认值模板", async () => {
  const sharedInput8 = z.object({});
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        choices: "（候选：{choices}）",
        default: "（默认：{value}）",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      show: {
        kind: "rootCommand",
        name: "show",
        description: "显示",
        input: sharedInput8,

        outputs: defineCli().outputModes("show", sharedInput8, (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion", text: () => text.silent },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
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
    /--output <mode> （候选："structured", "text"） （默认："text"）/,
  );
});

void test("输出方式帮助列出根作者提供的候选值与默认值文案", async () => {
  const sharedInput9 = z.object({});
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        choices: "candidates {choices}",
        default: "primary {value}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      show: {
        kind: "rootCommand",
        name: "show",
        description: "显示",
        input: sharedInput9,

        outputs: defineCli().outputModes("show", sharedInput9, (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
            text: mode.atomic({
              description: "文本输出",
              format: "text",
              success: { kind: "completion", text: () => text.silent },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        })),
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
    /--output <mode> candidates "structured", "text" primary "text"/,
  );
  assert.doesNotMatch(writes.join(""), /输出方式/);
});
