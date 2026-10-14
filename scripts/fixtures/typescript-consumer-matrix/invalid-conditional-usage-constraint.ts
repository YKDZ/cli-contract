/* oxlint-disable unicorn/no-thenable -- then 是 when 条件的公开分支名。 */
import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

defineCli()({
  root: "missingWhenEffects",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    missingWhenEffects: {
      kind: "rootCommand",
      name: "missing-when-effects",
      description: "缺少条件效果",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        { kind: "when", all: [{ kind: "present", field: "mode" }] },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

const define = defineCli();
define({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...define.command("branchConflict")({
      kind: "command",
      parent: "workspace",
      name: "branch-conflict",
      description: "条件分支冲突",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({ token: z.string().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          then: { require: ["token"], forbid: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});
