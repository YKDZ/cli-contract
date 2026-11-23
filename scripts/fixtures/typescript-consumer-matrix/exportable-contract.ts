import {
  defineCli,
  helpCapability,
  text,
  type CliContract,
  type ContractSchema,
  type UsageConstraint,
} from "@ykdz/cli-contract";

type Dependencies = Readonly<{
  readonly endpoint: "primary" | "backup";
}>;
type InspectInput = Readonly<{
  readonly query: "alpha" | "beta";
  readonly dryRun?: boolean;
}>;
type InspectOutput = Readonly<{
  readonly query: string;
  readonly dryRun?: boolean;
  readonly count: number;
}>;
type Found = Readonly<{
  readonly count: number;
  readonly endpoint: Dependencies["endpoint"];
}>;
type Unavailable = Readonly<{
  readonly reason: "offline" | "denied";
}>;
type TailInput = Readonly<{
  readonly topic: "source" | "mirror";
  readonly follow?: boolean;
}>;
type TailOutput = Readonly<{
  readonly target: string;
  readonly follow?: boolean;
}>;
type TailLine = Readonly<{
  readonly target: string;
  readonly endpoint: Dependencies["endpoint"];
}>;
type TailUnavailable = Readonly<{
  readonly reason: "offline" | "denied";
  readonly endpoint: Dependencies["endpoint"];
}>;

declare const inspectInput: ContractSchema<InspectInput, InspectOutput>;
declare const foundPayload: ContractSchema<Found>;
declare const unavailablePayload: ContractSchema<Unavailable>;
declare const tailInput: ContractSchema<TailInput, TailOutput>;
declare const tailLinePayload: ContractSchema<TailLine>;
declare const tailUnavailablePayload: ContractSchema<TailUnavailable>;

const define = defineCli<Dependencies>();

export const inspectCombination = define.command("inspect")({
  kind: "command",
  parent: "tool",
  name: "inspect",
  description: "Inspect target",
  fields: {
    query: {
      kind: "valueOption",
      longOption: "--query",
      description: "Query",
    },
    dryRun: {
      kind: "flag",
      longOption: "--dry-run",
      description: "Dry run only",
    },
  },
  input: inspectInput,
  usageConstraints: [
    {
      kind: "count",
      fields: ["query", "dryRun"],
      min: 1,
      max: 1,
    },
    {
      kind: "when",
      all: [{ kind: "equals", field: "query", value: "alpha" }],
      onMatch: { require: ["dryRun"] },
      otherwise: { forbid: ["dryRun"] },
    },
    {
      kind: "forbiddenCombination",
      all: [
        { kind: "equals", field: "query", value: "alpha" },
        { kind: "equals", field: "dryRun", value: true },
      ],
    },
  ],

  examples: [{ input: { query: "alpha" }, outputMode: "structured" }],

  outputs({ atomic }) {
    const operation = atomic({
      success: {
        kind: "data",
        variants: {
          found: {
            description: "Target found",
            schema: foundPayload,
            exitCode: 0,
          },
        },
      },
      failures: {
        unavailable: {
          description: "Target unavailable",
          schema: unavailablePayload,
          exitCode: 9,
        },
      },
      handler: ({ dependencies, input, outcome }) =>
        outcome.data.found({
          count: input.count,
          endpoint: dependencies.endpoint,
        }),
    });
    return {
      default: "structured",
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
});

export const tailCombination = define.command("tail")({
  kind: "command",
  parent: "tool",
  name: "tail",
  description: "Read records",
  fields: {
    topic: {
      kind: "valueOption",
      longOption: "--topic",
      description: "Source",
    },
    follow: {
      kind: "flag",
      longOption: "--follow",
      description: "Keep reading",
    },
  },
  input: tailInput,
  usageConstraints: [
    {
      kind: "forbiddenCombination",
      all: [
        { kind: "equals", field: "topic", value: "source" },
        { kind: "present", field: "follow" },
      ],
    },
  ],

  examples: [
    { input: { topic: "source" }, outputMode: "text" },
    { input: { topic: "mirror", follow: true } },
  ],

  outputs({ stream }) {
    const streaming = stream({
      records: {
        line: {
          description: "Read result",
          schema: tailLinePayload,
        },
      },
      failures: {
        unavailable: {
          description: "Source unavailable",
          schema: tailUnavailablePayload,
          exitCode: 10,
        },
      },
      async *handler({ dependencies, input, outcome }) {
        yield outcome.record.line({
          target: input.target,
          endpoint: dependencies.endpoint,
        });
        if (input.follow) {
          return outcome.failure.unavailable({
            reason: "offline",
            endpoint: dependencies.endpoint,
          });
        }
        return outcome.streamSuccess();
      },
    });
    return {
      default: "structured",
      modes: {
        structured: streaming.structured({ description: "Structured output" }),
        text: streaming.text({
          description: "Text output",
          records: { line: (value) => text.line(value.target) },
          failures: { unavailable: (value) => text.line(value.reason) },
          terminal: () => text.silent,
        }),
      },
    };
  },
});

type InspectUsageConstraint = UsageConstraint<
  {
    readonly query: {
      readonly kind: "valueOption";
      readonly longOption: "--query";
      readonly description: "Query";
    };
    readonly dryRun: {
      readonly kind: "flag";
      readonly longOption: "--dry-run";
      readonly description: "Dry run only";
    };
  },
  InspectInput
>;
void (0 as unknown as InspectUsageConstraint);

export const cli = define({
  root: "tool",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    tool: {
      kind: "rootGroup",
      name: "tool",
      description: "Tool",
    },
    ...inspectCombination,
    ...tailCombination,
  },
});

export const rootCommandContract = define({
  root: "probe",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    probe: {
      kind: "rootCommand",
      name: "probe",
      description: "Root command example",
      fields: {
        query: {
          kind: "valueOption",
          longOption: "--query",
          description: "Query",
        },
        dryRun: {
          kind: "flag",
          longOption: "--dry-run",
          description: "Dry run only",
        },
      },
      input: inspectInput,
      examples: [
        { input: { query: "alpha" }, outputMode: "structured" },
        { input: { query: "beta" }, outputMode: "text" },
        { input: { query: "alpha" } },
      ],
      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              found: {
                description: "Target found",
                schema: foundPayload,
                exitCode: 0,
              },
            },
          },
          failures: {
            unavailable: {
              description: "Target unavailable",
              schema: unavailablePayload,
              exitCode: 9,
            },
          },
          handler: ({ dependencies, input, outcome }) =>
            outcome.data.found({
              count: input.count,
              endpoint: dependencies.endpoint,
            }),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: { found: (value) => text.line(String(value.count)) },
              failures: { unavailable: (value) => text.line(value.reason) },
            }),
          },
        };
      },
    },
  },
});

export const wideConditionalContract: CliContract = cli;
