import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const define = defineCli();

const sharedInput0 = z.object({ count: z.number() });
define({
  root: "workspace",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "Workspace",
    },
    ...define.command("inspect")({
      kind: "command",
      parent: "workspace",
      name: "inspect",
      description: "Inspect",
      fields: {
        count: {
          kind: "valueOption",
          longOption: "--count",
          description: "Count",
        },
      },
      input: sharedInput0,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    }),
  },
});

const sharedInput1 = z.object({ count: z.number() });
defineCli()({
  root: "rootInspect",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    rootInspect: {
      kind: "rootCommand",
      name: "root-inspect",
      description: "Root inspect",
      fields: {
        count: {
          kind: "valueOption",
          longOption: "--count",
          description: "Count",
        },
      },
      input: sharedInput1,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});

const sharedInput2 = z.object({ enabled: z.string() });
defineCli()({
  root: "rootEnabled",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    rootEnabled: {
      kind: "rootCommand",
      name: "root-enabled",
      description: "Root enabled",
      fields: {
        enabled: {
          kind: "flag",
          longOption: "--enabled",
          description: "Enabled",
        },
      },
      input: sharedInput2,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});

const sharedInput3 = z.object({ tags: z.array(z.number()) });
defineCli()({
  root: "rootTags",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    rootTags: {
      kind: "rootCommand",
      name: "root-tags",
      description: "Root tags",
      fields: {
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          description: "Tags",
        },
      },
      input: sharedInput3,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});
