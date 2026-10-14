import { helpCapability } from "@ykdz/cli-contract";

export const englishHelpWording = {
  commandPlaceholder: "command",
  choices: "(choices: {choices})",
  default: "(default: {value})",
  whenThen: "when all of {facts}, {then}",
  whenOtherwise: "when not all of {facts}, {otherwise}",
  whenThenOtherwise: "when all of {facts}, {then}; otherwise, {otherwise}",
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

export function englishHelpCapability() {
  return helpCapability({ wording: englishHelpWording });
}
