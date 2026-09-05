import {
  defineCli,
  helpCapability,
  outputCapability,
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
      handler: () => undefined as never,
    },
  },
});

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
      handler: () => undefined as never,
    },
  },
});
