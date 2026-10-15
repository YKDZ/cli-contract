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
          onMatch: { require: ["token"], forbid: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
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

defineCli()({
  root: "multiFieldConflict",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({
        mode: z.string().optional(),
        token: z.string().optional(),
      }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: ["mode", "token"], forbid: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "unionFieldConflict",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({
        mode: z.string().optional(),
        token: z.string().optional(),
        auth: z.boolean().optional(),
      }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: unionModeRequirement, forbid: ["mode"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "effectSuffixConflict",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({ token: z.string().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: requiredTokenSuffix, forbid: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "factSuffixConflict",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({ token: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: conflictingFactSuffix,
          onMatch: { require: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
