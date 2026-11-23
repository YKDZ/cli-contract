import { defineCli, helpCapability } from "@ykdz/cli-contract";
import { z } from "zod";

const sharedInput0 = z.object({});
defineCli()({
  root: "bad_root",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    bad_root: {
      kind: "rootCommand",
      name: "Invalid root identity",
      description: "Checks root command identity diagnostics",
      input: sharedInput0,

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

const sharedInput1 = z.object({ token: z.boolean().optional() });
defineCli()({
  root: "negatedRoot",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    negatedRoot: {
      kind: "rootCommand",
      name: "Negated option spelling",
      description:
        "Still checks the negated option when the short alias is omitted",
      fields: {
        token: {
          kind: "flag",
          longOption: "--token",
          negatedLongOption: "--no-Bad",
          description: "Token",
        },
      },
      input: sharedInput1,

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

const sharedInput2 = z.object({ token: z.string().optional() });
defineCli()({
  root: "longOptionIdentity",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    longOptionIdentity: {
      kind: "rootCommand",
      name: "Long option spelling",
      description: "Checks an invalid long option",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--Bad",
          description: "Token",
        },
      },
      input: sharedInput2,

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

const sharedInput3 = z.object({ token: z.string().optional() });
defineCli()({
  root: "shortAliasIdentity",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    shortAliasIdentity: {
      kind: "rootCommand",
      name: "Short alias spelling",
      description: "Checks an invalid short alias",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          shortAlias: "-bad",
          description: "Token",
        },
      },
      input: sharedInput3,

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

const sharedInput4 = z.object({ bad_field: z.string().optional() });
defineCli()({
  root: "fieldIdentity",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    fieldIdentity: {
      kind: "rootCommand",
      name: "Field identity",
      description: "Checks field identity",
      fields: {
        bad_field: {
          kind: "valueOption",
          longOption: "--bad-field",
          description: "Token",
        },
      },
      input: sharedInput4,

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

const sharedInput5 = z.object({ token: z.string().optional() });
defineCli()({
  root: "dataVariantIdentity",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    dataVariantIdentity: {
      kind: "rootCommand",
      name: "Data variant identity",
      description: "Checks data variant identity",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
        },
      },
      input: sharedInput5,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              bad_name: {
                description: "Data variant",
                schema: z.string(),
                exitCode: 0,
              },
            },
          },
          failures: {},
          handler: () => {
            throw new Error("Type-check only");
          },
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

const sharedInput6 = z.object({});
defineCli()({
  root: "failureVariantIdentity",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    failureVariantIdentity: {
      kind: "rootCommand",
      name: "Failure variant identity",
      description: "Checks failure variant identity",
      input: sharedInput6,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            bad_name: {
              description: "Failure variant",
              schema: z.string(),
              exitCode: 1,
            },
          },
          handler: () => {
            throw new Error("Type-check only");
          },
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
const sharedInput7 = z.object({ token: z.boolean().optional() });
const invalidNegatedChild = define.command("deploy")({
  kind: "command",
  parent: "workspace",
  name: "Deploy",
  description: "Negated option spelling in command composition",
  fields: {
    token: {
      kind: "flag",
      longOption: "--token",
      negatedLongOption: "--no-Bad",
      description: "Token",
    },
  },
  input: sharedInput7,

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
  help: helpCapability(),

  usageFailureExitCode: 64,
  // @ts-expect-error An invalid negated option must not enter the root command tree.
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "Workspace",
      description: "Workspace",
    },
    ...invalidNegatedChild,
  },
});

const sharedInput8 = z.object({ constructor: z.string().optional() });
defineCli()({
  root: "reservedConstructor",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedConstructor: {
      kind: "rootCommand",
      name: "Reserved field",
      description:
        "A reserved name is not allowed by field shape or requiredness",
      fields: {
        constructor: {
          kind: "valueOption",
          longOption: "--constructor",
          description: "Reserved field identity",
        },
      },
      input: sharedInput8,

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

const sharedInput9 = z.object({ hasOwnProperty: z.boolean() });
defineCli()({
  root: "reservedHasOwnProperty",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedHasOwnProperty: {
      kind: "rootCommand",
      name: "Reserved field",
      description:
        "A reserved name is not allowed by field shape or requiredness",
      fields: {
        hasOwnProperty: {
          kind: "flag",
          longOption: "--hasownproperty",
          description: "Reserved field identity",
        },
      },
      input: sharedInput9,

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

const sharedInput10 = z.object({ isPrototypeOf: z.string() });
defineCli()({
  root: "reservedIsPrototypeOf",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedIsPrototypeOf: {
      kind: "rootCommand",
      name: "Reserved field",
      description:
        "A reserved name is not allowed by field shape or requiredness",
      fields: {
        isPrototypeOf: {
          kind: "positional",
          description: "Reserved field identity",
        },
      },
      input: sharedInput10,

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
  propertyIsEnumerable: z.array(z.string()).min(1).optional(),
});
defineCli()({
  root: "reservedPropertyIsEnumerable",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedPropertyIsEnumerable: {
      kind: "rootCommand",
      name: "Reserved field",
      description:
        "A reserved name is not allowed by field shape or requiredness",
      fields: {
        propertyIsEnumerable: {
          kind: "repeatableOption",
          longOption: "--propertyisenumerable",
          description: "Reserved field identity",
        },
      },
      input: sharedInput11,

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

const sharedInput12 = z.object({ toString: z.string().optional() });
defineCli()({
  root: "reservedToString",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedToString: {
      kind: "rootCommand",
      name: "Reserved field",
      description:
        "A reserved name is not allowed by field shape or requiredness",
      fields: {
        toString: {
          kind: "valueOption",
          longOption: "--tostring",
          description: "Reserved field identity",
        },
      },
      input: sharedInput12,

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

const sharedInput13 = z.object({ valueOf: z.array(z.string()).min(1) });
defineCli()({
  root: "reservedValueOf",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedValueOf: {
      kind: "rootCommand",
      name: "Reserved field",
      description:
        "A reserved name is not allowed by field shape or requiredness",
      fields: {
        valueOf: {
          kind: "variadicPositional",
          description: "Reserved field identity",
        },
      },
      input: sharedInput13,

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

const reservedLocaleFields = {
  toLocaleString: {
    kind: "valueOption",
    longOption: "--tolocalestring",
    description: "Reserved field identity",
  },
} as const;

const sharedInput14 = z.object({ toLocaleString: z.string().optional() });
define.command("reservedToLocaleString")({
  kind: "command",
  parent: "workspace",
  name: "Reserved field",
  description:
    "An extracted field is also rejected through command composition",
  fields: reservedLocaleFields,
  input: sharedInput14,

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
