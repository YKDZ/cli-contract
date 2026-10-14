import { helpCapability } from "@ykdz/cli-contract";

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
