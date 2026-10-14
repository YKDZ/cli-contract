import type {
  CliContractDependencies,
  CliContractRawInput,
  CliContractResult,
  CliContractRoot,
  ContractSchemaInput,
  ContractSchemaOutput,
  UsageFactValue,
} from "@ykdz/cli-contract";
import { cli, inspectCombination } from "__DECLARATION_IMPORT__";

type Dependencies = CliContractDependencies<typeof cli>;
type RawInput = CliContractRawInput<typeof cli>;
type InspectInput = ContractSchemaInput<
  typeof inspectCombination.inspect.input
>;
type InspectOutput = ContractSchemaOutput<
  typeof inspectCombination.inspect.input
>;

const dependencies: Dependencies = { endpoint: "primary" };
// @ts-expect-error 依赖值域在生成的声明中仍保持精确。
const invalidDependencies: Dependencies = { endpoint: "staging" };
const commandName: CliContractRoot<typeof cli> = "inspect";
// @ts-expect-error 命令身份在生成的声明中仍是闭集。
const invalidCommandName: CliContractRoot<typeof cli> = "missing";

const rawInput: RawInput = { query: "free-form", dryRun: true };
// @ts-expect-error 未配置反向拼写的 flag 原始输入只能表示出现。
const invalidRawFlag: RawInput = { dryRun: false };
// @ts-expect-error 契约原始输入不接受未知字段。
const invalidRawField: RawInput = { unknown: "value" };

const inspectInput: InspectInput = { query: "alpha" };
// @ts-expect-error Standard Schema 的 Input 值域仍保留。
const invalidInspectInput: InspectInput = { query: "gamma" };
const inspectOutput: InspectOutput = {
  query: "normalized",
  count: 2,
};
// @ts-expect-error Standard Schema 的 Output 与 Input 保持区分。
const invalidInspectOutput: InspectOutput = { query: "alpha" };

type Constraints = (typeof inspectCombination.inspect.usageConstraints)[number];
type ForbiddenFacts = Extract<
  Constraints,
  { readonly kind: "forbiddenCombination" }
>["all"][number];
type QueryValue = Extract<
  ForbiddenFacts,
  { readonly kind: "equals"; readonly field: "query" }
>["value"];
type DryRunValue = Extract<
  ForbiddenFacts,
  { readonly kind: "equals"; readonly field: "dryRun" }
>["value"];
type QueryFactDomain = UsageFactValue<
  typeof inspectCombination.inspect.fields,
  InspectInput,
  "query"
>;

const queryValue: QueryValue = "alpha";
// @ts-expect-error 生成的声明仍保留字段值字面量。
const invalidQueryValue: QueryValue = "beta";
const validQueryFactDomain: QueryFactDomain = "beta";
// @ts-expect-error 禁配 fact 的 Input 关联值域应在声明再消费后保留。
const invalidQueryFactDomain: QueryFactDomain = "gamma";
const dryRunValue: DryRunValue = true;
// @ts-expect-error flag 值仍保留为布尔字面量。
const invalidDryRunValue: DryRunValue = "true";

declare const result: CliContractResult<typeof cli>;
if (result.kind === "data") {
  result.command satisfies "inspect";
  result.variant satisfies "found";
  result.data.count satisfies number;
  // @ts-expect-error result variants remain associated with their branch.
  result.variant satisfies "unavailable";
}
if (result.kind === "failure") {
  result.command satisfies "inspect";
  result.variant satisfies "unavailable";
  result.data.reason satisfies "offline" | "denied";
  // @ts-expect-error failure variants remain a closed set.
  result.variant satisfies "found";
}

// @ts-expect-error 普通对象不能伪造已编译契约品牌。
const forgedContract: typeof cli = {
  grammar: cli.grammar,
  manifest: cli.manifest,
};

void dependencies;
void invalidDependencies;
void commandName;
void invalidCommandName;
void rawInput;
void invalidRawFlag;
void invalidRawField;
void inspectInput;
void invalidInspectInput;
void inspectOutput;
void invalidInspectOutput;
void queryValue;
void invalidQueryValue;
void validQueryFactDomain;
void invalidQueryFactDomain;
void dryRunValue;
void invalidDryRunValue;
void forgedContract;
