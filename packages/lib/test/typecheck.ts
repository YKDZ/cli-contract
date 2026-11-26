import {
  defineCli,
  type OutputExecutionFactory,
  executeCli,
  helpCapability,
  parseCliInvocation,
  schemaCapability,
  text,
  versionCapability,
  type CliContract,
  type CliContractResult,
  type CliInvocation,
  type CanonicalLongOption,
  type CountConstraintViolationIssue,
  type ContractSchema,
  type ContractSchemaInput,
  type ContractSchemaOutput,
  type EmptyCliInput,
  type FieldDefinition,
  type InvalidFieldChoiceIssue,
  type InvalidSchemaQueryIssue,
  type RootCommandDefinition,
  type ShortOptionAlias,
  type TextLines,
  type TextValueErrorIssue,
  type UsageIssue,
  type UsageConstraint,
  type UsageFactValue,
} from "@boringparts/cli-contract";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { z } from "zod";

import { englishHelpCapability, englishHelpWording } from "./english-help.ts";

const countConstraintIssue: CountConstraintViolationIssue = {
  code: "countConstraintViolation",
  min: 1,
  max: 2,
  presentFields: ["auth"],
  absentFields: ["quiet"],
};
void countConstraintIssue;

const realZodSchema = z
  .object({ name: z.string() })
  .transform(({ name }) => ({ normalizedName: name.toUpperCase() }))
  .pipe(z.object({ normalizedName: z.string() }));
const zodInput: ContractSchemaInput<typeof realZodSchema> = { name: "Ada" };
const zodOutput: ContractSchemaOutput<typeof realZodSchema> = {
  normalizedName: "ADA",
};

const realValibotSchema = toStandardJsonSchema(v.object({ name: v.string() }));
const valibotInput: ContractSchemaInput<typeof realValibotSchema> = {
  name: "Grace",
};
const valibotOutput: ContractSchemaOutput<typeof realValibotSchema> = {
  name: "Grace",
};

void zodInput;
void zodOutput;
void valibotInput;
void valibotOutput;

// oxlint-disable-next-line typescript/consistent-return -- Every branch of the closed issue union returns; new branches are left for the type checker to catch.
function exhaustivelyRecognizeUsageIssue(issue: UsageIssue): string {
  switch (issue.code) {
    case "conflictingFlag":
    case "conflictingOutputMode":
    case "countConstraintViolation":
    case "conditionalConstraintViolation":
    case "forbiddenCombinationViolation":
    case "inputRejected":
    case "invalidOutputMode":
    case "missingOptionValue":
    case "missingRequiredField":
    case "repeatedOption":
    case "unexpectedOptionValue":
    case "unexpectedPositional":
    case "unknownCommand":
    case "unknownOption":
      return issue.code;
    case "invalidFieldChoice":
      issue satisfies InvalidFieldChoiceIssue;
      return issue.choices.join(",");
    case "invalidSchemaQuery":
      issue satisfies InvalidSchemaQueryIssue;
      return issue.reason;
  }
}
void exhaustivelyRecognizeUsageIssue;

declare const emptyInput: ContractSchema<EmptyCliInput>;
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Contextual return-type inference is the authoring pattern under test.
declare function fromEnv<Value extends string>(fallback: string): Value;
declare const namedInput: ContractSchema<
  Readonly<{ readonly name: string }>,
  Readonly<{ readonly normalizedName: string }>
>;
declare const greetingData: ContractSchema<
  Readonly<{ readonly message: string }>
>;

type UsageFixtureFields = Readonly<{
  readonly format: {
    readonly kind: "valueOption";
    readonly longOption: "--format";
    readonly description: "Format";
  };
  readonly quiet: {
    readonly kind: "flag";
    readonly longOption: "--quiet";
    readonly description: "Silent";
  };
  readonly tags: {
    readonly kind: "repeatableOption";
    readonly longOption: "--tag";
    readonly description: "Tag";
  };
}>;

type UsageFixtureInput = Readonly<{
  readonly format?: "json" | "yaml";
  readonly quiet?: boolean;
  readonly tags?: readonly string[];
}>;

const validUsageConstraint: UsageConstraint<
  UsageFixtureFields,
  UsageFixtureInput
> = {
  kind: "forbiddenCombination",
  all: [
    { kind: "equals", field: "format", value: "json" },
    { kind: "equals", field: "format", value: "json" },
    { kind: "present", field: "tags" },
    { kind: "equals", field: "quiet", value: true },
  ],
};
void validUsageConstraint;

