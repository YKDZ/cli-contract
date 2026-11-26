import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const define = defineCli();
const exampleInput = z.object({ mode: z.enum(["fast", "safe"]) });

const otherLeaf = define.command("other")({
  kind: "command",
  parent: "tool",
  name: "other",
  description: "Other command",
  fields: {
    mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
  },
  input: exampleInput,
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
});

define.command("badExampleMode")({
  kind: "command",
  parent: "tool",
  name: "bad-example-mode",
  description: "Bad example output mode",
  fields: {
    mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
  },
  input: exampleInput,
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
  examples: [{ input: { mode: "fast" }, outputMode: "yaml" }],
});

define.command("multiExampleInvalidMode")({
  kind: "command",
  parent: "tool",
  name: "multi-example-invalid-mode",
  description: "Multi example invalid output mode",
  fields: {
    mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
  },
  input: exampleInput,
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
  examples: [
    { input: { mode: "fast" } },
    { input: { mode: "fast" }, outputMode: "yaml" },
  ],
});

define.command("badExampleShape")({
  kind: "command",
  parent: "tool",
  name: "bad-example-shape",
  description: "Bad example shape",
  fields: {
    mode: { kind: "valueOption", longOption: "--mode", description: "Mode" },
  },
  input: exampleInput,
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
  examples: [{ outputMode: "structured" }],
});

define({
  root: "tool",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "Tool" },
    mismatched: otherLeaf.other,
  },
});

define({
  root: "badConstraintKind",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    badConstraintKind: {
      kind: "rootCommand",
      name: "bad-constraint-kind",
      description: "Bad constraint kind",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: exampleInput,
      usageConstraints: [{ kind: "unknownKind" }],
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

define({
  root: "badConstraintCollection",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    badConstraintCollection: {
      kind: "rootCommand",
      name: "bad-constraint-collection",
      description: "Bad constraint collection",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
      },
      input: exampleInput,
      usageConstraints: { kind: "count" },
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
