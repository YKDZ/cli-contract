import { defineCli, helpCapability } from "@ykdz/cli-contract";
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
const validWideLastSuffixCountFields: readonly [...string[], "quiet", string] =
  ["quiet", "auth"];
declare const missingFixedCountFields: readonly ["missing", string];
declare const missingRestCountFields: readonly ["missing", ...string[]];
declare const missingSuffixCountFields: readonly [...string[], "missing"];
const missingSuffixBeforeWideCountFields: readonly [
  ...string[],
  "missing",
  string,
] = ["missing", "token"];
declare const duplicateSuffixCountFields: readonly [
  "token",
  ...string[],
  "token",
];
declare const broadCountFields: string[];
declare const broadCountTuple: readonly [string, string];
declare const unionCountTuple: readonly ["auth" | "quiet", "auth" | "quiet"];

const sharedInput0 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidChild = define.command("deploy")({
  kind: "command",
  parent: "workspace",
  name: "deploy",
  description: "部署",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
    quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
  },
  input: sharedInput0,
  usageConstraints: [
    {
      kind: "count",
      fields: dynamicCountFields,
      min: 2,
      max: 1,
    },
  ],

  outputs: define.outputModes("deploy", sharedInput0, (mode) => ({
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
});

const sharedInput1 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
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
  input: sharedInput1,
  usageConstraints: [
    {
      kind: "count",
      fields: dynamicCountFields,
      min: -1,
      max: 1,
    },
  ],

  outputs: define.outputModes("stage", sharedInput1, (mode) => ({
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
});

const sharedInput2 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
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
  input: sharedInput2,
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      max: 3,
    },
  ],

  outputs: define.outputModes("quota", sharedInput2, (mode) => ({
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
});

const sharedInput3 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidCompoundChild = define.command("compound")({
  kind: "command",
  parent: "workspace",
  name: "compound",
  description: "多个数量错误",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
    quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
  },
  input: sharedInput3,
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      min: -1,
      max: 3,
    },
  ],

  outputs: define.outputModes("compound", sharedInput3, (mode) => ({
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
});

const sharedInput4 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
const invalidFractionalChild = define.command("fractional")({
  kind: "command",
  parent: "workspace",
  name: "fractional",
  description: "小数端点",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
    quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
  },
  input: sharedInput4,
  usageConstraints: [
    {
      kind: "count",
      fields: ["auth", "quiet"],
      min: 0.5,
    },
  ],

  outputs: define.outputModes("fractional", sharedInput4, (mode) => ({
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
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidDynamicNegativeChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidFixedMaximumChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidCompoundChild,
  },
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidFractionalChild,
  },
});

const sharedInput5 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
defineCli()({
  root: "rootDeploy",
  help: countHelp,

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
      input: sharedInput5,
      usageConstraints: [
        {
          kind: "count",
          fields: ["auth", "quiet"],
          min: -1,
        },
      ],

      outputs: defineCli().outputModes("rootDeploy", sharedInput5, (mode) => ({
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

const sharedInput6 = z.object({ auth: z.boolean().optional() });
defineCli()({
  root: "rootMissingCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    rootMissingCountField: {
      kind: "rootCommand",
      name: "根缺失字段",
      description: "根命令中的混合数量字段组",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: sharedInput6,
      usageConstraints: [
        {
          kind: "count",
          fields: missingFixedCountFields,
          min: 0,
        },
      ],

      outputs: defineCli().outputModes(
        "rootMissingCountField",
        sharedInput6,
        (mode) => ({
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
        }),
      ),
    },
  },
});

const sharedInput7 = z.object({ auth: z.boolean().optional() });
const invalidMixedCountChild = define.command("missingCountChild")({
  kind: "command",
  parent: "workspace",
  name: "子命令缺失字段",
  description: "组合展开中的混合数量字段组",
  fields: {
    auth: { kind: "flag", longOption: "--auth", description: "认证" },
  },
  input: sharedInput7,
  usageConstraints: [
    {
      kind: "count",
      fields: missingRestCountFields,
      min: 0,
    },
  ],

  outputs: define.outputModes("missingCountChild", sharedInput7, (mode) => ({
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
});

define({
  root: "workspace",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidMixedCountChild,
  },
});

const sharedInput8 = z.object({
  auth: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
defineCli()({
  root: "validBroadCounts",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    validBroadCounts: {
      kind: "rootCommand",
      name: "宽泛数量字段组",
      description: "仍合法的宽泛字段组",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
        quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
      },
      input: sharedInput8,
      usageConstraints: [
        { kind: "count", fields: broadCountFields, min: 0, max: 1 },
        { kind: "count", fields: broadCountTuple, min: 0, max: 2 },
        { kind: "count", fields: unionCountTuple, min: 0, max: 2 },
        {
          kind: "count",
          fields: validWideLastSuffixCountFields,
          min: 0,
          max: 2,
        },
      ],

      outputs: defineCli().outputModes(
        "validBroadCounts",
        sharedInput8,
        (mode) => ({
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
        }),
      ),
    },
  },
});

const sharedInput9 = z.object({ token: z.string().optional() });
defineCli()({
  root: "missingSuffixCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    missingSuffixCountField: {
      kind: "rootCommand",
      name: "后缀未知字段",
      description: "保留已知后缀字段",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: sharedInput9,
      usageConstraints: [
        { kind: "count", fields: missingSuffixCountFields, max: 1 },
      ],

      outputs: defineCli().outputModes(
        "missingSuffixCountField",
        sharedInput9,
        (mode) => ({
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
        }),
      ),
    },
  },
});

const sharedInput10 = z.object({ token: z.string().optional() });
defineCli()({
  root: "missingSuffixBeforeWideCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    missingSuffixBeforeWideCountField: {
      kind: "rootCommand",
      name: "宽成员前的后缀未知字段",
      description: "末尾宽成员不能遮挡更早的已知必需字段",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: sharedInput10,
      usageConstraints: [
        {
          kind: "count",
          fields: missingSuffixBeforeWideCountFields,
          max: 1,
        },
      ],

      outputs: defineCli().outputModes(
        "missingSuffixBeforeWideCountField",
        sharedInput10,
        (mode) => ({
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
        }),
      ),
    },
  },
});

const sharedInput11 = z.object({ token: z.string().optional() });
defineCli()({
  root: "duplicateSuffixCountField",
  help: countHelp,

  usageFailureExitCode: 64,
  commands: {
    duplicateSuffixCountField: {
      kind: "rootCommand",
      name: "后缀重复字段",
      description: "保留已知前后缀字段",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: sharedInput11,
      usageConstraints: [
        { kind: "count", fields: duplicateSuffixCountFields, max: 1 },
      ],

      outputs: defineCli().outputModes(
        "duplicateSuffixCountField",
        sharedInput11,
        (mode) => ({
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
        }),
      ),
    },
  },
});
