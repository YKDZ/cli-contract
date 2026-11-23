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
      description: "Workspace",
    },
    ...define.command("deploy")({
      kind: "command",
      parent: "workspace",
      name: "deploy",
      description: "Deploy",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
      },
      input: sharedInput0,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
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
      description: "Root deploy",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
      },
      input: sharedInput1,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "auth" }],
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
      description: "Reserved known wrong field",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
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
          all: [{ kind: "present", field: "auth" }],
          onMatch: { require: mixedRestReferences },
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

const sharedInput3 = z.object({ token: z.boolean().optional() });
defineCli()({
  root: "suffixMissingEffect",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    suffixMissingEffect: {
      kind: "rootCommand",
      name: "Suffix unknown effect field",
      description: "Reserved effect with a known suffix",
      fields: {
        token: { kind: "flag", longOption: "--token", description: "Token" },
      },
      input: sharedInput3,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: missingSuffixEffectFields },
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
