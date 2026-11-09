import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  parseCliInvocation,
  text,
  versionCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

function createVersionCli(
  onSchema: () => void = () => undefined,
  onHandler: () => void = () => undefined,
) {
  const define = defineCli<Readonly<{ readonly serviceName: string }>>();
  const sharedInput0 = z.object({ name: z.string() }).superRefine(() => {
    onSchema();
  });
  return define({
    root: "workspace",
    help: englishHelpCapability(),
    version: versionCapability({
      value: text.line("2.3.4"),
      description: "显示版本",
      shortAlias: "-V",
    }),

    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        description: "工作区",
      },
      ...define.command("runTask")({
        kind: "command",
        parent: "workspace",
        name: "run",
        description: "运行任务",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "任务名称",
          },
        },
        input: sharedInput0,

        outputs: define.outputModes("runTask", sharedInput0, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ dependencies, outcome }) => {
                dependencies.serviceName satisfies string;
                onHandler();
                return outcome.completion();
              },
            }),
          },
        })),
      }),
    },
  });
}

void test("未装配 version 时不投影 spelling 或版本请求", () => {
  const sharedInput0 = z.object({});
  const cli = defineCli()({
    root: "quiet",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      quiet: {
        kind: "rootCommand",
        name: "quiet",
        description: "安静完成",
        input: sharedInput0,

        outputs: defineCli().outputModes("quiet", sharedInput0, (mode) => ({
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

  assert.equal(cli.grammar.controls.version, undefined);
  assert.equal(cli.manifest.controls.version, undefined);
  assert.deepEqual(parseCliInvocation(cli, ["--version"]), {
    kind: "usageFailure",
    command: "quiet",
    issues: [{ code: "unknownOption", position: 0, option: "--version" }],
    usage: { command: "quiet", synopsis: "quiet [--output <mode>]" },
  });
});

void test("version 全树装配并准确投影显式事实", () => {
  const cli = createVersionCli();
  assert.deepEqual(cli.grammar.controls.version, {
    longOption: "--version",
    shortAlias: "-V",
    value: "2.3.4",
    description: "显示版本",
  });
  assert.deepEqual(cli.manifest.controls.version, cli.grammar.controls.version);
  assert.deepEqual(parseCliInvocation(cli, ["--version"]), {
    kind: "version",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["-V"]), {
    kind: "version",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["run", "--version"]), {
    kind: "version",
    command: "runTask",
  });
});

void test("第一个 recognized eager control 短路后续格式、schema 与 handler", async () => {
  let schemaCalls = 0;
  let handlerCalls = 0;
  const cli = createVersionCli(
    () => {
      schemaCalls += 1;
    },
    () => {
      handlerCalls += 1;
    },
  );

  assert.deepEqual(parseCliInvocation(cli, ["--help", "--version"]), {
    kind: "help",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["--version", "--help"]), {
    kind: "version",
    command: "workspace",
  });
  assert.deepEqual(
    parseCliInvocation(cli, [
      "run",
      "--output",
      "structured",
      "--version",
      "--output",
      "structured",
      "--name",
    ]),
    { kind: "version", command: "runTask" },
  );
  assert.deepEqual(parseCliInvocation(cli, ["run", "--output", "--version"]), {
    kind: "version",
    command: "runTask",
  });
  assert.deepEqual(parseCliInvocation(cli, ["run", "--name", "--version"]), {
    kind: "version",
    command: "runTask",
  });

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const invocation = parseCliInvocation(cli, [
    "run",
    "--output",
    "structured",
    "--version",
    "--name",
  ]);
  if (invocation.kind !== "version") {
    assert.fail("预期解析为 version 请求");
  }
  const termination = await executeCli(cli, {
    invocation,
    write: (output) => {
      writes.push(output);
    },
  });
  assert.equal(schemaCalls, 0);
  assert.equal(handlerCalls, 0);
  assert.deepEqual(writes, [{ destination: "stdout", chunk: "2.3.4\n" }]);
  assert.deepEqual(termination, {
    kind: "version",
    command: "runTask",
    exitCode: 0,
  });
});

void test("version 与 help 保持独立请求、终止身份且帮助只使用显式描述", async () => {
  const cli = createVersionCli();
  const versionWrites: string[] = [];
  const helpWrites: string[] = [];
  const versionInvocation = parseCliInvocation(cli, ["--version"]);
  if (versionInvocation.kind !== "version") {
    assert.fail("预期解析为 version 请求");
  }
  const version = await executeCli(cli, {
    invocation: versionInvocation,
    write: ({ chunk }) => {
      versionWrites.push(chunk);
    },
  });
  const helpInvocation = parseCliInvocation(cli, ["--help"]);
  if (helpInvocation.kind !== "help") {
    assert.fail("预期解析为 help 请求");
  }
  const help = await executeCli(cli, {
    invocation: helpInvocation,
    write: ({ chunk }) => {
      helpWrites.push(chunk);
    },
  });
  assert.equal(version.kind, "version");
  assert.equal(help.kind, "help");
  assert.deepEqual(versionWrites, ["2.3.4\n"]);
  assert.match(helpWrites.join(""), /  --version, -V\n    显示版本\n/);
  assert.doesNotMatch(versionWrites.join(""), /workspace|v2\.3\.4/);
});

void test("版本值与所有 control spelling 在定义期闭合", () => {
  assert.throws(
    () =>
      versionCapability({
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意越过静态类型，以验证版本能力边界。
        value: { kind: "line", value: "2.3.4\n" } as never,
      }),
    TypeError,
  );

  for (const [field, spelling, control] of [
    ["help", "--help", "help"],
    ["version", "--version", "version"],
    ["shortVersion", "-V", "version"],
  ] as const) {
    const fieldDefinition =
      spelling === "-V"
        ? {
            kind: "flag" as const,
            longOption: "--short-version",
            shortAlias: spelling,
            description: "冲突字段",
          }
        : {
            kind: "flag" as const,
            longOption: spelling,
            description: "冲突字段",
          };
    const sharedInput1 = z.object({ [field]: z.boolean().optional() });
    assert.throws(
      () =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意越过静态类型，以验证版本能力边界。
        defineCli()({
          root: "conflict",
          help: englishHelpCapability(),
          version: versionCapability({
            value: text.line("2.3.4"),
            shortAlias: "-V",
          }),

          usageFailureExitCode: 64,
          commands: {
            conflict: {
              kind: "rootCommand",
              name: "conflict",
              description: "冲突",
              fields: {
                [field]: fieldDefinition,
              },
              input: sharedInput1,

              outputs: defineCli().outputModes(
                "conflict",
                sharedInput1,
                (mode) => ({
                  default: "structured",
                  modes: {
                    structured: mode.atomic({
                      description: "结构化输出",
                      format: "structured",
                      success: { kind: "completion" },
                      failures: {},
                      handler: () => undefined as never,
                    }),
                  },
                }),
              ),
            },
          },
        } as never),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "fieldOptionConflictsWithControl",
            command: "conflict",
            field,
            spelling,
            control,
          },
        ]);
        return true;
      },
    );
  }
});

void test("version capability 复制并闭合单行 value 与 description", async () => {
  assert.throws(
    () =>
      versionCapability({
        value: text.line("2.3.4"),
        description: "显示版本\n注入内容",
      }),
    TypeError,
  );

  const externalValue = { kind: "line", value: "2.3.4" };
  const version = versionCapability({
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意越过静态类型，以验证版本能力边界。
    value: externalValue as never,
    description: "显示版本",
  });
  assert.equal(Object.isFrozen(version), true);
  externalValue.value = "2.3.4\n注入内容";
  const sharedInput2 = z.object({});
  const cli = defineCli()({
    root: "copy",
    help: englishHelpCapability(),
    version,

    usageFailureExitCode: 64,
    commands: {
      copy: {
        kind: "rootCommand",
        name: "copy",
        description: "复制事实",
        input: sharedInput2,

        outputs: defineCli().outputModes("copy", sharedInput2, (mode) => ({
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
  assert.deepEqual(cli.grammar.controls.version, {
    longOption: "--version",
    value: "2.3.4",
    description: "显示版本",
  });
  const versionWrites: string[] = [];
  const helpWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--version"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      versionWrites.push(chunk);
    },
  });
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      helpWrites.push(chunk);
    },
  });
  assert.deepEqual(versionWrites, ["2.3.4\n"]);
  assert.match(helpWrites.join(""), /  --version\n    显示版本\n/);
  assert.doesNotMatch(helpWrites.join(""), /注入内容/);
});

void test("层级叶命令的应用选项与 version control 冲突时报告叶身份", () => {
  const define = defineCli();
  const sharedInput3 = z.object({ version: z.boolean().optional() });
  assert.throws(
    () =>
      define({
        root: "workspace",
        help: englishHelpCapability(),
        version: versionCapability({ value: text.line("2.3.4") }),

        usageFailureExitCode: 64,
        commands: {
          workspace: {
            kind: "rootGroup",
            name: "workspace",
            description: "工作区",
          },
          ...define.command("listPackages")({
            kind: "command",
            parent: "workspace",
            name: "list",
            description: "列出包",
            fields: {
              version: {
                kind: "flag",
                longOption: "--version",
                description: "冲突字段",
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
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "listPackages",
          field: "version",
          spelling: "--version",
          control: "version",
        },
      ]);
      return true;
    },
  );
});
