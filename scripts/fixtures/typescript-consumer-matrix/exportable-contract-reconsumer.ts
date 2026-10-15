import type {
  CliContract,
  CliContractDependencies,
  CliContractRawInput,
  CliContractResult,
  CliContractRoot,
  ContractSchemaInput,
  ContractSchemaOutput,
  StreamRecordFactUnion,
  UsageFactValue,
} from "@ykdz/cli-contract";
import { executeCli, parseCliInvocation } from "@ykdz/cli-contract";
import {
  cli,
  inspectCombination,
  tailCombination,
  wideConditionalContract,
} from "__DECLARATION_IMPORT__";

type Dependencies = CliContractDependencies<typeof cli>;
type RawInput = CliContractRawInput<typeof cli>;
type InspectInput = ContractSchemaInput<
  typeof inspectCombination.inspect.input
>;
type InspectOutput = ContractSchemaOutput<
  typeof inspectCombination.inspect.input
>;
type TailInput = ContractSchemaInput<typeof tailCombination.tail.input>;
type TailOutput = ContractSchemaOutput<typeof tailCombination.tail.input>;
type TailRecord = StreamRecordFactUnion<
  "tail",
  typeof tailCombination.tail.success.records
>;

const dependencies: Dependencies = { endpoint: "primary" };
// @ts-expect-error 依赖值域在生成的声明中仍保持精确。
const invalidDependencies: Dependencies = { endpoint: "staging" };
const commandName: CliContractRoot<typeof cli> = "inspect";
// @ts-expect-error 命令身份在生成的声明中仍是闭集。
const invalidCommandName: CliContractRoot<typeof cli> = "missing";

const rawInput: RawInput = { query: "free-form", dryRun: true };
const tailRawInput: RawInput = { topic: "arbitrary", follow: true };
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
const tailInput: TailInput = { topic: "source", follow: true };
// @ts-expect-error stream command 的 Input 值域在生成声明中仍保持精确。
const invalidTailInput: TailInput = { topic: "archive" };
const tailOutput: TailOutput = { target: "normalized", follow: true };
// @ts-expect-error stream handler 的 Output 仍与 Input 保持区分。
const invalidTailOutput: TailOutput = { topic: "source" };

type Constraints = (typeof inspectCombination.inspect.usageConstraints)[number];
type CountConstraint = Extract<Constraints, { readonly kind: "count" }>;
type WhenConstraint = Extract<Constraints, { readonly kind: "when" }>;
const matchedField: WhenConstraint["onMatch"]["require"][number] = "dryRun";
// @ts-expect-error 生成声明后的成立分支仍保留精确效果字段。
const invalidMatchedField: WhenConstraint["onMatch"]["require"][number] =
  "query";
void matchedField;
void invalidMatchedField;
type CountField = CountConstraint["fields"][number];
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
const countField: CountField = "query";
// @ts-expect-error 生成的声明仍将数量字段限制在当前命令字段中。
const invalidCountField: CountField = "missing";
const countMinimum: CountConstraint["min"] = 1;
// @ts-expect-error 生成的声明仍保留数量端点字面量。
const invalidCountMinimum: CountConstraint["min"] = 2;
const validQueryFactDomain: QueryFactDomain = "beta";
// @ts-expect-error 禁配 fact 的 Input 关联值域应在声明再消费后保留。
const invalidQueryFactDomain: QueryFactDomain = "gamma";
const dryRunValue: DryRunValue = true;
// @ts-expect-error flag 值仍保留为布尔字面量。
const invalidDryRunValue: DryRunValue = "true";

const invocation = parseCliInvocation(cli, ["inspect", "--query", "alpha"]);
if (invocation.kind === "usageFailure" && invocation.command === "inspect") {
  for (const issue of invocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    issue.branch satisfies "onMatch" | "otherwise";
    const condition = issue.conditions[0];
    if (condition.kind !== "equals") continue;
    const expectedInput: "alpha" = condition.expected;
    // @ts-expect-error expected 来源于 InspectInput，不是宽 Output 字符串。
    const invalidExpected: "outside" = condition.expected;
    if (condition.present) {
      const rawActual: string | boolean = condition.actual;
      const outsideExpectedDomain: typeof condition.actual = "outside";
      void rawActual;
      void outsideExpectedDomain;
    } else {
      // @ts-expect-error equals 缺席分支不声明 actual。
      void condition.actual;
    }
    void expectedInput;
    void invalidExpected;
  }
}

const reconsumedWideContract: CliContract = wideConditionalContract;
const wideInvocation = parseCliInvocation(reconsumedWideContract, ["inspect"]);
if (wideInvocation.kind === "usageFailure") {
  for (const issue of wideInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const broadConditionalCode: "conditionalConstraintViolation" = issue.code;
    void broadConditionalCode;
  }
}
void executeCli(reconsumedWideContract, {
  invocation: wideInvocation,
  dependencies: undefined,
  write: () => undefined,
}).then((termination) => {
  if (termination.kind !== "usageFailure") return;
  for (const issue of termination.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const broadConditionalCode: "conditionalConstraintViolation" = issue.code;
    void broadConditionalCode;
  }
});

declare const tailRecord: TailRecord;
tailRecord.command satisfies "tail";
tailRecord.variant satisfies "line";
tailRecord.data.endpoint satisfies Dependencies["endpoint"];
// @ts-expect-error stream record 名在声明再消费后仍保持闭集。
tailRecord.variant satisfies "missing";

declare const result: CliContractResult<typeof cli>;
if (result.kind === "data") {
  result.command satisfies "inspect";
  result.variant satisfies "found";
  result.data.count satisfies number;
  // @ts-expect-error 结果变体仍与所属分支保持关联。
  result.variant satisfies "unavailable";
}
if (result.kind === "failure") {
  result.command satisfies "inspect" | "tail";
  result.variant satisfies "unavailable";
  result.data.reason satisfies "offline" | "denied";
  // @ts-expect-error 失败变体仍保持闭合集合。
  result.variant satisfies "found";
}
type TailResult = Extract<CliContractResult<typeof cli>, { command: "tail" }>;
type TailSuccess = Extract<TailResult, { readonly kind: "streamSuccess" }>;
type TailFailure = Extract<TailResult, { readonly kind: "failure" }>;

declare const tailSuccess: TailSuccess;
tailSuccess.command satisfies "tail";
declare const tailFailure: TailFailure;
tailFailure.command satisfies "tail";
tailFailure.variant satisfies "unavailable";
tailFailure.data.reason satisfies "offline" | "denied";
tailFailure.data.endpoint satisfies Dependencies["endpoint"];
// @ts-expect-error stream failure 名在声明再消费后仍保持闭集。
tailFailure.variant satisfies "missing";

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
void tailRawInput;
void invalidRawFlag;
void invalidRawField;
void inspectInput;
void invalidInspectInput;
void inspectOutput;
void invalidInspectOutput;
void countField;
void invalidCountField;
void countMinimum;
void invalidCountMinimum;
void tailInput;
void invalidTailInput;
void tailOutput;
void invalidTailOutput;
void queryValue;
void invalidQueryValue;
void validQueryFactDomain;
void invalidQueryFactDomain;
void dryRunValue;
void invalidDryRunValue;
void invocation;
void tailRecord;
void tailSuccess;
void tailFailure;
void forgedContract;
