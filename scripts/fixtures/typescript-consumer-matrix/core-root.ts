import {
  defineCli,
  helpCapability,
  text,
  type CliContract,
  type CliContractResult,
  type CompletionFact,
} from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const textInput = z.object({ name: z.string().optional() });
const optionalCountInput = z.object({ count: z.number().optional() });
const eitherAcceptsEmptyInput = z.union([
  z.object({ count: z.number().optional() }),
  z.object({ name: z.string() }),
]);
const messagePayload = z.object({ message: z.string() });

const define = defineCli<Readonly<{}>>();
const contract = define({
  root: "consumer",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    consumer: {
      kind: "rootCommand",
      name: "consumer",
      description: "Root entry",
      fields: {},
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {},
            }),
          },
        };
      },
    },
  },
});

const publicContract: CliContract = contract;
void publicContract;

const textCompletionWithoutField = defineCli()({
  root: "emptyTextCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    emptyTextCompletion: {
      kind: "rootCommand",
      name: "empty-text-completion",
      description: "Text completion without fields",
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {},
            }),
          },
        };
      },
    },
  },
});
declare const textCompletionWithoutFieldResult: CliContractResult<
  typeof textCompletionWithoutField
>;
const textCompletionResult: CompletionFact<"emptyTextCompletion"> =
  textCompletionWithoutFieldResult;
void textCompletionResult;

const optionalCompletionWithoutField = defineCli()({
  root: "optionalTextCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    optionalTextCompletion: {
      kind: "rootCommand",
      name: "optional-text-completion",
      description: "Text completion with an optional field",
      input: optionalCountInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {},
            }),
          },
        };
      },
    },
  },
});
void optionalCompletionWithoutField;

const unionCompletionAcceptingEmpty = defineCli()({
  root: "unionTextCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    unionTextCompletion: {
      kind: "rootCommand",
      name: "union-text-completion",
      description: "Union completion accepting an empty object",
      input: eitherAcceptsEmptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {},
            }),
          },
        };
      },
    },
  },
});
void unionCompletionAcceptingEmpty;

const completeNamedVariants = defineCli()({
  root: "completeNamedVariants",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    completeNamedVariants: {
      kind: "rootCommand",
      name: "complete-named-variants",
      description: "Complete named variants",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "Name",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              accepted: {
                description: "Accepted",
                schema: messagePayload,
                exitCode: 0,
              },
              deferred: {
                description: "Deferred",
                schema: messagePayload,
                exitCode: 0,
              },
            },
          },
          failures: {
            unavailable: {
              description: "Unavailable",
              schema: messagePayload,
              exitCode: 9,
            },
          },
          handler: ({ outcome }) => {
            const accepted = outcome.data.accepted({
              message: "Request accepted",
            });
            accepted.variant satisfies "accepted";
            const unavailable = outcome.failure.unavailable({
              message: "Temporarily unavailable",
            });
            unavailable.variant satisfies "unavailable";
            return accepted;
          },
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: {
                accepted: (payload) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
                deferred: (payload) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
              failures: {
                unavailable: (payload) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
            }),
          },
        };
      },
    },
  },
});
void completeNamedVariants;

const completeCompletionFailures = defineCli()({
  root: "completeCompletionFailures",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    completeCompletionFailures: {
      kind: "rootCommand",
      name: "complete-completion-failures",
      description: "Complete failure presenter for completion",
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            unavailable: {
              description: "Unavailable",
              schema: messagePayload,
              exitCode: 9,
            },
          },
          handler: ({ outcome }) => {
            const completion = outcome.completion();
            completion.kind satisfies "completion";
            const unavailable = outcome.failure.unavailable({
              message: "Temporarily unavailable",
            });
            unavailable.variant satisfies "unavailable";
            return completion;
          },
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {
                unavailable: (payload) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
            }),
          },
        };
      },
    },
  },
});
void completeCompletionFailures;

defineCli()({
  root: "missingDataVariantText",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingDataVariantText: {
      kind: "rootCommand",
      name: "missing-data-variant-text",
      description: "Missing data presenter",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "Name",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              accepted: {
                description: "Accepted",
                schema: messagePayload,
                exitCode: 0,
              },
              deferred: {
                description: "Deferred",
                schema: messagePayload,
                exitCode: 0,
              },
            },
          },
          failures: {},
          handler: ({ outcome }) =>
            outcome.data.accepted({ message: "Request accepted" }),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            // @ts-expect-error Every data variant of a text mode must declare a presenter.
            text: operation.text({
              description: "Text output",
              success: {
                accepted: (payload: z.output<typeof messagePayload>) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
              failures: {},
            }),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "missingDataFailureText",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingDataFailureText: {
      kind: "rootCommand",
      name: "missing-data-failure-text",
      description: "Missing failure presenter for data",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "Name",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              accepted: {
                description: "Accepted",
                schema: messagePayload,
                exitCode: 0,
              },
            },
          },
          failures: {
            unavailable: {
              description: "Unavailable",
              schema: messagePayload,
              exitCode: 9,
            },
            forbidden: {
              description: "Forbidden",
              schema: messagePayload,
              exitCode: 13,
            },
          },
          handler: ({ outcome }) =>
            outcome.data.accepted({ message: "Request accepted" }),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            // @ts-expect-error Failure variants of a text mode must declare a presenter.
            text: operation.text({
              description: "Text output",
              success: {
                accepted: (payload: z.output<typeof messagePayload>) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
              failures: {
                unavailable: (payload: z.output<typeof messagePayload>) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
            }),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "missingCompletionFailureText",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingCompletionFailureText: {
      kind: "rootCommand",
      name: "missing-completion-failure-text",
      description: "Missing failure presenter for completion",
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            unavailable: {
              description: "Unavailable",
              schema: messagePayload,
              exitCode: 9,
            },
            forbidden: {
              description: "Forbidden",
              schema: messagePayload,
              exitCode: 13,
            },
          },
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            // @ts-expect-error Completion failure variants of a text mode must declare a presenter.
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {
                unavailable: (payload) => {
                  payload.message satisfies string;
                  return text.line(payload.message);
                },
              },
            }),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "missingCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingCompletion: {
      kind: "rootCommand",
      name: "missing-completion",
      description: "Missing completion presenter",
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            // @ts-expect-error A text completion must declare a presenter for the current mode.
            text: operation.text({
              description: "Text output",
              failures: {},
            }),
          },
        };
      },
    },
  },
});

const textCompletionWithField = defineCli()({
  root: "textCompletion",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    textCompletion: {
      kind: "rootCommand",
      name: "text-completion",
      description: "Completion with a field",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "Name",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ input, outcome }) => {
            input.name satisfies string | undefined;
            return outcome.completion();
          },
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {},
            }),
          },
        };
      },
    },
  },
});
void textCompletionWithField;

defineCli()({
  root: "completionCannotReturnData",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    completionCannotReturnData: {
      kind: "rootCommand",
      name: "completion-cannot-return-data",
      description: "Completion result closure",
      input: emptyInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => {
            // @ts-expect-error A completion handler does not accept the data result category.
            return outcome.data.value({ value: "nope" });
          },
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {},
            }),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "missingCompletionWithField",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    missingCompletionWithField: {
      kind: "rootCommand",
      name: "missing-completion-with-field",
      description: "Missing completion presenter with a field",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "Name",
        },
      },
      input: textInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ input, outcome }) => {
            input.name satisfies string | undefined;
            return outcome.completion();
          },
        });
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            // @ts-expect-error A text completion must declare a presenter for the current mode.
            text: operation.text({
              description: "Text output",
              failures: {},
            }),
          },
        };
      },
    },
  },
});
