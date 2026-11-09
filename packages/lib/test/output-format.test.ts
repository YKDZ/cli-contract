import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  executeCli,
  parseCliInvocation,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

function createGreetingCli() {
  const define = defineCli();
  const input = z.object({ name: z.string() });
  const payload = z.object({ message: z.string() });
  const outputs = define.outputModes("greet", input, (mode) => ({
    default: "json",
    modes: {
      json: mode.atomic({
        description: "供机器读取的完整结果",
        format: "structured",
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候内容",
              schema: payload,
              exitCode: 0,
            },
          },
        },
        failures: {
          unavailable: {
            description: "服务不可用",
            schema: payload,
            exitCode: 9,
          },
        },
        handler: ({ input: value, outcome }) =>
          value.name === "down"
            ? outcome.failure.unavailable({ message: "服务不可用" })
            : outcome.data.greeting({ message: value.name }),
      }),
      human: mode.atomic({
        description: "供人阅读的问候",
        format: "text",
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候内容",
              schema: payload,
              exitCode: 0,
              text: ({ message }) =>
                text.lines([`你好，${message}`, "", "欢迎使用"]),
            },
          },
        },
        failures: {
          unavailable: {
            description: "服务不可用",
            schema: payload,
            exitCode: 9,
            text: ({ message }) => text.lines([message, "稍后重试"]),
          },
        },
        handler: ({ input: value, outcome }) =>
          value.name === "down"
            ? outcome.failure.unavailable({ message: "服务不可用" })
            : outcome.data.greeting({ message: value.name }),
      }),
    },
  }));

  return define({
    root: "greet",
    help: englishHelpCapability(),
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
        input,
        outputs,
      },
    },
  });
}

void test("--output 选择命令方式并隔离重复、未知值和 -- 后的 token", async () => {
  const cli = createGreetingCli();
  assert.deepEqual(
    parseCliInvocation(cli, ["--name", "Ada", "--output", "human"]),
    {
      kind: "parsed",
      command: "greet",
      input: { name: "Ada" },
      outputMode: "human",
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["--name=Ada", "--output=json"]), {
    kind: "parsed",
    command: "greet",
    input: { name: "Ada" },
    outputMode: "json",
  });

  const missing = parseCliInvocation(cli, ["--output", "--name", "Ada"]);
  assert.equal(missing.kind, "usageFailure");
  if (missing.kind === "usageFailure") {
    assert.deepEqual(missing.issues[0], {
      code: "invalidOutputMode",
      position: 0,
      option: "--output",
      received: "--name",
      available: ["json", "human"],
    });
  }

  const unknown = parseCliInvocation(cli, ["--name", "Ada", "--output=yaml"]);
  assert.equal(unknown.kind, "usageFailure");
  if (unknown.kind === "usageFailure") {
    assert.equal(unknown.issues[0]?.code, "invalidOutputMode");
  }

  const inherited = parseCliInvocation(cli, [
    "--name",
    "Ada",
    "--output=toString",
  ]);
  assert.equal(inherited.kind, "usageFailure");
  if (inherited.kind === "usageFailure") {
    assert.deepEqual(inherited.issues[0], {
      code: "invalidOutputMode",
      position: 2,
      option: "--output",
      received: "toString",
      available: ["json", "human"],
    });
    const inheritedWrites: Array<
      Readonly<{ destination: string; chunk: string }>
    > = [];
    const termination = await executeCli(cli, {
      invocation: inherited,
      dependencies: undefined,
      write: (output) => {
        inheritedWrites.push(output);
      },
    });
    assert.deepEqual(termination, {
      kind: "usageFailure",
      command: "greet",
      issues: inherited.issues,
      exitCode: 64,
    });
    assert.deepEqual(
      inheritedWrites.map(({ destination }) => destination),
      ["stderr"],
    );
    assert.deepEqual(JSON.parse(inheritedWrites[0]!.chunk), {
      schemaVersion: "3",
      command: "greet",
      kind: "usageFailure",
      issues: inherited.issues,
      usage: "greet [--output <mode>] --name <name>",
      helpArgv: ["greet", "--help"],
    });
  }

  const repeated = parseCliInvocation(cli, [
    "--name",
    "Ada",
    "--output=json",
    "--output=human",
  ]);
  assert.equal(repeated.kind, "usageFailure");
  if (repeated.kind === "usageFailure") {
    assert.deepEqual(repeated.issues[0], {
      code: "conflictingOutputMode",
      occurrences: [
        { position: 2, option: "--output", mode: "json" },
        { position: 3, option: "--output", mode: "human" },
      ],
    });
  }

  const afterTerminator = parseCliInvocation(cli, [
    "--name",
    "Ada",
    "--",
    "--output",
    "human",
  ]);
  assert.equal(afterTerminator.kind, "usageFailure");
  if (afterTerminator.kind === "usageFailure") {
    assert.equal(afterTerminator.issues[0]?.code, "unexpectedPositional");
  }
});

