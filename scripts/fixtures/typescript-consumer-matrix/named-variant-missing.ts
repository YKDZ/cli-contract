import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const textInput = z.object({ name: z.string().optional() });
const messagePayload = z.object({ message: z.string() });

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
            text: operation.text({
              description: "Text output",
              success: {
                accepted: (payload) => text.line(payload.message),
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
            text: operation.text({
              description: "Text output",
              success: {
                accepted: (payload) => text.line(payload.message),
              },
              failures: {
                unavailable: (payload) => text.line(payload.message),
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
            text: operation.text({
              description: "Text output",
              success: () => text.silent,
              failures: {
                unavailable: (payload) => text.line(payload.message),
              },
            }),
          },
        };
      },
    },
  },
});
