import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  text,
  type ContractSchema,
  type FieldDefinitions,
  type UsageConstraint,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpWording } from "./english-help.ts";

const validatedRawCounts: string[] = [];
let handlerCalls = 0;
const exampleInput = z
  .object({
    count: z.string(),
    enabled: z.boolean(),
    tags: z.array(z.string()),
    target: z.string(),
    paths: z.array(z.string()),
  })
  .superRefine(({ count }) => {
    validatedRawCounts.push(count);
  })
  .transform(({ count, ...rest }) => ({ ...rest, count: Number(count) }))
  .pipe(
    z.object({
      count: z.number().int(),
      enabled: z.boolean(),
      tags: z.array(z.string()),
      target: z.string(),
      paths: z.array(z.string()),
    }),
  );

function createCli(
  defaultOutputMode: "structured" | "text" = "structured",
  includeExamplesHeading = true,
) {
  const define = defineCli();
  const outputs = define.outputModes("inspect", exampleInput, (mode) => ({
    default: defaultOutputMode,
    modes: {
      structured: mode.atomic({
        description: "机器读取结果",
        format: "structured",
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => {
          handlerCalls += 1;
          return outcome.completion();
        },
      }),
      text: mode.atomic({
        description: "供人阅读结果",
        format: "text",
        success: { kind: "completion", text: () => text.silent },
        failures: {},
        handler: ({ outcome }) => {
          handlerCalls += 1;
          return outcome.completion();
        },
      }),
    },
  }));

  return define({
    root: "workspace",
    help: helpCapability({
      headings: includeExamplesHeading
        ? { examples: "调用示例", supplement: "补充" }
        : { supplement: "补充" },
      wording: englishHelpWording,
    }),
    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "tool",
        description: "工作区工具",
      },
      tasks: {
        kind: "commandGroup",
        parent: "workspace",
        name: "task",
        description: "任务",
      },
      ...define.command("inspect")({
        kind: "command",
        parent: "tasks",
        name: "inspect",
        description: "检查输入",
        fields: {
          count: {
            kind: "valueOption",
            longOption: "--count",
            description: "数量",
          },
          enabled: {
            kind: "flag",
            longOption: "--enabled",
            negatedLongOption: "--no-enabled",
            description: "启用",
          },
          tags: {
            kind: "repeatableOption",
            longOption: "--tag",
            description: "标签",
          },
          target: { kind: "positional", description: "目标" },
          paths: { kind: "variadicPositional", description: "路径" },
        },
        input: exampleInput,
        outputs,
        examples: [
          {
            input: {
              count: "4",
              enabled: false,
              tags: [
                "space value",
                "single'quote",
                "$(printf injected)",
                "`printf other`",
                "-leading",
                "line\nbreak",
                "",
                "x=y",
              ],
              target: "-leading\nO'Ada",
              paths: ["--help", "-tail"],
            },
          },
          {
            input: {
              count: "5",
              enabled: true,
              tags: ["fixed mode"],
              target: "target",
              paths: ["path"],
            },
            outputMode: "text",
          },
        ],
        helpSupplement: text.lines(["保留自由补充说明"]),
      }),
    },
  });
}

