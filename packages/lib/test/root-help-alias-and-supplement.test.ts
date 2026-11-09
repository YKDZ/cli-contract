import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  text,
  versionCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability, englishHelpWording } from "./english-help.ts";

function createAliasedHierarchy(onRun: () => void = () => undefined) {
  const define = defineCli();
  const supplement = text.lines(["先完成准备。", "", "随后执行任务。"]);
  const sharedInput0 = z.object({});
  const cli = define({
    root: "workspace",
    help: helpCapability({
      shortAlias: "-h",
      wording: englishHelpWording,
      headings: {
        usage: "用法",
        commands: "命令",
        arguments: "参数",
        options: "选项",
        constraints: "约束",
        supplement: "补充",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        description: "工作区",
        helpSupplement: supplement,
      },
      tasks: {
        kind: "commandGroup",
        parent: "workspace",
        name: "task",
        description: "任务",
      },
      ...define.command("runTask")({
        kind: "command",
        parent: "tasks",
        name: "run",
        description: "运行任务",
        input: sharedInput0,

        outputs: define.outputModes("runTask", sharedInput0, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => {
                onRun();
                return outcome.completion();
              },
            }),
          },
        })),
      }),
    },
  });
  return { cli, supplement };
}

void test("根级 -h 配置机械投影到 controls、各节点 parser 与完整帮助", async () => {
  let runs = 0;
  const { cli, supplement } = createAliasedHierarchy(() => {
    runs += 1;
  });

  assert.deepEqual(cli.grammar.controls.help, {
    longOption: "--help",
    shortAlias: "-h",
    wording: englishHelpWording,
    headings: {
      usage: "用法",
      commands: "命令",
      arguments: "参数",
      options: "选项",
      constraints: "约束",
      supplement: "补充",
    },
  });
  assert.deepEqual(cli.manifest.controls.help, cli.grammar.controls.help);
  assert.deepEqual(cli.grammar.root.helpSupplement, supplement.lines);
  assert.deepEqual(
    cli.manifest.commands.workspace.helpSupplement,
    supplement.lines,
  );
  assert.notEqual(cli.grammar.root.helpSupplement, supplement.lines);
  assert.equal(Object.isFrozen(cli.grammar.root.helpSupplement), true);
  assert.equal(
    Object.isFrozen(cli.manifest.commands.workspace.helpSupplement),
    true,
  );

  assert.deepEqual(parseCliInvocation(cli, ["--help"]), {
    kind: "help",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["-h"]), {
    kind: "help",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["task", "--help"]), {
    kind: "help",
    command: "tasks",
  });
  assert.deepEqual(parseCliInvocation(cli, ["task", "run", "--help"]), {
    kind: "help",
    command: "runTask",
  });
  assert.deepEqual(parseCliInvocation(cli, ["task", "-h"]), {
    kind: "help",
    command: "tasks",
  });
  assert.deepEqual(parseCliInvocation(cli, ["task", "run", "-h"]), {
    kind: "help",
    command: "runTask",
  });

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, [
      "task",
      "run",
      "--output",
      "structured",
      "-h",
      "ignored",
    ]),
    dependencies: undefined,
    write: (output) => {
      writes.push(output);
    },
  });
  assert.equal(runs, 0);
  assert.deepEqual(writes, [
    {
      destination: "stdout",
      chunk:
        '运行任务\n\n用法\n  workspace task run [--output <mode>]\n\n选项\n  --help, -h\n  --output <mode> (choices: "structured") (default: "structured")\n  structured (atomic, structured)\n    结构化输出\n',
    },
  ]);
  assert.deepEqual(termination, {
    kind: "help",
    command: "runTask",
    exitCode: 0,
  });

  const groupWrites: Array<Readonly<{ destination: string; chunk: string }>> =
    [];
  const groupTermination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["task", "-h"]),
    dependencies: undefined,
    write: (output) => {
      groupWrites.push(output);
    },
  });
  assert.equal(runs, 0);
  assert.deepEqual(groupWrites, [
    {
      destination: "stdout",
      chunk:
        "任务\n\n用法\n  workspace task <command>\n\n命令\n  run\n    运行任务\n\n选项\n  --help, -h\n",
    },
  ]);
  assert.deepEqual(groupTermination, {
    kind: "help",
    command: "tasks",
    exitCode: 0,
  });

  const rootWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      rootWrites.push(chunk);
    },
  });
  assert.deepEqual(rootWrites, [
    "工作区\n\n用法\n  workspace <command>\n\n命令\n  task <command>\n    任务\n\n选项\n  --help, -h\n\n补充\n  先完成准备。\n\n  随后执行任务。\n",
  ]);
});

