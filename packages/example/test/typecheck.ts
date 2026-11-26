import { defineCli, helpCapability, text } from "@boringparts/cli-contract";
import {
  defineCommandScenarios,
  defineFailureScenarios,
  type CliObservation,
} from "@boringparts/cli-contract/testing";
import { z } from "zod";

import { cli } from "../src/index.ts";

export type ExampleObservation = CliObservation<typeof cli>;

// These negative cases only participate in compilation; if a constraint stops holding, the unused @ts-expect-error becomes an error.
export function rejectedDeclarations() {
  // @ts-expect-error the declared lookup lacks a trigger scenario.
  defineCommandScenarios(cli, {});
  // @ts-expect-error the declared notFound lacks a trigger scenario.
  defineFailureScenarios(cli, { lookup: {} });

  defineCli()({
    root: "check",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "mode",
        choicesAndDefault: "{usage} (choices: {choices}; default: {value})",
        list: "{left}, {right}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "Check types",
        fields: {},
        input: z.object({}),

        outputs: ({ atomic }) => {
          const lookup = atomic({
            success: {
              kind: "data",
              variants: {
                found: {
                  description: "Result found",
                  schema: z.object({ name: z.string() }),
                  exitCode: 0,
                },
              },
            },
            failures: {
              notFound: {
                description: "Result not found",
                schema: z.object({ id: z.string() }),
                exitCode: 1,
              },
            },
            handler({ outcome }) {
              // @ts-expect-error cannot invoke an undeclared failure.
              outcome.failure.unknown({});
              // @ts-expect-error the payload must match the contract schema input.
              outcome.data.found({ name: 42 });
              return outcome.data.found({ name: "Alice" });
            },
          });
          return {
            default: "text",
            modes: {
              structured: lookup.structured({
                description: "Structured output",
              }),
              text: lookup.text({
                description: "Text output",
                success: { found: ({ name }) => text.line(name) },
                failures: { notFound: ({ id }) => text.line(id) },
              }),
            },
          };
        },
      },
    },
  });

  defineCli()({
    root: "missingCompletion",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "mode",
        choicesAndDefault: "{usage} (choices: {choices}; default: {value})",
        list: "{left}, {right}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      missingCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "Check types",
        input: z.object({}),

        outputs: ({ atomic }) => {
          const complete = atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          });
          return {
            default: "text",
            modes: {
              structured: complete.structured({
                description: "Structured output",
              }),
              // @ts-expect-error a text completion mode must declare a success presenter.
              text: complete.text({ description: "Text output", failures: {} }),
            },
          };
        },
      },
    },
  });

  defineCli()({
    root: "validCompletion",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "mode",
        choicesAndDefault: "{usage} (choices: {choices}; default: {value})",
        list: "{left}, {right}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      validCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "Check types",
        input: z.object({}),

        outputs: ({ atomic }) => {
          const complete = atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          });
          return {
            default: "text",
            modes: {
              structured: complete.structured({
                description: "Structured output",
              }),
              text: complete.text({
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
}
