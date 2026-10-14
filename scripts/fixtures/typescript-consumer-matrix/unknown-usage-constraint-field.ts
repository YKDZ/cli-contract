/* oxlint-disable unicorn/no-thenable -- then 是 when 条件的公开分支名。 */
import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

const mixedRestReferences: readonly ["missing", ...string[]] = [
  "missing",
  "token",
];

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
    ...define.command("deploy")({
      kind: "command",
      parent: "workspace",
      name: "deploy",
      description: "部署",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: z.object({ auth: z.boolean().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
          then: { require: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

defineCli()({
  root: "rootDeploy",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    rootDeploy: {
      kind: "rootCommand",
      name: "root-deploy",
      description: "根部署",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: z.object({ auth: z.boolean().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
          then: { require: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "mixedRest",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    mixedRest: {
      kind: "rootCommand",
      name: "mixed-rest",
      description: "保留已知错字段",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({
        auth: z.boolean().optional(),
        token: z.string().optional(),
      }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
          then: { require: mixedRestReferences },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
