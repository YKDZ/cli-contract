import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  ContractExecutionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const message = z.object({ message: z.string() });

function createTextCli() {
  return defineCli()({
    root: "greet",
    help: helpCapability(),
    output: outputCapability({
      defaultFormat: "structured",
      text: true,
      compatibilityFlags: { "--plain": "text" },
    }),
    usageFailureExitCode: 64,
    commands: {
      greet: {
        kind: "rootCommand",
        name: "greet",
        description: "生成问候",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "问候对象",
          },
        },
        input: z.object({ name: z.string() }),
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候内容",
              schema: message,
              exitCode: 0,
              text: (data: Readonly<{ readonly message: string }>) =>
                text.lines([`你好，${data.message}`, "", "欢迎使用"]),
            },
          },
        },
        failures: {
          unavailable: {
            description: "服务不可用",
            schema: message,
            exitCode: 9,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.lines([data.message, "稍后重试"]),
          },
        },
        handler({ input, outcome }) {
          return input.name === "down"
            ? outcome.failure.unavailable({ message: "服务不可用" })
            : outcome.data.greeting({ message: input.name });
        },
      },
    },
  });
}

function createTextHierarchyCli() {
  const define = defineCli();
  return define({
    root: "workspace",
    help: helpCapability(),
    output: outputCapability({
      defaultFormat: "text",
      compatibilityFlags: { "--plain": "text" },
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
        input: z.object({}),
        success: { kind: "completion", text: () => text.silent },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
    },
  });
}

void test("格式 control 全路径生效、保持在 invocation 元数据且不进入输入", () => {
  const cli = createTextCli();
  assert.deepEqual(cli.grammar.controls.output, {
    defaultFormat: "structured",
    formats: ["structured", "text"],
    selector: "--output-format",
    compatibilityFlags: { "--plain": "text" },
  });
  assert.deepEqual(
    parseCliInvocation(cli, ["--output-format", "text", "--name", "Ada"]),
    {
      kind: "parsed",
      command: "greet",
      input: { name: "Ada" },
      outputFormat: "text",
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["--name", "Ada", "--plain"]), {
    kind: "parsed",
    command: "greet",
    input: { name: "Ada" },
    outputFormat: "text",
  });
  assert.deepEqual(
    parseCliInvocation(cli, ["--name", "Ada", "--output-format=text"]),
    {
      kind: "parsed",
      command: "greet",
      input: { name: "Ada" },
      outputFormat: "text",
    },
  );
  assert.deepEqual(
    parseCliInvocation(cli, ["--output-format", "yaml", "--name", "Ada"]),
    {
      kind: "usageFailure",
      command: "greet",
      usage: { command: "greet", synopsis: "greet --name <name>" },
      issues: [
        {
          code: "invalidOutputFormat",
          position: 0,
          option: "--output-format",
          received: "yaml",
        },
      ],
    },
  );
  assert.deepEqual(
    parseCliInvocation(cli, [
      "--plain",
      "--output-format",
      "text",
      "--name",
      "Ada",
    ]),
    {
      kind: "usageFailure",
      command: "greet",
      usage: { command: "greet", synopsis: "greet --name <name>" },
      issues: [
        {
          code: "conflictingOutputFormat",
          occurrences: [
            { position: 0, option: "--plain", format: "text" },
            { position: 1, option: "--output-format", format: "text" },
          ],
        },
      ],
    },
  );
  const afterTerminator = parseCliInvocation(cli, [
    "--name",
    "Ada",
    "--",
    "--output-format",
    "text",
  ]);
  assert.equal(afterTerminator.kind, "usageFailure");
  assert.equal(afterTerminator.issues[0]?.code, "unexpectedPositional");
});

void test("selector 紧邻 help 时在根与层级路径即时生效", () => {
  const rootCli = createTextCli();
  assert.deepEqual(parseCliInvocation(rootCli, ["--output-format", "--help"]), {
    kind: "help",
    command: "greet",
  });

  const hierarchyCli = createTextHierarchyCli();
  assert.deepEqual(
    parseCliInvocation(hierarchyCli, [
      "package",
      "list",
      "--output-format",
      "--help",
    ]),
    { kind: "help", command: "listPackages" },
  );
});

void test("format controls 不改变 usage failure 的固定 JSON 通道", async () => {
  const cli = createTextCli();
  for (const [argv, code] of [
    [["--plain", "--unknown"], "unknownOption"],
    [["--unknown", "--plain"], "unknownOption"],
    [["--output-format", "yaml"], "invalidOutputFormat"],
    [["--plain", "--output-format", "text"], "conflictingOutputFormat"],
  ] as const) {
    const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
    const termination = await executeCli(cli, {
      invocation: parseCliInvocation(cli, argv),
      dependencies: undefined,
      write: (output) => {
        writes.push(output);
      },
    });
    assert.equal(termination.kind, "usageFailure");
    assert.deepEqual(
      writes.map(({ destination }) => destination),
      ["stderr"],
    );
    const chunk = writes[0]?.chunk;
    assert.ok(chunk?.endsWith("\n"));
    const envelope = JSON.parse(chunk ?? "") as {
      readonly kind: string;
      readonly issues: readonly Readonly<{ readonly code: string }>[];
    };
    assert.equal(envelope.kind, "usageFailure");
    assert.equal(envelope.issues[0]?.code, code);
    assert.equal(chunk, `${JSON.stringify(envelope)}\n`);
  }
});

void test("帮助从 controls 投影 selector 与 compatibility flags", async () => {
  const cli = createTextHierarchyCli();
  for (const argv of [
    ["--help"],
    ["package", "--help"],
    ["package", "list", "--help"],
  ]) {
    const writes: string[] = [];
    await executeCli(cli, {
      invocation: parseCliInvocation(cli, argv),
      dependencies: undefined,
      write: ({ chunk }) => {
        writes.push(chunk);
      },
    });
    const help = writes.join("");
    assert.match(help, /--output-format <structured\|text>/);
    assert.match(help, /--plain/);
  }
});

void test("structured wire 保持不变，text data 与 failure 使用固定通道和 atomic line", async () => {
  const cli = createTextCli();
  const structuredWrites: Array<
    Readonly<{ destination: string; chunk: string }>
  > = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "Ada"]),
    dependencies: undefined,
    write: (output) => {
      structuredWrites.push(output);
    },
  });
  assert.deepEqual(structuredWrites, [
    {
      destination: "stdout",
      chunk:
        '{"schemaVersion":"1","command":"greet","kind":"data","variant":"greeting","data":{"message":"Ada"}}\n',
    },
  ]);

  const textWrites: Array<Readonly<{ destination: string; chunk: string }>> =
    [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, [
      "--output-format",
      "text",
      "--name",
      "Ada",
    ]),
    dependencies: undefined,
    write: (output) => {
      textWrites.push(output);
    },
  });
  assert.deepEqual(textWrites, [
    { destination: "stdout", chunk: "你好，Ada\n\n欢迎使用\n" },
  ]);

  const failureWrites: Array<Readonly<{ destination: string; chunk: string }>> =
    [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--plain", "--name", "down"]),
    dependencies: undefined,
    write: (output) => {
      failureWrites.push(output);
    },
  });
  assert.equal(termination.exitCode, 9);
  assert.deepEqual(failureWrites, [
    { destination: "stderr", chunk: "服务不可用\n稍后重试\n" },
  ]);
});

