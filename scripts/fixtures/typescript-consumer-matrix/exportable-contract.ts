import {
  defineCli,
  helpCapability,
  outputCapability,
  type ContractSchema,
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

declare const inspectInput: ContractSchema<InspectInput, InspectOutput>;
declare const foundPayload: ContractSchema<Found>;
declare const unavailablePayload: ContractSchema<Unavailable>;

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
      kind: "forbiddenCombination",
      values: [
        { field: "query", value: "alpha" },
        { field: "dryRun", value: true },
      ],
    },
  ],
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

export const cli = define({
  root: "tool",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    tool: {
      kind: "rootGroup",
      name: "tool",
      description: "工具",
    },
    ...inspectCombination,
  },
});
