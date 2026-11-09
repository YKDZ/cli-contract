import { defineCli, helpCapability } from "@ykdz/cli-contract";
import { z } from "zod";

const conflictingFactSuffix: readonly [
  ...{ readonly kind: "present"; readonly field: "token" }[],
  { readonly kind: "equals"; readonly field: "token"; readonly value: "safe" },
  { readonly kind: "equals"; readonly field: "token"; readonly value: "force" },
] = [
  { kind: "equals", field: "token", value: "safe" },
  { kind: "equals", field: "token", value: "force" },
];

const base = {
  help: helpCapability(),

  usageFailureExitCode: 64,
} as const;

type ValidExtractedFact =
  | { readonly kind: "present"; readonly field: "mode" }
  | {
      readonly kind: "equals";
      readonly field: "mode";
      readonly value: "safe";
    };
declare const validExtractedFact: ValidExtractedFact;

type ExtractedFactWithUnknownProperty =
  | {
      readonly kind: "present";
      readonly field: "mode";
      readonly typo: true;
    }
  | {
      readonly kind: "equals";
      readonly field: "mode";
      readonly value: "safe";
      readonly typo: true;
    };
declare const extractedFactWithUnknownProperty: ExtractedFactWithUnknownProperty;

const define = defineCli();
const sharedInput0 = z.object({ mode: z.enum(["safe", "force"]).optional() });
define({
  root: "workspace",
  ...base,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...define.command("invalidHierarchy")({
      kind: "command",
      parent: "workspace",
      name: "invalid-hierarchy",
      description: "非法层级约束",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput0,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: "staging" }],
        },
      ],

      outputs: define.outputModes("invalidHierarchy", sharedInput0, (mode) => ({
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

const sharedInput1 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "validExtractedFactUnion",
  ...base,
  commands: {
    validExtractedFactUnion: {
      kind: "rootCommand",
      name: "valid-extracted-fact-union",
      description: "合法提取事实联合",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput1,
      usageConstraints: [
        { kind: "forbiddenCombination", all: [validExtractedFact] },
      ],

      outputs: defineCli().outputModes(
        "validExtractedFactUnion",
        sharedInput1,
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

const sharedInput2 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidClosedFactUnion",
  ...base,
  commands: {
    invalidClosedFactUnion: {
      kind: "rootCommand",
      name: "invalid-closed-fact-union",
      description: "闭合提取事实联合",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput2,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [extractedFactWithUnknownProperty],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidClosedFactUnion",
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

const sharedInput3 = z.object({ mode: z.enum(["safe", "force"]).optional() });
define({
  root: "workspace",
  ...base,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...define.command("invalidClosedFactUnionHierarchy")({
      kind: "command",
      parent: "workspace",
      name: "invalid-closed-fact-union-hierarchy",
      description: "层级闭合提取事实联合",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput3,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [extractedFactWithUnknownProperty],
        },
      ],

      outputs: define.outputModes(
        "invalidClosedFactUnionHierarchy",
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
    }),
  },
});

const sharedInput4 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "invalidClosedConstraint",
  ...base,
  commands: {
    invalidClosedConstraint: {
      kind: "rootCommand",
      name: "invalid-closed-constraint",
      description: "封闭禁配规则",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput4,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "mode" }],
          typo: true,
        },
      ],

      outputs: defineCli().outputModes(
        "invalidClosedConstraint",
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

const sharedInput5 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "invalidClosedFact",
  ...base,
  commands: {
    invalidClosedFact: {
      kind: "rootCommand",
      name: "invalid-closed-fact",
      description: "封闭禁配事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput5,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "mode", typo: true }],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidClosedFact",
        sharedInput5,
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

const sharedInput6 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidNumericValue",
  ...base,
  commands: {
    invalidNumericValue: {
      kind: "rootCommand",
      name: "invalid-numeric-value",
      description: "非法数字等值",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput6,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: 42 }],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidNumericValue",
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

const sharedInput7 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidNullValue",
  ...base,
  commands: {
    invalidNullValue: {
      kind: "rootCommand",
      name: "invalid-null-value",
      description: "非法空值等值",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput7,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: null }],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidNullValue",
        sharedInput7,
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

const sharedInput8 = z.object({ mode: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "invalidObjectValue",
  ...base,
  commands: {
    invalidObjectValue: {
      kind: "rootCommand",
      name: "invalid-object-value",
      description: "非法对象等值",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput8,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: { nested: true } }],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidObjectValue",
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

const sharedInput9 = z.object({ token: z.enum(["safe", "force"]).optional() });
defineCli()({
  root: "factSuffixConflict",
  ...base,
  commands: {
    factSuffixConflict: {
      kind: "rootCommand",
      name: "事实后缀矛盾",
      description: "保留事实已知后缀",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: sharedInput9,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: conflictingFactSuffix,
        },
      ],

      outputs: defineCli().outputModes(
        "factSuffixConflict",
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

const sharedInput10 = z.object({
  auth: z.boolean().optional(),
  mode: z.enum(["safe", "fast"]).optional(),
});
defineCli()({
  root: "invalidValue",
  ...base,
  commands: {
    invalidValue: {
      kind: "rootCommand",
      name: "invalid-value",
      description: "值类型冲突",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput10,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "auth", value: "yes" },
            { kind: "equals", field: "mode", value: "unknown" },
          ],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidValue",
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
  auth: z.boolean().optional(),
  target: z.array(z.string()).optional(),
});
defineCli()({
  root: "invalidKind",
  ...base,
  commands: {
    invalidKind: {
      kind: "rootCommand",
      name: "invalid-kind",
      description: "字段种类冲突",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
        target: {
          kind: "repeatableOption",
          longOption: "--target",
          description: "目标",
        },
      },
      input: sharedInput11,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "auth", value: true },
            { kind: "equals", field: "target", value: "prod" },
          ],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidKind",
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

const sharedInput12 = z.object({ mode: z.string().optional() });
defineCli()({
  root: "invalidContradiction",
  ...base,
  commands: {
    invalidContradiction: {
      kind: "rootCommand",
      name: "invalid-contradiction",
      description: "矛盾等值事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput12,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
        },
      ],

      outputs: defineCli().outputModes(
        "invalidContradiction",
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

const sharedInput13 = z.object({ mode: z.string().optional() });
define({
  root: "workspace",
  ...base,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...define.command("contradictoryHierarchy")({
      kind: "command",
      parent: "workspace",
      name: "contradictory-hierarchy",
      description: "矛盾等值事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: sharedInput13,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
        },
      ],

      outputs: define.outputModes(
        "contradictoryHierarchy",
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
    }),
  },
});
