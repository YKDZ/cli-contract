import {
  defineCli,
  helpCapability,
  schemaCapability,
  text,
  versionCapability,
} from "@boringparts/cli-contract";
import { z } from "zod";

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Contextual return-type inference is the authoring pattern under test.
declare function fromEnv<Value extends string>(fallback: string): Value;

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

void helpCapability({});
const emptyHelp = {} as const;
void helpCapability(emptyHelp);
void helpCapability({ shortAlias: fromEnv("-h") });
void versionCapability({
  value: text.line("1.0.0"),
  shortAlias: fromEnv("-V"),
});

const capabilityBranch = Math.random() < 0.5;
const helpDefinitionUnion = capabilityBranch
  ? ({ shortAlias: "-h", headings: { usage: "用法" } } as const)
  : ({ wording: { outputModePlaceholder: "输出方式" } } as const);
void helpCapability(helpDefinitionUnion);

const explicitHelpDefinitionUnion:
  | { readonly shortAlias: "-h" }
  | { readonly wording: { readonly outputModePlaceholder: "输出方式" } } =
  capabilityBranch
    ? { shortAlias: "-h" }
    : { wording: { outputModePlaceholder: "输出方式" } };
void helpCapability(explicitHelpDefinitionUnion);

const optionalHelpDefinitionUnion: { readonly shortAlias: "-h" } | undefined =
  capabilityBranch ? { shortAlias: "-h" } : undefined;
void helpCapability(optionalHelpDefinitionUnion);

const versionDefinitionUnion = capabilityBranch
  ? ({ value: text.line("1.0.0"), shortAlias: "-V" } as const)
  : ({ value: text.line("2.0.0"), description: "打印版本" } as const);
void versionCapability(versionDefinitionUnion);

const schemaDefinitionUnion = capabilityBranch
  ? ({ description: text.line("查询契约") } as const)
  : ({ description: text.line("查看模式") } as const);
void schemaCapability(schemaDefinitionUnion);

type ValidChoicesUnion =
  | { readonly choices: "{usage} 候选 {choices}" }
  | { readonly choices: "{usage} 可选 {choices}" };
const validChoicesUnion: ValidChoicesUnion =
  Math.random() < 0.5
    ? { choices: "{usage} 候选 {choices}" }
    : { choices: "{usage} 可选 {choices}" };
void helpCapability({ wording: validChoicesUnion });

const validEmptyAndWordingUnion =
  Math.random() < 0.5 ? {} : { wording: { choices: "{usage} 候选 {choices}" } };
void helpCapability(validEmptyAndWordingUnion);

void helpCapability(
  // @ts-expect-error An unannotated empty branch must not let an invalid template in the other branch pass.
  Math.random() < 0.5 ? {} : { wording: { choices: "{usage} 候选 {choises}" } },
);

const inferredEmptyWordingBranch =
  Math.random() < 0.5
    ? {}
    : ({ wording: { choices: "{usage} 候选 {choises}" } } as const);
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