void test("帮助列出方式说明和默认值，用法失败保持固定结构化通道", async () => {
  const cli = createGreetingCli();
  const helpWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      helpWrites.push(chunk);
    },
  });
  const help = helpWrites.join("");
  assert.match(help, /--output <mode> \(choices: "json", "human"\)/);
  assert.match(help, /供机器读取的完整结果/);
  assert.match(help, /供人阅读的问候/);
  assert.match(help, /--output <mode> .*\(default: "json"\)/);

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "Ada", "--output=unknown"]),
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
  assert.match(writes[0]?.chunk ?? "", /"kind":"usageFailure"/);
});

void test("文本方式呈现成功与失败，structured 方式保留结构化信封", async () => {
  const cli = createGreetingCli();
  const humanWrites: Array<Readonly<{ destination: string; chunk: string }>> =
    [];
  const humanResult = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "Ada", "--output=human"]),
    dependencies: undefined,
    write: (output) => {
      humanWrites.push(output);
    },
  });
  assert.equal(humanResult.kind, "applicationResult");
  if (humanResult.kind !== "applicationResult") return;
  assert.equal(humanResult.outputMode, "human");
  assert.deepEqual(humanWrites, [
    { destination: "stdout", chunk: "你好，Ada\n\n欢迎使用\n" },
  ]);

  const failureWrites: Array<Readonly<{ destination: string; chunk: string }>> =
    [];
  const failureResult = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "down", "--output=human"]),
    dependencies: undefined,
    write: (output) => {
      failureWrites.push(output);
    },
  });
  assert.equal(failureResult.exitCode, 9);
  if (failureResult.kind !== "applicationResult") return;
  assert.equal(failureResult.outputMode, "human");
  assert.deepEqual(failureWrites, [
    { destination: "stderr", chunk: "服务不可用\n稍后重试\n" },
  ]);

  const structuredWrites: Array<
    Readonly<{ destination: string; chunk: string }>
  > = [];
  const structuredResult = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--name", "Ada"]),
    dependencies: undefined,
    write: (output) => {
      structuredWrites.push(output);
    },
  });
  if (structuredResult.kind !== "applicationResult") return;
  assert.equal(structuredResult.outputMode, "json");
  assert.deepEqual(structuredWrites, [
    {
      destination: "stdout",
      chunk:
        '{"schemaVersion":"3","command":"greet","outputMode":"json","kind":"data","variant":"greeting","data":{"message":"Ada"}}\n',
    },
  ]);
});

void test("文本构造器拒绝非法 framing 并保留可显式静默的 completion", async () => {
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
  const define = defineCli();
  const input = z.object({});
  const quietCli = define({
    root: "quiet",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      quiet: {
        kind: "rootCommand",
        name: "quiet",
        description: "静默完成",
        input,
        outputs: define.outputModes("quiet", input, (mode) => ({
          modes: {
            text: mode.atomic({
              description: "文字结果",
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
  const result = await executeCli(quietCli, {
    invocation: parseCliInvocation(quietCli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.equal(result.kind, "applicationResult");
  assert.deepEqual(writes, []);
});
