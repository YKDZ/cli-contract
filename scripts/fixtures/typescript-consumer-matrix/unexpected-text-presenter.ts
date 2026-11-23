import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
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
      description: "工作区",
    },
    ...define.command("inspect")({
      kind: "command",
      parent: "workspace",
      name: "inspect",
      description: "检查",
      input: sharedInput0,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            permissionDenied: {
              description: "无权限",
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
            structured: operation.structured({ description: "结构化输出" }),
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
      description: "根检查",
      input: sharedInput1,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {
            permissionDenied: {
              description: "无权限",
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
            structured: operation.structured({ description: "结构化输出" }),
          },
        };
      },
    },
  },
});
