import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

const base = {
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: "staging" }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        { kind: "forbiddenCombination", all: [validExtractedFact] },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [extractedFactWithUnknownProperty],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [extractedFactWithUnknownProperty],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

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
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "mode" }],
          typo: true,
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "mode", typo: true }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: 42 }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: null }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "mode", value: { nested: true } }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
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
      input: z.object({
        auth: z.boolean().optional(),
        mode: z.enum(["safe", "fast"]).optional(),
      }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "auth", value: "yes" },
            { kind: "equals", field: "mode", value: "unknown" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
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
      input: z.object({
        auth: z.boolean().optional(),
        target: z.array(z.string()).optional(),
      }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "auth", value: true },
            { kind: "equals", field: "target", value: "prod" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

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
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});
