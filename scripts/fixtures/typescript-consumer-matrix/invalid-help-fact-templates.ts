import { helpCapability } from "@ykdz/cli-contract";

helpCapability({ wording: { commandPlaceholder: "   " } });
helpCapability({ wording: { commandPlaceholder: "<命令组>" } });
helpCapability({ wording: { choices: "候选 {choises}" } });

const extractedTemplate = {
  wording: { present: "字段" },
} as const;
helpCapability(extractedTemplate);

helpCapability({ wording: { equals: "字段 {field}" } });
helpCapability({ wording: { forbiddenCombination: "禁止 {facts}\n一起出现" } });
