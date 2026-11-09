import { defineCli, helpCapability } from "@ykdz/cli-contract";
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

const sharedInput0 = z.object({ auth: z.boolean().optional() });
define({
  root: "workspace",
  help: helpCapability(),

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
      input: sharedInput0,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
          onMatch: { require: ["token"] },
        },
      ],

      outputs: define.outputModes("deploy", sharedInput0, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
    }),
  },
});

const sharedInput1 = z.object({ auth: z.boolean().optional() });
defineCli()({
  root: "rootDeploy",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    rootDeploy: {
      kind: "rootCommand",
      name: "root-deploy",
      description: "根部署",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: sharedInput1,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
          onMatch: { require: ["token"] },
        },
      ],

      outputs: defineCli().outputModes("rootDeploy", sharedInput1, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
    },
  },
});

const sharedInput2 = z.object({
  auth: z.boolean().optional(),
  token: z.string().optional(),
});
defineCli()({
  root: "mixedRest",
  help: helpCapability(),

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
      input: sharedInput2,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
          onMatch: { require: mixedRestReferences },
        },
      ],

      outputs: defineCli().outputModes("mixedRest", sharedInput2, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
    },
  },
});

const sharedInput3 = z.object({ token: z.boolean().optional() });
defineCli()({
  root: "suffixMissingEffect",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    suffixMissingEffect: {
      kind: "rootCommand",
      name: "后缀未知效果字段",
      description: "保留效果已知后缀",
      fields: {
        token: { kind: "flag", longOption: "--token", description: "令牌" },
      },
      input: sharedInput3,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: missingSuffixEffectFields },
        },
      ],

      outputs: defineCli().outputModes(
        "suffixMissingEffect",
        sharedInput3,
        (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }),
          },
        }),
      ),
    },
  },
});
