import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

const define = defineCli();
const countHelp = helpCapability({
  wording: {
    countExactly: "{fields} 恰好出现 {count} 项",
    countAtLeast: "{fields} 至少出现 {min} 项",
    countAtMost: "{fields} 至多出现 {max} 项",
    countBetween: "{fields} 出现 {min} 到 {max} 项",
  },
});
const dynamicCountFields: readonly ["auth" | "quiet", ...("auth" | "quiet")[]] =
  ["auth", "quiet"];

const invalidChild = define.command("deploy")({
  kind: "command",
  parent: "workspace",
  name: "deploy",
  description: "部署",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
    quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
  },
  input: z.object({
    auth: z.boolean().optional(),
    quiet: z.boolean().optional(),
  }),
  usageConstraints: [
    {
      kind: "count",
      fields: dynamicCountFields,
      min: 2,
      max: 1,
    },
  ],
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});

const invalidDynamicNegativeChild = define.command("stage")({
  kind: "command",
  parent: "workspace",
  name: "stage",
  description: "部署阶段",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
    quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
  },
  input: z.object({
    auth: z.boolean().optional(),
    quiet: z.boolean().optional(),
  }),
  usageConstraints: [
    {
      kind: "count",
      fields: dynamicCountFields,
      min: -1,
      max: 1,
    },
  ],
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});

const invalidFixedMaximumChild = define.command("quota")({
  kind: "command",
  parent: "workspace",
  name: "quota",
  description: "配额",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
    quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
  },
  input: z.object({
    auth: z.boolean().optional(),
    quiet: z.boolean().optional(),
  }),
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      max: 3,
    },
  ],
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});

define({
  root: "workspace",
  help: countHelp,
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidChild,
    ...invalidDynamicNegativeChild,
    ...invalidFixedMaximumChild,
  },
});

defineCli()({
  root: "rootDeploy",
  help: countHelp,
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    rootDeploy: {
      kind: "rootCommand",
      name: "根部署",
      description: "根部署",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
        quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
      },
      input: z.object({
        auth: z.boolean().optional(),
        quiet: z.boolean().optional(),
      }),
      usageConstraints: [
        {
          kind: "count",
          fields: ["auth", "quiet"],
          min: -1,
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
