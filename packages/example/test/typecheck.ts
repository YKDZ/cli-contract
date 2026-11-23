import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
import {
  defineCommandScenarios,
  defineFailureScenarios,
} from "@ykdz/cli-contract-testing";
import { z } from "zod";

import { cli } from "../src/index.ts";

// These negative cases only participate in compilation; if a constraint stops holding, the unused @ts-expect-error becomes an error.
export function rejectedDeclarations() {
  // @ts-expect-error the declared lookup lacks a trigger scenario.
  defineCommandScenarios(cli, {});
  // @ts-expect-error the declared notFound lacks a trigger scenario.
  defineFailureScenarios(cli, { lookup: {} });

  const sharedInput0 = z.object({});
  defineCli()({
    root: "check",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "Check types",
        fields: {},
        input: sharedInput0,

        outputs: defineCli().outputModes("check", sharedInput0, (mode) => ({
          default: "text",
          modes: {
            structured: mode.atomic({
              description: "Structured output",
              format: "structured",
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
                // @ts-expect-error the variant payload must match the type inferred from the contract schema.
                outcome.data.found({ name: 42 });
                return outcome.data.found({ name: "Alice" });
              },
            }),
            text: mode.atomic({
              description: "Text output",
              format: "text",
              success: {
                kind: "data",
                variants: {
                  found: {
                    description: "Result found",
                    schema: z.object({ name: z.string() }),
                    exitCode: 0,
                    text: ({ name }) => text.line(name),
                  },
                },
              },
              failures: {
                notFound: {
                  description: "Result not found",
                  schema: z.object({ id: z.string() }),
                  exitCode: 1,
                  text: ({ id }) => text.line(id),
                },
              },
              handler({ outcome }) {
                // @ts-expect-error cannot invoke an undeclared failure.
                outcome.failure.unknown({});
                // @ts-expect-error the variant payload must match the type inferred from the contract schema.
                outcome.data.found({ name: 42 });
                return outcome.data.found({ name: "Alice" });
              },
            }),
          },
        })),
      },
    },
  });

  const sharedInput1 = z.object({});
  defineCli()({
    root: "missingCompletion",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      missingCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "Check types",
        input: sharedInput1,

        outputs: defineCli().outputModes(
          "missingCompletion",
          sharedInput1,
          (mode) => ({
            default: "text",
            modes: {
              structured: mode.atomic({
                description: "Structured output",
                format: "structured",
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }),
              // @ts-expect-error a text completion mode must declare a presenter for the current mode.
              text: mode.atomic({
                description: "Text output",
                format: "text",
                success: { kind: "completion" },
                failures: {},
                handler: () => undefined as never,
              }),
            },
          }),
        ),
      },
    },
  });

  const sharedInput2 = z.object({});
  defineCli()({
    root: "validCompletion",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      validCompletion: {
        kind: "rootCommand",
        name: "check",
        description: "Check types",
        input: sharedInput2,

        outputs: defineCli().outputModes(
          "validCompletion",
          sharedInput2,
          (mode) => ({
            default: "text",
            modes: {
              structured: mode.atomic({
                description: "Structured output",
                format: "structured",
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }),
              text: mode.atomic({
                description: "Text output",
                format: "text",
                success: { kind: "completion", text: () => text.silent },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }),
            },
          }),
        ),
      },
    },
  });
}
