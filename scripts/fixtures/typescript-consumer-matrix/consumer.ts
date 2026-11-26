import { stderr, stdout } from "node:process";
import { Writable } from "node:stream";

import {
  defineCli,
  helpCapability,
  text,
  type ContractSchema,
  type EmptyCliInput,
  type InvalidFieldChoiceIssue,
  type UnknownCommandIssue,
  type UnknownOptionIssue,
} from "@boringparts/cli-contract";
import { nodeCliOutput } from "@boringparts/cli-contract/node";
import {
  defineCommandScenarios,
  defineFailureScenarios,
  runCliScenario,
  type CliObservation,
  type CliScenario,
} from "@boringparts/cli-contract/testing";

type Dependencies = Readonly<{ readonly available: boolean }>;
type InspectInput = Readonly<{ readonly target: string }>;
type Payload = Readonly<{ readonly message: string }>;

function schema<Input, Output>(): ContractSchema<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "typescript-consumer-matrix",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The cross-package compile matrix deliberately uses static placeholders and type probes.
      validate: (value) => ({ value: value as Output }),
      jsonSchema: {
        input: () => ({ type: "object" }),
        output: () => ({ type: "object" }),
      },
    },
  };
}

const define = defineCli<Dependencies>();
const emptyInput = schema<EmptyCliInput, EmptyCliInput>();
const inspectInput = schema<InspectInput, InspectInput>();
const payload = schema<Payload, Payload>();

const nonEmptyTextLines: readonly [string, ...string[]] = [
  "Known non-empty",
  "",
];
void text.lines(nonEmptyTextLines);

const emptyTextLines: [] = [];
// @ts-expect-error An empty tuple cannot satisfy the public at-least-one-line declaration.
void text.lines(emptyTextLines);

const dynamicTextLines: string[] = [
  "Whether lines exist is decided at runtime",
];
// @ts-expect-error A plain array does not preserve the static at-least-one-line fact.
void text.lines(dynamicTextLines);

const complete = define.command("complete")({
  kind: "command",
  parent: "consumer",
  name: "complete",
  description: "Complete task",
  fields: {},
  input: emptyInput,

  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      default: "structured",
      modes: {
        structured: operation.structured({ description: "Structured output" }),
        text: operation.text({
          description: "Text output",
          success: () => text.lines(["Done", ""]),
          failures: {},
        }),
      },
    };
  },
});

const inspect = define.command("inspect")({
  kind: "command",
  parent: "consumer",
  name: "inspect",
  description: "Inspect target",
  fields: {
    target: {
      kind: "valueOption",
      longOption: "--target",
      description: "Target",
    },
  },
  input: inspectInput,

  outputs({ atomic }) {
    const operation = atomic({
      success: {
        kind: "data",
        variants: {
          found: {
            description: "Target found",
            schema: payload,
            exitCode: 0,
          },
        },
      },
      failures: {
        unavailable: {
          description: "Service unavailable",
          schema: payload,
          exitCode: 9,
        },
      },
      handler: ({ dependencies, outcome }) =>
        dependencies.available
          ? outcome.data.found({ message: "public" })
          : outcome.failure.unavailable({ message: "remote" }),
    });
    return {
      default: "structured",
      modes: {
        structured: operation.structured({ description: "Structured output" }),
        text: operation.text({
          description: "Text output",
          success: {
            found: (value: Payload) => text.lines(["Found", value.message]),
          },
          failures: {
            unavailable: (value: Payload) =>
              text.lines(["Unavailable", value.message]),
          },
        }),
      },
    };
  },
});

const watch = define.command("watch")({
  kind: "command",
  parent: "consumer",
  name: "watch",
  description: "Observe target",
  fields: {},
  input: emptyInput,

  outputs({ stream }) {
    const streaming = stream({
      records: {
        item: {
          description: "Observation record",
          schema: payload,
        },
      },
      failures: {},
      async *handler({ outcome }) {
        yield outcome.record.item({ message: "First entry" });
        return outcome.streamSuccess();
      },
    });
    return {
      default: "structured",
      modes: {
        structured: streaming.structured({ description: "Structured output" }),
        text: streaming.text({
          description: "Text output",
          records: { item: (value: Payload) => text.line(value.message) },
          failures: {},
          terminal: () => text.lines(["Observation complete", ""]),
        }),
      },
    };
  },
});

const cli = define({
  root: "consumer",
  help: helpCapability({ shortAlias: "-h" }),

  usageFailureExitCode: 64,
  commands: {
    consumer: {
      kind: "rootGroup",
      name: "consumer",
      description: "Consumer",
      helpSupplement: text.lines(["Use -h for help", ""]),
    },
    ...complete,
    ...inspect,
    ...watch,
  },
});

