import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@cli-contract/lib";
import { z } from "zod";

function createWorkspaceCli() {
  const define = defineCli();
  return define({
    root: "workspace",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        aliases: ["ws"],
        description: "管理工作区",
        helpSupplement: "命令在当前工作区中运行。",
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
        input: z.object({ name: z.string() }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ input, outcome }) => {
          input satisfies { name: string };
          // @ts-expect-error completion 命令不暴露 data 构造器。
          void outcome.data;
          return outcome.completion();
        },
      }),
      ...define.command("listPackages")({
        kind: "command",
        parent: "package",
        name: "list",
        description: "列出包",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
    },
  });
}

void test("命令路径通过可见名称或 alias 选择叶命令", () => {
  const cli = createWorkspaceCli();

  assert.deepEqual(parseCliInvocation(cli, ["package", "add", "core"]), {
    kind: "parsed",
    command: "addPackage",
    input: { name: "core" },
    outputFormat: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["pkg", "a", "core"]), {
    kind: "parsed",
    command: "addPackage",
    input: { name: "core" },
    outputFormat: "structured",
  });
});

void test("group 自然结束与路径内 help 产生对应节点的局部帮助", () => {
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

void test("未知路径产生 unknownCommand，不回退到 group 或默认命令", () => {
  const cli = createWorkspaceCli();

  assert.deepEqual(parseCliInvocation(cli, ["package", "remove"]), {
    kind: "usageFailure",
    command: "package",
    issues: [{ code: "unknownCommand", position: 1, command: "remove" }],
    usage: { command: "package", synopsis: "workspace package <command>" },
  });
});

void test("grammar、manifest 与完整帮助投影同一父前子后层级", async () => {
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

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    "workspace <command>\n管理工作区\npackage, pkg\t管理包\n--help\n命令在当前工作区中运行。\n",
  ]);
});

void test("defineCli 聚合拒绝无效 parent、环与同级 spelling 冲突", () => {
  const definition = {
    root: "workspace",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
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
      defineCli()({
        root: "invalidRoot",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          invalidRoot: {
            kind: "rootGroup",
            parent: "missing",
            name: "invalid-root",
            description: "非法根",
            handler: () => undefined,
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