const sharedInput0 = z.object({ mode: z.enum(["safe", "force"]).optional() });
const validStaticUsageCli = defineCli()({
  root: "validStaticFacts",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    validStaticFacts: {
      kind: "rootCommand",
      name: "valid-static-facts",
      description: "Repeatable static fact",
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
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "present", field: "mode" },
          ],
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void validStaticUsageCli;

const whenInput = z.object({
  mode: z.enum(["safe", "force"]).optional(),
  token: z.string().optional(),
  cursor: z.string().optional(),
});
const validWhenCli = defineCli()({
  root: "validWhen",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    validWhen: {
      kind: "rootCommand",
      name: "valid-when",
      description: "Conditional fact",
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
        cursor: {
          kind: "valueOption",
          longOption: "--cursor",
          description: "Cursor",
        },
      },
      input: whenInput,
      usageConstraints: [
        {
          kind: "when",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "present", field: "mode" },
          ],
          onMatch: { require: ["token", "token"], forbid: ["cursor"] },
          otherwise: { forbid: ["token", "token"] },
        },
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: ["token"] },
        },
        {
          kind: "when",
          all: [{ kind: "present", field: "cursor" }],
          onMatch: {},
          otherwise: { forbid: ["token"] },
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void validWhenCli;

const dynamicRequiredEffectFields: readonly ("mode" | "token")[] = ["token"];
const dynamicForbiddenEffectFields: readonly ("mode" | "token")[] = ["mode"];
const dynamicEffectsInput = z.object({
  mode: z.string().optional(),
  token: z.string().optional(),
});
const dynamicEffectsWhenCli = defineCli()({
  root: "dynamicEffectsWhen",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    dynamicEffectsWhen: {
      kind: "rootCommand",
      name: "dynamic-effects-when",
      description: "Runtime-resolved dynamic effect field",
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
      input: dynamicEffectsInput,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: {
            require: dynamicRequiredEffectFields,
            forbid: dynamicForbiddenEffectFields,
          },
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void dynamicEffectsWhenCli;

const invalidWhenInput = z.object({
  mode: z.enum(["safe", "force"]).optional(),
});
// @ts-expect-error when.equals uses the field's raw Input domain.
const invalidWhenValueCli = defineCli()({
  root: "invalidWhenValue",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    invalidWhenValue: {
      kind: "rootCommand",
      name: "invalid-when-value",
      description: "Out-of-domain condition value",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: invalidWhenInput,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "equals", field: "mode", value: "toml" }],
          onMatch: { require: ["mode"] },
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void invalidWhenValueCli;

const sharedInput2 = z.object({ mode: z.string().optional() });
// @ts-expect-error One when branch cannot both require and forbid the same field.
const invalidWhenEffectsCli = defineCli()({
  root: "invalidWhenEffects",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    invalidWhenEffects: {
      kind: "rootCommand",
      name: "invalid-when-effects",
      description: "Contradictory branch effects",
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
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: ["mode"], forbid: ["mode"] },
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void invalidWhenEffectsCli;

const sharedInput3 = z.object({ mode: z.string().optional() });
// @ts-expect-error An empty effect branch does not form a valid rule.
const noEffectWhenCli = defineCli()({
  root: "noEffectWhen",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    noEffectWhen: {
      kind: "rootCommand",
      name: "no-effect-when",
      description: "Empty branch",
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
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: [] },
          otherwise: { forbid: [] },
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void noEffectWhenCli;

const sharedInput4 = z.object({ mode: z.string().optional() });
// @ts-expect-error With neither onMatch nor otherwise declared, the rule still has no effect.
defineCli()({
  root: "missingWhenEffects",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingWhenEffects: {
      kind: "rootCommand",
      name: "missing-when-effects",
      description: "Missing branch effects",
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
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});

const extractedWhenUnion =
  Math.random() < 0.5
    ? ({
        kind: "when",
        all: [{ kind: "present", field: "mode" }],
        onMatch: { require: ["token"], typo: true },
      } as const)
    : ({
        kind: "when",
        all: [{ kind: "present", field: "mode", typo: true }],
        otherwise: { forbid: ["token"], typo: true },
      } as const);
const extractedWhenInput = z.object({
  mode: z.string().optional(),
  token: z.string().optional(),
});
const invalidExtractedWhenCli = defineCli()({
  root: "invalidExtractedWhen",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    invalidExtractedWhen: {
      kind: "rootCommand",
      name: "invalid-extracted-when",
      description: "Extracted conditional union",
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
      input: extractedWhenInput,
      // @ts-expect-error Each fact/effect branch in the extracted union still rejects unknown properties.
      usageConstraints: [extractedWhenUnion],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void invalidExtractedWhenCli;

type FormatFactDomain = UsageFactValue<
  UsageFixtureFields,
  UsageFixtureInput,
  "format"
>;
const validFormatFact: FormatFactDomain = "yaml";
// @ts-expect-error An equals fact only accepts values from the corresponding schema Input.
const invalidFormatFact: FormatFactDomain = "toml";
type PositiveFlagFactDomain = UsageFactValue<
  UsageFixtureFields,
  UsageFixtureInput,
  "quiet"
>;
const validPositiveFlagFact: PositiveFlagFactDomain = true;
// @ts-expect-error An equals fact for a flag without a negated spelling can only express true.
const invalidPositiveFlagFact: PositiveFlagFactDomain = false;
void validFormatFact;
void invalidFormatFact;
void validPositiveFlagFact;
void invalidPositiveFlagFact;

const transformedModeSchema = z.object({
  mode: z
    .string()
    .transform((value) => value.length)
    .pipe(z.number()),
});
type TransformedModeInputFact = UsageFactValue<
  Readonly<{
    readonly mode: Readonly<{
      readonly kind: "valueOption";
      readonly longOption: "--mode";
      readonly description: "Mode";
    }>;
  }>,
  ContractSchemaInput<typeof transformedModeSchema>,
  "mode"
>;
const validRawModeFact: TransformedModeInputFact = "json";
// @ts-expect-error equals uses the intersection of raw and schema Input, not the Output number.
const invalidTransformedOutputFact: TransformedModeInputFact = 3;
const transformedModeOutput: ContractSchemaOutput<
  typeof transformedModeSchema
> = {
  mode: 3,
};
void validRawModeFact;
void invalidTransformedOutputFact;
void transformedModeOutput;

const defineObservationCli = defineCli();
const replayInput = z.object({
  mode: z
    .enum(["live", "after"])
    .transform((value) => value.length)
    .pipe(z.number()),
  token: z.string().optional(),
});
const replayCommand = defineObservationCli.command("replay")({
  kind: "command",
  parent: "tool",
  name: "replay",
  description: "Replay",
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
  input: replayInput,
  usageConstraints: [
    {
      kind: "when",
      all: [
        { kind: "equals", field: "mode", value: "after" },
        { kind: "present", field: "token" },
      ],
      onMatch: { require: ["token"] },
      otherwise: { forbid: ["token"] },
    },
  ],

  outputs: (mode) => ({
    default: "structured",
    modes: {
      structured: mode
        .atomic({
          success: {
            kind: "completion",
          },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        })
        .structured({
          description: "Structured output",
        }),
    },
  }),
});
const inspectInput = z.object({
  mode: z.enum(["json", "yaml"]).optional(),
  token: z.string().optional(),
});
const inspectCommand = defineObservationCli.command("inspect")({
  kind: "command",
  parent: "tool",
  name: "inspect",
  description: "Inspect",
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
  input: inspectInput,
  usageConstraints: [
    {
      kind: "when",
      all: [{ kind: "equals", field: "mode", value: "json" }],
      onMatch: { forbid: ["token"] },
    },
  ],

  outputs: (mode) => ({
    default: "structured",
    modes: {
      structured: mode
        .atomic({
          success: {
            kind: "completion",
          },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        })
        .structured({
          description: "Structured output",
        }),
    },
  }),
});
const observationCli = defineObservationCli({
  root: "tool",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "Tool" },
    ...replayCommand,
    ...inspectCommand,
  },
});
const replayInvocation = parseCliInvocation(observationCli, [
  "replay",
  "--mode",
  "after",
]);
if (
  replayInvocation.kind === "usageFailure" &&
  replayInvocation.command === "replay"
) {
  for (const issue of replayInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind !== "equals") continue;
    const replayExpected: "after" = condition.expected;
    // @ts-expect-error equals expected keeps the original Input domain, not the transformed Output number.
    const replayOutput: number = condition.expected;
    if (condition.present) {
      const rawActual: string | boolean = condition.actual;
      void rawActual;
    } else {
      // @ts-expect-error An absent equals observation carries no actual sentinel property.
      void condition.actual;
    }
    void replayExpected;
    void replayOutput;
  }
}
const inspectInvocation = parseCliInvocation(observationCli, [
  "inspect",
  "--mode",
  "json",
]);
if (
  inspectInvocation.kind === "usageFailure" &&
  inspectInvocation.command === "inspect"
) {
  for (const issue of inspectInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind !== "equals") continue;
    const inspectExpected: "json" = condition.expected;
    // @ts-expect-error Same-named fields in another command keep their own Input domains.
    const replayExpected: "after" = condition.expected;
    void inspectExpected;
    void replayExpected;
  }
}
const replayTermination = executeCli(observationCli, {
  invocation: replayInvocation,
  dependencies: undefined,
  write: () => undefined,
});
void replayTermination.then((termination) => {
  if (termination.kind !== "usageFailure" || termination.command !== "replay") {
    return;
  }
  for (const issue of termination.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind === "equals") {
      const expectedReplay: "after" = condition.expected;
      void expectedReplay;
    }
  }
});

const sharedInput5 = z.object({
  mode: z
    .enum(["safe", "force"])
    .transform((value) => value.length)
    .pipe(z.number()),
  token: z.string().optional(),
});
const rootObservationCli = defineCli()({
  root: "rootObservation",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    rootObservation: {
      kind: "rootCommand",
      name: "root-observation",
      description: "Root command observation",
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
      input: sharedInput5,
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "equals", field: "mode", value: "safe" }],
          onMatch: { require: ["token"] },
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
const rootObservationInvocation = parseCliInvocation(rootObservationCli, [
  "--mode",
  "safe",
]);
if (rootObservationInvocation.kind === "usageFailure") {
  const issue = rootObservationInvocation.issues[0];
  if (issue.code === "conditionalConstraintViolation") {
    const missingRootField: "token" = issue.missingRequiredFields[0]!;
    const condition = issue.conditions[0];
    if (condition.kind === "equals") {
      const expectedRootInput: "safe" = condition.expected;
      if (condition.present) {
        const rootRawActual: string | boolean = condition.actual;
        const outOfDomainActual: string | boolean = "outside";
        // @ts-expect-error expected comes from Input, not the transformed Output or out-of-domain values.
        const invalidRootExpected: "outside" = condition.expected;
        void rootRawActual;
        void outOfDomainActual;
        void invalidRootExpected;
      } else {
        // @ts-expect-error Absence carries no actual sentinel.
        void condition.actual;
      }
      void expectedRootInput;
    }
    void missingRootField;
  }
}
void executeCli(rootObservationCli, {
  invocation: rootObservationInvocation,
  dependencies: undefined,
  write: () => undefined,
}).then((termination) => {
  if (termination.kind !== "usageFailure") return;
  const issue = termination.issues[0];
  if (issue.code !== "conditionalConstraintViolation") return;
  const condition = issue.conditions[0];
  if (condition.kind === "equals") {
    const expectedRootInput: "safe" = condition.expected;
    void expectedRootInput;
  }
});

const widenedObservationCli: CliContract = observationCli;
const widenedObservationInvocation = parseCliInvocation(widenedObservationCli, [
  "replay",
]);
if (widenedObservationInvocation.kind === "usageFailure") {
  for (const issue of widenedObservationInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const broadConditionalCode: "conditionalConstraintViolation" = issue.code;
    void broadConditionalCode;
  }
}
void executeCli(widenedObservationCli, {
  invocation: widenedObservationInvocation,
  dependencies: undefined,
  write: () => undefined,
}).then((termination) => {
  if (termination.kind !== "usageFailure") return;
  for (const issue of termination.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const broadConditionalCode: "conditionalConstraintViolation" = issue.code;
    void broadConditionalCode;
  }
});

const closedFactInput = z.object({ mode: z.string().optional() });
const invalidClosedFactCli = defineCli()({
  root: "closedFacts",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    closedFacts: {
      kind: "rootCommand",
      name: "closed-facts",
      description: "Closed fact",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: closedFactInput,
      // @ts-expect-error Unknown fact members produce a stable local authoring diagnostic.
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "present", field: "mode", typo: true },
            { kind: "equals", field: "mode", value: "safe" },
          ],
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void invalidClosedFactCli;

const sharedInput6 = z.object({ mode: z.string().optional() });
// @ts-expect-error Two disjoint equals facts on the same field cannot pass static authoring.
defineCli()({
  root: "staticContradiction",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    staticContradiction: {
      kind: "rootCommand",
      name: "static-contradiction",
      description: "Statically contradictory fact",
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
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
        },
      ],

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});

const explicitTextLines: TextLines = text.lines([
  "First line",
  "",
  "Last line",
]);
void explicitTextLines;

const knownNonEmptyTextLines: readonly [string, ...string[]] = ["First line"];
void text.lines(knownNonEmptyTextLines);

const dynamicTextLines: string[] = ["First line"];
// @ts-expect-error A plain array does not preserve the at-least-one-line static fact.
text.lines(dynamicTextLines);

function narrowNotStringTextIssue(issue: TextValueErrorIssue): void {
  if (issue.reason !== "notString") return;
  if (issue.code === "invalidTextLines") {
    const line: number = issue.line;
    void line;
    return;
  }
  // @ts-expect-error Line and fragment construction issues carry no line position; check code first.
  const line: number = issue.line;
  void line;
}
void narrowNotStringTextIssue;

const shortHelp = helpCapability({ shortAlias: "-h" });
void shortHelp;

// @ts-expect-error The help short alias can only be -h.
helpCapability({ shortAlias: "-x" });

// @ts-expect-error Help fact wording only accepts closed slots.
helpCapability({
  wording: { choices: "{usage} Choices {choices}", typo: "Extra" },
});
// @ts-expect-error Help fact wording must still be a non-function object.
helpCapability({ wording: () => "Choices {choices}" });

// @ts-expect-error A static template must contain every required placeholder.
helpCapability({ wording: { choices: "{usage} Choices" } });
// @ts-expect-error Line modifier templates require {usage}.
helpCapability({ wording: { choices: "Choices {choices}" } });
// @ts-expect-error choicesAndDefault requires {usage}, {choices}, and {value}.
helpCapability({ wording: { choicesAndDefault: "{usage} ({choices})" } });
// @ts-expect-error Binary joiners require {left} and {right}.
helpCapability({ wording: { list: "{left}" } });
// @ts-expect-error A static template cannot reference unknown placeholders.
helpCapability({
  wording: { choices: "{usage} Choices {choices} or {other}" },
});
// @ts-expect-error A static template must be single-line.
helpCapability({ wording: { default: "{usage} Default\n{value}" } });
// @ts-expect-error An equals fact template must contain both field and value.
helpCapability({ wording: { equals: "Field {field}" } });
// @ts-expect-error A static help template cannot be whitespace-only.
helpCapability({ wording: { commandPlaceholder: "   " } });
// @ts-expect-error The command group placeholder itself cannot contain angle brackets.
helpCapability({ wording: { commandPlaceholder: "<group>" } });
// @ts-expect-error The output mode placeholder cannot be empty.
helpCapability({ wording: { outputModePlaceholder: "" } });
// @ts-expect-error The output mode placeholder cannot contain angle brackets.
helpCapability({ wording: { outputModePlaceholder: "<mode>" } });

const validHelpFactTemplates = helpCapability({
  wording: {
    commandPlaceholder: "command group",
    outputModePlaceholder: "output mode",
    choices: "{usage} Choices {choices}, also written {choices}",
    default: "{usage} Default {value}, confirm again {value}",
    choicesAndDefault: "{usage} ({choices}; {value})",
    list: "{left} / {right}",
    facts: "{left} & {right}",
    effects: "{left}; {right}",
  },
});
void validHelpFactTemplates;

const validPlaceholderCli = defineCli()({
  root: "placeholders",
  help: englishHelpCapability(),
  usageFailureExitCode: 64,
  commands: {
    placeholders: {
      kind: "rootCommand",
      name: "placeholders",
      description: "Validate field placeholder type contracts",
      fields: {
        target: {
          kind: "positional",
          placeholder: "target-file",
          description: "Target",
        },
        extras: {
          kind: "variadicPositional",
          placeholder: "extra-files",
          description: "Extras",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          placeholder: "api-token",
          description: "Token",
        },
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          placeholder: "tag-name",
          description: "Tags",
        },
      },
      input: z.object({
        target: z.string(),
        extras: z.array(z.string()).optional(),
        token: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({ description: "Structured" }),
        },
      }),
    },
  },
});
void validPlaceholderCli;

defineCli()({
  root: "badPlaceholders",
  help: englishHelpCapability(),
  usageFailureExitCode: 64,
  commands: {
    badPlaceholders: {
      kind: "rootCommand",
      name: "bad-placeholders",
      description: "Reject invalid placeholders at compile time",
      fields: {
        emptyPositional: {
          kind: "positional",
          // @ts-expect-error Empty field placeholder must fail statically.
          placeholder: "",
          description: "Empty",
        },
        blankVariadic: {
          kind: "variadicPositional",
          // @ts-expect-error Whitespace-only field placeholder must fail statically.
          placeholder: "   ",
          description: "Blank",
        },
        multilineOption: {
          kind: "valueOption",
          longOption: "--multi",
          // @ts-expect-error Multiline field placeholder must fail statically.
          placeholder: "line1\nline2",
          description: "Multiline",
        },
        bracketedRepeatable: {
          kind: "repeatableOption",
          longOption: "--bracket",
          // @ts-expect-error Angle brackets in field placeholder must fail statically.
          placeholder: "<tag>",
          description: "Bracketed",
        },
      },
      input: z.object({
        emptyPositional: z.string(),
        blankVariadic: z.array(z.string()).optional(),
        multilineOption: z.string().optional(),
        bracketedRepeatable: z.array(z.string()).optional(),
      }),
      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({ description: "Structured" }),
        },
      }),
    },
  },
});

const badFlagField = {
  kind: "flag",
  longOption: "--flag",
  placeholder: "nope",
  description: "Flag",
} as const;
defineCli()({
  root: "badFlagPlaceholder",
  help: englishHelpCapability(),
  usageFailureExitCode: 64,
  commands: {
    badFlagPlaceholder: {
      kind: "rootCommand",
      name: "bad-flag-placeholder",
      description: "Reject placeholder on flag",
      fields: {
        // @ts-expect-error Flags do not accept a placeholder property.
        flagged: badFlagField,
      },
      input: z.object({
        flagged: z.boolean().optional(),
      }),
      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({ description: "Structured" }),
        },
      }),
    },
  },
});

// @ts-expect-error TextLines can only be issued by the controlled constructor.
const forgedTextLines: TextLines = { kind: "lines", lines: ["Forged"] };
void forgedTextLines;

const cli = defineCli()({
  root: "fixture",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    fixture: {
      kind: "rootCommand",
      name: "fixture",
      description: "Demonstrate a minimal CLI",
      helpSupplement: explicitTextLines,
      input: emptyInput,

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler({ input, dependencies, outcome }) {
                input satisfies EmptyCliInput;
                dependencies satisfies undefined;
                return outcome.completion();
              },
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});

function checkModeBindings() {
  const define = defineCli();
  const run = define.command("run");
  const node = {
    kind: "command",
    name: "run",
    parent: "workspace",
    description: "Run",
    input: emptyInput,
  } as const;
  const execution = ({
    atomic,
  }: OutputExecutionFactory<"run", undefined, typeof emptyInput>) =>
    atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
  const valid = run({
    ...node,
    outputs: (factory) => ({
      modes: { json: execution(factory).structured({ description: "JSON" }) },
    }),
  });
  define.command("other")({
    ...node,
    // @ts-expect-error A mode bound to run cannot be selected by another command.
    outputs: () => ({
      modes: {
        json: valid.run.outputs.modes.json,
      },
    }),
  });
  run({
    ...node,
    // @ts-expect-error The default must be a declared mode.
    outputs: (factory) => ({
      default: "missing",
      modes: { json: execution(factory).structured({ description: "JSON" }) },
    }),
  });
  run({
    ...node,
    // @ts-expect-error Multiple modes need an explicit default.
    outputs: (factory) => {
      const result = execution(factory);
      return {
        modes: {
          json: result.structured({ description: "JSON" }),
          text: result.text({
            description: "Text",
            success: () => text.silent,
            failures: {},
          }),
        },
      };
    },
  });
}
void checkModeBindings;

const invalidHelpSupplement: RootCommandDefinition<"invalidSupplement"> = {
  kind: "rootCommand",
  name: "invalid-supplement",
  description: "Invalid help supplement",
  // @ts-expect-error The help supplement only accepts controlled TextLines.
  helpSupplement: "Arbitrary text",
  input: emptyInput,
  outputs: (mode) => ({
    default: "structured",
    modes: {
      structured: mode
        .atomic({
          success: {
            kind: "completion",
          },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        })
        .structured({
          description: "Structured output",
        }),
    },
  }),
};
void invalidHelpSupplement;

const dataCli = defineCli()({
  root: "greet",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    greet: {
      kind: "rootCommand",
      name: "greet",
      description: "Generate a greeting",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "Greeting target",
        },
      },
      input: namedInput,

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "data",
                variants: {
                  greeting: {
                    description: "Generated greeting",
                    schema: greetingData,
                    exitCode: 0,
                  },
                },
              },
              failures: {
                unavailable: {
                  description: "Service unavailable",
                  schema: greetingData,
                  exitCode: 9,
                },
              },
              handler({ input, outcome }) {
                input satisfies Readonly<{ readonly normalizedName: string }>;
                // @ts-expect-error A data handler does not own the completion constructor.
                outcome.completion();
                // @ts-expect-error Undeclared data variants cannot be constructed.
                outcome.data.other({ message: "nope" });
                // @ts-expect-error A data payload must match its variant schema.
                outcome.data.greeting({ message: 1 });
                // @ts-expect-error Undeclared failure variants cannot be constructed.
                outcome.failure.other({ message: "nope" });
                // @ts-expect-error A failure payload must match its variant schema.
                outcome.failure.unavailable({ message: 1 });
                // @ts-expect-error There is no catch-all default failure branch.
                outcome.failure.default({ message: "nope" });
                if (input.normalizedName === "unavailable") {
                  return outcome.failure.unavailable({
                    message: "Retry later",
                  });
                }
                return outcome.data.greeting({ message: input.normalizedName });
              },
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});

