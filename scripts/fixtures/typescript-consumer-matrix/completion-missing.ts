import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const emptyInput = z.object({});
const textInput = z.object({ name: z.string().optional() });

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