declare const streamWritable: Writable;
void nodeCliOutput({ stdout, stderr });
void nodeCliOutput({ stdout: streamWritable, stderr: streamWritable });

const commandScenarios = defineCommandScenarios(cli, {
  complete: { argv: ["complete"], dependencies: { available: true } },
  inspect: {
    argv: ["inspect", "--target", "public"],
    dependencies: { available: true },
  },
  watch: { argv: ["watch"], dependencies: { available: true } },
});

const failureScenarios = defineFailureScenarios(cli, {
  inspect: {
    unavailable: {
      argv: ["inspect", "--target", "remote"],
      dependencies: { available: false },
    },
  },
});

void commandScenarios;
void failureScenarios;

type ConsumerObservation = CliObservation<typeof cli>;
const scenarioObservation: Promise<ConsumerObservation> = runCliScenario(cli, {
  argv: ["complete"],
  dependencies: { available: true },
});
const verifyObservationType = (observation: ConsumerObservation) =>
  observation.termination.exitCode;
void scenarioObservation;
void verifyObservationType;

function positiveIssueShapes(
  choice: InvalidFieldChoiceIssue,
  command: UnknownCommandIssue,
  option: UnknownOptionIssue,
): void {
  const choices: readonly string[] = choice.choices;
  const suggestedCommand: string | undefined = command.suggestedCommand;
  const suggestedOption: string | undefined = option.suggestedOption;
  void choices;
  void suggestedCommand;
  void suggestedOption;
}
void positiveIssueShapes;

function negativeContractShapes(): void {
  void defineCommandScenarios(
    cli,
    // @ts-expect-error Every command must have a scenario.
    {
      complete: { argv: ["complete"], dependencies: { available: true } },
      inspect: {
        argv: ["inspect", "--target", "public"],
        dependencies: { available: true },
      },
    },
  );

  void defineFailureScenarios(cli, {
    // @ts-expect-error A declared failure must not omit its scenario.
    inspect: {},
  });

  void defineFailureScenarios(cli, {
    inspect: {
      unavailable: {
        argv: ["inspect"],
        // @ts-expect-error Scenario dependencies must match the contract dependencies.
        dependencies: { missing: true },
      },
    },
  });

  void defineCommandScenarios(cli, {
    complete: { argv: ["complete"], dependencies: { available: true } },
    inspect: {
      argv: ["inspect", "--target", "public"],
      dependencies: { available: true },
    },
    watch: { argv: ["watch"], dependencies: { available: true } },
    // @ts-expect-error A result location cannot be forged as a command scenario.
    result: { argv: [], dependencies: { available: true } },
  });

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The cross-package compile matrix deliberately uses static placeholders and type probes.
  const scenarioSink = null as unknown as Readonly<
    Record<string, CliScenario<typeof cli>>
  >;
  // @ts-expect-error A scenario map cannot use an index signature to escape the closed set.
  void defineCommandScenarios(cli, scenarioSink);

  void define.command("presenterProbes")({
    kind: "command",
    parent: "consumer",
    name: "presenter-probes",
    description: "Presenter probes",
    fields: {},
    input: emptyInput,
    outputs({ atomic, stream }) {
      const operation = atomic({
        success: {
          kind: "data",
          variants: {
            found: { description: "Found", schema: payload, exitCode: 0 },
          },
        },
        failures: {
          unavailable: {
            description: "Unavailable",
            schema: payload,
            exitCode: 9,
          },
        },
        handler: ({ outcome }) => outcome.data.found({ message: "public" }),
      });
      void operation.text({
        description: "Wrong data",
        // @ts-expect-error A data presenter does not accept silentText.
        success: { found: () => text.silent },
        failures: {
          unavailable: (value: Payload) => text.line(value.message),
        },
      });
      void operation.text({
        description: "Wrong failure",
        success: { found: (value: Payload) => text.line(value.message) },
        // @ts-expect-error A failure presenter does not accept silentText.
        failures: { unavailable: () => text.silent },
      });
      const streaming = stream({
        records: { item: { description: "Record", schema: payload } },
        failures: {},
        async *handler({ outcome }) {
          yield outcome.record.item({ message: "First entry" });
          return outcome.streamSuccess();
        },
      });
      void streaming.text({
        description: "Wrong record",
        // @ts-expect-error A stream record presenter does not accept TextLines.
        records: { item: () => text.lines(["Wrong location"]) },
        failures: {},
        terminal: () => text.silent,
      });
      return {
        modes: {
          structured: operation.structured({
            description: "Structured output",
          }),
        },
      };
    },
  });
}
void negativeContractShapes;
