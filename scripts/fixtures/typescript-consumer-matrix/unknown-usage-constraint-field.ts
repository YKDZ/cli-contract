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
const missingSuffixEffectFields: readonly [...string[], "missing"] = [
  "token",
  "missing",
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
          onMatch: { require: ["token"] },
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
          onMatch: { require: ["token"] },
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
          onMatch: { require: mixedRestReferences },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "suffixMissingEffect",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    suffixMissingEffect: {
      kind: "rootCommand",
      name: "后缀未知效果字段",
      description: "保留效果已知后缀",
      fields: {
        token: { kind: "flag", longOption: "--token", description: "令牌" },
      },
      input: z.object({ token: z.boolean().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: missingSuffixEffectFields },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
