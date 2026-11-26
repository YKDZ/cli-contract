import { defineCli, helpCapability, text } from "@boringparts/cli-contract";
import { z } from "zod";

const define = defineCli();

const sharedInput0 = z.object({});
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
      input: sharedInput0,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            permissionDenied: {
              description: "Permission denied",
              schema: z.object({ resource: z.string() }),
              exitCode: 13,
              text: ({ resource }) => text.line(resource),
            },
          },
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

const sharedInput1 = z.object({});
defineCli()({
  root: "rootInspect",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    rootInspect: {
      kind: "rootCommand",
      name: "root-inspect",
      description: "Root inspect",
      input: sharedInput1,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            permissionDenied: {
              description: "Permission denied",
              schema: z.object({ resource: z.string() }),
              exitCode: 13,
              text: ({ resource }) => text.line(resource),
            },
          },
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