const streamCli = defineCli()({
  root: "stream",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    stream: {
      kind: "rootCommand",
      name: "stream",
      description: "Stream fixture",
      input: emptyInput,

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .stream({
              records: {
                greeting: {
                  description: "Greeting",
                  schema: greetingData,
                },
              },
              failures: {
                unavailable: {
                  description: "Service unavailable",
                  schema: greetingData,
                  exitCode: 9,
                },
              },
              async *handler({ outcome }) {
                yield outcome.record.greeting({ message: "hello" });
                return outcome.streamSuccess();
              },
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});
void streamCli;

const textStreamCli = defineCli()({
  root: "textStream",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    textStream: {
      kind: "rootCommand",
      name: "text-stream",
      description: "Text stream fixture",
      input: emptyInput,

      outputs: (mode) => ({
        default: "text",
        modes: {
          structured: mode
            .stream({
              records: {
                greeting: {
                  description: "Greeting",
                  schema: greetingData,
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.greeting({ message: "hello" });
                return outcome.streamSuccess();
              },
            })
            .structured({
              description: "Structured output",
            }),
          text: mode
            .stream({
              records: {
                greeting: {
                  description: "Greeting",
                  schema: greetingData,
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.greeting({ message: "hello" });
                return outcome.streamSuccess();
              },
            })
            .text({
              description: "Text output",
              records: {
                greeting: (data: Readonly<{ readonly message: string }>) =>
                  text.line(data.message),
              },
              failures: {},
              terminal: () =>
                text.lines(["Stream ended", "", "No more records"]),
            }),
        },
      }),
    },
  },
});
void textStreamCli;

const hierarchyStreamDefine = defineCli();
const hierarchyStreamLeaf = hierarchyStreamDefine.command("streamLeaf")({
  kind: "command",
  parent: "workspace",
  name: "stream",
  description: "Stream fixture",
  fields: {},
  input: emptyInput,

  outputs: (mode) => ({
    default: "structured",
    modes: {
      structured: mode
        .stream({
          records: {
            greeting: {
              description: "Greeting",
              schema: greetingData,
            },
          },
          failures: {},
          async *handler({ outcome }) {
            yield* [] as Iterable<never>;
            return outcome.streamSuccess();
          },
        })
        .structured({
          description: "Structured output",
        }),
    },
  }),
});
const textStreamHierarchy = hierarchyStreamDefine({
  root: "workspace",
  help: englishHelpCapability(),

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "Workspace",
    },
    ...hierarchyStreamLeaf,
  },
});
void textStreamHierarchy;

function verifyTypeErrors() {
  // @ts-expect-error The version capability requires an explicit controlled single-line value.
  versionCapability({ value: "1.2.3" });

  // @ts-expect-error A line group contains at least one entry at the type level.
  text.lines([]);

  const invalidUsageConstraint: UsageConstraint<
    UsageFixtureFields,
    UsageFixtureInput
  > = {
    kind: "forbiddenCombination",
    all: [
      // @ts-expect-error A repeatable option cannot be a discrete combination value.
      { kind: "equals", field: "tags", value: "nightly" },
      { kind: "equals", field: "quiet", value: true },
    ],
  };
  void invalidUsageConstraint;

  const sharedInput6 = z.object({
    auth: z.string().optional(),
    quiet: z.boolean().optional(),
  });
  const countAuthoringDefinition = {
    root: "countAuthoring",
    help: helpCapability({
      wording: {
        outputModePlaceholder: englishHelpWording.outputModePlaceholder,
        choicesAndDefault: englishHelpWording.choicesAndDefault,
        list: englishHelpWording.list,
        countExactly: "{fields} appears exactly {count} times",
        countAtLeast: "{fields} appears at least {min} times",
        countAtMost: "{fields} appears at most {max} times",
        countBetween: "{fields} appears {min} to {max} times",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      countAuthoring: {
        kind: "rootCommand",
        name: "count-authoring",
        description: "Count constraint",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "Authentication method",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            description: "Silent output",
          },
        },
        input: sharedInput6,
        usageConstraints: [
          { kind: "count", fields: ["auth", "quiet"], min: 0, max: 2 },
        ],

        outputs: (
          mode: OutputExecutionFactory<
            "countAuthoring",
            undefined,
            typeof sharedInput6
          >,
        ) => ({
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: () => {
                  throw new Error("Type fixtures never execute");
                },
              })
              .structured({
                description: "Structured output",
              }),
          },
        }),
      },
    },
  } as const;
  const countAuthoringCli = defineCli()(countAuthoringDefinition);
  void countAuthoringCli;

  const countDefinitionWith = <const Constraint extends object>(
    constraint: Constraint,
  ) => ({
    ...countAuthoringDefinition,
    commands: {
      ...countAuthoringDefinition.commands,
      countAuthoring: {
        ...countAuthoringDefinition.commands.countAuthoring,
        usageConstraints: [constraint],
      },
    },
  });
  const negativeCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    min: -1,
  });
  const fractionalCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    min: 0.5,
  });
  const reversedCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    min: 2,
    max: 1,
  });
  const excessiveCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    max: 3,
  });
  const endpointlessCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
  });
  const duplicateCountFieldsDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "auth"],
    min: 1,
  });
  const unknownCountFieldDefinition = countDefinitionWith({
    kind: "count",
    fields: ["missing"],
    min: 1,
  });
  const emptyCountFieldsDefinition = countDefinitionWith({
    kind: "count",
    fields: [],
    min: 0,
  });
  const unknownCountPropertyDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth"],
    min: 1,
    maximum: 1,
  });
  const dynamicCountFieldNames: string[] = ["auth", "quiet"];
  const dynamicCountFieldsDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFieldNames,
    min: 1,
  });
  const dynamicCountFieldPair: readonly [string, string] = ["auth", "quiet"];
  const dynamicCountFieldPairDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFieldPair,
    min: 1,
  });
  const dynamicCountFields: readonly [string, ...string[]] = ["auth", "quiet"];
  const reversedDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: 2,
    max: 1,
  });
  const negativeDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: -1,
    max: 1,
  });
  const orderedLargeDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: 1e100,
    max: 1e101,
  });
  const reversedLargeDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: 1e100,
    max: 1e99,
  });
  const excessiveLargeCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    max: 1e100,
  });
  // @ts-expect-error Known negative endpoints are rejected at authoring time.
  defineCli()(negativeCountDefinition);
  // @ts-expect-error Known fractional endpoints are rejected at authoring time.
  defineCli()(fractionalCountDefinition);
  // @ts-expect-error Known inverted endpoints are rejected at authoring time.
  defineCli()(reversedCountDefinition);
  // @ts-expect-error The maximum cannot exceed the field group length.
  defineCli()(excessiveCountDefinition);
  // @ts-expect-error A count constraint requires at least one explicit endpoint.
  defineCli()(endpointlessCountDefinition);
  // @ts-expect-error A field group cannot repeat the same field.
  defineCli()(duplicateCountFieldsDefinition);
  // @ts-expect-error A count constraint can only reference this command's fields.
  defineCli()(unknownCountFieldDefinition);
  // @ts-expect-error A count constraint field group cannot be empty.
  defineCli()(emptyCountFieldsDefinition);
  // @ts-expect-error A count constraint rejects undeclared properties.
  defineCli()(unknownCountPropertyDefinition);
  defineCli()(dynamicCountFieldsDefinition);
  defineCli()(dynamicCountFieldPairDefinition);
  // @ts-expect-error Even with a dynamic field group length, known inverted endpoints are rejected at authoring time.
  defineCli()(reversedDynamicCountDefinition);
  // @ts-expect-error Even with a dynamic field group length, known negative endpoints are rejected at authoring time.
  defineCli()(negativeDynamicCountDefinition);
  defineCli()(orderedLargeDynamicCountDefinition);
  // @ts-expect-error Large integer endpoint comparison cannot rely on recursive tuples expanded by endpoint size.
  defineCli()(reversedLargeDynamicCountDefinition);
  // @ts-expect-error A fixed field group should report large integers as exceeding the field count limit.
  defineCli()(excessiveLargeCountDefinition);

  const variadicValueOption: FieldDefinition = {
    // @ts-expect-error The core does not provide a variadic option that consumes multiple values per occurrence.
    kind: "variadicOption",
    longOption: "--values",
    description: "Multiple values",
  };
  void variadicValueOption;

  // @ts-expect-error Application results can only be issued by scoped outcome constructors.
  const rawFailure: CliContractResult<typeof dataCli> = {
    kind: "failure",
    command: "greet",
    variant: "unavailable",
    data: { message: "nope" },
  };
  void rawFailure;

  const invalidZodOutput: ContractSchemaOutput<typeof realZodSchema> = {
    // @ts-expect-error The transformed Zod Output no longer has the raw Input shape.
    name: "Ada",
  };
  void invalidZodOutput;

  // @ts-expect-error The canonical long option must be lowercase kebab-case.
  const invalidLongOption: CanonicalLongOption<"--foo_bar"> = "--foo_bar";
  void invalidLongOption;

  // @ts-expect-error A short alias must be a single ASCII letter or digit.
  const invalidShortAlias: ShortOptionAlias<"--f"> = "--f";
  void invalidShortAlias;

  // @ts-expect-error A CLI contract cannot be forged from a plain object literal.
  const forgedContract: CliContract = { grammar: {}, manifest: {} };
  void forgedContract;

  // @ts-expect-error A CLI invocation cannot be forged from a plain object literal.
  const forgedInvocation: CliInvocation<typeof cli> = {
    kind: "parsed",
    command: "fixture",
    input: {},
    outputMode: "structured",
  };
  void forgedInvocation;

  defineCli()({
    root: "invalidVariant",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      invalidVariant: {
        kind: "rootCommand",
        name: "invalid-variant",
        description: "Error variant",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "Greeting target",
          },
        },
        input: namedInput,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "data",
                  // @ts-expect-error Data variant names must start with a lowercase letter.
                  variants: {
                    "1greeting": {
                      description: "Error variant",
                      schema: greetingData,
                      exitCode: 0,
                    },
                  },
                },
                failures: {},
                handler: () => {
                  throw new Error("Type-check only");
                },
              })
              .structured({
                description: "Structured output",
              }),
            failure: mode
              .atomic({
                success: {
                  kind: "data",
                  variants: {
                    ok: {
                      description: "OK",
                      schema: greetingData,
                      exitCode: 0,
                    },
                  },
                },
                // @ts-expect-error Failure names must start with a lowercase letter.
                failures: {
                  "1failure": {
                    description: "Error failure",
                    schema: greetingData,
                    exitCode: 9,
                  },
                },
                handler: () => {
                  throw new Error("Type-check only");
                },
              })
              .structured({
                description: "Failure identity check",
              }),
          },
        }),
      },
    },
  });

  function completionOutputs<
    Command extends string,
    Schema extends ContractSchema,
  >({ atomic }: OutputExecutionFactory<Command, undefined, Schema>) {
    return {
      modes: {
        structured: atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        }).structured({ description: "Structured output" }),
      },
    };
  }

  defineCli()({
    root: "mismatch",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      mismatch: {
        kind: "rootCommand",
        name: "mismatch",
        description: "Error field",
        // @ts-expect-error Field keys must exactly match the contract schema Input properties.
        fields: {
          other: {
            kind: "valueOption",
            longOption: "--other",
            description: "Error field",
          },
        },
        input: namedInput,

        outputs: completionOutputs,
      },
    },
  });

  defineCli()({
    root: "invalidFields",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      invalidFields: {
        kind: "rootCommand",
        name: "invalid-fields",
        description: "Invalid field declaration",
        fields: {
          // @ts-expect-error A short alias must be a single ASCII letter or digit.
          name: {
            kind: "valueOption",
            longOption: "--name",
            shortAlias: "-bad",
            description: "Invalid field",
          },
        },
        input: namedInput,

        outputs: completionOutputs,
      },
    },
  });

  const sharedInput7 = z.object({ "bad-field": z.string() });
  defineCli()({
    root: "invalidIdentity",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      invalidIdentity: {
        kind: "rootCommand",
        name: "invalid-identity",
        description: "Invalid field identity",
        // @ts-expect-error Field identity must be lower camel case.
        fields: {
          "bad-field": {
            kind: "positional",
            description: "Invalid field",
          },
        },
        input: sharedInput7,

        outputs: completionOutputs,
      },
    },
  });
}