void test("text.line 与 text.lines 拒绝非法 framing，completion 可显式 silent", async () => {
  for (const value of ["", "a\rb", "a\nb", "a\0b"]) {
    assert.throws(() => text.line(value), TypeError);
  }
  for (const value of [[], [""], ["a\rb"], ["a\nb"], ["a\0b"]]) {
    assert.throws(() => text.lines(value as never), TypeError);
  }
  assert.deepEqual(text.lines(["第一行", "", "最后一行"]).lines, [
    "第一行",
    "",
    "最后一行",
  ]);
  const cli = defineCli()({
    root: "quiet",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "text" }),
    usageFailureExitCode: 64,
    commands: {
      quiet: {
        kind: "rootCommand",
        name: "quiet",
        description: "安静完成",
        input: z.object({}),
        success: { kind: "completion", text: () => text.silent },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, []);
});

void test("completion 接受 text.lines，伪造的动态行组在写出前被拒绝", async () => {
  const createCli = (presenter: () => unknown) =>
    defineCli()({
      root: "complete",
      help: helpCapability(),
      output: outputCapability({ defaultFormat: "text" }),
      usageFailureExitCode: 64,
      commands: {
        complete: {
          kind: "rootCommand",
          name: "complete",
          description: "完成任务",
          input: z.object({}),
          success: { kind: "completion", text: presenter as never },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        },
      },
    });
  const cli = createCli(() => text.lines(["完成", "", "下一步"]));
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, ["完成\n\n下一步\n"]);

  const forged = createCli(() => ({ kind: "lines", lines: ["伪造"] }));
  await assert.rejects(
    executeCli(forged, {
      invocation: parseCliInvocation(forged, []),
      dependencies: undefined,
      write: () => undefined,
    }),
    ContractExecutionError,
  );
});

