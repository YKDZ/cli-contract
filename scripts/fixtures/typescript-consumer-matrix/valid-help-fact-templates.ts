import { defineCli, helpCapability } from "@boringparts/cli-contract";
import { z } from "zod";

const help = helpCapability({
  wording: {
    commandPlaceholder: "命令 组",
    outputModePlaceholder: "输出方式",
    choices: "{usage} 候选 {choices}，也可写作 {choices}",
    default: "{usage} 默认值 {value}，再次确认 {value}",
    choicesAndDefault: "{usage}（可选：{choices}；默认：{value}）",
    list: "{left}、{right}",
    facts: "{left}且{right}",
    effects: "{left}，{right}",
  },
});

void help;

type ValidChoicesUnion =
  | { readonly choices: "{usage} 候选 {choices}" }
  | { readonly choices: "{usage} 可选 {choices}" };
const validChoicesUnion: ValidChoicesUnion =
  Math.random() < 0.5
    ? { choices: "{usage} 候选 {choices}" }
    : { choices: "{usage} 可选 {choices}" };
void helpCapability({ wording: validChoicesUnion });

const inferredEmptyWordingBranch =
  Math.random() < 0.5 ? {} : { wording: { choices: "{usage} 候选 {choises}" } };
// @ts-expect-error An unannotated empty branch must not let an invalid template in the other branch pass.
void helpCapability(inferredEmptyWordingBranch);

type OptionalValidWording = {
  readonly shortAlias: "-h";
  readonly wording?: { readonly choices: "{usage} 候选 {choices}" };
};
const optionalValidWording: OptionalValidWording = {
  shortAlias: "-h",
  wording: { choices: "{usage} 候选 {choices}" },
};
void helpCapability(optionalValidWording);

const validSuffixCountFields: readonly [...string[], "token"] = ["token"];
const suffixHelp = helpCapability({
  wording: {
    countAtLeast: "至少提供 {min} 项：{fields}",
    countAtMost: "至多提供 {max} 项：{fields}",
  },
});
const sharedInput0 = z.object({ token: z.string().optional() });
const validSuffixCount = defineCli()({
  root: "validSuffixCount",
  help: suffixHelp,

  usageFailureExitCode: 64,
  commands: {
    validSuffixCount: {
      kind: "rootCommand",
      name: "Valid suffix count",
      description: "Known-suffix fields are still usable",
      fields: {
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "Token",
        },
      },
      input: sharedInput0,
      usageConstraints: [
        { kind: "count", fields: validSuffixCountFields, max: 1 },
      ],

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});

const sharedInput1 = z.object({ token: z.boolean().optional() });
const validNegatedOptionWithoutAlias = defineCli()({
  root: "validNegatedOption",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    validNegatedOption: {
      kind: "rootCommand",
      name: "Valid negated option",
      description: "A valid negated option without a short alias",
      fields: {
        token: {
          kind: "flag",
          longOption: "--token",
          negatedLongOption: "--no-token",
          description: "Token",
        },
      },
      input: sharedInput1,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});

void validSuffixCount;
void validNegatedOptionWithoutAlias;
