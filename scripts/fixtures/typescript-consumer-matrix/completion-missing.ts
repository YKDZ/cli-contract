import { defineCli, helpCapability } from "@ykdz/cli-contract";
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
      description: "缺少 completion presenter",
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
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text({
              description: "文本输出",
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
      description: "带字段但缺少 completion presenter",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "名称",
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
            structured: operation.structured({ description: "结构化输出" }),
            text: operation.text({
              description: "文本输出",
              failures: {},
            }),
          },
        };
      },
    },
  },
});