void test("text 开关在定义期要求或禁止同位 presenter", () => {
  assert.throws(
    () =>
      defineCli()({
        root: "missing",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "text" }),
        usageFailureExitCode: 64,
        commands: {
          missing: {
            kind: "rootCommand",
            name: "missing",
            description: "缺少 presenter",
            input: z.object({}),
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingTextPresenter",
          command: "missing",
          location: "completion",
        },
      ]);
      return true;
    },
  );
});

void test("compatibility flag 在定义期闭合到已启用格式和 control 拼写", () => {
  for (const [flag, format] of [
    ["--plain_mode", "structured"],
    ["--help", "structured"],
    ["--output-format", "structured"],
    ["--plain", "text"],
    ["--yaml", "yaml"],
  ] as const) {
    assert.throws(
      () =>
        defineCli()({
          root: "compatibility",
          help: helpCapability(),
          output: outputCapability({
            defaultFormat: "structured",
            compatibilityFlags: { [flag]: format } as never,
          }),
          usageFailureExitCode: 64,
          commands: {
            compatibility: {
              kind: "rootCommand",
              name: "compatibility",
              description: "兼容 flag",
              input: z.object({}),
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            },
          },
        }),
      (error) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "invalidOutputCompatibilityFlag",
            flag,
            received: format,
          },
        ]);
        return true;
      },
    );
  }
});

void test("compatibility flag 复用输出 control 的应用字段冲突检查", () => {
  assert.throws(
    () =>
      defineCli()({
        root: "conflictingField",
        help: helpCapability(),
        output: outputCapability({
          defaultFormat: "structured",
          compatibilityFlags: { "--plain": "structured" },
        }),
        usageFailureExitCode: 64,
        commands: {
          conflictingField: {
            kind: "rootCommand",
            name: "conflicting-field",
            description: "冲突字段",
            fields: {
              plain: {
                kind: "flag",
                longOption: "--plain",
                description: "应用字段",
              },
            },
            input: z.object({ plain: z.boolean().optional() }),
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          },
        },
      }),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "fieldOptionConflictsWithControl",
          command: "conflictingField",
          field: "plain",
          spelling: "--plain",
          control: "outputFormat",
        },
      ]);
      return true;
    },
  );
});

void test("compatibility flags 的动态 collection 形状在定义期闭合", () => {
  for (const [compatibilityFlags, received] of [
    [null, "null"],
    [true, "boolean"],
    [[], "array"],
  ] as const) {
    assert.throws(
      () =>
        defineCli()({
          root: "invalidCompatibilityFlags",
          help: helpCapability(),
          output: outputCapability({
            defaultFormat: "structured",
            compatibilityFlags: compatibilityFlags as never,
          }),
          usageFailureExitCode: 64,
          commands: {
            invalidCompatibilityFlags: {
              kind: "rootCommand",
              name: "invalid-compatibility-flags",
              description: "无效兼容 flags",
              input: z.object({}),
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            },
          },
        }),
      (error) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "invalidOutputCompatibilityFlags",
            received,
          },
        ]);
        return true;
      },
    );
  }
});
