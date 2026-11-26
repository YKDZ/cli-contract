import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const input = z.object({
  emptyPositional: z.string(),
  blankVariadic: z.array(z.string()).optional(),
  multilineOption: z.string().optional(),
  bracketedRepeatable: z.array(z.string()).optional(),
});

defineCli()({
  root: "badPlaceholders",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    badPlaceholders: {
      kind: "rootCommand",
      name: "bad-placeholders",
      description: "Reject invalid placeholders at compile time",
      fields: {
        emptyPositional: {
          kind: "positional",
          placeholder: "",
          description: "Empty",
        },
        blankVariadic: {
          kind: "variadicPositional",
          placeholder: "   ",
          description: "Blank",
        },
        multilineOption: {
          kind: "valueOption",
          longOption: "--multi",
          placeholder: "line1\nline2",
          description: "Multiline",
        },
        bracketedRepeatable: {
          kind: "repeatableOption",
          longOption: "--bracket",
          placeholder: "<tag>",
          description: "Bracketed",
        },
      },
      input,
      outputs: (mode) => ({
        default: "structured",
        modes: {
          structured: mode
            .atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            })
            .structured({ description: "Structured" }),
        },
      }),
    },
  },
});
