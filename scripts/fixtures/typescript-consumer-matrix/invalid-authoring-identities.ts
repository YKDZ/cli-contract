import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

defineCli()({
  root: "bad_root",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    bad_root: {
      kind: "rootCommand",
      name: "非法根身份",
      description: "检查根命令身份诊断",
      input: z.object({}),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "negatedRoot",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    negatedRoot: {
      kind: "rootCommand",
      name: "反向选项拼写",
      description: "省略短别名时仍检查反向选项",
      fields: {
        token: {
          kind: "flag",
          longOption: "--token",
          negatedLongOption: "--no-Bad",
          description: "令牌",
        },
      },
      input: z.object({ token: z.boolean().optional() }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "longOptionIdentity",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    longOptionIdentity: {
      kind: "rootCommand",
      name: "长选项拼写",
      description: "检查无效长选项",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--Bad",
          description: "令牌",
        },
      },
      input: z.object({ token: z.string().optional() }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "shortAliasIdentity",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    shortAliasIdentity: {
      kind: "rootCommand",
      name: "短别名拼写",
      description: "检查无效短别名",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          shortAlias: "-bad",
          description: "令牌",
        },
      },
      input: z.object({ token: z.string().optional() }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "fieldIdentity",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    fieldIdentity: {
      kind: "rootCommand",
      name: "字段身份",
      description: "检查字段身份",
      fields: {
        bad_field: {
          kind: "valueOption",
          longOption: "--bad-field",
          description: "令牌",
        },
      },
      input: z.object({ bad_field: z.string().optional() }),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

defineCli()({
  root: "dataVariantIdentity",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    dataVariantIdentity: {
      kind: "rootCommand",
      name: "数据变体身份",
      description: "检查数据变体身份",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({ token: z.string().optional() }),
      success: {
        kind: "data",
        variants: {
          bad_name: {
            description: "数据变体",
            schema: z.string(),
            exitCode: 0,
          },
        },
      },
      failures: {},
      handler: ({ outcome }) => outcome.data.bad_name("value"),
    },
  },
});

defineCli()({
  root: "failureVariantIdentity",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    failureVariantIdentity: {
      kind: "rootCommand",
      name: "失败变体身份",
      description: "检查失败变体身份",
      input: z.object({}),
      success: { kind: "completion" },
      failures: {
        bad_name: {
          description: "失败变体",
          schema: z.string(),
          exitCode: 1,
        },
      },
      handler: ({ outcome }) => outcome.failure.bad_name("value"),
    },
  },
});

const define = defineCli();
const invalidNegatedChild = define.command("deploy")({
  kind: "command",
  parent: "workspace",
  name: "部署",
  description: "命令组合中的反向选项拼写",
  fields: {
    token: {
      kind: "flag",
      longOption: "--token",
      negatedLongOption: "--no-Bad",
      description: "令牌",
    },
  },
  input: z.object({ token: z.boolean().optional() }),
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});

define({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  // @ts-expect-error 非法反向选项不能进入根命令树。
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "工作区",
      description: "工作区",
    },
    ...invalidNegatedChild,
  },
});
