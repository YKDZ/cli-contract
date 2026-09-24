import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@ykdz/cli-contract";
import { z } from "zod";

void test("叶命令独立声明应用选项，清单版本与执行线版本各自保持准确", async () => {
  const define = defineCli();
  const cli = define({
    root: "workspace",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        description: "管理工作区",
      },
      ...define.command("deploy")({
        kind: "command",
        parent: "workspace",
        name: "deploy",
        description: "部署",
        fields: {
          region: {
            kind: "valueOption",
            longOption: "--region",
            description: "区域",
          },
        },
        input: z.object({ region: z.enum(["us", "eu"]) }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
      ...define.command("inspect")({
        kind: "command",
        parent: "workspace",
        name: "inspect",
        description: "查看",
        fields: {
          region: {
            kind: "valueOption",
            longOption: "--region",
            description: "区域",
          },
        },
        input: z.object({ region: z.enum(["us", "cn"]).optional() }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }),
    },
  });

  assert.equal(cli.manifest.schemaVersion, "2");
  for (const command of ["deploy", "inspect"] as const) {
    const node = cli.grammar.nodes.find(
      (candidate) => candidate.id === command,
    );
    assert(node?.kind === "command");
    assert.deepEqual(
      node.fields.map(({ key }) => key),
      ["region"],
    );
    assert.deepEqual(
      cli.manifest.commands[command].fields.map(({ key }) => key),
      ["region"],
    );
  }

  assert.deepEqual(parseCliInvocation(cli, ["--region", "us", "deploy"]), {
    kind: "usageFailure",
    command: "workspace",
    issues: [{ code: "unknownOption", position: 0, option: "--region" }],
    usage: { command: "workspace", synopsis: "workspace <command>" },
  });
  assert.deepEqual(parseCliInvocation(cli, ["deploy", "--region", "eu"]), {
    kind: "parsed",
    command: "deploy",
    input: { region: "eu" },
    outputFormat: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["inspect"]), {
    kind: "parsed",
    command: "inspect",
    input: {},
    outputFormat: "structured",
  });

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["deploy", "--region", "eu"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    '{"schemaVersion":"1","command":"deploy","kind":"completion"}\n',
  ]);
});
