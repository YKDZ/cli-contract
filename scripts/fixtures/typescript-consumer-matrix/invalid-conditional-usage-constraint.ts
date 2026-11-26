import { defineCli, helpCapability } from "@boringparts/cli-contract";
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
      description: "Missing conditional effect",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput0,
      usageConstraints: [
        { kind: "when", all: [{ kind: "present", field: "mode" }] },
      ],

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
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
      description: "Workspace",
    },
    ...define.command("branchConflict")({
      kind: "command",
      parent: "workspace",
      name: "branch-conflict",
      description: "Conditional branch conflict",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
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

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
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
      description: "Multi-field effect conflict",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
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

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
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
      description: "Shared field conflict across branches",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
        },
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
      },
      input: sharedInput3,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: unionModeRequirement, forbid: ["mode"] },
        },
      ],

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
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
      name: "Effect suffix contradiction",
      description: "Reserved effect with a known suffix",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
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

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
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
      name: "Fact suffix contradiction",
      description: "Reserved fact with a known suffix",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
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

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});
