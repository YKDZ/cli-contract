import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@ykdz/cli-contract";
import { z } from "zod";

function createPackageCli() {
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
        description: "管理工作区",
        sharedOptions: {
          verbose: {
            kind: "flag",
            longOption: "--verbose",
            description: "显示详细信息",
          },
        },
      },
      package: {
        kind: "commandGroup",
        parent: "workspace",
        name: "package",
        description: "管理包",
        sharedOptions: {
          registry: {
            kind: "valueOption",
            longOption: "--registry",
            description: "包注册表",
          },
        },
      },
      ...define.command("addPackage")({
        kind: "command",
        parent: "package",
        name: "add",
        description: "添加包",
        fields: {
          name: { kind: "positional", description: "包名" },
        },
        usageConstraints: [
          { kind: "requires", field: "registry", requires: "verbose" },
        ],
        input: z.object({
          name: z.string(),
          verbose: z.boolean().optional(),
          registry: z.string().optional(),
        }),
        success: {
          kind: "data",
          variants: {
            added: {
              description: "添加结果",
              schema: z.object({
                name: z.string(),
                verbose: z.boolean().optional(),
                registry: z.string().optional(),
              }),
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ input, outcome }) => outcome.data.added(input),
      }),
    },
  });
}

void test("shared option 沿 parent scope 贯通解析、handler 与输出", async () => {
  const cli = createPackageCli();
  const invocation = parseCliInvocation(cli, [
    "--verbose",
    "package",
    "--registry",
    "internal",
    "add",
    "core",
  ]);
  if (invocation.kind === "parsed") {
    const verbose = invocation.input.verbose satisfies true | undefined;
    const registry = invocation.input.registry satisfies string | undefined;
    const name = invocation.input.name satisfies string | undefined;
    void verbose;
    void registry;
    void name;
  }
  assert.deepEqual(invocation, {
    kind: "parsed",
    command: "addPackage",
    input: { verbose: true, registry: "internal", name: "core" },
    outputFormat: "structured",
  });

  const writes: string[] = [];
  const termination = await executeCli(cli, {
    invocation,
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.equal(termination.kind, "applicationResult");
  assert.deepEqual(writes, [
    '{"schemaVersion":"1","command":"addPackage","kind":"data","variant":"added","data":{"name":"core","verbose":true,"registry":"internal"}}\n',
  ]);
});

void test("shared option 在声明 scope 后任意位置生效，leaf option 不向祖先泄漏", () => {
  const cli = createPackageCli();

  assert.deepEqual(
    parseCliInvocation(cli, [
      "package",
      "add",
      "core",
      "--registry",
      "internal",
      "--verbose",
    ]),
    {
      kind: "parsed",
      command: "addPackage",
      input: { name: "core", registry: "internal", verbose: true },
      outputFormat: "structured",
    },
  );
  assert.deepEqual(
    parseCliInvocation(cli, [
      "package",
      "--verbose",
      "--registry",
      "internal",
      "add",
      "core",
    ]),
    {
      kind: "parsed",
      command: "addPackage",
      input: { verbose: true, registry: "internal", name: "core" },
      outputFormat: "structured",
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["--registry", "package"]), {
    kind: "usageFailure",
    command: "workspace",
    issues: [{ code: "unknownOption", position: 0, option: "--registry" }],
    usage: {
      command: "workspace",
      synopsis: "workspace [--verbose] <command>",
    },
  });
  assert.deepEqual(
    parseCliInvocation(cli, [
      "package",
      "--registry",
      "internal",
      "add",
      "core",
    ]),
    {
      kind: "usageFailure",
      command: "addPackage",
      issues: [
        {
          code: "requiredByUsageConstraint",
          field: "registry",
          requires: "verbose",
        },
      ],
      usage: {
        command: "addPackage",
        synopsis:
          "workspace package add [--verbose] [--registry <registry>] <name>",
      },
    },
  );
});

void test("grammar、help 与 manifest 同时保留声明 scope 和叶有效字段", async () => {
  const cli = createPackageCli();
  assert.deepEqual(
    cli.grammar.root.sharedOptions.map(({ key }) => key),
    ["verbose"],
  );
  const packageGroup = cli.grammar.nodes.find((node) => node.id === "package");
  assert(packageGroup?.kind === "commandGroup");
  assert.deepEqual(
    packageGroup.sharedOptions.map(({ key }) => key),
    ["registry"],
  );
  const leaf = cli.grammar.nodes.find((node) => node.id === "addPackage");
  assert(leaf?.kind === "command");
  assert.deepEqual(
    leaf.fields.map(({ key }) => key),
    ["name"],
  );
  assert.deepEqual(
    leaf.effectiveFields.map(({ key }) => key),
    ["verbose", "registry", "name"],
  );
  assert.deepEqual(
    cli.manifest.commands.addPackage.effectiveFields.map(({ key }) => key),
    ["verbose", "registry", "name"],
  );

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["package", "add", "--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(
    writes.join(""),
    /^workspace package add \[--verbose\] \[--registry <registry>\] <name>/,
  );
});

void test("defineCli 拒绝继承字段 key、spelling 与输入 schema 漂移", () => {
  const define = defineCli();
  assert.throws(
    () =>
      define({
        root: "root",
        help: helpCapability(),
        output: outputCapability({ defaultFormat: "structured" }),
        usageFailureExitCode: 64,
        commands: {
          root: {
            kind: "rootGroup",
            name: "root",
            description: "根",
            sharedOptions: {
              token: {
                kind: "valueOption",
                longOption: "--token",
                description: "令牌",
              },
            },
          },
          ...define.command("run")({
            kind: "command",
            parent: "root",
            name: "run",
            description: "运行",
            fields: {
              token: {
                kind: "flag",
                longOption: "--other",
                description: "冲突 key",
              },
              other: {
                kind: "flag",
                longOption: "--token",
                description: "冲突 spelling",
              },
            },
            input: z.object({ token: z.string(), missing: z.string() }),
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      } as never),
    (error: unknown) => {
      assert(error instanceof ContractDefinitionError);
      assert.deepEqual(
        error.issues.map(({ code }) => code),
        [
          "duplicateInheritedFieldIdentity",
          "duplicateInheritedOptionSpelling",
          "schemaFieldSetMismatch",
        ],
      );
      return true;
    },
  );
});
