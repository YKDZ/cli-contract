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
  description: "检查目标",
  fields: {
    query: {
      kind: "valueOption",
      longOption: "--query",
      description: "查询",
    },
    dryRun: {
      kind: "flag",
      longOption: "--dry-run",
      description: "仅演练",
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

  outputs({ atomic }) {
    const operation = atomic({
      success: {
        kind: "data",
        variants: {
          found: {
            description: "找到目标",
            schema: foundPayload,
            exitCode: 0,
          },
        },
      },
      failures: {
        unavailable: {
          description: "目标不可用",
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
        structured: operation.structured({ description: "结构化输出" }),
      },
    };
  },
});

export const tailCombination = define.command("tail")({
  kind: "command",
  parent: "tool",
  name: "tail",
  description: "读取记录",
  fields: {
    topic: {
      kind: "valueOption",
      longOption: "--topic",
      description: "来源",
    },
    follow: {
      kind: "flag",
      longOption: "--follow",
      description: "持续读取",
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

  outputs({ stream }) {
    const streaming = stream({
      records: {
        line: {
          description: "读取结果",
          schema: tailLinePayload,
        },
      },
      failures: {
        unavailable: {
          description: "来源不可用",
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
        structured: streaming.structured({ description: "结构化输出" }),
        text: streaming.text({
          description: "文本输出",
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
      readonly description: "查询";
    };
    readonly dryRun: {
      readonly kind: "flag";
      readonly longOption: "--dry-run";
      readonly description: "仅演练";
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
      description: "工具",
    },
    ...inspectCombination,
    ...tailCombination,
  },
});

export const wideConditionalContract: CliContract = cli;
