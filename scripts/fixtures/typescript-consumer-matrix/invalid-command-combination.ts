import { defineCli, helpCapability } from "@ykdz/cli-contract";
import { z } from "zod";

const invalidFact:
  | { readonly kind: "present"; readonly field: "mode"; readonly typo: true }
  | {
      readonly kind: "equals";
      readonly field: "mode";
      readonly value: "safe";
      readonly typo: true;
    } =
  Math.random() < 0.5
    ? { kind: "present", field: "mode", typo: true }
    : { kind: "equals", field: "mode", value: "safe", typo: true };

const define = defineCli();
const sharedInput0 = z.object({ mode: z.enum(["safe", "force"]).optional() });
const inspect = define.command("inspect")({
  kind: "command",
  parent: "tool",
  name: "inspect",
  description: "检查配置",
  fields: {
    mode: {
      kind: "valueOption",
      longOption: "--mode",
      description: "模式",
    },
  },
  input: sharedInput0,
  usageConstraints: [{ kind: "forbiddenCombination", all: [invalidFact] }],

  outputs: define.outputModes("inspect", sharedInput0, (mode) => ({
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

export const cli = define({
  root: "tool",
  help: helpCapability({
    wording: {
      commandPlaceholder: "命令",
      choices: "候选 {choices}",
      present: "字段 {field}",
      equals: "字段 {field}={value}",
      forbiddenCombination: "禁配事实 {facts}",
    },
  }),

  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "工具" },
    ...inspect,
  },
});
