import {
  defineCli,
  helpCapability,
  outputCapability,
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
      fields: {
        count: {
          kind: "valueOption",
          longOption: "--count",
          description: "数量",
        },
      },
      input: z.object({ count: z.number() }),
      success: { kind: "completion" },
      failures: {},
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
      fields: {
        count: {
          kind: "valueOption",
          longOption: "--count",
          description: "数量",
        },
      },
      input: z.object({ count: z.number() }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "rootEnabled",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({ enabled: z.string() }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "rootTags",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({ tags: z.array(z.number()) }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
