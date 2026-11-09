import { defineCli, helpCapability } from "@ykdz/cli-contract";
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
      description: "工作区",
    },
    ...define.command("inspect")({
      kind: "command",
      parent: "workspace",
      name: "inspect",
      description: "检查",
      fields: {
        count: {
          kind: "valueOption",
          longOption: "--count",
          description: "数量",
        },
      },
      input: sharedInput0,

      outputs: define.outputModes("inspect", sharedInput0, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
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
      description: "根检查",
      fields: {
        count: {
          kind: "valueOption",
          longOption: "--count",
          description: "数量",
        },
      },
      input: sharedInput1,

      outputs: defineCli().outputModes("rootInspect", sharedInput1, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
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
      description: "根启用",
      fields: {
        enabled: {
          kind: "flag",
          longOption: "--enabled",
          description: "启用",
        },
      },
      input: sharedInput2,

      outputs: defineCli().outputModes("rootEnabled", sharedInput2, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
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
      description: "根标签",
      fields: {
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          description: "标签",
        },
      },
      input: sharedInput3,

      outputs: defineCli().outputModes("rootTags", sharedInput3, (mode) => ({
        default: "structured",
        modes: {
          structured: mode.atomic({
            description: "结构化输出",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }),
        },
      })),
    },
  },
});
