import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
  type CliContract,
  type ContractSchema,
  type EmptyCliInput,
} from "@ykdz/cli-contract";

const emptyInput: ContractSchema<EmptyCliInput, EmptyCliInput> = {
  "~standard": {
    version: 1,
    vendor: "typescript-consumer-matrix",
    validate: (value) => ({ value: value as EmptyCliInput }),
    jsonSchema: {
      input: () => ({ type: "object" }),
      output: () => ({ type: "object" }),
    },
  },
};

const textInput: ContractSchema<
  Readonly<{ readonly name?: string }>,
  Readonly<{ readonly name?: string }>
> = {
  "~standard": {
    version: 1,
    vendor: "typescript-consumer-matrix",
    validate: (value) => ({
      value: value as Readonly<{ readonly name?: string }>,
    }),
    jsonSchema: {
      input: () => ({ type: "object" }),
      output: () => ({ type: "object" }),
    },
  },
};

const define = defineCli<Readonly<{}>>();
const contract = define({
  root: "consumer",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    consumer: {
      kind: "rootCommand",
      name: "consumer",
      description: "根入口",
      fields: {},
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

const publicContract: CliContract = contract;
void publicContract;

// @ts-expect-error completion 缺少 text presenter 必须在真实 defineCli 入口被拒绝。
defineCli()({
  root: "missingCompletion",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingCompletion: {
      kind: "rootCommand",
      name: "missing-completion",
      description: "缺少 completion presenter",
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

const textCompletionWithField = defineCli()({
  root: "textCompletion",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    textCompletion: {
      kind: "rootCommand",
      name: "text-completion",
      description: "带字段的 completion",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {},
      handler: ({ input, outcome }) => {
        input.name satisfies string | undefined;
        return outcome.completion();
      },
    },
  },
});
void textCompletionWithField;

// @ts-expect-error 带字段的 completion 缺少 text presenter 必须在真实 defineCli 入口被拒绝。
defineCli()({
  root: "missingCompletionWithField",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingCompletionWithField: {
      kind: "rootCommand",
      name: "missing-completion-with-field",
      description: "带字段但缺少 completion presenter",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
        },
      },
      input: textInput,
      success: { kind: "completion" },
      failures: {},
      handler: ({ input, outcome }) => {
        input.name satisfies string | undefined;
        return outcome.completion();
      },
    },
  },
});
