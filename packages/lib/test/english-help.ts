import { helpCapability } from "@ykdz/cli-contract";

export const englishHelpWording = {
  commandPlaceholder: "command",
  choices: "(choices: {choices})",
  default: "(default: {value})",
  requires: "{field} requires {requires}",
  exclusive: "exclusive {fields}",
  present: "{field} is present",
  equals: "{field}={value}",
  forbiddenCombination: "forbidden combination of {facts}",
} as const;

export function englishHelpCapability() {
  return helpCapability({ wording: englishHelpWording });
}
