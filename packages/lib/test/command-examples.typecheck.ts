import {
  defineCli,
  helpCapability,
  text,
  type CommandExampleManifest,
} from "@ykdz/cli-contract";
import { z } from "zod";

const exampleInput = z.object({
  count: z.string().transform(Number).pipe(z.number().int()),
  channel: z.enum(["fast", "safe"]),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  first: z.string().optional(),
  second: z.string().optional(),
  paths: z.array(z.string()),
});
const exampleFields = {
  count: {
    kind: "valueOption",
    longOption: "--count",
    description: "数量",
  },
  channel: {
    kind: "valueOption",
    longOption: "--channel",
    description: "通道",
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
  first: { kind: "positional", description: "首项" },
  second: { kind: "positional", description: "次项" },
  paths: { kind: "variadicPositional", description: "路径" },
} as const;

const define = defineCli();
const outputs = define.outputModes("inspect", exampleInput, (mode) => ({
  default: "structured",
  modes: {
    structured: mode.atomic({
      description: "机器读取结果",
      format: "structured",
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
    text: mode.atomic({
      description: "供人阅读结果",
      format: "text",
      success: { kind: "completion", text: () => text.silent },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
}));

const root = define({
  root: "inspect",
  help: helpCapability({
    wording: {
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "tool",
      description: "检查输入",
      fields: exampleFields,
      input: exampleInput,
      outputs,
      examples: [
        {
          input: {
            count: "4",
            channel: "fast",
            enabled: false,
            tags: ["one", "two"],
            paths: ["first", "second"],
          },
        },
        {
          input: {
            count: "5",
            channel: "safe",
            enabled: true,
            tags: ["three"],
            first: "left",
            second: "right",
            paths: ["tail"],
          },
          outputMode: "text",
        },
      ],
    },
  },
});

const leafCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: false,
        tags: ["one"],
        paths: ["first"],
      },
    },
  ],
});
const leaf = define({
  root: "workspace",
  help: helpCapability({
    wording: {
      commandPlaceholder: "command",
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
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

const manifestExample: CommandExampleManifest = {
  argv: ["inspect", "--count=4"],
  shell: "'workspace' 'inspect' '--count=4'",
};

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error Input 枚举值来自契约模式
  examples: [
    {
      input: {
        count: "4",
        channel: "turbo",
        enabled: true,
        tags: ["one"],
        paths: ["first"],
      },
    },
  ],
});

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error 固定输出方式必须来自本命令的方式闭集
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: ["one"],
        paths: ["first"],
      },
      outputMode: "json",
    },
  ],
});

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error schema Input 的必填字段也必须出现在样本中
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: ["one"],
      },
    },
  ],
});

const inputWithExtraField = {
  count: "4",
  channel: "fast" as const,
  enabled: true,
  tags: ["one"],
  paths: ["first"] as [string, ...string[]],
  extra: "not declared",
};
// @ts-expect-error 提取变量保留字段闭集检查，额外字段不能经 raw input 进入示例
define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  examples: [{ input: inputWithExtraField }],
});

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: ["one"],
        paths: ["first"],
      },
      // @ts-expect-error 示例成员名称受闭集约束
      outputmode: "text",
    },
  ],
});

const readonlyTags = ["readonly"] as const;
// @ts-expect-error 显式只读数组不满足 schema 的可变 Input 数组
define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: readonlyTags,
        paths: ["first"],
      },
    },
  ],
});

const unnegatedFlagFields = {
  ...exampleFields,
  enabled: {
    kind: "flag",
    longOption: "--enabled",
    description: "启用",
  },
} as const;
define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "检查输入",
  fields: unnegatedFlagFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error 无否定拼写的 flag 不能以 false 作为 raw 样本
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: false,
        tags: ["one"],
        paths: ["first"],
      },
    },
  ],
});

const rootGroupWithExamples = {
  kind: "rootGroup",
  name: "workspace",
  description: "工作区",
  examples: [{ input: {} }],
} as const;
define({
  root: "workspace",
  help: helpCapability({
    wording: {
      commandPlaceholder: "command",
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
  usageFailureExitCode: 64,
  commands: {
    // @ts-expect-error 命令组不是可执行节点，不能声明调用示例
    workspace: {
      ...rootGroupWithExamples,
    },
    ...leafCommand,
  },
});

void manifestExample;
void root;
void leaf;
