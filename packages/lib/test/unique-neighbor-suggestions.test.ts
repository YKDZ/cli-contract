import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  parseCliInvocation,
  text,
  versionCapability,
} from "@boringparts/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

function createSuggestionCli() {
  const define = defineCli();
  const sharedInput0 = z.object({
    verbose: z.boolean().optional(),
    registry: z.string().optional(),
    name: z.string(),
    force: z.boolean().optional(),
    label: z.string().optional(),
  });
  return define({
    root: "workspace",
    help: englishHelpCapability(),
    version: versionCapability({ value: text.line("1.0.0") }),

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
        aliases: ["pkg"],
        description: "包",
      },
      ...define.command("addPackage")({
        kind: "command",
        parent: "package",
        name: "add",
        aliases: ["install"],
        description: "添加包",
        fields: {
          verbose: {
            kind: "flag",
            longOption: "--verbose",
            shortAlias: "-v",
            description: "详细输出",
          },
          registry: {
            kind: "valueOption",
            longOption: "--registry",
            shortAlias: "-r",
            description: "注册表",
          },
          name: {
            kind: "positional",
            description: "包名",
          },
          force: {
            kind: "flag",
            longOption: "--force",
            shortAlias: "-f",
            description: "强制添加",
          },
          label: {
            kind: "valueOption",
            longOption: "--label",
            description: "标签",
          },
        },
        input: sharedInput0,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      }),
    },
  });
}

void test("command suggestions pick uniquely from the direct names and aliases of the current group", () => {
  const cli = createSuggestionCli();

  for (const [argv, issue] of [
    [["pakcage"], { command: "pakcage", suggestedCommand: "package" }],
    [["pkq"], { command: "pkq", suggestedCommand: "pkg" }],
    [["package", "ad"], { command: "ad", suggestedCommand: "add" }],
    [
      ["package", "insatll"],
      { command: "insatll", suggestedCommand: "install" },
    ],
  ] as const) {
    const invocation = parseCliInvocation(cli, argv);
    assert.equal(invocation.kind, "usageFailure");
    assert.deepEqual(invocation.issues, [
      { code: "unknownCommand", position: argv.length - 1, ...issue },
    ]);
  }

  assert.deepEqual(parseCliInvocation(cli, ["add"]), {
    kind: "usageFailure",
    command: "workspace",
    issues: [{ code: "unknownCommand", position: 0, command: "add" }],
    usage: {
      command: "workspace",
      synopsis: "workspace <command>",
    },
  });
});

void test("long option suggestions pick mechanically from the fields of the current executable command and core controls", () => {
  const cli = createSuggestionCli();

  for (const [argv, option, suggestedOption] of [
    [["package", "add", "--verbsoe"], "--verbsoe", "--verbose"],
    [["package", "add", "--regsitry"], "--regsitry", "--registry"],
    [["package", "add", "--focre"], "--focre", "--force"],
    [["--hepl"], "--hepl", "--help"],
    [["--versoin"], "--versoin", "--version"],
    [["--outpt"], "--outpt", "--output"],
    [["package", "add", "--lable=release"], "--lable=release", "--label"],
  ] as const) {
    const invocation = parseCliInvocation(cli, argv);
    assert.equal(invocation.kind, "usageFailure");
    assert.deepEqual(invocation.issues, [
      {
        code: "unknownOption",
        position: argv.length - 1,
        option,
        suggestedOption,
      },
    ]);
  }

  assert.deepEqual(parseCliInvocation(cli, ["--regsitry"]), {
    kind: "usageFailure",
    command: "workspace",
    issues: [{ code: "unknownOption", position: 0, option: "--regsitry" }],
    usage: {
      command: "workspace",
      synopsis: "workspace <command>",
    },
  });
  assert.deepEqual(parseCliInvocation(cli, ["package", "add", "-g"]), {
    kind: "usageFailure",
    command: "addPackage",
    issues: [{ code: "unknownOption", position: 2, option: "-g" }],
    usage: {
      command: "addPackage",
      synopsis:
        "workspace package add [--output <mode>] [--verbose] [--registry <registry>] <name> [--force] [--label <label>]",
    },
  });
});

void test("suggestions stay case-sensitive and are omitted at the threshold, on ties, or when too distant", () => {
  const define = defineCli();
  const sharedInput0 = z.object({});
  const sharedInput1 = z.object({
    read: z.boolean().optional(),
    write: z.boolean().optional(),
    abcxxx: z.boolean().optional(),
    cave: z.boolean().optional(),
    case: z.boolean().optional(),
  });
  const cli = define({
    root: "root",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      root: { kind: "rootGroup", name: "root", description: "根" },
      ...define.command("add")({
        kind: "command",
        parent: "root",
        name: "add",
        description: "添加",
        fields: {
          read: {
            kind: "flag",
            longOption: "--read",
            description: "读取",
          },
          write: {
            kind: "flag",
            longOption: "--write",
            description: "写入",
          },
          abcxxx: {
            kind: "flag",
            longOption: "--abcxxx",
            description: "完整距离测试",
          },
          cave: {
            kind: "flag",
            longOption: "--cave",
            description: "洞穴",
          },
          case: {
            kind: "flag",
            longOption: "--case",
            description: "大小写",
          },
        },
        input: sharedInput1,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      }),
      ...define.command("and")({
        kind: "command",
        parent: "root",
        name: "and",
        description: "并且",
        input: sharedInput0,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      }),
    },
  });

  for (const [argv, issue] of [
    [["aad"], { command: "aad" }],
    [["add", "--READ"], { option: "--READ" }],
    [["add", "--raed"], { option: "--raed", suggestedOption: "--read" }],
    [["add", "--rexx"], { option: "--rexx" }],
    [["add", "--caxxx"], { option: "--caxxx", suggestedOption: "--abcxxx" }],
    [["add", "--writxq"], { option: "--writxq", suggestedOption: "--write" }],
    [["add", "--wixxq"], { option: "--wixxq" }],
    [["add", "--caxe"], { option: "--caxe" }],
  ] as const) {
    const invocation = parseCliInvocation(cli, argv);
    assert.equal(invocation.kind, "usageFailure");
    assert.deepEqual(invocation.issues, [
      {
        code: argv.length === 1 ? "unknownCommand" : "unknownOption",
        position: argv.length - 1,
        ...(argv.length === 1 ? { command: argv[0] } : issue),
        ...issue,
      },
    ]);
  }
});