void verifyTypeErrors;
void cli;
void dataCli;

type InvocationDependencies = Readonly<{ readonly requestId: string }>;
const invocationDependencyCli = defineCli<InvocationDependencies>()({
  root: "dependencyRequest",
  help: englishHelpCapability(),
  version: versionCapability({ value: text.line("1.0.0") }),

  usageFailureExitCode: 64,
  commands: {
    dependencyRequest: {
      kind: "rootCommand",
      name: "request",
      description: "Dependency request identifier",
      input: emptyInput,

      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler({ dependencies, outcome }) {
                dependencies.requestId satisfies string;
                return outcome.completion();
              },
            })
            .structured({
              description: "Structured output",
            }),
        },
      }),
    },
  },
});

const dependencyInvocation = parseCliInvocation(invocationDependencyCli, []);
if (dependencyInvocation.kind === "parsed") {
  // @ts-expect-error Application invocations must carry exactly typed business dependencies.
  void executeCli(invocationDependencyCli, {
    invocation: dependencyInvocation,
    write: () => undefined,
  });
  void executeCli(invocationDependencyCli, {
    invocation: dependencyInvocation,
    // @ts-expect-error Application dependencies cannot be substituted with a different object shape.
    dependencies: { wrong: true },
    write: () => undefined,
  });
  void executeCli(invocationDependencyCli, {
    invocation: dependencyInvocation,
    dependencies: { requestId: "req-1" },
    write: () => undefined,
  });
}

