import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const define = defineCli();
const countHelp = helpCapability({
  wording: {
    countExactly: "{fields} appears exactly {count} times",
    countAtLeast: "{fields} appears at least {min} times",
    countAtMost: "{fields} appears at most {max} times",
    countBetween: "{fields} appears between {min} and {max} times",
  },
});
const dynamicCountFields: readonly ["auth" | "quiet", ...("auth" | "quiet")[]] =
  ["auth", "quiet"];
const validWideLastSuffixCountFields: readonly [...string[], "quiet", string] =
  ["quiet", "auth"];
declare const missingFixedCountFields: readonly ["missing", string];
declare const missingRestCountFields: readonly ["missing", ...string[]];
declare const missingSuffixCountFields: readonly [...string[], "missing"];
const missingSuffixBeforeWideCountFields: readonly [
  ...string[],
  "missing",
  string,
] = ["missing", "token"];
declare const duplicateSuffixCountFields: readonly [
  "token",
  ...string[],
  "token",
];
declare const broadCountFields: string[];
declare const broadCountTuple: readonly [string, string];
declare const unionCountTuple: readonly ["auth" | "quiet", "auth" | "quiet"];

const sharedInput0 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidChild = define.command("deploy")({
  kind: "command",
  parent: "workspace",
  name: "deploy",
  description: "Deploy",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "Auth" },
    quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
  },
  input: sharedInput0,
  usageConstraints: [
    {
      kind: "count",
      fields: dynamicCountFields,
      min: 2,
      max: 1,
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
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

const sharedInput1 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidDynamicNegativeChild = define.command("stage")({
  kind: "command",
  parent: "workspace",
  name: "stage",
  description: "Deploy stage",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "Auth" },
    quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
  },
  input: sharedInput1,
  usageConstraints: [
    {
      kind: "count",
      fields: dynamicCountFields,
      min: -1,
      max: 1,
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
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

const sharedInput2 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidFixedMaximumChild = define.command("quota")({
  kind: "command",
  parent: "workspace",
  name: "quota",
  description: "Quota",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "Auth" },
    quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
  },
  input: sharedInput2,
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      max: 3,
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
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

const sharedInput3 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidCompoundChild = define.command("compound")({
  kind: "command",
  parent: "workspace",
  name: "compound",
  description: "Multiple count errors",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "Auth" },
    quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
  },
  input: sharedInput3,
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      min: -1,
      max: 3,
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
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

const sharedInput4 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidFractionalChild = define.command("fractional")({
  kind: "command",
  parent: "workspace",
  name: "fractional",
  description: "Fractional endpoint",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "Auth" },
    quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
  },
  input: sharedInput4,
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      min: 0.5,
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
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidDynamicNegativeChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidFixedMaximumChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidCompoundChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidFractionalChild,
  },
});

const sharedInput5 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
defineCli()({
  root: "rootDeploy",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    rootDeploy: {
      kind: "rootCommand",
      name: "Root deploy",
      description: "Root deploy",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
        quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
      },
      input: sharedInput5,
      usageConstraints: [
        {
          kind: "count",
          fields: ["auth", "quiet"],
          min: -1,
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

const sharedInput6 = z.object({ auth: z.boolean().optional() });
defineCli()({
  root: "rootMissingCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    rootMissingCountField: {
      kind: "rootCommand",
      name: "Root missing field",
      description: "Mixed count field group in a root command",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
      },
      input: sharedInput6,
      usageConstraints: [
        {
          kind: "count",
          fields: missingFixedCountFields,
          min: 0,
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

const sharedInput7 = z.object({ auth: z.boolean().optional() });
const invalidMixedCountChild = define.command("missingCountChild")({
  kind: "command",
  parent: "workspace",
  name: "Child command missing field",
  description: "Mixed count field group in composition expansion",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "Auth" },
  },
  input: sharedInput7,
  usageConstraints: [
    {
      kind: "count",
      fields: missingRestCountFields,
      min: 0,
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
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidMixedCountChild,
  },
});

const sharedInput8 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
defineCli()({
  root: "validBroadCounts",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    validBroadCounts: {
      kind: "rootCommand",
      name: "Wide count field group",
      description: "Wide field group that is still valid",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
        quiet: { kind: "flag", longOption: "--quiet", description: "Quiet" },
      },
      input: sharedInput8,
      usageConstraints: [
        { kind: "count", fields: broadCountFields, min: 0, max: 1 },
        { kind: "count", fields: broadCountTuple, min: 0, max: 2 },
        { kind: "count", fields: unionCountTuple, min: 0, max: 2 },
        {
          kind: "count",
          fields: validWideLastSuffixCountFields,
          min: 0,
          max: 2,
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

const sharedInput9 = z.object({ token: z.string().optional() });
defineCli()({
  root: "missingSuffixCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    missingSuffixCountField: {
      kind: "rootCommand",
      name: "Suffix unknown field",
      description: "Reserved known-suffix field",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
        },
      },
      input: sharedInput9,
      usageConstraints: [
        { kind: "count", fields: missingSuffixCountFields, max: 1 },
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

const sharedInput10 = z.object({ token: z.string().optional() });
defineCli()({
  root: "missingSuffixBeforeWideCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    missingSuffixBeforeWideCountField: {
      kind: "rootCommand",
      name: "Suffix unknown field before a wide member",
      description:
        "A trailing wide member must not mask an earlier known required field",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
        },
      },
      input: sharedInput10,
      usageConstraints: [
        {
          kind: "count",
          fields: missingSuffixBeforeWideCountFields,
          max: 1,
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

const sharedInput11 = z.object({ token: z.string().optional() });
defineCli()({
  root: "duplicateSuffixCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    duplicateSuffixCountField: {
      kind: "rootCommand",
      name: "Suffix duplicate field",
      description: "Reserved known prefix/suffix field",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
        },
      },
      input: sharedInput11,
      usageConstraints: [
        { kind: "count", fields: duplicateSuffixCountFields, max: 1 },
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
