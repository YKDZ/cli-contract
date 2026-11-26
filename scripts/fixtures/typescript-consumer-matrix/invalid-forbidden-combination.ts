import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const conflictingFactSuffix: readonly [
  ...{ readonly kind: "present"; readonly field: "token" }[],
  { readonly kind: "equals"; readonly field: "token"; readonly value: "safe" },
  { readonly kind: "equals"; readonly field: "token"; readonly value: "force" },
] = [
  { kind: "equals", field: "token", value: "safe" },
  { kind: "equals", field: "token", value: "force" },
];

const base = {
  help: helpCapability(),

  usageFailureExitCode: 64,
} as const;

type ValidExtractedFact =
  | { readonly kind: "present"; readonly field: "mode" }
  | {
      readonly kind: "equals";
      readonly field: "mode";
      readonly value: "safe";
    };
declare const validExtractedFact: ValidExtractedFact;

type ExtractedFactWithUnknownProperty =
  | {
      readonly kind: "present";
      readonly field: "mode";
      readonly typo: true;
    }
  | {
      readonly kind: "equals";
      readonly field: "mode";
      readonly value: "safe";
      readonly typo: true;
    };
declare const extractedFactWithUnknownProperty: ExtractedFactWithUnknownProperty;

const define = defineCli();
const sharedInput0 = z.object({ mode: z.enum(["safe", "force"]).optional() });
define({
  root: "workspace",
  ...base,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "Workspace",
    },
    ...define.command("invalidHierarchy")({
      kind: "command",
      parent: "workspace",
      name: "invalid-hierarchy",
      description: "Invalid hierarchy constraint",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput0,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: "staging" }],
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

const sharedInput1 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "validExtractedFactUnion",
  ...base,
  commands: {
    validExtractedFactUnion: {
      kind: "rootCommand",
      name: "valid-extracted-fact-union",
      description: "Valid extracted fact union",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput1,
      usageConstraints: [
        { kind: "forbiddenCombination", all: [validExtractedFact] },
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

const sharedInput2 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidClosedFactUnion",
  ...base,
  commands: {
    invalidClosedFactUnion: {
      kind: "rootCommand",
      name: "invalid-closed-fact-union",
      description: "Closed extracted fact union",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput2,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [extractedFactWithUnknownProperty],
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

const sharedInput3 = z.object({ mode: z.enum(["safe", "force"]).optional() });
define({
  root: "workspace",
  ...base,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "Workspace",
    },
    ...define.command("invalidClosedFactUnionHierarchy")({
      kind: "command",
      parent: "workspace",
      name: "invalid-closed-fact-union-hierarchy",
      description: "Hierarchy closed extracted fact union",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput3,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [extractedFactWithUnknownProperty],
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

const sharedInput4 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "invalidClosedConstraint",
  ...base,
  commands: {
    invalidClosedConstraint: {
      kind: "rootCommand",
      name: "invalid-closed-constraint",
      description: "Closed forbidden-combination rule",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput4,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "mode" }],
          typo: true,
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

const sharedInput5 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "invalidClosedFact",
  ...base,
  commands: {
    invalidClosedFact: {
      kind: "rootCommand",
      name: "invalid-closed-fact",
      description: "Closed forbidden-combination fact",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput5,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "mode", typo: true }],
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

const sharedInput6 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidNumericValue",
  ...base,
  commands: {
    invalidNumericValue: {
      kind: "rootCommand",
      name: "invalid-numeric-value",
      description: "Invalid numeric equality",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput6,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: 42 }],
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

const sharedInput7 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidNullValue",
  ...base,
  commands: {
    invalidNullValue: {
      kind: "rootCommand",
      name: "invalid-null-value",
      description: "Invalid null equality",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput7,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: null }],
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

const sharedInput8 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidObjectValue",
  ...base,
  commands: {
    invalidObjectValue: {
      kind: "rootCommand",
      name: "invalid-object-value",
      description: "Invalid object equality",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput8,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: { nested: true } }],
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

const sharedInput9 = z.object({ token: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "factSuffixConflict",
  ...base,
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
      input: sharedInput9,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: conflictingFactSuffix,
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

const sharedInput10 = z.object({
  auth: z.boolean().optional(),
  mode: z.enum(["safe", "fast"]).optional(),
});
defineCli()({
  root: "invalidValue",
  ...base,
  commands: {
    invalidValue: {
      kind: "rootCommand",
      name: "invalid-value",
      description: "Value type conflict",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput10,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "auth", value: "yes" },
            { kind: "equals", field: "mode", value: "unknown" },
          ],
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

const sharedInput11 = z.object({
  auth: z.boolean().optional(),
  target: z.array(z.string()).optional(),
});
defineCli()({
  root: "invalidKind",
  ...base,
  commands: {
    invalidKind: {
      kind: "rootCommand",
      name: "invalid-kind",
      description: "Field kind conflict",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "Auth" },
        target: {
          kind: "repeatableOption",
          longOption: "--target",
          description: "Target",
        },
      },
      input: sharedInput11,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "auth", value: true },
            { kind: "equals", field: "target", value: "prod" },
          ],
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

const sharedInput12 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "invalidContradiction",
  ...base,
  commands: {
    invalidContradiction: {
      kind: "rootCommand",
      name: "invalid-contradiction",
      description: "Contradictory equality fact",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput12,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
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

const sharedInput13 = z.object({ mode: z.string().optional() });
define({
  root: "workspace",
  ...base,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "Workspace",
    },
    ...define.command("contradictoryHierarchy")({
      kind: "command",
      parent: "workspace",
      name: "contradictory-hierarchy",
      description: "Contradictory equality fact",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: sharedInput13,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
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
