import {
  defineCli,
  helpCapability,
  outputCapability,
  type CliContract,
  type CliInvocation,
  type ContractSchema,
  type EmptyCliInput,
} from "@cli-contract/lib";

declare const emptyInput: ContractSchema<EmptyCliInput>;

const cli = defineCli()({
  root: "fixture",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    fixture: {
      kind: "rootCommand",
      name: "fixture",
      description: "演示最小 CLI",
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler({ input, dependencies, outcome }) {
        input satisfies EmptyCliInput;
        dependencies satisfies undefined;
        return outcome.completion();
      },
    },
  },
});

function verifyTypeErrors() {
  // @ts-expect-error 根契约必须显式装配帮助能力。
  defineCli()({
    root: "fixture",
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "演示最小 CLI",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  // @ts-expect-error CLI 契约不能由普通对象字面量伪造。
  const forgedContract: CliContract = { grammar: {}, manifest: {} };
  void forgedContract;

  // @ts-expect-error CLI 调用不能由普通对象字面量伪造。
  const forgedInvocation: CliInvocation<typeof cli> = {
    kind: "parsed",
    command: "fixture",
    input: {},
    outputFormat: "structured",
  };
  void forgedInvocation;
}

void cli;
void verifyTypeErrors;
