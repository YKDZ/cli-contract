import {
  defineCli,
  helpCapability,
  outputCapability,
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
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    typed: {
      kind: "rootCommand",
      name: "typed",
      description: "类型 fixture",
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

void runCliScenario({
  cliContract: cli,
  argv: ["--help"],
  dependencies: { service: "billing" },
});

void runCliScenario({
  cliContract: cli,
  argv: [],
  // @ts-expect-error help 场景也必须提供与契约一致的依赖。
  dependencies: { service: 1 },
});

void runCliScenario({
  cliContract: cli,
  argv: [],
  // @ts-expect-error 依赖不能通过宽化为 unknown 绕过契约。
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
  description: "回放",
  fields: {
    mode: {
      kind: "valueOption",
      longOption: "--mode",
      description: "模式",
    },
    token: {
      kind: "valueOption",
      longOption: "--token",
      description: "令牌",
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
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});
const inspectScenarioCommand = defineScenarioCli.command("inspect")({
  kind: "command",
  parent: "tool",
  name: "inspect",
  description: "检查",
  fields: {
    mode: {
      kind: "valueOption",
      longOption: "--mode",
      description: "模式",
    },
    token: {
      kind: "valueOption",
      longOption: "--token",
      description: "令牌",
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
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});
const scenarioCli = defineScenarioCli({
  root: "tool",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "工具" },
    ...replayScenarioCommand,
    ...inspectScenarioCommand,
  },
});
const widenedScenarioCli: CliContract = scenarioCli;
void runCliScenario({
  cliContract: widenedScenarioCli,
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

void runCliScenario({
  cliContract: scenarioCli,
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