function createDynamicCli(
  input: ContractSchema,
  fields: FieldDefinitions,
  example: unknown,
  usageConstraints?: readonly UsageConstraint[],
) {
  const define = defineCli();
  const outputs = define.outputModes("check", input, (mode) => ({
    modes: {
      structured: mode.atomic({
        description: "结构化结果",
        format: "structured",
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
    },
  }));
  return Reflect.apply(define, undefined, [
    {
      root: "check",
      help: helpCapability({ wording: englishHelpWording }),
      usageFailureExitCode: 64,
      commands: {
        check: {
          kind: "rootCommand",
          name: "check",
          description: "检查样本",
          fields,
          input,
          outputs,
          ...(usageConstraints === undefined ? {} : { usageConstraints }),
          examples: [example],
        },
      },
    },
  ]);
}

function getExampleError(action: () => unknown): ContractDefinitionError {
  try {
    action();
  } catch (error) {
    if (error instanceof ContractDefinitionError) return error;
    throw error;
  }
  throw new Error("预期 defineCli 拒绝无效命令示例");
}

function getExampleIssue(action: () => unknown) {
  const error = getExampleError(action);
  const issue = error.issues.find(
    (candidate) => candidate.code === "invalidCommandExample",
  );
  if (issue === undefined) throw new Error("缺少命令示例定义诊断");
  return issue;
}

function createGroupWithExample() {
  const define = defineCli();
  const input = z.object({});
  const outputs = define.outputModes("run", input, (mode) => ({
    modes: {
      structured: mode.atomic({
        description: "结构化结果",
        format: "structured",
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
    },
  }));
  return Reflect.apply(define, undefined, [
    {
      root: "tool",
      help: helpCapability({
        wording: {
          ...englishHelpWording,
          commandPlaceholder: "command",
        },
      }),
      usageFailureExitCode: 64,
      commands: {
        tool: {
          kind: "rootGroup",
          name: "tool",
          description: "工具",
          examples: [{ input: {} }],
        },
        tasks: {
          kind: "commandGroup",
          parent: "tool",
          name: "tasks",
          description: "任务",
        },
        ...define.command("run")({
          kind: "command",
          parent: "tasks",
          name: "run",
          description: "运行任务",
          input,
          outputs,
        }),
      },
    },
  ]);
}

void test("定义期验证类型化示例并从同一 argv 生成帮助与可往返 shell", async () => {
  const cli = createCli();
  assert.equal(handlerCalls, 0);
  assert.deepEqual(validatedRawCounts.slice(0, 2), ["4", "5"]);

  const examples = cli.manifest.commands.inspect.examples;
  assert.deepEqual(examples, [
    {
      argv: [
        "task",
        "inspect",
        "--count=4",
        "--no-enabled",
        "--tag=space value",
        "--tag=single'quote",
        "--tag=$(printf injected)",
        "--tag=`printf other`",
        "--tag=-leading",
        "--tag=line\nbreak",
        "--tag=",
        "--tag=x=y",
        "--",
        "-leading\nO'Ada",
        "--help",
        "-tail",
      ],
      shell:
        "'tool' 'task' 'inspect' '--count=4' '--no-enabled' '--tag=space value' '--tag=single'\\''quote' '--tag=$(printf injected)' '--tag=`printf other`' '--tag=-leading' '--tag=line\nbreak' '--tag=' '--tag=x=y' '--' '-leading\nO'\\''Ada' '--help' '-tail'",
    },
    {
      argv: [
        "task",
        "inspect",
        "--output=text",
        "--count=5",
        "--enabled",
        "--tag=fixed mode",
        "--",
        "target",
        "path",
      ],
      shell:
        "'tool' 'task' 'inspect' '--output=text' '--count=5' '--enabled' '--tag=fixed mode' '--' 'target' 'path'",
      outputMode: "text",
    },
  ]);
  assert.equal(examples?.[0]?.outputMode, undefined);
  assert.equal(Object.isFrozen(examples), true);
  assert.equal(Object.isFrozen(examples?.[0]?.argv), true);

  const defaultInvocation = parseCliInvocation(cli, examples?.[0]?.argv ?? []);
  assert.deepEqual(defaultInvocation, {
    kind: "parsed",
    command: "inspect",
    input: {
      count: "4",
      enabled: false,
      tags: [
        "space value",
        "single'quote",
        "$(printf injected)",
        "`printf other`",
        "-leading",
        "line\nbreak",
        "",
        "x=y",
      ],
      target: "-leading\nO'Ada",
      paths: ["--help", "-tail"],
    },
    outputMode: "structured",
  });
  const fixedInvocation = parseCliInvocation(cli, examples?.[1]?.argv ?? []);
  assert.equal(fixedInvocation.kind, "parsed");
  if (fixedInvocation.kind === "parsed") {
    assert.equal(fixedInvocation.outputMode, "text");
    assert.deepEqual(fixedInvocation.input, {
      count: "5",
      enabled: true,
      tags: ["fixed mode"],
      target: "target",
      paths: ["path"],
    });
  }

  const writes: string[] = [];
  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["task", "inspect", "--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(termination, {
    kind: "help",
    command: "inspect",
    exitCode: 0,
  });
  const help = writes[0] ?? "";
  const examplesHeading = help.indexOf("调用示例\n");
  const supplementHeading = help.indexOf("补充\n");
  assert.ok(examplesHeading >= 0);
  assert.ok(supplementHeading > examplesHeading);
  assert.ok(help.includes("  保留自由补充说明"));

  const firstExample = examples?.[0];
  if (firstExample === undefined) throw new Error("缺少调用示例");
  const displayedStart = help.indexOf(`  ${firstExample.shell}\n`);
  assert.ok(displayedStart >= 0);
  const displayedShell = help.slice(
    displayedStart + 2,
    displayedStart + 2 + firstExample.shell.length,
  );
  assert.equal(displayedShell, firstExample.shell);
  const shellRoundTrip = spawnSync(
    "/bin/sh",
    ["-c", `set -- ${displayedShell}; printf '%s\\0' "$@"`],
    { encoding: "utf8" },
  );
  assert.equal(shellRoundTrip.status, 0, shellRoundTrip.stderr);
  assert.deepEqual(shellRoundTrip.stdout?.split("\0").slice(0, -1), [
    "tool",
    ...firstExample.argv,
  ]);

  const singleModeExample = createDynamicCli(
    z.object({ name: z.string() }),
    {
      name: {
        kind: "valueOption",
        longOption: "--name",
        description: "名字",
      },
    },
    { input: { name: "Ada" }, outputMode: "structured" },
  );
  assert.deepEqual(singleModeExample.manifest.commands.check?.examples?.[0], {
    argv: ["--output=structured", "--name=Ada"],
    shell: "'check' '--output=structured' '--name=Ada'",
    outputMode: "structured",
  });

  const changedDefault = createCli("text");
  const changedExamples = changedDefault.manifest.commands.inspect.examples;
  assert.deepEqual(changedExamples?.[0]?.argv, firstExample.argv);
  const changedDefaultInvocation = parseCliInvocation(
    changedDefault,
    changedExamples?.[0]?.argv ?? [],
  );
  assert.equal(changedDefaultInvocation.kind, "parsed");
  if (changedDefaultInvocation.kind === "parsed") {
    assert.equal(changedDefaultInvocation.outputMode, "text");
  }
  assert.equal(changedExamples?.[1]?.outputMode, "text");
  assert.deepEqual(changedExamples?.[1]?.argv, examples?.[1]?.argv);
  const changedFixedInvocation = parseCliInvocation(
    changedDefault,
    changedExamples?.[1]?.argv ?? [],
  );
  assert.equal(changedFixedInvocation.kind, "parsed");
  if (changedFixedInvocation.kind === "parsed") {
    assert.equal(changedFixedInvocation.outputMode, "text");
  }
  assert.equal(handlerCalls, 0);
});

void test("公开 defineCli 会拒绝无法往返、约束失败或模式拒绝的样本", () => {
  const stringField = {
    name: {
      kind: "valueOption",
      longOption: "--name",
      description: "名字",
    },
  } as const;
  const schemaRejected = getExampleError(() =>
    createDynamicCli(
      z.object({ name: z.string().min(3, "名字至少三个字符") }),
      stringField,
      { input: { name: "ab" } },
    ),
  );
  const rejected = schemaRejected.issues.find(
    (candidate) => candidate.code === "invalidCommandExample",
  );
  assert.ok(rejected);
  assert.equal(rejected.reason, "inputRejected");
  assert.match(schemaRejected.message, /名字至少三个字符.*name/);
  if (rejected.reason === "inputRejected") {
    assert.deepEqual(rejected.evidence, [
      { message: "名字至少三个字符", path: ["name"] },
    ]);
  }

  for (const outputMode of ["text", "toString"]) {
    const modeRejected = getExampleIssue(() =>
      createDynamicCli(z.object({ name: z.string() }), stringField, {
        input: { name: "Ada" },
        outputMode,
      }),
    );
    assert.equal(modeRejected.reason, "invalidOutputMode");
    if (modeRejected.reason === "invalidOutputMode") {
      assert.equal(modeRejected.received, outputMode);
    }
  }

  const unknownField = getExampleIssue(() =>
    createDynamicCli(z.object({ name: z.string() }), stringField, {
      input: { name: "Ada", extra: "not declared" },
    }),
  );
  assert.equal(unknownField.reason, "unknownField");
  assert.equal(unknownField.field, "extra");

  const constrained = getExampleIssue(() =>
    createDynamicCli(
      z.object({ first: z.string().optional(), second: z.string().optional() }),
      {
        first: {
          kind: "valueOption",
          longOption: "--first",
          description: "首项",
        },
        second: {
          kind: "valueOption",
          longOption: "--second",
          description: "次项",
        },
      },
      { input: {} },
      [{ kind: "count", fields: ["first", "second"], min: 1 }],
    ),
  );
  assert.equal(constrained.reason, "parseDidNotComplete");
  if (constrained.reason === "parseDidNotComplete") {
    assert.equal(
      constrained.usageIssues?.[0]?.code,
      "countConstraintViolation",
    );
  }

  const positionalGap = getExampleIssue(() =>
    createDynamicCli(
      z.object({ first: z.string().optional(), second: z.string().optional() }),
      {
        first: { kind: "positional", description: "首项" },
        second: { kind: "positional", description: "次项" },
      },
      { input: { second: "shifted" } },
    ),
  );
  assert.equal(positionalGap.reason, "rawInputMismatch");
  if (positionalGap.reason === "rawInputMismatch") {
    assert.deepEqual(positionalGap.mismatchedFields, ["first", "second"]);
  }

  for (const name of ["\0", "\ud800"]) {
    const unencodable = getExampleIssue(() =>
      createDynamicCli(z.object({ name: z.string() }), stringField, {
        input: { name },
      }),
    );
    assert.equal(unencodable.reason, "unencodableFieldValue");
  }

  assert.throws(
    () => createGroupWithExample(),
    (error) =>
      error instanceof ContractDefinitionError &&
      error.issues.some(
        (issue) =>
          issue.code === "unknownDefinitionProperty" &&
          issue.path.join(".") === "commands.tool.examples",
      ),
  );
});

void test("未配置 examples 标题时仍显示独立的调用示例内容", async () => {
  const cli = createCli("structured", false);
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["task", "inspect", "--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.doesNotMatch(writes[0] ?? "", /调用示例/);
  assert.match(writes[0] ?? "", /  'tool' 'task' 'inspect' '--count=4'/);
  assert.match(writes[0] ?? "", /\n\n补充\n/);
});
