import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  parseCliInvocation,
  text,
} from "@boringparts/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

function createWorkspaceCli() {
  const define = defineCli();
  const sharedInput1 = z.object({});
  const sharedInput0 = z.object({ name: z.string() });
  return define({
    root: "workspace",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        aliases: ["ws"],
        description: "管理工作区",
        helpSupplement: text.lines(["命令在当前工作区中运行。"]),
      },
      package: {
        kind: "commandGroup",
        parent: "workspace",
        name: "package",
        aliases: ["pkg"],
        description: "管理包",
      },
      ...define.command("addPackage")({
        kind: "command",
        parent: "package",
        name: "add",
        aliases: ["a"],
        description: "添加包",
        fields: {
          name: { kind: "positional", description: "包名" },
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
                handler: ({ input, outcome }) => {
                  input satisfies { name: string };
                  // @ts-expect-error A completion command does not expose data constructors.
                  void outcome.data;
                  return outcome.completion();
                },
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      }),
      ...define.command("listPackages")({
        kind: "command",
        parent: "package",
        name: "list",
        description: "列出包",
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
    },
  });
}

void test("command paths select leaf commands by visible name or alias", () => {
  const cli = createWorkspaceCli();

  assert.deepEqual(parseCliInvocation(cli, ["package", "add", "core"]), {
    kind: "parsed",
    command: "addPackage",
    input: { name: "core" },
    outputMode: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["pkg", "a", "core"]), {
    kind: "parsed",
    command: "addPackage",
    input: { name: "core" },
    outputMode: "structured",
  });
});

void test("a natural group end and in-path help produce local help for the corresponding node", () => {
  const cli = createWorkspaceCli();

  assert.deepEqual(parseCliInvocation(cli, []), {
    kind: "help",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["package"]), {
    kind: "help",
    command: "package",
  });
  assert.deepEqual(parseCliInvocation(cli, ["--help", "package"]), {
    kind: "help",
    command: "workspace",
  });
  assert.deepEqual(parseCliInvocation(cli, ["package", "--help", "ignored"]), {
    kind: "help",
    command: "package",
  });
  assert.deepEqual(parseCliInvocation(cli, ["package", "add", "--help"]), {
    kind: "help",
    command: "addPackage",
  });
});

void test("an unknown path produces unknownCommand without falling back to a group or default command", () => {
  const cli = createWorkspaceCli();

  assert.deepEqual(parseCliInvocation(cli, ["package", "remove"]), {
    kind: "usageFailure",
    command: "package",
    issues: [{ code: "unknownCommand", position: 1, command: "remove" }],
    usage: { command: "package", synopsis: "workspace package <command>" },
  });
});

void test("grammar, manifest, and full help project the same parent-before-child hierarchy", async () => {
  const cli = createWorkspaceCli();
  const rootId: "workspace" = cli.grammar.root.id;
  type GrammarNode = (typeof cli.grammar.nodes)[number];
  const addParent: Extract<
    GrammarNode,
    { readonly id: "addPackage" }
  >["parent"] = "package";
  void rootId;
  void addParent;
  assert.deepEqual(
    [cli.grammar.root, ...cli.grammar.nodes].map((node) => [
      node.id,
      node.kind,
      "parent" in node ? node.parent : undefined,
      node.name,
      node.aliases,
    ]),
    [
      ["workspace", "rootGroup", undefined, "workspace", ["ws"]],
      ["package", "commandGroup", "workspace", "package", ["pkg"]],
      ["addPackage", "command", "package", "add", ["a"]],
      ["listPackages", "command", "package", "list", []],
    ],
  );
  assert.deepEqual(Object.keys(cli.manifest.commands), [
    "workspace",
    "package",
    "addPackage",
    "listPackages",
  ]);
  assert.deepEqual(Object.keys(cli.manifest.wire), [
    "addPackage",
    "listPackages",
  ]);
  const usageFailureWire = JSON.stringify(cli.manifest.usageFailure.wire);
  for (const [command, helpArgv] of [
    ["workspace", '["workspace","--help"]'],
    ["package", '["workspace","package","--help"]'],
    ["addPackage", '["workspace","package","add","--help"]'],
    ["listPackages", '["workspace","package","list","--help"]'],
  ]) {
    assert.match(
      usageFailureWire,
      new RegExp(`\\"command\\":\\{\\"const\\":\\"${command}\\"\\}`),
    );
    assert.ok(usageFailureWire.includes(`"helpArgv":{"const":${helpArgv}}`));
  }

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    "管理工作区\n\n  workspace <command>\n\n  package, pkg <command>\n    管理包\n\n  --help\n\n  命令在当前工作区中运行。\n",
  ]);
});

void test("defineCli aggregates rejection of invalid parents, cycles, and sibling spelling conflicts", () => {
  const definition = {
    root: "workspace",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      workspace: { kind: "rootGroup", name: "workspace", description: "根" },
      orphan: {
        kind: "commandGroup",
        parent: "missing",
        name: "orphan",
        description: "孤儿",
      },
      first: {
        kind: "commandGroup",
        parent: "second",
        name: "same",
        description: "第一",
      },
      second: {
        kind: "commandGroup",
        parent: "first",
        name: "other",
        aliases: ["same"],
        description: "第二",
      },
      duplicateOne: {
        kind: "commandGroup",
        parent: "workspace",
        name: "duplicate",
        description: "重复一",
      },
      duplicateTwo: {
        kind: "commandGroup",
        parent: "workspace",
        name: "other-duplicate",
        aliases: ["duplicate"],
        description: "重复二",
      },
    },
  } as const;

  assert.throws(
    () => defineCli()(definition),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(
        error.issues.map(({ code }) => code),
        [
          "invalidCommandParent",
          "commandHierarchyCycle",
          "duplicateCommandSpelling",
        ],
      );
      return true;
    },
  );

  assert.throws(
    () =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally bypasses static restrictions to verify definition-time rejection.
      defineCli()({
        root: "invalidRoot",
        help: englishHelpCapability(),

        usageFailureExitCode: 64,
        commands: {
          invalidRoot: {
            kind: "rootGroup",
            parent: "missing",
            name: "invalid-root",
            description: "非法根",
            handler: () => undefined as never,
          },
          child: {
            kind: "commandGroup",
            parent: "invalidRoot",
            name: "child",
            description: "子命令组",
          },
        },
      } as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(
        error.issues.map(({ code }) => code),
        ["invalidCommandParent", "invalidCommandHandler"],
      );
      return true;
    },
  );
});
