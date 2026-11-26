import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  executeCli,
  parseCliInvocation,
} from "@boringparts/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

void test("leaf commands declare application options independently, and manifest and execution wire versions each stay accurate", async () => {
  const define = defineCli();
  const sharedInput1 = z.object({ region: z.enum(["us", "cn"]).optional() });
  const sharedInput0 = z.object({ region: z.enum(["us", "eu"]) });
  const cli = define({
    root: "workspace",
    help: englishHelpCapability(),

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

  assert.equal(cli.manifest.schemaVersion, "5");
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
    outputMode: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["inspect"]), {
    kind: "parsed",
    command: "inspect",
    input: {},
    outputMode: "structured",
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
    '{"schemaVersion":"3","command":"deploy","outputMode":"structured","kind":"completion"}\n',
  ]);
});
