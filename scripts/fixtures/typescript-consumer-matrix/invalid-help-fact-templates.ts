import { helpCapability } from "@ykdz/cli-contract";

helpCapability({ wording: { commandPlaceholder: "   " } });
helpCapability({ wording: { commandPlaceholder: "<命令组>" } });
helpCapability({ wording: { choices: "候选 {choises}" } });

const extractedUnknownSlot = {
  wording: { choises: "候选 {choices}" },
} as const;
helpCapability(extractedUnknownSlot);

type UnknownSlotWordingUnion =
  | { readonly choices: "候选 {choices}" }
  | { readonly choices: "候选 {choices}"; readonly choises: "候选 {choices}" };
const extractedUnknownSlotUnion: UnknownSlotWordingUnion =
  Math.random() < 0.5
    ? { choices: "候选 {choices}" }
    : { choices: "候选 {choices}", choises: "候选 {choices}" };
helpCapability({ wording: extractedUnknownSlotUnion });

type InvalidTemplateWordingUnion =
  | { readonly choices: "候选 {choices}" }
  | { readonly choices: "候选 {choises}" };
const extractedInvalidTemplateUnion: InvalidTemplateWordingUnion =
  Math.random() < 0.5
    ? { choices: "候选 {choices}" }
    : { choices: "候选 {choises}" };
helpCapability({ wording: extractedInvalidTemplateUnion });

type CallableWordingUnion =
  | { readonly choices: "候选 {choices}" }
  | (() => string);
const extractedCallableWordingUnion: CallableWordingUnion =
  Math.random() < 0.5 ? { choices: "候选 {choices}" } : () => "候选 {choices}";
// @ts-expect-error A wording union containing a function must still reject the whole declaration.
helpCapability({ wording: extractedCallableWordingUnion });

type OptionalInvalidTemplate = {
  readonly shortAlias: "-h";
  readonly wording?: { readonly choices: "候选 {choises}" };
};
const optionalInvalidTemplate: OptionalInvalidTemplate = {
  shortAlias: "-h",
  wording: { choices: "候选 {choises}" },
};
helpCapability(optionalInvalidTemplate);

type OptionalUnknownSlot = {
  readonly shortAlias: "-h";
  readonly wording?: {
    readonly choices: "候选 {choices}";
    readonly choises: "候选 {choices}";
  };
};
const optionalUnknownSlot: OptionalUnknownSlot = {
  shortAlias: "-h",
  wording: { choices: "候选 {choices}", choises: "候选 {choices}" },
};
helpCapability(optionalUnknownSlot);

type OptionalCallableWording = {
  readonly shortAlias: "-h";
  readonly wording?: () => "候选 {choices}";
};
const optionalCallableWording: OptionalCallableWording = {
  shortAlias: "-h",
  wording: () => "候选 {choices}",
};
// @ts-expect-error An optional wording declaration must not contain a function either.
helpCapability(optionalCallableWording);

// @ts-expect-error wording must remain a non-function object.
helpCapability({ wording: () => "候选 {choices}" });

const extractedTemplate = {
  wording: { present: "字段" },
} as const;
helpCapability(extractedTemplate);

helpCapability({ wording: { equals: "字段 {field}" } });
helpCapability({ wording: { forbiddenCombination: "禁止 {facts}\n一起出现" } });
