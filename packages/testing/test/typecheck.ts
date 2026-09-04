import {
  defineCli,
  helpCapability,
  outputCapability,
  type ContractSchema,
  type EmptyCliInput,
} from "@ykdz/cli-contract";
import {
  defineCommandScenarios,
  runCliScenario,
} from "@ykdz/cli-contract-testing";

declare const emptyInput: ContractSchema<EmptyCliInput>;

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
