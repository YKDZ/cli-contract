import { defineCli, helpCapability } from "@ykdz/cli-contract";
import { z } from "zod";

const sharedInput0 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "missingWhenEffects",
  help: helpCapability(),

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
      input: sharedInput0,
      usageConstraints: [
        { kind: "when", all: [{ kind: "present", field: "mode" }] },
      ],

      outputs: defineCli().outputModes(
        "missingWhenEffects",
        sharedInput0,
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

const define = defineCli();
const sharedInput1 = z.object({ token: z.string().optional() });
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
      input: sharedInput1,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: ["token"], forbid: ["token"] },
        },
      ],

      outputs: define.outputModes("branchConflict", sharedInput1, (mode) => ({
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

const unionModeRequirement:
  | readonly ["mode", "token"]
  | readonly ["mode", "auth"] = ["mode", "token"];
const requiredTokenSuffix: readonly [..."token"[], "token"] = ["token"];
const conflictingFactSuffix: readonly [
  ...{ readonly kind: "present"; readonly field: "token" }[],
  { readonly kind: "equals"; readonly field: "token"; readonly value: "safe" },
  { readonly kind: "equals"; readonly field: "token"; readonly value: "force" },
] = [
  { kind: "equals", field: "token", value: "safe" },
  { kind: "equals", field: "token", value: "force" },
];

const sharedInput2 = z.object({
  mode: z.string().optional(),
  token: z.string().optional(),
});
defineCli()({
  root: "multiFieldConflict",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    multiFieldConflict: {
      kind: "rootCommand",
      name: "multi-field-conflict",
      description: "多字段效果冲突",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
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
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: ["mode", "token"], forbid: ["token"] },
        },
      ],

      outputs: defineCli().outputModes(
        "multiFieldConflict",
        sharedInput2,
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

const sharedInput3 = z.object({
  mode: z.string().optional(),
  token: z.string().optional(),
  auth: z.boolean().optional(),
});
defineCli()({
  root: "unionFieldConflict",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    unionFieldConflict: {
      kind: "rootCommand",
      name: "union-field-conflict",
      description: "分支共同字段冲突",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: sharedInput3,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: unionModeRequirement, forbid: ["mode"] },
        },
      ],

      outputs: defineCli().outputModes(
        "unionFieldConflict",
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

const sharedInput4 = z.object({ token: z.string().optional() });
defineCli()({
  root: "effectSuffixConflict",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    effectSuffixConflict: {
      kind: "rootCommand",
      name: "效果后缀矛盾",
      description: "保留效果已知后缀",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: sharedInput4,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: requiredTokenSuffix, forbid: ["token"] },
        },
      ],

      outputs: defineCli().outputModes(
        "effectSuffixConflict",
        sharedInput4,
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

const sharedInput5 = z.object({ token: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "factSuffixConflict",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    factSuffixConflict: {
      kind: "rootCommand",
      name: "事实后缀矛盾",
      description: "保留事实已知后缀",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: sharedInput5,
      usageConstraints: [
        {
          kind: "when",
          all: conflictingFactSuffix,
          onMatch: { require: ["token"] },
        },
      ],

      outputs: defineCli().outputModes(
        "factSuffixConflict",
        sharedInput5,
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
