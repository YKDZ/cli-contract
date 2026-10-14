import { helpCapability } from "@ykdz/cli-contract";

const help = helpCapability({
  wording: {
    commandPlaceholder: "命令 组",
    choices: "候选 {choices}，也可写作 {choices}",
    default: "默认值 {value}，再次确认 {value}",
  },
});

void help;