void test("未启用短别名时 -h 保留给字段且帮助不注入补充", () => {
  const sharedInput1 = z.object({ help: z.boolean().optional() });
  const cli = defineCli()({
    root: "quiet",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      quiet: {
        kind: "rootCommand",
        name: "quiet",
        description: "安静执行",
        fields: {
          help: {
            kind: "flag",
            longOption: "--application-help",
            shortAlias: "-h",
            description: "应用字段",
          },
        },
        input: sharedInput1,

        outputs: defineCli().outputModes("quiet", sharedInput1, (mode) => ({
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

  assert.equal(cli.grammar.controls.help.longOption, "--help");
  assert.equal(cli.grammar.controls.help.shortAlias, undefined);
  assert.equal(
    cli.grammar.controls.help.wording?.choices,
    englishHelpWording.choices,
  );
  assert.equal(cli.grammar.root.helpSupplement, undefined);
  assert.equal(cli.manifest.commands.quiet.helpSupplement, undefined);
  assert.deepEqual(parseCliInvocation(cli, ["-h"]), {
    kind: "parsed",
    command: "quiet",
    input: { help: true },
    outputMode: "structured",
  });
});

void test("缺席标题只省略标题行，空段落不注入默认文案", async () => {
  const sharedInput2 = z.object({});
  const cli = defineCli()({
    root: "minimal",
    help: englishHelpCapability({ headings: { usage: "用法" } }),

    usageFailureExitCode: 64,
    commands: {
      minimal: {
        kind: "rootCommand",
        name: "minimal",
        description: "最小命令",
        input: sharedInput2,

        outputs: defineCli().outputModes("minimal", sharedInput2, (mode) => ({
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
  assert.deepEqual(writes, [
    '最小命令\n\n用法\n  minimal [--output <mode>]\n\n  --help\n  --output <mode> (choices: "structured") (default: "structured")\n  structured (atomic, structured)\n    结构化输出\n',
  ]);
  assert.doesNotMatch(
    writes.join(""),
    /^(?:命令|参数|选项|约束|补充|显示帮助)$/m,
  );
});

void test("-h 与字段及其他 control spelling 在定义期聚合，伪造补充被拒绝", () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证帮助配置拒绝。
  assert.throws(() => helpCapability({ shortAlias: "-x" } as never), TypeError);
  for (const headings of [
    { usage: "" },
    { commands: "命令\n列表" },
    { arguments: "参数\r列表" },
    { options: "选项\0列表" },
    { extra: "额外" },
  ]) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证帮助配置拒绝。
    assert.throws(() => helpCapability({ headings } as never), TypeError);
  }

  const define = defineCli();
  const sharedInput3 = z.object({ help: z.boolean().optional() });
  assert.throws(
    () =>
      define({
        root: "workspace",
        help: helpCapability({
          shortAlias: "-h",
          wording: englishHelpWording,
        }),

        usageFailureExitCode: 64,
        commands: {
          workspace: {
            kind: "rootGroup",
            name: "workspace",
            description: "工作区",
          },
          package: {
            kind: "commandGroup",
            parent: "workspace",
            name: "package",
            description: "包",
          },
          ...define.command("listPackages")({
            kind: "command",
            parent: "package",
            name: "list",
            description: "列出包",
            fields: {
              help: {
                kind: "flag",
                longOption: "--application-help",
                shortAlias: "-h",
                description: "帮助",
              },
            },
            input: sharedInput3,

            outputs: define.outputModes(
              "listPackages",
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
          }),
        },
      }),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "listPackages",
          field: "help",
          spelling: "-h",
          control: "help",
        },
      ]);
      return true;
    },
  );

  const sharedInput0 = z.object({
    help: z.boolean().optional(),
    version: z.boolean().optional(),
    format: z.boolean().optional(),
    json: z.boolean().optional(),
  });
  assert.throws(
    () =>
      defineCli()({
        root: "conflict",
        help: helpCapability({
          shortAlias: "-h",
          wording: englishHelpWording,
        }),
        version: versionCapability({
          value: text.line("1.0.0"),
          shortAlias: "-V",
        }),

        usageFailureExitCode: 64,
        commands: {
          conflict: {
            kind: "rootCommand",
            name: "conflict",
            description: "冲突",
            fields: {
              help: {
                kind: "flag",
                longOption: "--application-help",
                shortAlias: "-h",
                description: "帮助",
              },
              version: {
                kind: "flag",
                longOption: "--application-version",
                shortAlias: "-V",
                description: "版本",
              },
              format: {
                kind: "flag",
                longOption: "--output",
                description: "格式",
              },
              json: {
                kind: "flag",
                longOption: "--json",
                description: "JSON",
              },
            },
            input: sharedInput0,

            outputs: defineCli().outputModes(
              "conflict",
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
                  text: mode.atomic({
                    description: "文本输出",
                    format: "text",
                    success: { kind: "completion", text: () => text.silent },
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
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "conflict",
          field: "help",
          spelling: "-h",
          control: "help",
        },
        {
          code: "fieldOptionConflictsWithControl",
          command: "conflict",
          field: "version",
          spelling: "-V",
          control: "version",
        },
        {
          code: "fieldOptionConflictsWithControl",
          command: "conflict",
          field: "format",
          spelling: "--output",
          control: "outputMode",
        },
      ]);
      return true;
    },
  );

  const sharedInput4 = z.object({});
  assert.throws(
    () =>
      defineCli()({
        root: "forged",
        help: englishHelpCapability(),

        usageFailureExitCode: 64,
        commands: {
          forged: {
            kind: "rootCommand",
            name: "forged",
            description: "伪造",
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证帮助配置拒绝。
            helpSupplement: { kind: "lines", lines: ["伪造"] } as never,
            input: sharedInput4,

            outputs: defineCli().outputModes(
              "forged",
              sharedInput4,
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
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "invalidHelpSupplement", command: "forged" },
      ]);
      return true;
    },
  );
});
