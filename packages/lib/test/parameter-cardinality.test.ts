import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type CliContractRawInput,
} from "@ykdz/cli-contract";
import { z } from "zod";

function createArchiveCli() {
  return defineCli()({
    root: "archiveFiles",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      archiveFiles: {
        kind: "rootCommand",
        name: "archive-files",
        description: "归档文件",
        fields: {
          source: {
            kind: "positional",
            description: "源文件",
          },
          files: {
            kind: "variadicPositional",
            description: "附加文件",
          },
          tag: {
            kind: "repeatableOption",
            longOption: "--tag",
            shortAlias: "-t",
            description: "归档标签",
          },
          color: {
            kind: "flag",
            longOption: "--color",
            negatedLongOption: "--no-color",
            description: "彩色输出",
          },
        },
        input: z.object({
          source: z.string(),
          files: z.array(z.string()).optional(),
          tag: z.array(z.string()).optional(),
          color: z.boolean().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
}

void test("repeatable、variadic positional 与 negated flag 形成固定 raw 值", () => {
  const cli = createArchiveCli();
  const negativeRawInput: CliContractRawInput<typeof cli> = { color: false };
  void negativeRawInput;
  const invocation = parseCliInvocation(cli, ["source.txt", "--no-color"]);
  if (invocation.kind === "parsed") {
    invocation.input satisfies Readonly<{
      readonly source?: string;
      readonly files?: readonly [string, ...string[]];
      readonly tag?: readonly [string, ...string[]];
      readonly color?: boolean;
    }>;
  }

  assert.deepEqual(
    parseCliInvocation(cli, [
      "source.txt",
      "one.txt",
      "--tag",
      "first",
      "two.txt",
      "-t",
      "second",
      "--no-color",
    ]),
    {
      kind: "parsed",
      command: "archiveFiles",
      input: {
        source: "source.txt",
        files: ["one.txt", "two.txt"],
        tag: ["first", "second"],
        color: false,
      },
      outputFormat: "structured",
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--color"]), {
    kind: "parsed",
    command: "archiveFiles",
    input: { source: "source.txt", color: true },
    outputFormat: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["source.txt"]), {
    kind: "parsed",
    command: "archiveFiles",
    input: { source: "source.txt" },
    outputFormat: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--tag", "only"]), {
    kind: "parsed",
    command: "archiveFiles",
    input: { source: "source.txt", tag: ["only"] },
    outputFormat: "structured",
  });
  assert.deepEqual(
    parseCliInvocation(cli, ["source.txt", "--", "--first", "-second"]),
    {
      kind: "parsed",
      command: "archiveFiles",
      input: { source: "source.txt", files: ["--first", "-second"] },
      outputFormat: "structured",
    },
  );
  assert.deepEqual(
    parseCliInvocation(cli, ["source.txt", "--tag=-leading", "-t", "plain"]),
    {
      kind: "parsed",
      command: "archiveFiles",
      input: { source: "source.txt", tag: ["-leading", "plain"] },
      outputFormat: "structured",
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "-t", "-leading"]), {
    kind: "usageFailure",
    command: "archiveFiles",
    issues: [
      {
        code: "missingOptionValue",
        position: 1,
        field: "tag",
        option: "-t",
      },
    ],
    usage: {
      command: "archiveFiles",
      synopsis:
        "archive-files <source> [<files...>] [--tag <tag>]... [--color|--no-color]",
    },
  });
});

function createDiagnosticCli() {
  return defineCli()({
    root: "diagnose",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      diagnose: {
        kind: "rootCommand",
        name: "diagnose",
        description: "诊断参数",
        fields: {
          source: { kind: "positional", description: "源文件" },
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            shortAlias: "-m",
            description: "模式",
          },
          force: {
            kind: "flag",
            longOption: "--force",
            shortAlias: "-f",
            description: "强制执行",
          },
          color: {
            kind: "flag",
            longOption: "--color",
            negatedLongOption: "--no-color",
            description: "彩色输出",
          },
        },
        input: z.object({
          source: z.string(),
          mode: z.string(),
          force: z.boolean().optional(),
          color: z.boolean().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
}

void test("无歧义解析后按字段声明顺序聚合必填、重复与正负冲突", () => {
  const cli = createDiagnosticCli();
  const usage = {
    command: "diagnose",
    synopsis: "diagnose <source> --mode <mode> [--force] [--color|--no-color]",
  } as const;

  assert.deepEqual(
    parseCliInvocation(cli, ["--force", "-f", "--color", "--no-color"]),
    {
      kind: "usageFailure",
      command: "diagnose",
      issues: [
        { code: "missingRequiredField", field: "source" },
        { code: "missingRequiredField", field: "mode" },
        {
          code: "repeatedOption",
          field: "force",
          occurrences: [
            { position: 0, option: "--force" },
            { position: 1, option: "-f" },
          ],
        },
        {
          code: "conflictingFlag",
          field: "color",
          positiveOccurrences: [{ position: 2, option: "--color" }],
          negativeOccurrences: [{ position: 3, option: "--no-color" }],
        },
      ],
      usage,
    },
  );
  assert.deepEqual(
    parseCliInvocation(cli, ["source.txt", "--mode", "first", "-m", "second"]),
    {
      kind: "usageFailure",
      command: "diagnose",
      issues: [
        {
          code: "repeatedOption",
          field: "mode",
          occurrences: [
            { position: 1, option: "--mode" },
            { position: 3, option: "-m" },
          ],
        },
      ],
      usage,
    },
  );
  assert.deepEqual(
    parseCliInvocation(cli, [
      "source.txt",
      "--mode",
      "safe",
      "--no-color",
      "--no-color",
    ]),
    {
      kind: "usageFailure",
      command: "diagnose",
      issues: [
        {
          code: "repeatedOption",
          field: "color",
          occurrences: [
            { position: 3, option: "--no-color" },
            { position: 4, option: "--no-color" },
          ],
        },
      ],
      usage,
    },
  );
});

void test("cardinality 事实同源投影到 grammar、usage、help 与 manifest", async () => {
  const cli = createArchiveCli();
  const fields = [
    {
      kind: "positional",
      key: "source",
      description: "源文件",
      required: true,
    },
    {
      kind: "variadicPositional",
      key: "files",
      description: "附加文件",
      required: false,
    },
    {
      kind: "repeatableOption",
      key: "tag",
      longOption: "--tag",
      shortAlias: "-t",
      description: "归档标签",
      required: false,
    },
    {
      kind: "flag",
      key: "color",
      longOption: "--color",
      negatedLongOption: "--no-color",
      description: "彩色输出",
      required: false,
    },
  ] as const;

  assert.deepEqual(cli.grammar.root.fields, fields);
  assert.strictEqual(
    cli.grammar.root.fields,
    cli.manifest.commands.archiveFiles.fields,
  );
  assert.equal(
    cli.grammar.root.usage.synopsis,
    "archive-files <source> [<files...>] [--tag <tag>]... [--color|--no-color]",
  );

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    "归档文件\n\n  archive-files <source> [<files...>] [--tag <tag>]... [--color|--no-color]\n\n  <source>\n    源文件\n  [<files...>]\n    附加文件\n\n  [--tag, -t <tag>]...\n    归档标签\n  [--color, --no-color]\n    彩色输出\n  --help\n",
  ]);
});

void test("defineCli 拒绝 variadic 后续 positional 与非法或冲突 negated spelling", () => {
  const definition = {
    root: "invalidCardinality",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidCardinality: {
        kind: "rootCommand",
        name: "invalid-cardinality",
        description: "非法 cardinality",
        fields: {
          files: { kind: "variadicPositional", description: "文件" },
          after: { kind: "positional", description: "后续字段" },
          color: {
            kind: "flag",
            longOption: "--color",
            negatedLongOption: "--No-color",
            description: "颜色",
          },
          quiet: {
            kind: "flag",
            longOption: "--no-verbose",
            description: "静默",
          },
          verbose: {
            kind: "flag",
            longOption: "--verbose",
            negatedLongOption: "--no-verbose",
            description: "详细",
          },
        },
        input: z.object({
          files: z.array(z.string()).optional(),
          after: z.string().optional(),
          color: z.boolean().optional(),
          quiet: z.boolean().optional(),
          verbose: z.boolean().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };

  assert.throws(
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidFieldLongOption",
          command: "invalidCardinality",
          field: "color",
          received: "--No-color",
        },
        {
          code: "duplicateFieldLongOption",
          command: "invalidCardinality",
          longOption: "--no-verbose",
          fields: ["quiet", "verbose"],
        },
        {
          code: "positionalAfterVariadic",
          command: "invalidCardinality",
          field: "after",
          variadicField: "files",
        },
      ]);
      return true;
    },
  );
});
