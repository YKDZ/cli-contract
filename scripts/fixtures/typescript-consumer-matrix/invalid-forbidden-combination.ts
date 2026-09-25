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
        mode: z.string().optional(),
      }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          values: [
            { field: "auth", value: "yes" },
            { field: "mode", value: "safe" },
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
        target: { kind: "positional", description: "目标" },
      },
      input: z.object({ auth: z.boolean().optional(), target: z.string() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          values: [
            { field: "auth", value: true },
            { field: "target", value: "prod" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
