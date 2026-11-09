import {
  defineCli,
  helpCapability,
  type CommandExampleManifest,
} from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({
  channel: z.enum(["fast", "safe"]),
  count: z.string().transform(Number).pipe(z.number().int()),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  target: z.string(),
  paths: z.array(z.string()),
});
const fields = {
  channel: {
    kind: "valueOption",
    longOption: "--channel",
    description: "通道",
  },
  count: {
    kind: "valueOption",
    longOption: "--count",
    description: "数量",
  },
  enabled: {
    kind: "flag",
    longOption: "--enabled",
    negatedLongOption: "--no-enabled",
    description: "启用",
  },
  tags: {
    kind: "repeatableOption",
    longOption: "--tag",
    description: "标签",
  },
  target: { kind: "positional", description: "目标" },
  paths: { kind: "variadicPositional", description: "路径" },
} as const;
const define = defineCli();
const outputs = define.outputModes("inspect", input, (mode) => ({
  modes: {
    structured: mode.atomic({
      description: "结构化输出",
      format: "structured",
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
}));

const root = define({
  root: "inspect",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "inspect",
      description: "根命令示例",
      fields,
      input,
      outputs,
      examples: [
        {
          input: {
            channel: "fast",
            count: "3",
            enabled: false,
            tags: ["one", "two"],
            target: "build",
            paths: ["src", "test"],
          },
        },
        {
          input: {
            channel: "safe",
            count: "4",
            enabled: true,
            tags: ["release"],
            target: "publish",
            paths: ["dist"],
          },
          outputMode: "structured",
        },
      ],
    },
  },
});

const leafCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "叶命令示例",
  fields,
  input,
  outputs,
  examples: [
    {
      input: {
        channel: "fast",
        count: "5",
        enabled: false,
        tags: ["leaf"],
        target: "build",
        paths: ["packages", "lib"],
      },
    },
  ],
});
const leaf = define({
  root: "workspace",
  help: helpCapability({ wording: { commandPlaceholder: "command" } }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...leafCommand,
  },
});

const invalidEnumCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "枚举负例",
  fields,
  input,
  outputs,
  // @ts-expect-error 输入模式的枚举约束也适用于原始示例。
  examples: [
    {
      input: {
        channel: "turbo",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const invalidModeCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "方式负例",
  fields,
  input,
  outputs,
  // @ts-expect-error 固定输出方式必须属于命令的方式闭集。
  examples: [
    {
      input: {
        channel: "safe",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
      outputMode: "text",
    },
  ],
});

const missingInputCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "必填负例",
  fields,
  input,
  outputs,
  // @ts-expect-error 输入模式必填字段不能从示例中省略。
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
      },
    },
  ],
});

const inputWithExtra = {
  channel: "fast" as const,
  count: "3",
  enabled: true,
  tags: ["one"],
  target: "build",
  paths: ["src"] as [string, ...string[]],
  extra: "not declared",
};
// @ts-expect-error 提取变量中的额外字段仍受输入闭集检查。
const extraInputCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "额外字段负例",
  fields,
  input,
  outputs,
  examples: [{ input: inputWithExtra }],
});

const misspelledMemberCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "拼错成员负例",
  fields,
  input,
  outputs,
  examples: [
    {
      input: {
        channel: "safe",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
      // @ts-expect-error 示例成员采用闭合拼写。
      outputmode: "structured",
    },
  ],
});

const readonlyTags = ["read-only"] as const;
// @ts-expect-error 只读数组不能满足 schema 的可变数组 Input。
const readonlyArrayCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "只读数组负例",
  fields,
  input,
  outputs,
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: true,
        tags: readonlyTags,
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

// @ts-expect-error repeatable 字段必须包含至少一个原始值。
const emptyRepeatableCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "空重复数组负例",
  fields,
  input,
  outputs,
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: true,
        tags: [],
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const unnegatedFlagFields = {
  ...fields,
  enabled: {
    kind: "flag",
    longOption: "--enabled",
    description: "启用",
  },
} as const;
const unnegatedFalseFlagCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "无否定flag负例",
  fields: unnegatedFlagFields,
  input,
  outputs,
  // @ts-expect-error 无否定拼写的flag不能使用false原始值。
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: false,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const manifestExample: CommandExampleManifest = {
  argv: ["inspect", "--count=3"],
  shell: "'tool' 'inspect' '--count=3'",
};

void root;
void leaf;
void invalidEnumCommand;
void invalidModeCommand;
void missingInputCommand;
void extraInputCommand;
void misspelledMemberCommand;
void readonlyArrayCommand;
void emptyRepeatableCommand;
void unnegatedFalseFlagCommand;
void manifestExample;
