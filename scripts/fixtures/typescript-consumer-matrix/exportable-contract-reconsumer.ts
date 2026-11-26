import type {
  CliContract,
  CliContractDependencies,
  CliContractRawInput,
  CliContractResult,
  CliContractRoot,
  CommandExampleManifest,
  ContractSchemaInput,
  ContractSchemaOutput,
  StreamRecordFactUnion,
  TextFragment,
  UsageFactValue,
} from "@boringparts/cli-contract";
import { executeCli, parseCliInvocation } from "@boringparts/cli-contract";
import {
  cli,
  inspectCombination,
  rootCommandContract,
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
  typeof tailCombination.tail.outputs.modes.structured.success.records
>;
declare const textFragment: TextFragment;
void textFragment;

const dependencies: Dependencies = { endpoint: "primary" };
// @ts-expect-error The dependency domain stays precise in the generated declarations.
const invalidDependencies: Dependencies = { endpoint: "staging" };
const commandName: CliContractRoot<typeof cli> = "inspect";
// @ts-expect-error Command identities stay a closed set in the generated declarations.
const invalidCommandName: CliContractRoot<typeof cli> = "missing";

const rawInput: RawInput = { query: "free-form", dryRun: true };
const tailRawInput: RawInput = { topic: "arbitrary", follow: true };
// @ts-expect-error Raw input for a flag without a negated spelling can only express presence.
const invalidRawFlag: RawInput = { dryRun: false };
// @ts-expect-error Contract raw input rejects unknown fields.
const invalidRawField: RawInput = { unknown: "value" };

const inspectInput: InspectInput = { query: "alpha" };
// @ts-expect-error The Standard Schema Input domain survives declaration generation.
const invalidInspectInput: InspectInput = { query: "gamma" };
const inspectOutput: InspectOutput = {
  query: "normalized",
  count: 2,
};
// @ts-expect-error The Standard Schema Output stays distinct from Input.
const invalidInspectOutput: InspectOutput = { query: "alpha" };
const tailInput: TailInput = { topic: "source", follow: true };
// @ts-expect-error The stream command's Input domain stays precise in the generated declarations.
const invalidTailInput: TailInput = { topic: "archive" };
const tailOutput: TailOutput = { target: "normalized", follow: true };
// @ts-expect-error The stream handler's Output stays distinct from Input.
const invalidTailOutput: TailOutput = { topic: "source" };

type Constraints = (typeof inspectCombination.inspect.usageConstraints)[number];
type CountConstraint = Extract<Constraints, { readonly kind: "count" }>;
type WhenConstraint = Extract<Constraints, { readonly kind: "when" }>;
const matchedField: WhenConstraint["onMatch"]["require"][number] = "dryRun";
// @ts-expect-error The matched branch keeps precise effect fields after declaration generation.
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
// @ts-expect-error The generated declarations keep field value literals.
const invalidQueryValue: QueryValue = "beta";
const countField: CountField = "query";
// @ts-expect-error The generated declarations still restrict count fields to the owning command's fields.
const invalidCountField: CountField = "missing";
const countMinimum: CountConstraint["min"] = 1;
// @ts-expect-error The generated declarations keep count endpoint literals.
const invalidCountMinimum: CountConstraint["min"] = 2;
const validQueryFactDomain: QueryFactDomain = "beta";
// @ts-expect-error The Input-linked domain of forbidden-combination facts survives declaration re-consumption.
const invalidQueryFactDomain: QueryFactDomain = "gamma";
const dryRunValue: DryRunValue = true;
// @ts-expect-error Flag values stay boolean literals.
const invalidDryRunValue: DryRunValue = "true";

const invocation = parseCliInvocation(cli, ["inspect", "--query", "alpha"]);
if (invocation.kind === "usageFailure" && invocation.command === "inspect") {
  for (const issue of invocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    issue.branch satisfies "onMatch" | "otherwise";
    const condition = issue.conditions[0];
    if (condition.kind !== "equals") continue;
    const expectedInput: "alpha" = condition.expected;
    // @ts-expect-error expected comes from InspectInput, not the wide Output string.
    const invalidExpected: "outside" = condition.expected;
    if (condition.present) {
      const rawActual: string | boolean = condition.actual;
      const outsideExpectedDomain: typeof condition.actual = "outside";
      void rawActual;
      void outsideExpectedDomain;
    } else {
      // @ts-expect-error The absent branch of an equals condition does not declare actual.
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
// @ts-expect-error Stream record names stay a closed set after declaration re-consumption.
tailRecord.variant satisfies "missing";

declare const result: CliContractResult<typeof cli>;
if (result.kind === "data") {
  result.command satisfies "inspect";
  result.variant satisfies "found";
  result.data.count satisfies number;
  // @ts-expect-error Result variants stay tied to their owning branch.
  result.variant satisfies "unavailable";
}
if (result.kind === "failure") {
  result.command satisfies "inspect" | "tail";
  result.variant satisfies "unavailable";
  result.data.reason satisfies "offline" | "denied";
  // @ts-expect-error Failure variants stay a closed set.
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
// @ts-expect-error Stream failure names stay a closed set after declaration re-consumption.
tailFailure.variant satisfies "missing";

// Re-consumed mode tables stay closed with literal defaults on the exported leaf
// definition and on the formal root/leaf grammar and manifest, via public exports.
type TailDefinitionModeKeys = keyof typeof tailCombination.tail.outputs.modes;
const tailDefinitionMode: TailDefinitionModeKeys = "text";
// @ts-expect-error The exported tail definition keeps a closed mode key set.
const invalidTailDefinitionMode: TailDefinitionModeKeys = "missing";
type InspectDefinitionModeKeys =
  keyof typeof inspectCombination.inspect.outputs.modes;
const inspectDefinitionMode: InspectDefinitionModeKeys = "structured";
// @ts-expect-error The exported inspect definition keeps a closed mode key set.
const invalidInspectDefinitionMode: InspectDefinitionModeKeys = "text";
const tailDefinitionDefault: typeof tailCombination.tail.outputs.default =
  "structured";
// @ts-expect-error The exported tail definition keeps a literal default mode.
const invalidTailDefinitionDefault: typeof tailCombination.tail.outputs.default =
  "text";
const inspectDefinitionDefault: typeof inspectCombination.inspect.outputs.default =
  "structured";
// @ts-expect-error The exported inspect definition keeps a literal default mode.
const invalidInspectDefinitionDefault: typeof inspectCombination.inspect.outputs.default =
  "text";

type TailManifestModeKeys =
  keyof typeof cli.manifest.commands.tail.outputs.modes;
const tailManifestMode: TailManifestModeKeys = "text";
// @ts-expect-error The formal manifest tail mode keys stay closed.
const invalidTailManifestMode: TailManifestModeKeys = "missing";
const tailManifestDefault: typeof cli.manifest.commands.tail.outputs.default =
  "structured";
// @ts-expect-error The formal manifest tail default stays a literal.
const invalidTailManifestDefault: typeof cli.manifest.commands.tail.outputs.default =
  "text";
type InspectManifestModeKeys =
  keyof typeof cli.manifest.commands.inspect.outputs.modes;
const inspectManifestMode: InspectManifestModeKeys = "structured";
// @ts-expect-error The formal manifest inspect mode keys stay closed.
const invalidInspectManifestMode: InspectManifestModeKeys = "text";

type TailGrammarNode = Extract<
  (typeof cli.grammar.nodes)[number],
  { readonly id: "tail" }
>;
type TailGrammarModeKeys = keyof TailGrammarNode["outputs"]["modes"];
const tailGrammarMode: TailGrammarModeKeys = "text";
// @ts-expect-error The formal grammar tail mode keys stay closed.
const invalidTailGrammarMode: TailGrammarModeKeys = "missing";
const tailGrammarDefault: TailGrammarNode["outputs"]["default"] = "structured";
// @ts-expect-error The formal grammar tail default stays a literal.
const invalidTailGrammarDefault: TailGrammarNode["outputs"]["default"] = "text";

// Example outputMode literals survive on the exported definition, and the formal
// root/leaf manifest examples only select modes from their own closed table.
type InspectExampleMode =
  (typeof inspectCombination.inspect.examples)[0]["outputMode"];
const inspectExampleMode: InspectExampleMode = "structured";
// @ts-expect-error The exported inspect example keeps its literal output mode.
const invalidInspectExampleMode: InspectExampleMode = "text";
type TailExampleMode = (typeof tailCombination.tail.examples)[0]["outputMode"];
const tailExampleMode: TailExampleMode = "text";
// @ts-expect-error The exported tail example keeps its literal output mode.
const invalidTailExampleMode: TailExampleMode = "structured";

type TailManifestExample = NonNullable<
  typeof cli.manifest.commands.tail.examples
>[number];
type TailManifestExampleMode = Exclude<
  TailManifestExample["outputMode"],
  undefined
>;
const tailManifestExampleMode: TailManifestExampleMode = "text";
const tailManifestStructuredExampleMode: TailManifestExampleMode = "structured";
// @ts-expect-error The formal manifest tail example cannot select a mode outside its table.
const invalidTailManifestExampleMode: TailManifestExampleMode = "missing";
const tailManifestExampleWithoutMode: TailManifestExample = {
  argv: ["tail", "--topic=source"],
  shell: "'tool' 'tail' '--topic=source'",
};

type InspectManifestExample = NonNullable<
  typeof cli.manifest.commands.inspect.examples
>[number];
type InspectManifestExampleMode = Exclude<
  InspectManifestExample["outputMode"],
  undefined
>;
const inspectManifestExampleMode: InspectManifestExampleMode = "structured";
// @ts-expect-error The formal manifest inspect example cannot select a mode outside its table.
const invalidInspectManifestExampleMode: InspectManifestExampleMode = "text";

type ProbeManifestExample = NonNullable<
  typeof rootCommandContract.manifest.commands.probe.examples
>[number];
type ProbeManifestExampleMode = Exclude<
  ProbeManifestExample["outputMode"],
  undefined
>;
const probeManifestExampleMode: ProbeManifestExampleMode = "text";
const probeManifestStructuredExampleMode: ProbeManifestExampleMode =
  "structured";
// @ts-expect-error The formal manifest root example cannot select a mode outside its table.
const invalidProbeManifestExampleMode: ProbeManifestExampleMode = "missing";
const probeManifestExampleWithoutMode: ProbeManifestExample = {
  argv: ["probe", "--query=alpha"],
  shell: "'probe' '--query=alpha'",
};

// The public example type stays wide for consumers that are not bound to one table.
const wideManifestExample: CommandExampleManifest = {
  argv: ["tail"],
  shell: "'tool' 'tail'",
  outputMode: "outside-any-table",
};
const widenedTailExample: CommandExampleManifest =
  tailManifestExampleWithoutMode;
const widenedProbeExample: CommandExampleManifest =
  probeManifestExampleWithoutMode;

// @ts-expect-error A plain object cannot forge the compiled contract brand.
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
void tailDefinitionMode;
void invalidTailDefinitionMode;
void inspectDefinitionMode;
void invalidInspectDefinitionMode;
void tailDefinitionDefault;
void invalidTailDefinitionDefault;
void inspectDefinitionDefault;
void invalidInspectDefinitionDefault;
void tailManifestMode;
void invalidTailManifestMode;
void tailManifestDefault;
void invalidTailManifestDefault;
void inspectManifestMode;
void invalidInspectManifestMode;
void tailGrammarMode;
void invalidTailGrammarMode;
void tailGrammarDefault;
void invalidTailGrammarDefault;
void inspectExampleMode;
void invalidInspectExampleMode;
void tailExampleMode;
void invalidTailExampleMode;
void tailManifestExampleMode;
void tailManifestStructuredExampleMode;
void invalidTailManifestExampleMode;
void tailManifestExampleWithoutMode;
void inspectManifestExampleMode;
void invalidInspectManifestExampleMode;
void probeManifestExampleMode;
void probeManifestStructuredExampleMode;
void invalidProbeManifestExampleMode;
void probeManifestExampleWithoutMode;
void wideManifestExample;
void widenedTailExample;
void widenedProbeExample;
