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
  versionCapability,
} from "@cli-contract/lib";
import { z } from "zod";

function createVersionCli(
  onSchema: () => void = () => undefined,
  onHandler: () => void = () => undefined,
) {
  const define = defineCli();
  return define({
    root: "workspace",
    help: helpCapability(),
    version: versionCapability({
      value: text.line("2.3.4"),
      description: "显示版本",
      shortAlias: "-V",
    }),
    output: outputCapability({ defaultFormat: "structured", text: true }),
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
        input: z.object({ name: z.string() }).superRefine(() => {
          onSchema();
        }),
        success: { kind: "completion", text: () => text.silent },
        failures: {},
        handler: ({ outcome }) => {
          onHandler();
          return outcome.completion();
        },
      }),
    },
  });
}

void test("未装配 version 时不投影 spelling 或版本请求", () => {
  const cli = defineCli()({
    root: "quiet",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      quiet: {
        kind: "rootCommand",
        name: "quiet",
        description: "安静完成",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.equal(cli.grammar.controls.version, undefined);
  assert.equal(cli.manifest.controls.version, undefined);
  assert.deepEqual(parseCliInvocation(cli, ["--version"]), {
    kind: "usageFailure",
    command: "quiet",
    issues: [{ code: "unknownOption", position: 0, option: "--version" }],
    usage: { command: "quiet", synopsis: "quiet" },
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
      "--output-format",
      "text",
      "--version",
      "--output-format",
      "structured",
      "--name",
    ]),
    { kind: "version", command: "runTask" },
  );
  assert.deepEqual(
    parseCliInvocation(cli, ["run", "--output-format", "--version"]),
    { kind: "version", command: "runTask" },
  );
  assert.deepEqual(parseCliInvocation(cli, ["run", "--name", "--version"]), {
    kind: "version",
    command: "runTask",
  });

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, [
      "run",
      "--output-format",
      "text",
      "--version",
      "--name",
    ]),
    dependencies: undefined,
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
  const version = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--version"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      versionWrites.push(chunk);
    },
  });
  const help = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      helpWrites.push(chunk);
    },
  });
  assert.equal(version.kind, "version");
  assert.equal(help.kind, "help");
  assert.deepEqual(versionWrites, ["2.3.4\n"]);
  assert.match(helpWrites.join(""), /--version, -V\t显示版本\n/);
  assert.doesNotMatch(versionWrites.join(""), /workspace|v2\.3\.4/);
});

void test("版本值与所有 control spelling 在定义期闭合", () => {
  assert.throws(
    () =>
      versionCapability({
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
    assert.throws(
      () =>
        defineCli()({
          root: "conflict",
          help: helpCapability(),
          version: versionCapability({
            value: text.line("2.3.4"),
            shortAlias: "-V",
          }),
          output: outputCapability({ defaultFormat: "structured" }),
          usageFailureExitCode: 64,
          commands: {
            conflict: {
              kind: "rootCommand",
              name: "conflict",
              description: "冲突",
              fields: {
                [field]: fieldDefinition,
              },
              input: z.object({ [field]: z.boolean().optional() }),
              success: { kind: "completion" },
              failures: {},
              handler: () => undefined,
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
    value: externalValue as never,
    description: "显示版本",
  });
  assert.equal(Object.isFrozen(version), true);
  externalValue.value = "2.3.4\n注入内容";
  const cli = defineCli()({
    root: "copy",
    help: helpCapability(),
    version,
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      copy: {
        kind: "rootCommand",
        name: "copy",
        description: "复制事实",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
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
  assert.match(helpWrites.join(""), /--version\t显示版本\n/);
  assert.doesNotMatch(helpWrites.join(""), /注入内容/);
});

void test("层级 group 的本地 shared option 同样检查 version spelling", () => {
  const define = defineCli();
  assert.throws(
    () =>
      define({
        root: "rootConflict",
        help: helpCapability(),
        version: versionCapability({ value: text.line("2.3.4") }),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          rootConflict: {
            kind: "rootGroup",
            name: "root-conflict",
            description: "根冲突",
            sharedOptions: {
              version: {
                kind: "flag",
                longOption: "--version",
                description: "冲突字段",
              },
            },
          },
          child: {
            kind: "commandGroup",
            parent: "rootConflict",
            name: "child",
            description: "子组",
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "rootConflict",
          field: "version",
          spelling: "--version",
          control: "version",
        },
      ]);
      return true;
    },
  );

  assert.throws(
    () =>
      define({
        root: "workspace",
        help: helpCapability(),
        version: versionCapability({ value: text.line("2.3.4") }),
        output: outputCapability({ defaultFormat: "structured" }),
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
            sharedOptions: {
              version: {
                kind: "flag",
                longOption: "--version",
                description: "冲突字段",
              },
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "package",
          field: "version",
          spelling: "--version",
          control: "version",
        },
      ]);
      return true;
    },
  );

  assert.doesNotThrow(() =>
    define({
      root: "legal",
      help: helpCapability(),
      version: versionCapability({ value: text.line("2.3.4") }),
      output: outputCapability({ defaultFormat: "structured" }),
      usageFailureExitCode: 64,
      commands: {
        legal: {
          kind: "rootGroup",
          name: "legal",
          description: "合法根",
        },
        child: {
          kind: "commandGroup",
          parent: "legal",
          name: "child",
          description: "合法组",
          sharedOptions: {
            verbose: {
              kind: "flag",
              longOption: "--verbose",
              description: "详细输出",
            },
          },
        },
      },
    }),
  );
});

void test("继承到 leaf 的 shared control 冲突只报告其声明 scope", () => {
  const define = defineCli();
  assert.throws(
    () =>
      define({
        root: "workspace",
        help: helpCapability(),
        version: versionCapability({ value: text.line("2.3.4") }),
        output: outputCapability({ defaultFormat: "structured" }),
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
            sharedOptions: {
              version: {
                kind: "flag",
                longOption: "--version",
                description: "冲突字段",
              },
            },
          },
          ...define.command("listPackages")({
            kind: "command",
            parent: "package",
            name: "list",
            description: "列出包",
            input: z.object({ version: z.boolean().optional() }),
            success: { kind: "completion" },
            failures: {},
            handler: () => undefined,
          } as never),
        },
      } as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "package",
          field: "version",
          spelling: "--version",
          control: "version",
        },
      ]);
      return true;
    },
  );
});
