import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({});
const payload = z.object({ message: z.string() });

defineCli()({
  root: "extractedMissingFailure",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    extractedMissingFailure: {
      kind: "rootCommand",
      name: "extracted-missing-failure",
      description: "Missing failure presenter after extracting a variable",
      input,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            unavailable: {
              description: "Unavailable",
              schema: payload,
              exitCode: 9,
            },
          },
          handler: ({ outcome }) => outcome.completion(),
        });
        const presentation = {
          description: "Text output",
          success: () => text.silent,
          failures: {},
        };
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text(presentation),
          },
        };
      },
    },
  },
});

defineCli()({
  root: "extractedMissingData",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    extractedMissingData: {
      kind: "rootCommand",
      name: "extracted-missing-data",
      description: "Missing data presenter after extracting a variable",
      input,

      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              found: {
                description: "Found",
                schema: payload,
                exitCode: 0,
              },
            },
          },
          failures: {},
          handler: ({ outcome }) => outcome.data.found({ message: "Result" }),
        });
        const presentation = {
          description: "Text output",
          success: {},
          failures: {},
        };
        return {
          default: "text",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
            text: operation.text(presentation),
          },
        };
      },
    },
  },
});
