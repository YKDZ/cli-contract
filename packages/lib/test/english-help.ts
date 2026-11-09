import {
  helpCapability,
  type HelpCapabilityDefinition,
  type HelpFactWording,
} from "@ykdz/cli-contract";

export const englishHelpWording = {
  commandPlaceholder: "command",
  choices: "(choices: {choices})",
  default: "(default: {value})",
  whenOnMatch: "when all of {facts}, {onMatch}",
  whenOtherwise: "when not all of {facts}, {otherwise}",
  whenOnMatchOtherwise:
    "when all of {facts}, {onMatch}; otherwise, {otherwise}",
  require: "require {fields}",
  forbid: "forbid {fields}",
  present: "{field} is present",
  equals: "{field}={value}",
  forbiddenCombination: "forbidden combination of {facts}",
  countExactly: "{fields} exactly {count}",
  countAtLeast: "{fields} at least {min}",
  countAtMost: "{fields} at most {max}",
  countBetween: "{fields} between {min} and {max}",
} as const;

type EnglishHelpCapabilityDefinition = Omit<
  HelpCapabilityDefinition,
  "wording"
> & {
  readonly wording?: Partial<HelpFactWording>;
};

export function englishHelpCapability(
  definition: EnglishHelpCapabilityDefinition = {},
) {
  return helpCapability({
    ...definition,
    wording: { ...englishHelpWording, ...definition.wording },
  });
}
