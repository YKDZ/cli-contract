import { helpCapability } from "@ykdz/cli-contract";

export const englishHelpWording = {
  commandPlaceholder: "command",
  choices: "(choices: {choices})",
  default: "(default: {value})",
  requires: "{field} requires {requires}",
  exclusive: "exclusive {fields}",
  forbiddenCombination: "forbidden {values}",
} as const;

export function englishHelpCapability() {
  return helpCapability({ wording: englishHelpWording });
}
