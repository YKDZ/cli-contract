import { helpCapability } from "@ykdz/cli-contract";

helpCapability({ wording: { commandPlaceholder: "   " } });
helpCapability({ wording: { commandPlaceholder: "<命令组>" } });
helpCapability({ wording: { choices: "候选 {choises}" } });

const extractedUnknownSlot = {
  wording: { choises: "候选 {choices}" },
} as const;
helpCapability(extractedUnknownSlot);

// @ts-expect-error wording 必须保持为非函数对象。
helpCapability({ wording: () => "候选 {choices}" });

const extractedTemplate = {
  wording: { present: "字段" },
} as const;
helpCapability(extractedTemplate);

helpCapability({ wording: { equals: "字段 {field}" } });
helpCapability({ wording: { forbiddenCombination: "禁止 {facts}\n一起出现" } });