const eagerDependencyInvocation = parseCliInvocation(invocationDependencyCli, [
  "--help",
]);
if (eagerDependencyInvocation.kind !== "parsed") {
  void executeCli(invocationDependencyCli, {
    invocation: eagerDependencyInvocation,
    write: () => undefined,
  });
}

function verifyRootCapabilityAndAlignedTypeErrors() {
  const validOptionalHeading: string | undefined = "Usage";
  const validExtractedHelp = {
    shortAlias: "-h",
    headings: { usage: validOptionalHeading },
    wording: { outputModePlaceholder: "mode" },
  } as const;
  helpCapability();
  helpCapability(undefined);
  helpCapability({});
  const emptyHelp = {} as const;
  helpCapability(emptyHelp);
  helpCapability(validExtractedHelp);
  helpCapability({ shortAlias: fromEnv("-h") });

  const branchCondition = Math.random() < 0.5;
  const helpUnion = branchCondition
    ? ({ shortAlias: "-h", headings: { usage: "Usage" } } as const)
    : ({ wording: { outputModePlaceholder: "mode" } } as const);
  helpCapability(helpUnion);
  const explicitHelpUnion:
    | { readonly shortAlias: "-h" }
    | { readonly wording: { readonly outputModePlaceholder: "mode" } } =
    branchCondition
      ? { shortAlias: "-h" }
      : { wording: { outputModePlaceholder: "mode" } };
  helpCapability(explicitHelpUnion);
  const optionalHelpUnion: { readonly shortAlias: "-h" } | undefined =
    branchCondition ? { shortAlias: "-h" } : undefined;
  helpCapability(optionalHelpUnion);

  const validVersionDesc: string | undefined = "Print version";
  versionCapability({
    value: text.line("1.0.0"),
    description: validVersionDesc,
    shortAlias: "-V",
  });
  versionCapability({
    value: text.line("1.0.0"),
    shortAlias: fromEnv("-V"),
  });
  const versionUnion = branchCondition
    ? ({ value: text.line("1.0.0"), shortAlias: "-V" } as const)
    : ({ value: text.line("2.0.0"), description: "Print version" } as const);
  versionCapability(versionUnion);

  schemaCapability({ description: text.line("Query contract") });
  const schemaUnion = branchCondition
    ? ({ description: text.line("Query contract") } as const)
    : ({ description: text.line("Inspect schema") } as const);
  schemaCapability(schemaUnion);

  // @ts-expect-error Help capability rejects unknown top-level properties.
  helpCapability({ extra: true });
  // @ts-expect-error Help capability rejects short aliases other than -h.
  helpCapability({ shortAlias: "-x" });
  // @ts-expect-error Help capability rejects non-object headings.
  helpCapability({ headings: "Usage" });
  // @ts-expect-error Help capability rejects unknown heading sections.
  helpCapability({ headings: { extra: "Extra" } });
  // @ts-expect-error Help capability rejects empty heading text.
  helpCapability({ headings: { usage: "" } });
  // @ts-expect-error Help capability rejects multiline heading text.
  helpCapability({ headings: { usage: "Usage\nLine" } });
  // @ts-expect-error Help capability rejects non-string heading text.
  helpCapability({ headings: { usage: 42 } });
  // @ts-expect-error Help capability rejects non-object wording.
  helpCapability({ wording: "mode" });
  // @ts-expect-error Help capability rejects function inputs.
  helpCapability(() => ({ shortAlias: "-x" }));
  // @ts-expect-error Help capability rejects array inputs.
  helpCapability([]);
  // @ts-expect-error Help capability rejects primitive string inputs.
  helpCapability("help");
  // @ts-expect-error Help capability rejects null inputs.
  helpCapability(null);

  // @ts-expect-error Version capability rejects unknown properties.
  versionCapability({ value: text.line("1.0.0"), extra: true });
  // @ts-expect-error Version capability rejects empty description literals.
  versionCapability({ value: text.line("1.0.0"), description: "" });
  // @ts-expect-error Version capability rejects multiline description literals.
  versionCapability({ value: text.line("1.0.0"), description: "a\nb" });
  // @ts-expect-error Version capability rejects short aliases other than -V.
  versionCapability({ value: text.line("1.0.0"), shortAlias: "-v" });
  // @ts-expect-error Version capability rejects primitive string inputs.
  versionCapability("1.0.0");
  // @ts-expect-error Version capability rejects array inputs.
  versionCapability([]);
  // @ts-expect-error Version capability rejects null inputs.
  versionCapability(null);
  // @ts-expect-error Version capability rejects function inputs even with properties.
  versionCapability(Object.assign(() => {}, { value: text.line("1.0.0") }));
  // @ts-expect-error Version capability reports missing value alongside invalid shortAlias.
  versionCapability({ shortAlias: "-v" });

  // @ts-expect-error Schema capability rejects unknown properties.
  schemaCapability({ description: text.line("Schema"), extra: true });
  // @ts-expect-error Schema capability requires a text.line description.
  schemaCapability({ description: "Schema" });
  // @ts-expect-error Schema capability rejects primitive string inputs.
  schemaCapability("Schema");
  // @ts-expect-error Schema capability rejects array inputs.
  schemaCapability([]);
  // @ts-expect-error Schema capability rejects null inputs.
  schemaCapability(null);
  const invalidSchemaFn = Object.assign(() => {}, {
    description: text.line("Schema"),
  });
  // @ts-expect-error Schema capability rejects function inputs even with properties.
  schemaCapability(invalidSchemaFn);
  // @ts-expect-error Schema capability reports missing description alongside unknown properties.
  schemaCapability({ extra: true });

  const localDefine = defineCli();
  const exampleInput = z.object({ mode: z.enum(["fast", "safe"]) });
  const otherLeaf = localDefine.command("other")({
    kind: "command",
    parent: "tool",
    name: "other",
    description: "Other command",
    fields: {
      mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
    },
    input: exampleInput,
    outputs: (mode) => ({
      default: "structured",
      modes: {
        structured: mode
          .atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          })
          .structured({ description: "Structured" }),
      },
    }),
  });

  localDefine.command("sample")({
    kind: "command",
    parent: "tool",
    name: "sample",
    description: "Sample command",
    fields: {
      mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
    },
    input: exampleInput,
    outputs: (mode) => ({
      default: "structured",
      modes: {
        structured: mode
          .atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          })
          .structured({ description: "Structured" }),
      },
    }),
    // @ts-expect-error Command examples require an input object.
    examples: [{ outputMode: "structured" }],
  });

  localDefine.command("multiExampleInvalidMode")({
    kind: "command",
    parent: "tool",
    name: "multi-example-invalid-mode",
    description: "Multi-example command",
    fields: {
      mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
    },
    input: exampleInput,
    outputs: (mode) => ({
      default: "structured",
      modes: {
        structured: mode
          .atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          })
          .structured({ description: "Structured" }),
      },
    }),
    examples: [
      { input: { mode: "fast" } },
      // @ts-expect-error Later elements in an examples tuple must still validate outputMode.
      { input: { mode: "fast" }, outputMode: "yaml" },
    ],
  });

  // @ts-expect-error Command outputs must match the command identity they are mounted under.
  localDefine({
    root: "tool",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      tool: { kind: "rootGroup", name: "tool", description: "Tool" },
      mismatched: otherLeaf.other,
    },
  });

  // @ts-expect-error Usage constraints reject unknown kinds.
  localDefine({
    root: "badConstraintKind",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      badConstraintKind: {
        kind: "rootCommand",
        name: "bad-constraint-kind",
        description: "Bad constraint kind",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "Mode",
          },
        },
        input: exampleInput,
        usageConstraints: [{ kind: "unknownKind" }],
        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({ description: "Structured" }),
          },
        }),
      },
    },
  });

  // @ts-expect-error Usage constraints must be an array.
  localDefine({
    root: "badConstraintCollection",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      badConstraintCollection: {
        kind: "rootCommand",
        name: "bad-constraint-collection",
        description: "Bad constraint collection",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "Mode",
          },
        },
        input: exampleInput,
        usageConstraints: { kind: "count" },
        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({ description: "Structured" }),
          },
        }),
      },
    },
  });
}
void verifyRootCapabilityAndAlignedTypeErrors;
