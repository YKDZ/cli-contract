import { defineCli, helpCapability } from "@ykdz/cli-contract";
import { z } from "zod";

const sharedInput0 = z.object({});
defineCli()({
  root: "bad_root",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    bad_root: {
      kind: "rootCommand",
      name: "非法根身份",
      description: "检查根命令身份诊断",
      input: sharedInput0,

      outputs: defineCli().outputModes("bad_root", sharedInput0, (mode) => ({
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

const sharedInput1 = z.object({ token: z.boolean().optional() });
defineCli()({
  root: "negatedRoot",
  help: helpCapability(),

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
      input: sharedInput1,

      outputs: defineCli().outputModes("negatedRoot", sharedInput1, (mode) => ({
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

const sharedInput2 = z.object({ token: z.string().optional() });
defineCli()({
  root: "longOptionIdentity",
  help: helpCapability(),

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
      input: sharedInput2,

      outputs: defineCli().outputModes(
        "longOptionIdentity",
        sharedInput2,
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

const sharedInput3 = z.object({ token: z.string().optional() });
defineCli()({
  root: "shortAliasIdentity",
  help: helpCapability(),

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
      input: sharedInput3,

      outputs: defineCli().outputModes(
        "shortAliasIdentity",
        sharedInput3,
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

const sharedInput4 = z.object({ bad_field: z.string().optional() });
defineCli()({
  root: "fieldIdentity",
  help: helpCapability(),

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
      input: sharedInput4,

      outputs: defineCli().outputModes(
        "fieldIdentity",
        sharedInput4,
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

const sharedInput5 = z.object({ token: z.string().optional() });
defineCli()({
  root: "dataVariantIdentity",
  help: helpCapability(),

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
      input: sharedInput5,

      outputs: defineCli().outputModes(
        "dataVariantIdentity",
        sharedInput5,
        (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
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
              handler: () => {
                throw new Error("仅用于类型检查");
              },
            }),
          },
        }),
      ),
    },
  },
});

const sharedInput6 = z.object({});
defineCli()({
  root: "failureVariantIdentity",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    failureVariantIdentity: {
      kind: "rootCommand",
      name: "失败变体身份",
      description: "检查失败变体身份",
      input: sharedInput6,

      outputs: defineCli().outputModes(
        "failureVariantIdentity",
        sharedInput6,
        (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {
                bad_name: {
                  description: "失败变体",
                  schema: z.string(),
                  exitCode: 1,
                },
              },
              handler: () => {
                throw new Error("仅用于类型检查");
              },
            }),
          },
        }),
      ),
    },
  },
});

const define = defineCli();
const sharedInput7 = z.object({ token: z.boolean().optional() });
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
  input: sharedInput7,

  outputs: define.outputModes("deploy", sharedInput7, (mode) => ({
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
  help: helpCapability(),

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

const sharedInput8 = z.object({ constructor: z.string().optional() });
defineCli()({
  root: "reservedConstructor",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedConstructor: {
      kind: "rootCommand",
      name: "保留字段",
      description: "禁名不因字段形态或必填性而放行",
      fields: {
        constructor: {
          kind: "valueOption",
          longOption: "--constructor",
          description: "保留字段身份",
        },
      },
      input: sharedInput8,

      outputs: defineCli().outputModes(
        "reservedConstructor",
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

const sharedInput9 = z.object({ hasOwnProperty: z.boolean() });
defineCli()({
  root: "reservedHasOwnProperty",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedHasOwnProperty: {
      kind: "rootCommand",
      name: "保留字段",
      description: "禁名不因字段形态或必填性而放行",
      fields: {
        hasOwnProperty: {
          kind: "flag",
          longOption: "--hasownproperty",
          description: "保留字段身份",
        },
      },
      input: sharedInput9,

      outputs: defineCli().outputModes(
        "reservedHasOwnProperty",
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

const sharedInput10 = z.object({ isPrototypeOf: z.string() });
defineCli()({
  root: "reservedIsPrototypeOf",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedIsPrototypeOf: {
      kind: "rootCommand",
      name: "保留字段",
      description: "禁名不因字段形态或必填性而放行",
      fields: {
        isPrototypeOf: {
          kind: "positional",
          description: "保留字段身份",
        },
      },
      input: sharedInput10,

      outputs: defineCli().outputModes(
        "reservedIsPrototypeOf",
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

const sharedInput11 = z.object({
  propertyIsEnumerable: z.array(z.string()).min(1).optional(),
});
defineCli()({
  root: "reservedPropertyIsEnumerable",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedPropertyIsEnumerable: {
      kind: "rootCommand",
      name: "保留字段",
      description: "禁名不因字段形态或必填性而放行",
      fields: {
        propertyIsEnumerable: {
          kind: "repeatableOption",
          longOption: "--propertyisenumerable",
          description: "保留字段身份",
        },
      },
      input: sharedInput11,

      outputs: defineCli().outputModes(
        "reservedPropertyIsEnumerable",
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

const sharedInput12 = z.object({ toString: z.string().optional() });
defineCli()({
  root: "reservedToString",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedToString: {
      kind: "rootCommand",
      name: "保留字段",
      description: "禁名不因字段形态或必填性而放行",
      fields: {
        toString: {
          kind: "valueOption",
          longOption: "--tostring",
          description: "保留字段身份",
        },
      },
      input: sharedInput12,

      outputs: defineCli().outputModes(
        "reservedToString",
        sharedInput12,
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

const sharedInput13 = z.object({ valueOf: z.array(z.string()).min(1) });
defineCli()({
  root: "reservedValueOf",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    reservedValueOf: {
      kind: "rootCommand",
      name: "保留字段",
      description: "禁名不因字段形态或必填性而放行",
      fields: {
        valueOf: {
          kind: "variadicPositional",
          description: "保留字段身份",
        },
      },
      input: sharedInput13,

      outputs: defineCli().outputModes(
        "reservedValueOf",
        sharedInput13,
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

const reservedLocaleFields = {
  toLocaleString: {
    kind: "valueOption",
    longOption: "--tolocalestring",
    description: "保留字段身份",
  },
} as const;

const sharedInput14 = z.object({ toLocaleString: z.string().optional() });
define.command("reservedToLocaleString")({
  kind: "command",
  parent: "workspace",
  name: "保留字段",
  description: "提取字段经命令组合也应拒绝",
  fields: reservedLocaleFields,
  input: sharedInput14,

  outputs: define.outputModes(
    "reservedToLocaleString",
    sharedInput14,
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
});
