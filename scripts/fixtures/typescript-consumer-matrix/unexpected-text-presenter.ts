import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const define = defineCli();

define({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({}),
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
    }),
  },
});

defineCli()({
  root: "rootInspect",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    rootInspect: {
      kind: "rootCommand",
      name: "root-inspect",
      description: "根检查",
      input: z.object({}),
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
    },
  },
});
