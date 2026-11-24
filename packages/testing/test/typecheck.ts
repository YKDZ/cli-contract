import {
  defineCli,
  helpCapability,
  type CliContract,
  type ContractSchema,
  type EmptyCliInput,
} from "@ykdz/cli-contract";
import {
  defineCommandScenarios,
  runCliScenario,
} from "@ykdz/cli-contract-testing";

declare const emptyInput: ContractSchema<EmptyCliInput>;
declare const replayInput: ContractSchema<
  Readonly<{
    readonly mode: "live" | "after";
    readonly token?: string;
  }>,
  Readonly<{
    readonly mode: number;
    readonly token?: string;
  }>
>;
declare const inspectInput: ContractSchema<
  Readonly<{
    readonly mode: "json" | "yaml";
    readonly token?: string;
  }>
>;

const cli = defineCli<Readonly<{ readonly service: string }>>()({
  root: "typed",
  help: helpCapability({
    wording: {
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),

  usageFailureExitCode: 64,
  commands: {
    typed: {
      kind: "rootCommand",
      name: "typed",
      description: "Typed fixture",
      input: emptyInput,

      outputs: ({ atomic }) => ({
        modes: {
          structured: atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }).structured({ description: "Structured output" }),
        },
      }),
    },
  },
});

void runCliScenario(cli, {
  argv: ["--help"],
  dependencies: { service: "billing" },
});

void runCliScenario(cli, {
  argv: [],
  // @ts-expect-error help scenarios still need the declared dependencies.
  dependencies: { service: 1 },
});

void runCliScenario(cli, {
  argv: [],
  // @ts-expect-error unknown does not satisfy the declared dependencies.
  dependencies: {} as unknown,
});

void defineCommandScenarios(cli, {
  typed: {
    argv: [],
    dependencies: { service: "billing" },
  },
});

const defineScenarioCli = defineCli();
const replayScenarioCommand = defineScenarioCli.command("replay")({
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
      all: [{ kind: "equals", field: "mode", value: "after" }],
      onMatch: { require: ["token"] },
    },
  ],

  outputs: ({ atomic }) => ({
    modes: {
      structured: atomic({
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }).structured({ description: "Structured output" }),
    },
  }),
});
const inspectScenarioCommand = defineScenarioCli.command("inspect")({
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

  outputs: ({ atomic }) => ({
    modes: {
      structured: atomic({
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      }).structured({ description: "Structured output" }),
    },
  }),
});
const scenarioCli = defineScenarioCli({
  root: "tool",
  help: helpCapability({
    wording: {
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),

  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "Tool" },
    ...replayScenarioCommand,
    ...inspectScenarioCommand,
  },
});
const widenedScenarioCli: CliContract = scenarioCli;
void runCliScenario(widenedScenarioCli, {
  argv: ["replay"],
  dependencies: undefined,
}).then(({ termination }) => {
  if (termination.kind !== "usageFailure") return;
  for (const issue of termination.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const broadConditionalCode: "conditionalConstraintViolation" = issue.code;
    void broadConditionalCode;
  }
});

void runCliScenario(scenarioCli, {
  argv: ["replay", "--mode", "after"],
  dependencies: undefined,
}).then(({ termination }) => {
  if (termination.kind !== "usageFailure" || termination.command !== "replay") {
    return;
  }
  for (const issue of termination.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind === "equals") {
      const expectedReplay: "after" = condition.expected;
      const actualRaw: string | boolean = condition.present
        ? condition.actual
        : "";
      void expectedReplay;
      void actualRaw;
    }
  }
});
