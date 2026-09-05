import {
  defineCli,
  helpCapability,
  outputCapability,
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
