import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

const help = helpCapability({
  wording: {
    commandPlaceholder: "命令 组",
    choices: "候选 {choices}，也可写作 {choices}",
    default: "默认值 {value}，再次确认 {value}",
  },
});

void help;

type ValidChoicesUnion =
  | { readonly choices: "候选 {choices}" }
  | { readonly choices: "可选 {choices}" };
const validChoicesUnion: ValidChoicesUnion =
  Math.random() < 0.5
    ? { choices: "候选 {choices}" }
    : { choices: "可选 {choices}" };
void helpCapability({ wording: validChoicesUnion });

const inferredEmptyWordingBranch =
  Math.random() < 0.5 ? {} : { wording: { choices: "候选 {choises}" } };
// @ts-expect-error 无注解空分支不能让另一分支中的非法模板通过。
void helpCapability(inferredEmptyWordingBranch);

type OptionalValidWording = {
  readonly shortAlias: "-h";
  readonly wording?: { readonly choices: "候选 {choices}" };
};
const optionalValidWording: OptionalValidWording = {
  shortAlias: "-h",
  wording: { choices: "候选 {choices}" },
};
void helpCapability(optionalValidWording);

const validSuffixCountFields: readonly [...string[], "token"] = ["token"];
const suffixHelp = helpCapability({
  wording: {
    countAtLeast: "至少提供 {min} 项：{fields}",
    countAtMost: "至多提供 {max} 项：{fields}",
  },
});
const validSuffixCount = defineCli()({
  root: "validSuffixCount",
  help: suffixHelp,
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    validSuffixCount: {
      kind: "rootCommand",
      name: "有效后缀数量",
      description: "已知后缀字段仍可使用",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({ token: z.string().optional() }),
      usageConstraints: [
        { kind: "count", fields: validSuffixCountFields, max: 1 },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

const validNegatedOptionWithoutAlias = defineCli()({
  root: "validNegatedOption",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    validNegatedOption: {
      kind: "rootCommand",
      name: "有效反向选项",
      description: "无短别名的合法反向选项",
      fields: {
        token: {
          kind: "flag",
          longOption: "--token",
          negatedLongOption: "--no-token",
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

void validSuffixCount;
void validNegatedOptionWithoutAlias;
