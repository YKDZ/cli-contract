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
