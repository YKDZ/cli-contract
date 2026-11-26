import { defineCli } from "@boringparts/cli-contract";
import { z } from "zod";

const invalidFact:
  | { readonly kind: "present"; readonly field: "mode"; readonly typo: true }
  | {
      readonly kind: "equals";
      readonly field: "mode";
      readonly value: "safe";
      readonly typo: true;
    } =
  Math.random() < 0.5
    ? { kind: "present", field: "mode", typo: true }
    : { kind: "equals", field: "mode", value: "safe", typo: true };

const define = defineCli();
const sharedInput0 = z.object({ mode: z.enum(["safe", "force"]).optional() });
export const inspect = define.command("inspect")({
  kind: "command",
  parent: "tool",
  name: "inspect",
  description: "Inspect configuration",
  fields: {
    mode: {
      kind: "valueOption",
      longOption: "--mode",
      description: "Mode",
    },
  },
  input: sharedInput0,
  usageConstraints: [{ kind: "forbiddenCombination", all: [invalidFact] }],

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
      },
    };
  },
});
