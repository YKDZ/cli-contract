import {
  compileAtomicVariants,
  type RuntimeAtomicVariant,
} from "#/atomic-variant-compiler";
import { validateCliInput } from "#/cli-input-validation";
import { parseCliInvocation, type CommandUsage } from "#/cli-invocation";
import {
  ContractDefinitionError,
  type ContractDefinitionIssue,
} from "#/contract-definition-error";
import { ContractExecutionError } from "#/contract-execution-error";
import type {
  ContractSchema,
  ContractSchemaInput,
  ContractSchemaOutput,
  EmptyCliInput,
  JsonObject,
  JsonValue,
} from "#/contract-schema";
import {
  compileContractSchema,
  compileInputFields,
  projectFieldDescriptions,
} from "#/contract-schema-compiler";
import { copySingleLineText, isSingleLineText } from "#/description";
import type { reservedFieldNames } from "#/field-identity";
import { deepFreeze, isPlainRecord } from "#/json-value";
import type {
  CompletionFact,
  CompletionTextPresenter,
  CompletionOutcome,
  DataFactUnion,
  DataOutcome,
  DataVariantDefinitions,
  FailureFactUnion,
  FailureOutcome,
  FailureVariantDefinitions,
  OutcomeFact,
  TextFragment,
  TextLine,
  TextLines,
  StreamOutcome,
  StreamRecordDefinitions,
  StreamRecordFactUnion,
  StreamSuccessFact,
} from "#/outcome-fact";
import { isIssuedTextProjection } from "#/outcome-fact";
import {
  createCompletionWireSchema,
  createDataWireSchema,
  createFailureWireSchema,
  createStreamHeaderWireSchema,
  createStreamRecordWireSchema,
  createStreamSuccessWireSchema,
  createUsageFailureWireSchema,
} from "#/outcome-wire";
import {
  compileStreamRecords,
  type RuntimeStreamRecord,
  type StreamRecordManifest,
} from "#/stream-variant-compiler";
import {
  compileUsageConstraints,
  collectUnknownUsageConstraintDefinitionProperties,
  usageConstraintDefinitionPropertyKeys,
  type CountUsageConstraintGrammar,
  type UsageConstraintGrammar,
} from "#/usage-constraint";
export {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  createStreamRecordFact,
  createStreamSuccessFact,
  isIssuedOutcomeFact,
  TextValueError,
  text,
} from "#/outcome-fact";
export type {
  CompletionFact,
  CompletionTextPresenter,
  CompletionOutcome,
  DataFact,
  DataFactUnion,
  DataOutcome,
  DataVariantDefinitions,
  FailureFact,
  FailureFactUnion,
  FailureOutcome,
  FailureVariantDefinitions,
  OutcomeFact,
  StreamOutcome,
  StreamRecordDefinitions,
  StreamRecordFact,
  StreamRecordFactUnion,
  StreamSuccessFact,
  StreamTextPresenter,
  SilentText,
  TextLine,
  TextLines,
  TextValueErrorIssue,
  TextFragment,
} from "#/outcome-fact";

const cliContractType = Symbol("CliContract.type");
const outputModesType = Symbol("OutputModes.type");
const helpCapabilities = new WeakSet<object>();
const schemaCapabilities = new WeakSet<object>();
const invalidHelpFactWordingValues = new WeakMap<
  object,
  ReadonlyMap<string, unknown>
>();
const boundCommandNodes = new WeakMap<object, RuntimeExecutableDefinition>();
type OutputAuthoringIssue = Extract<
  ContractDefinitionIssue,
  { readonly code: "unknownDefinitionProperty" | "invalidPresenterTable" }
>;
const outputModes = new WeakSet<object>();
const outputModeMetadata = new WeakMap<
  object,
  Readonly<{
    readonly command: string;
    readonly input: ContractSchema;
    readonly binding: object;
    readonly authoringIssues: readonly OutputAuthoringIssue[];
  }>
>();
const outputModeDefinitions = new WeakSet<object>();
const outputModeDefinitionMetadata = new WeakMap<
  object,
  Readonly<{
    readonly command: string;
    readonly input: ContractSchema;
    readonly binding: object;
    readonly authoringIssues: readonly OutputAuthoringIssue[];
  }>
>();
const versionCapabilities = new WeakSet<object>();
const compiledCliContracts = new WeakMap<object, RuntimeCompiledCli>();

const declaredAtomicVariantProperties = [
  "description",
  "schema",
  "exitCode",
] as const;
const declaredStreamRecordProperties = ["description", "schema"] as const;

// Type constraints and definition-time checks share these known properties so
// misspelled declarations are not silently dropped.
const definitionPropertyKeys = {
  cli: [
    "root",
    "help",
    "version",
    "schema",
    "usageFailureExitCode",
    "commands",
  ],
  group: [
    "kind",
    "parent",
    "name",
    "aliases",
    "description",
    "helpSupplement",
    "handler",
  ],
  command: [
    "kind",
    "parent",
    "name",
    "aliases",
    "description",
    "helpSupplement",
    "examples",
    "fields",
    "input",
    "outputs",
    "usageConstraints",
  ],
  field: {
    flag: [
      "kind",
      "longOption",
      "shortAlias",
      "negatedLongOption",
      "description",
    ],
    option: ["kind", "longOption", "shortAlias", "description"],
    positional: ["kind", "description"],
  },
  example: ["input", "outputMode"],
  usage: usageConstraintDefinitionPropertyKeys,
  atomicVariant: [...declaredAtomicVariantProperties, "text"],
  streamRecord: [...declaredStreamRecordProperties, "text"],
  capability: {
    help: ["shortAlias", "headings", "wording"],
    version: ["value", "description", "shortAlias"],
    schema: ["description"],
  },
  outputModes: ["default", "modes"],
  outputMode: [
    "delivery",
    "description",
    "format",
    "success",
    "failures",
    "handler",
  ],
  atomicSuccess: ["kind", "text", "variants"],
  streamSuccess: ["kind", "text", "records"],
} as const;

export interface HelpCapability {
  readonly kind: "helpCapability";
  readonly longOption: "--help";
  readonly shortAlias?: "-h";
  readonly headings?: HelpHeadings;
  readonly wording?: HelpFactWording;
  readonly [cliContractType]: "help";
}

/**
 * Optional headings for the fixed sections of root help. Omitting a heading keeps
 * the section's mechanical content and indentation; the core writes no default copy.
 */
export interface HelpHeadings {
  readonly usage?: string;
  readonly commands?: string;
  readonly arguments?: string;
  readonly options?: string;
  readonly constraints?: string;
  readonly schema?: string;
  readonly examples?: string;
  readonly supplement?: string;
}

export interface HelpFactWording {
  /** The command-group placeholder word itself; the core adds the angle brackets. */
  readonly commandPlaceholder?: string;
  /** The choice set of a field or output format; must contain `{choices}`. */
  readonly choices?: string;
  /** The default JSON value of a field or output format; must contain `{value}`. */
  readonly default?: string;
  /** A valid match branch; must contain `{facts}` and `{onMatch}`. */
  readonly whenOnMatch?: string;
  /** A valid non-match branch; must contain `{facts}` and `{otherwise}`. */
  readonly whenOtherwise?: string;
  /** A conditional branch valid on both sides; must contain `{facts}`, `{onMatch}` and `{otherwise}`. */
  readonly whenOnMatchOtherwise?: string;
  /** A required field group in an effect; must contain `{fields}`. */
  readonly require?: string;
  /** A forbidden field group in an effect; must contain `{fields}`. */
  readonly forbid?: string;
  /** A field-presence fact; must contain `{field}`. */
  readonly present?: string;
  /** A field-equality fact; must contain `{field}` and `{value}`. */
  readonly equals?: string;
  /** A group of field facts that must not hold together; must contain `{facts}`. */
  readonly forbiddenCombination?: string;
  /** The field count must be exactly `{count}`; contains `{fields}`. */
  readonly countExactly?: string;
  /** The field count must be at least `{min}`; contains `{fields}`. */
  readonly countAtLeast?: string;
  /** The field count must be at most `{max}`; contains `{fields}`. */
  readonly countAtMost?: string;
  /** The field count must be between `{min}` and `{max}`; contains `{fields}`. */
  readonly countBetween?: string;
}

/** The single specification of help fact slots and their required replacement parameters. */
export const helpTemplateSpecifications = {
  commandPlaceholder: { placeholders: [] },
  choices: { placeholders: ["choices"] },
  default: { placeholders: ["value"] },
  whenOnMatch: { placeholders: ["facts", "onMatch"] },
  whenOtherwise: { placeholders: ["facts", "otherwise"] },
  whenOnMatchOtherwise: { placeholders: ["facts", "onMatch", "otherwise"] },
  require: { placeholders: ["fields"] },
  forbid: { placeholders: ["fields"] },
  present: { placeholders: ["field"] },
  equals: { placeholders: ["field", "value"] },
  forbiddenCombination: { placeholders: ["facts"] },
  countExactly: { placeholders: ["fields", "count"] },
  countAtLeast: { placeholders: ["fields", "min"] },
  countAtMost: { placeholders: ["fields", "max"] },
  countBetween: { placeholders: ["fields", "min", "max"] },
} as const satisfies Record<
  keyof HelpFactWording,
  Readonly<{ readonly placeholders: readonly string[] }>
>;

/** Closed replacement-parameter shapes derived per help slot. */
export type HelpFactTemplateParameters = {
  readonly [Slot in keyof typeof helpTemplateSpecifications]: Readonly<
    Record<
      (typeof helpTemplateSpecifications)[Slot]["placeholders"][number],
      string
    >
  >;
};

/** Help configuration assembled once on the root contract; headings are optional, but every fact that actually appears needs wording. */
export interface HelpCapabilityDefinition {
  readonly shortAlias?: "-h";
  readonly headings?: HelpHeadings;
  readonly wording?: HelpFactWording;
}

type HelpCapabilityDefinitionForTypeCheck = Omit<
  HelpCapabilityDefinition,
  "wording"
> & {
  /** Keep literal keys of unknown slots so the local closed-set diagnostic reports an actionable identity. */
  readonly wording?: object;
};

export interface VersionCapability {
  readonly kind: "versionCapability";
  readonly value: string;
  readonly description?: string;
  readonly shortAlias?: "-V";
  readonly [cliContractType]: "version";
}

export interface VersionCapabilityDefinition {
  readonly value: TextLine;
  readonly description?: string;
  readonly shortAlias?: "-V";
}

/** Root-level contract discovery capability; the description is assembled once and projected into help across the tree. */
export interface SchemaCapability {
  readonly kind: "schemaCapability";
  readonly longOption: "--schema";
  readonly description: string;
  readonly [cliContractType]: "schema";
}

export interface SchemaCapabilityDefinition {
  readonly description: TextLine;
}

export type OutputFormat = "structured" | "text";
export type OutputDelivery = "atomic" | "stream";

/** An invocation sample colocated with an executable command; omitting outputMode selects the command's default mode. */
export interface CommandExampleDefinition<
  Input = unknown,
  OutputMode extends string = string,
> {
  readonly input: Input;
  readonly outputMode?: OutputMode;
}

type CommandExampleInputContext = Readonly<
  Record<string, boolean | string | [string, ...string[]]>
>;

type CommandDefinitionExampleContext = Readonly<{
  readonly examples?: readonly CommandExampleDefinition<CommandExampleInputContext>[];
}>;

type OutputModeKeys<Modes> = Extract<keyof Modes, string>;

type OutputModeDefaultContract<Definition> =
  Definition extends Readonly<{
    readonly modes: infer Modes;
    readonly default: infer Default;
  }>
    ? [Default] extends [OutputModeKeys<Modes>]
      ? unknown
      : ContractTypeError<
          "invalidDefaultOutputMode",
          Readonly<{ readonly default: Default }>
        >
    : Definition extends Readonly<{ readonly modes: infer Modes }>
      ? IsUnion<OutputModeKeys<Modes>> extends true
        ? ContractTypeError<
            "invalidDefaultOutputMode",
            Readonly<{ readonly default: undefined }>
          >
        : unknown
      : ContractTypeError<
          "invalidOutputModes",
          Readonly<{ readonly reason: "missingModes" }>
        >;

export interface OutputModesDefinition<
  Command extends string = string,
  InputSchema extends ContractSchema = ContractSchema,
  Modes extends Readonly<Record<string, OutputModeDefinition>> = Readonly<
    Record<string, OutputModeDefinition>
  >,
  Default extends OutputModeKeys<Modes> = OutputModeKeys<Modes>,
> {
  readonly default: Default;
  readonly modes: Modes;
  readonly [outputModesType]: Readonly<{
    readonly command: Command;
    readonly input: InputSchema;
  }>;
}

export interface AtomicOutputModeDefinition<
  Command extends string,
  InputSchema extends ContractSchema,
  Format extends OutputFormat,
  Success,
  Failures extends object,
> {
  readonly delivery: "atomic";
  readonly description: string;
  readonly format: Format;
  readonly success: Success;
  readonly failures: Failures;
  readonly handler: unknown;
  readonly [cliContractType]: Readonly<{
    readonly command: Command;
    readonly input: InputSchema;
  }>;
}

export interface StreamOutputModeDefinition<
  Command extends string,
  InputSchema extends ContractSchema,
  Format extends OutputFormat,
  Records extends StreamRecordDefinitions,
  Failures extends object,
> {
  readonly delivery: "stream";
  readonly description: string;
  readonly format: Format;
  readonly success: Readonly<{
    readonly kind: "stream";
    readonly records: Records;
    readonly text?: CompletionTextPresenter;
  }>;
  readonly failures: Failures;
  readonly handler: unknown;
  readonly [cliContractType]: Readonly<{
    readonly command: Command;
    readonly input: InputSchema;
  }>;
}

export type OutputModeDefinition<
  Command extends string = string,
  InputSchema extends ContractSchema = ContractSchema,
> =
  | AtomicOutputModeDefinition<
      Command,
      InputSchema,
      OutputFormat,
      | Readonly<{ readonly kind: "completion" }>
      | Readonly<{
          readonly kind: "data";
          readonly variants: DataVariantDefinitions;
        }>,
      object
    >
  | StreamOutputModeDefinition<
      Command,
      InputSchema,
      OutputFormat,
      StreamRecordDefinitions,
      object
    >;

export type OutputModeMap = Readonly<Record<string, OutputModeDefinition>>;

/**
 * Declare executions and name their output modes within the current command.
 * The callback runs once at definition time with a factory bound to this command
 * construction, carrying the command's identity, input schema and dependency types.
 */
export type OutputModesAuthoring<
  Command extends string = string,
  Dependencies = unknown,
  InputSchema extends ContractSchema = ContractSchema,
> = (
  factory: OutputExecutionFactory<Command, Dependencies, InputSchema>,
) => OutputModeTableDeclaration<Command, InputSchema>;

type DeclaredVariantOutput<Variant> =
  Variant extends Readonly<{
    readonly schema: infer Schema extends ContractSchema;
  }>
    ? ContractSchemaOutput<Schema>
    : never;

/** One named atomic result variant; every text mode supplies its own presenter for the shared result contract. */
export type DeclaredAtomicVariant = Readonly<{
  readonly description: string;
  readonly schema: ContractSchema;
  readonly exitCode: number;
}>;

export type DeclaredStreamRecord = Readonly<{
  readonly description: string;
  readonly schema: ContractSchema;
}>;

export type DeclaredVariants = Readonly<Record<string, DeclaredAtomicVariant>>;
export type DeclaredRecords = Readonly<Record<string, DeclaredStreamRecord>>;

export type DeclaredAtomicSuccess =
  | Readonly<{ readonly kind: "completion" }>
  | Readonly<{ readonly kind: "data"; readonly variants: DeclaredVariants }>;

type ClosedDeclaredVariants<Variants> = ClosedVariantDefinitions<
  Variants,
  (typeof declaredAtomicVariantProperties)[number]
>;

type UnexpectedFailureText<
  Command extends string,
  Name extends PropertyKey,
> = ContractTypeError<
  "unexpectedTextPresenter",
  Readonly<{
    readonly command: Command;
    readonly location: "failure";
    readonly variant: Name;
    readonly unexpected: "text";
  }>
>;

/** Infer names independently so an invalid callback cannot widen its variant to string. */
type EmbeddedFailureText<Command extends string, Names extends PropertyKey> = {
  readonly [Name in Names]: {
    readonly text?: ((payload: never) => unknown) &
      ContractTypeError<
        "unexpectedTextPresenter",
        Readonly<{
          readonly command: Command;
          readonly location: "failure";
          readonly variant: Name;
          readonly unexpected: "text";
        }>
      >;
  };
};

type ClosedExecutionFailures<Command extends string, Variants> = {
  readonly [Name in keyof Variants]: RejectUnknownProperties<
    Variants[Name],
    (typeof declaredAtomicVariantProperties)[number] | "text"
  > &
    ("text" extends keyof Variants[Name]
      ? UnexpectedFailureText<Command, Name>
      : unknown);
};

type ClosedDeclaredRecords<Records> = ClosedVariantDefinitions<
  Records,
  (typeof declaredStreamRecordProperties)[number]
>;

type ClosedDeclaredSuccess<Success> = RejectUnknownProperties<
  Success,
  Success extends Readonly<{ readonly kind: "completion" }>
    ? "kind"
    : "kind" | "variants"
> &
  (Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants;
  }>
    ? Readonly<{ readonly variants: ClosedDeclaredVariants<Variants> }>
    : unknown);

type AtomicProjection = TextLine | TextLines;
type RecordProjection = TextLine | TextFragment;

type VariantPresenter<Variant, Projection> = (
  payload: DeclaredVariantOutput<Variant>,
) => Projection;

type TextPresentedVariants<Variants, Projection> = Readonly<{
  readonly [Name in keyof Variants]: Variants[Name] &
    Readonly<{ readonly text: VariantPresenter<Variants[Name], Projection> }>;
}>;

/** A string index signature cannot prove that every closed variant key is covered. */
type IndexKeys<Keys extends PropertyKey> = Keys extends PropertyKey
  ? {} extends Record<Keys, never>
    ? Keys
    : never
  : never;

/** Check supplied presenters separately so missing entries retain their diagnostic evidence. */
type PresenterTable<
  Definitions,
  Provided extends PropertyKey,
  Projection,
> = Readonly<{
  readonly [Name in Provided]: VariantPresenter<
    Definitions[Name & keyof Definitions],
    Projection
  >;
}> &
  Readonly<{
    readonly [
      Name in Exclude<
        NoInfer<Provided>,
        keyof Definitions | IndexKeys<NoInfer<Provided>>
      >
    ]: never;
  }>;

type PresenterCoverage<
  Command extends string,
  Location extends "data" | "failure" | "record",
  Definitions,
  Keys extends PropertyKey,
> = Exclude<keyof Definitions, Exclude<Keys, IndexKeys<Keys>>> &
  string extends infer Missing
  ? [Missing] extends [never]
    ? [IndexKeys<Keys>] extends [never]
      ? unknown
      : ContractTypeError<
          "missingTextPresenter",
          Readonly<{
            readonly command: Command;
            readonly location: Location;
            readonly missing: "text";
          }>
        >
    : ContractTypeError<
        "missingTextPresenter",
        Readonly<{
          readonly command: Command;
          readonly location: Location;
          readonly variant: Missing;
          readonly missing: "text";
        }>
      >
  : never;

type OnlyOptionKeys<
  Actual extends PropertyKey,
  Allowed extends string,
> = Readonly<{
  readonly [Name in Actual]: Name extends Allowed ? unknown : never;
}>;

type MissingTerminalPresenter<
  Command extends string,
  Location extends "completion" | "streamSuccess",
  Keys extends PropertyKey,
  Name extends string,
> = Name extends Keys
  ? unknown
  : ContractTypeError<
      "missingTextPresenter",
      Readonly<{
        readonly command: Command;
        readonly location: Location;
        readonly missing: "text";
      }>
    >;

type DescriptionOnly<Options> = Readonly<{ readonly description: string }> &
  RejectUnknownProperties<Options, "description">;

// Leads the .text parameter intersection: a long options alias alone truncates the first
// diagnostic level, so the coverage evidence must also appear outside the alias.
type AtomicTextCoverage<
  Command extends string,
  Success extends DeclaredAtomicSuccess,
  Failures extends DeclaredVariants,
  SuccessKeys extends PropertyKey,
  FailureKeys extends PropertyKey,
  OptionKeys extends PropertyKey,
> = (Success extends Readonly<{
  readonly kind: "data";
  readonly variants: infer Variants;
}>
  ? PresenterCoverage<Command, "data", Variants, NoInfer<SuccessKeys>>
  : MissingTerminalPresenter<
      Command,
      "completion",
      NoInfer<OptionKeys>,
      "success"
    >) &
  PresenterCoverage<Command, "failure", Failures, NoInfer<FailureKeys>>;

/**
 * Precise `.text(...)` options for one atomic execution. The explicit key generics let a
 * generic wrapper forward a closed presenter table without assertions; ordinary calls infer
 * them from the argument. Coverage evidence leads the intersection so the first diagnostic
 * level names the command, result location and missing variant.
 */
export type AtomicTextOptions<
  Command extends string,
  Success extends DeclaredAtomicSuccess,
  Failures extends DeclaredVariants,
  SuccessKeys extends PropertyKey,
  FailureKeys extends PropertyKey,
  OptionKeys extends PropertyKey,
> = AtomicTextCoverage<
  Command,
  Success,
  Failures,
  SuccessKeys,
  FailureKeys,
  OptionKeys
> &
  (Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants;
  }>
    ? Readonly<{
        readonly success: PresenterTable<
          Variants,
          SuccessKeys,
          AtomicProjection
        >;
      }>
    : Readonly<{ readonly success: CompletionTextPresenter }>) &
  OnlyOptionKeys<OptionKeys, "description" | "success" | "failures"> &
  Readonly<{
    readonly description: string;
    readonly failures: PresenterTable<Failures, FailureKeys, AtomicProjection>;
  }>;

type AtomicTextSuccess<Success extends DeclaredAtomicSuccess> =
  Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants;
  }>
    ? Readonly<{
        readonly kind: "data";
        readonly variants: TextPresentedVariants<Variants, AtomicProjection>;
      }>
    : Readonly<{
        readonly kind: "completion";
        readonly text: CompletionTextPresenter;
      }>;

// Same first-level coverage evidence as AtomicTextCoverage, for stream executions.
type StreamTextCoverage<
  Command extends string,
  Records extends DeclaredRecords,
  Failures extends DeclaredVariants,
  RecordKeys extends PropertyKey,
  FailureKeys extends PropertyKey,
  OptionKeys extends PropertyKey,
> = MissingTerminalPresenter<
  Command,
  "streamSuccess",
  NoInfer<OptionKeys>,
  "terminal"
> &
  PresenterCoverage<Command, "record", Records, NoInfer<RecordKeys>> &
  PresenterCoverage<Command, "failure", Failures, NoInfer<FailureKeys>>;

/** Precise `.text(...)` options for one stream execution; see {@link AtomicTextOptions}. */
export type StreamTextOptions<
  Command extends string,
  Records extends DeclaredRecords,
  Failures extends DeclaredVariants,
  RecordKeys extends PropertyKey,
  FailureKeys extends PropertyKey,
  OptionKeys extends PropertyKey,
> = StreamTextCoverage<
  Command,
  Records,
  Failures,
  RecordKeys,
  FailureKeys,
  OptionKeys
> &
  OnlyOptionKeys<
    OptionKeys,
    "description" | "records" | "failures" | "terminal"
  > &
  Readonly<{
    readonly description: string;
    readonly records: PresenterTable<Records, RecordKeys, RecordProjection>;
    readonly failures: PresenterTable<Failures, FailureKeys, AtomicProjection>;
    readonly terminal: CompletionTextPresenter;
  }>;

type StreamTextSuccess<Records extends DeclaredRecords> = Readonly<{
  readonly kind: "stream";
  readonly records: TextPresentedVariants<Records, RecordProjection>;
  readonly text: CompletionTextPresenter;
}>;

/**
 * Derive modes for one atomic handler and result contract. All derived modes share
 * the handler and result contract, and a CLI invocation runs only the selected mode.
 * Each text mode provides its own success and failure presenters. Outcome constructors
 * accept the result schema's Input; presenters receive the validated schema Output.
 */
export interface AtomicExecution<
  Command extends string,
  InputSchema extends ContractSchema,
  Success extends DeclaredAtomicSuccess,
  Failures extends DeclaredVariants,
> {
  structured<const Options extends object>(
    options: Options & DescriptionOnly<NoInfer<Options>>,
  ): AtomicOutputModeDefinition<
    Command,
    InputSchema,
    "structured",
    Success,
    Failures
  >;
  text<
    const SuccessKeys extends PropertyKey,
    const FailureKeys extends PropertyKey,
    const OptionKeys extends PropertyKey,
  >(
    options: AtomicTextCoverage<
      Command,
      Success,
      Failures,
      SuccessKeys,
      FailureKeys,
      OptionKeys
    > &
      AtomicTextOptions<
        Command,
        Success,
        Failures,
        SuccessKeys,
        FailureKeys,
        OptionKeys
      >,
  ): AtomicOutputModeDefinition<
    Command,
    InputSchema,
    "text",
    AtomicTextSuccess<Success>,
    TextPresentedVariants<Failures, AtomicProjection>
  >;
}

/**
 * Derive modes for one stream handler and result contract. The handler yields record
 * facts and returns a streamSuccess or failure fact as the terminal state. Each text
 * mode presents its records, failures and successful termination; record presenters
 * may return lines or fragments, while the terminal presenter may return text.silent.
 */
export interface StreamExecution<
  Command extends string,
  InputSchema extends ContractSchema,
  Records extends DeclaredRecords,
  Failures extends DeclaredVariants,
> {
  structured<const Options extends object>(
    options: Options & DescriptionOnly<NoInfer<Options>>,
  ): StreamOutputModeDefinition<
    Command,
    InputSchema,
    "structured",
    Records,
    Failures
  >;
  text<
    const RecordKeys extends PropertyKey,
    const FailureKeys extends PropertyKey,
    const OptionKeys extends PropertyKey,
  >(
    options: StreamTextCoverage<
      Command,
      Records,
      Failures,
      RecordKeys,
      FailureKeys,
      OptionKeys
    > &
      StreamTextOptions<
        Command,
        Records,
        Failures,
        RecordKeys,
        FailureKeys,
        OptionKeys
      >,
  ): Omit<
    StreamOutputModeDefinition<
      Command,
      InputSchema,
      "text",
      TextPresentedVariants<Records, RecordProjection>,
      TextPresentedVariants<Failures, AtomicProjection>
    >,
    "success"
  > &
    Readonly<{ readonly success: StreamTextSuccess<Records> }>;
}

type AtomicHandlerContext<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  Success extends DeclaredAtomicSuccess,
  Failures extends DeclaredVariants,
> =
  Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants extends DeclaredVariants;
  }>
    ? DataHandlerContext<
        Command,
        Dependencies,
        ContractSchemaOutput<InputSchema>,
        Variants,
        NoInfer<Failures>
      >
    : CompletionHandlerContext<
        Command,
        Dependencies,
        NoInfer<Failures>,
        ContractSchemaOutput<InputSchema>
      >;

type AtomicHandlerResult<
  Command extends string,
  Success extends DeclaredAtomicSuccess,
  Failures extends DeclaredVariants,
> =
  Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants extends DeclaredVariants;
  }>
    ?
        | DataFactUnion<Command, Variants>
        | FailureFactUnion<Command, NoInfer<Failures>>
    : CompletionFact<Command> | FailureFactUnion<Command, NoInfer<Failures>>;

type AtomicSuccessNameContract<Command extends string, Success> =
  Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants extends DeclaredVariants;
  }>
    ? Readonly<{
        readonly variants: DataVariantNameContract<Command, Variants>;
      }>
    : unknown;

/**
 * Precise definition accepted by {@link AtomicExecutionFactory}. A generic wrapper can type
 * its declaration parameter with this and forward to the factory without assertions; ordinary
 * authors keep inferring the success and failure tables from the argument.
 */
export type AtomicExecutionDefinition<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  Success extends DeclaredAtomicSuccess,
  Failures extends DeclaredVariants,
  FailureNames extends PropertyKey = keyof Failures,
> = Readonly<{
  readonly success: Success;
  readonly failures: Failures & EmbeddedFailureText<Command, FailureNames>;
  readonly handler: (
    context: AtomicHandlerContext<
      Command,
      Dependencies,
      InputSchema,
      Success,
      Failures
    >,
  ) =>
    | AtomicHandlerResult<Command, Success, Failures>
    | Promise<AtomicHandlerResult<Command, Success, Failures>>;
}> &
  Readonly<{
    readonly success: ClosedDeclaredSuccess<NoInfer<Success>> &
      AtomicSuccessNameContract<Command, NoInfer<Success>>;
    readonly failures: ClosedExecutionFailures<Command, NoInfer<Failures>> &
      FailureVariantNameContract<Command, NoInfer<Failures>>;
  }>;

/** Precise definition accepted by {@link StreamExecutionFactory}; see {@link AtomicExecutionDefinition}. */
export type StreamExecutionDefinition<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  Records extends DeclaredRecords,
  Failures extends DeclaredVariants,
> = Readonly<{
  readonly records: Records;
  readonly failures: Failures;
  readonly handler: (
    context: StreamHandlerContext<
      Command,
      Dependencies,
      ContractSchemaOutput<InputSchema>,
      NoInfer<Records>,
      NoInfer<Failures>
    >,
  ) => AsyncGenerator<
    StreamRecordFactUnion<Command, NoInfer<Records>>,
    StreamSuccessFact<Command> | FailureFactUnion<Command, NoInfer<Failures>>,
    void
  >;
}> &
  Readonly<{
    readonly records: ClosedDeclaredRecords<NoInfer<Records>> &
      StreamRecordNameContract<Command, NoInfer<Records>>;
    readonly failures: ClosedDeclaredVariants<NoInfer<Failures>> &
      FailureVariantNameContract<Command, NoInfer<Failures>>;
  }>;

export interface AtomicExecutionFactory<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
> {
  <
    const RawDefinition extends object,
    const RawSuccess extends DeclaredAtomicSuccess,
    const RawFailures extends DeclaredVariants,
    const FailureNames extends PropertyKey = keyof RawFailures,
  >(
    definition: RawDefinition &
      AtomicExecutionDefinition<
        Command,
        Dependencies,
        InputSchema,
        RawSuccess,
        RawFailures,
        FailureNames
      > &
      RejectUnknownProperties<
        NoInfer<RawDefinition>,
        "success" | "failures" | "handler"
      >,
  ): AtomicExecution<Command, InputSchema, RawSuccess, RawFailures>;
}

export interface StreamExecutionFactory<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
> {
  <
    const RawDefinition extends object,
    const RawRecords extends DeclaredRecords,
    const RawFailures extends DeclaredVariants,
  >(
    definition: RawDefinition &
      StreamExecutionDefinition<
        Command,
        Dependencies,
        InputSchema,
        RawRecords,
        RawFailures
      > &
      RejectUnknownProperties<
        NoInfer<RawDefinition>,
        "records" | "failures" | "handler"
      >,
  ): StreamExecution<Command, InputSchema, RawRecords, RawFailures>;
}

/**
 * Executions and their derived modes belong to the current command construction.
 * Reusing modes or executions from another construction is rejected at definition
 * time, even for identical command names and input schema instances. Handlers
 * receive validated command input.
 */
export interface OutputExecutionFactory<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
> {
  readonly atomic: AtomicExecutionFactory<Command, Dependencies, InputSchema>;
  readonly stream: StreamExecutionFactory<Command, Dependencies, InputSchema>;
}

/**
 * Name the modes returned by an outputs callback. A single mode is its own default;
 * with several modes, `default` must name one of them. Mode names are declared once
 * here and constrain `examples.outputMode`.
 */
export type OutputModeTableDeclaration<
  Command extends string = string,
  InputSchema extends ContractSchema = ContractSchema,
> = Readonly<{
  readonly default?: string;
  readonly modes: Readonly<
    Record<string, OutputModeDefinition<Command, InputSchema>>
  >;
}>;

type OutputModesDefault<Definition> =
  Definition extends Readonly<{
    readonly default: infer Default extends string;
  }>
    ? Default
    : Definition extends Readonly<{ readonly modes: infer Modes }>
      ? OutputModeKeys<Modes>
      : never;

type OutputModesTypeContract<Definition> = RejectUnknownProperties<
  Definition,
  "modes" | "default"
> &
  OutputModeDefaultContract<Definition> &
  (Definition extends Readonly<{ readonly modes: infer Modes }>
    ? [keyof Modes] extends [never]
      ? ContractTypeError<
          "invalidOutputModes",
          Readonly<{ readonly reason: "emptyModes" }>
        >
      : Exclude<Modes[keyof Modes], OutputModeDefinition> extends never
        ? unknown
        : ContractTypeError<
            "invalidOutputModes",
            Readonly<{ readonly reason: "invalidMode" }>
          >
    : never);

type AtomicOutputModeResult<Command extends string, Mode> =
  Mode extends Readonly<{
    readonly delivery: "atomic";
    readonly success: infer Success;
    readonly failures: infer Failures extends object;
  }>
    ? Success extends Readonly<{ readonly kind: "completion" }>
      ? CompletionFact<Command> | FailureFactUnion<Command, Failures, "output">
      : Success extends Readonly<{
            readonly kind: "data";
            readonly variants: infer Variants extends DataVariantDefinitions;
          }>
        ?
            | DataFactUnion<Command, Variants, "output">
            | FailureFactUnion<Command, Failures, "output">
        : never
    : never;

type StreamOutputModeResult<Command extends string, Mode> =
  Mode extends Readonly<{
    readonly delivery: "stream";
    readonly failures: infer Failures extends object;
  }>
    ? StreamSuccessFact<Command> | FailureFactUnion<Command, Failures, "output">
    : never;

type OutputModesResult<Command extends string, Outputs> =
  Outputs extends Readonly<{ readonly modes: infer Modes }>
    ? {
        [Mode in keyof Modes]:
          | AtomicOutputModeResult<Command, Modes[Mode]>
          | StreamOutputModeResult<Command, Modes[Mode]>;
      }[keyof Modes]
    : never;

type OutputModesFromDeclaration<
  Command extends string,
  InputSchema extends ContractSchema,
  Definition,
> =
  Definition extends Readonly<{ readonly modes: infer Modes }>
    ? OutputModesDefinition<
        Command,
        InputSchema,
        Extract<Modes, OutputModeMap>,
        Extract<OutputModesDefault<Definition>, OutputModeKeys<Modes>>
      >
    : never;

/** An omitted field table falls back to the generic index signature. An explicit empty object retains its empty key set. */
type FieldsOmitted<Fields extends FieldDefinitions> =
  string extends keyof Fields ? true : false;

/**
 * Replace the authoring callback with its bound table for field, example, usage and result inference.
 */
type CompiledExecutableNode<
  Command extends string,
  Node,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Declaration,
  Kind extends "command" | "rootCommand",
> = Omit<Node, "input" | "outputs" | "kind" | "fields"> &
  (FieldsOmitted<Fields> extends true
    ? unknown
    : Readonly<{ readonly fields: Fields }>) &
  Readonly<{
    readonly kind: Kind;
    readonly input: InputSchema;
    readonly outputs: OutputModesFromDeclaration<
      Command,
      InputSchema,
      Declaration
    >;
  }>;

type CompiledRootCommands<
  Command extends string,
  Node,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Declaration,
> = Readonly<
  Record<
    Command,
    CompiledExecutableNode<
      Command,
      Node,
      Fields,
      InputSchema,
      Declaration,
      "rootCommand"
    >
  >
>;

type LowercaseLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

type DecimalDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type LowercaseAlphaNumeric = DecimalDigit | LowercaseLetter;
type AlphaNumeric = LowercaseAlphaNumeric | Uppercase<LowercaseLetter>;

type IsCanonicalKebabBody<
  Value extends string,
  NeedsCharacter extends boolean = true,
> = Value extends ""
  ? NeedsCharacter extends true
    ? false
    : true
  : Value extends `${LowercaseAlphaNumeric}${infer Rest}`
    ? IsCanonicalKebabBody<Rest, false>
    : Value extends `-${infer Rest}`
      ? NeedsCharacter extends true
        ? false
        : IsCanonicalKebabBody<Rest>
      : false;

type IsLowerCamelCase<Value extends string> =
  Value extends `${LowercaseLetter}${infer Rest}`
    ? Rest extends ""
      ? true
      : Rest extends `${AlphaNumeric}${infer Tail}`
        ? IsAlphaNumericTail<Tail>
        : false
    : false;

type IsAlphaNumericTail<Value extends string> = Value extends ""
  ? true
  : Value extends `${AlphaNumeric}${infer Rest}`
    ? IsAlphaNumericTail<Rest>
    : false;

export type CanonicalLongOption<Value extends string> = string extends Value
  ? `--${string}`
  : `--${string}` extends Value
    ? Value
    : Value extends `--${infer Body}`
      ? IsCanonicalKebabBody<Body> extends true
        ? Value
        : never
      : never;

export type ShortOptionAlias<Value extends string> = string extends Value
  ? `-${string}`
  : Value extends `-${infer Body}`
    ? Body extends AlphaNumeric
      ? Value
      : never
    : never;

export interface PositionalDefinition {
  readonly kind: "positional";
  readonly description: string;
}

export interface VariadicPositionalDefinition {
  readonly kind: "variadicPositional";
  readonly description: string;
}

export interface FlagDefinition<
  LongOption extends `--${string}` = `--${string}`,
  ShortAlias extends `-${string}` | undefined = `-${string}` | undefined,
  NegatedLongOption extends `--${string}` | undefined =
    | `--${string}`
    | undefined,
> {
  readonly kind: "flag";
  readonly longOption: LongOption;
  readonly shortAlias?: ShortAlias;
  readonly negatedLongOption?: NegatedLongOption;
  readonly description: string;
}

export interface RepeatableOptionDefinition<
  LongOption extends `--${string}` = `--${string}`,
  ShortAlias extends `-${string}` | undefined = `-${string}` | undefined,
> {
  readonly kind: "repeatableOption";
  readonly longOption: LongOption;
  readonly shortAlias?: ShortAlias;
  readonly description: string;
}

export interface ValueOptionDefinition<
  LongOption extends `--${string}` = `--${string}`,
  ShortAlias extends `-${string}` | undefined = `-${string}` | undefined,
> {
  readonly kind: "valueOption";
  readonly longOption: LongOption;
  readonly shortAlias?: ShortAlias;
  readonly description: string;
}

export type FieldDefinition =
  | FlagDefinition
  | PositionalDefinition
  | RepeatableOptionDefinition
  | VariadicPositionalDefinition
  | ValueOptionDefinition;

/**
 * Field keys must be lowerCamelCase and must not be constructor, hasOwnProperty,
 * isPrototypeOf, propertyIsEnumerable, toString, valueOf or toLocaleString.
 * When renaming a field key, update the schema Input key and its references;
 * the CLI spelling may stay unchanged.
 */
export type FieldDefinitions = Readonly<Record<string, FieldDefinition>>;

/**
 * The limited field relations projectable to the parser and Draft 2020-12: `count`
 * limits raw field occurrences, `when` selects require or forbid effects from raw
 * facts, and `forbiddenCombination` rejects the listed fact combinations. Required
 * fields, choices and formats are expressed by the input schema; rules that depend
 * on computed values, time or business state belong in the handler as named failures.
 */
export type UsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
  Input = unknown,
> =
  | CountUsageConstraint<Fields>
  | WhenUsageConstraint<Fields, Input>
  | ForbiddenCombinationUsageConstraint<Fields, Input>;

/**
 * Limits how many of the raw input fields listed in `fields` occur in the current
 * command; the field group must be non-empty and free of duplicates. Normalized
 * endpoints must be finite integers satisfying `0 <= min <= max <= fields.length`.
 * Each raw own property counts once, so `false` still counts as present and multiple
 * values of a repeatable or variadic field still count as one; an absent variadic
 * field has no property, and schema defaults or transform results add no count.
 * `min` defaults to 0 and `max` to the field group length; provide at least one
 * endpoint explicitly. TypeScript rejects statically decidable errors; dynamic
 * endpoints or field members are validated when the CLI is defined.
 */
export interface CountUsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
> {
  readonly kind: "count";
  readonly fields: readonly [
    Extract<keyof Fields, string>,
    ...Extract<keyof Fields, string>[],
  ];
  readonly min?: number;
  readonly max?: number;
}

/**
 * A conditional branch only describes effects for when all raw input facts hold or
 * do not all hold; an empty effect adds no restriction, but the rule needs at least
 * one non-empty branch. Fields are never assigned values or filled with defaults.
 */
export interface UsageConstraintEffect<Field extends string = string> {
  readonly require?: readonly Field[];
  readonly forbid?: readonly Field[];
}

/** States that an input field occurs in the raw argv parse result. */
export interface PresentUsageFact<Field extends string = string> {
  readonly kind: "present";
  readonly field: Field;
}

type RawUsageFactValue<Field extends FieldDefinition> =
  Field extends Readonly<{
    readonly kind: "flag";
    readonly negatedLongOption: `--${string}`;
  }>
    ? boolean
    : Field extends FlagDefinition
      ? true
      : Field extends ValueOptionDefinition | PositionalDefinition
        ? string
        : never;

type UsageFactInputValue<Input, Field extends string, RawValue> =
  IsAny<Input> extends true
    ? RawValue
    : unknown extends Input
      ? RawValue
      : Field extends keyof Input
        ? Extract<Exclude<Input[Field], undefined>, RawValue>
        : never;

/** Derives the comparable values from the intersection of the field's raw scalar and the schema Input. */
export type UsageFactValue<
  Fields extends FieldDefinitions,
  Input,
  Field extends keyof Fields & string,
> = UsageFactInputValue<Input, Field, RawUsageFactValue<Fields[Field]>>;

/** Associates a field identity with its acceptable raw equality operands. */
export type EqualsUsageFact<
  Fields extends FieldDefinitions = FieldDefinitions,
  Input = unknown,
> = {
  [Field in keyof Fields & string]: UsageFactValue<
    Fields,
    Input,
    Field
  > extends never
    ? never
    : Readonly<{
        readonly kind: "equals";
        readonly field: Field;
        readonly value: UsageFactValue<Fields, Input, Field>;
      }>;
}[keyof Fields & string];

/** The closed union of field-presence and single-value equality facts. */
export type UsageFact<
  Fields extends FieldDefinitions = FieldDefinitions,
  Input = unknown,
> = string extends keyof Fields
  ?
      | PresentUsageFact<string>
      | Readonly<{
          readonly kind: "equals";
          readonly field: string;
          readonly value: boolean | string;
        }>
  :
      | PresentUsageFact<Extract<keyof Fields, string>>
      | EqualsUsageFact<Fields, Input>;

/** Rejects the invocation when all listed facts hold together; `all` keeps its non-empty order and duplicates. */
export interface ForbiddenCombinationUsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
  Input = unknown,
> {
  readonly kind: "forbiddenCombination";
  readonly all: readonly [
    UsageFact<Fields, Input>,
    ...UsageFact<Fields, Input>[],
  ];
}

/**
 * A flat conjunction of facts selects the match or non-match branch. Observations
 * and effects both read the raw input before schema validation, defaults and transforms.
 */
export interface WhenUsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
  Input = unknown,
> {
  readonly kind: "when";
  readonly all: readonly [
    UsageFact<Fields, Input>,
    ...UsageFact<Fields, Input>[],
  ];
  readonly onMatch?: UsageConstraintEffect<Extract<keyof Fields, string>>;
  readonly otherwise?: UsageConstraintEffect<Extract<keyof Fields, string>>;
}

export type ValueOptionDefinitions = Readonly<
  Record<string, ValueOptionDefinition>
>;

type RawFieldValue<Field extends FieldDefinition> = Field extends {
  readonly kind: "flag";
}
  ? Field extends { readonly negatedLongOption: unknown }
    ? boolean
    : true
  : Field extends RepeatableOptionDefinition | VariadicPositionalDefinition
    ? readonly [string, ...string[]]
    : string;

type RawSchemaInputValue<Field extends FieldDefinition> = Field extends
  | RepeatableOptionDefinition
  | VariadicPositionalDefinition
  ? [string, ...string[]]
  : RawFieldValue<Field>;

export type RawFieldInput<Fields extends FieldDefinitions> = Readonly<{
  [Field in keyof Fields]?: RawFieldValue<Fields[Field]>;
}>;

export type RawValueOptionInput<Fields extends ValueOptionDefinitions> =
  RawFieldInput<Fields>;

export type FieldDefinitionsForInput<Input> = Readonly<{
  [Field in Extract<keyof Input, string>]: FieldDefinition;
}>;

export type ValueOptionDefinitionsForInput<Input> = Readonly<{
  [Field in Extract<keyof Input, string>]: ValueOptionDefinition;
}>;

type InvalidCanonicalLongOptionIssue<
  Command extends string,
  Key,
  LongOption extends `--${string}`,
> =
  LongOption extends CanonicalLongOption<LongOption>
    ? never
    : ContractTypeError<
        "invalidFieldLongOption",
        Readonly<{
          readonly command: Command;
          readonly field: Extract<Key, string>;
          readonly received: LongOption;
        }>
      >;

type InvalidShortOptionAliasIssue<Field, Command extends string, Key> =
  Field extends Readonly<{
    readonly shortAlias: infer ShortAlias extends `-${string}`;
  }>
    ? ShortAlias extends ShortOptionAlias<ShortAlias>
      ? never
      : ContractTypeError<
          "invalidFieldShortAlias",
          Readonly<{
            readonly command: Command;
            readonly field: Extract<Key, string>;
            readonly received: ShortAlias;
          }>
        >
    : never;

type InvalidNegatedLongOptionIssue<Field, Key, Command extends string> =
  Field extends Readonly<{
    readonly negatedLongOption: infer NegatedLongOption extends `--${string}`;
  }>
    ? NegatedLongOption extends CanonicalLongOption<NegatedLongOption>
      ? never
      : ContractTypeError<
          "invalidFieldLongOption",
          Readonly<{
            readonly command: Command;
            readonly field: Extract<Key, string>;
            readonly received: NegatedLongOption;
          }>
        >
    : never;

type CheckedFieldDefinition<
  Field extends FieldDefinition,
  Key,
  Command extends string,
> = Field extends PositionalDefinition
  ? Field
  : Field extends VariadicPositionalDefinition
    ? Field
    : Field extends FlagDefinition<infer LongOption>
      ? CheckedNegatedFlagDefinition<Field, Key, LongOption, Command>
      : Field extends RepeatableOptionDefinition<infer LongOption>
        ? CheckedOptionDefinition<Field, Key, LongOption, Command>
        : Field extends ValueOptionDefinition<infer LongOption>
          ? CheckedOptionDefinition<Field, Key, LongOption, Command>
          : never;

type CheckedNegatedFlagDefinition<
  Field,
  Key,
  LongOption extends `--${string}`,
  Command extends string,
> = [InvalidCanonicalLongOptionIssue<Command, Key, LongOption>] extends [never]
  ? [InvalidShortOptionAliasIssue<Field, Command, Key>] extends [never]
    ? [InvalidNegatedLongOptionIssue<Field, Key, Command>] extends [never]
      ? Field
      : InvalidNegatedLongOptionIssue<Field, Key, Command>
    : InvalidShortOptionAliasIssue<Field, Command, Key>
  : InvalidCanonicalLongOptionIssue<Command, Key, LongOption>;

type CheckedOptionDefinition<
  Field,
  Key,
  LongOption extends `--${string}`,
  Command extends string,
> = [InvalidCanonicalLongOptionIssue<Command, Key, LongOption>] extends [never]
  ? [InvalidShortOptionAliasIssue<Field, Command, Key>] extends [never]
    ? Field
    : InvalidShortOptionAliasIssue<Field, Command, Key>
  : InvalidCanonicalLongOptionIssue<Command, Key, LongOption>;

type CheckedFieldDefinitions<
  Fields extends FieldDefinitions,
  Command extends string,
> = {
  readonly [Field in keyof Fields]: CheckedFieldDefinition<
    Fields[Field],
    Field,
    Command
  > &
    RejectUnknownProperties<
      Fields[Field],
      AllowedFieldProperties<Fields[Field]>
    >;
};

type RejectUnknownProperties<Value, Allowed extends PropertyKey> = Readonly<{
  [Property in Exclude<keyof Value, Allowed>]?: never;
}>;

type AllowedFieldProperties<Field> =
  Field extends Readonly<{
    readonly kind: "flag";
  }>
    ? (typeof definitionPropertyKeys.field.flag)[number]
    : Field extends Readonly<{
          readonly kind: "valueOption" | "repeatableOption";
        }>
      ? (typeof definitionPropertyKeys.field.option)[number]
      : (typeof definitionPropertyKeys.field.positional)[number];

type ClosedVariantDefinitions<
  Definitions,
  Allowed extends PropertyKey,
> = Readonly<{
  [Variant in keyof Definitions]: RejectUnknownProperties<
    Definitions[Variant],
    Allowed
  >;
}>;

type ClosedFieldDefinitions<Fields> = Readonly<{
  [Field in keyof Fields]: RejectUnknownProperties<
    Fields[Field],
    AllowedFieldProperties<Fields[Field]>
  >;
}>;

type ClosedUsageFact<Fact> =
  Fact extends Readonly<{ readonly kind: "present" }>
    ? RejectUnknownProperties<
        Fact,
        (typeof definitionPropertyKeys.usage.fact.present)[number]
      >
    : Fact extends Readonly<{ readonly kind: "equals" }>
      ? RejectUnknownProperties<
          Fact,
          (typeof definitionPropertyKeys.usage.fact.equals)[number]
        >
      : unknown;

type ClosedUsageFacts<Facts extends readonly unknown[]> = {
  readonly [Index in keyof Facts]: ClosedUsageFact<Facts[Index]>;
};

type ClosedUsageEffect<Effect> = Effect extends object
  ? RejectUnknownProperties<
      Effect,
      (typeof definitionPropertyKeys.usage.effect)[number]
    >
  : Effect;

type ClosedUsageConstraint<Constraint> =
  Constraint extends Readonly<{
    readonly kind: "when";
    readonly all: infer Facts extends readonly unknown[];
  }>
    ? RejectUnknownProperties<
        Constraint,
        (typeof definitionPropertyKeys.usage.when)[number]
      > &
        Readonly<{ readonly all: ClosedUsageFacts<Facts> }> &
        (Constraint extends Readonly<{ readonly onMatch?: infer OnMatch }>
          ? Readonly<{ readonly onMatch?: ClosedUsageEffect<OnMatch> }>
          : unknown) &
        (Constraint extends Readonly<{ readonly otherwise?: infer Otherwise }>
          ? Readonly<{ readonly otherwise?: ClosedUsageEffect<Otherwise> }>
          : unknown)
    : Constraint extends Readonly<{ readonly kind: "count" }>
      ? RejectUnknownProperties<
          Constraint,
          (typeof definitionPropertyKeys.usage.count)[number]
        >
      : Constraint extends Readonly<{
            readonly kind: "forbiddenCombination";
          }>
        ? unknown
        : unknown;

type ClosedUsageConstraints<
  Command extends string,
  Constraints,
> = Constraints extends readonly unknown[]
  ? InvalidClosedUsageConstraintProperties<
      Command,
      Constraints[number]
    > extends infer Issue
    ? [Issue] extends [never]
      ? {
          readonly [Index in keyof Constraints]: Constraints[Index] &
            ClosedUsageConstraint<Constraints[Index]>;
        }
      : Issue
    : never
  : unknown;

type ClosedCommandDefinition<
  Definition,
  Command extends string = string,
> = RejectUnknownProperties<
  Definition,
  (typeof definitionPropertyKeys.command)[number]
> &
  (Definition extends Readonly<{ readonly fields: infer Fields }>
    ? Readonly<{ readonly fields: ClosedFieldDefinitions<Fields> }>
    : unknown) &
  (Definition extends Readonly<{
    readonly usageConstraints: infer Constraints;
  }>
    ? Readonly<{
        readonly usageConstraints: ClosedUsageConstraints<Command, Constraints>;
      }>
    : unknown);

type ClosedRootCommands<Commands> = Readonly<{
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
  }>
    ? ClosedCommandDefinition<Commands[Command], Extract<Command, string>>
    : RejectUnknownProperties<
        Commands[Command],
        (typeof definitionPropertyKeys.group)[number]
      >;
}>;

type ClosedRootDefinition<Definition> = RejectUnknownProperties<
  Definition,
  (typeof definitionPropertyKeys.cli)[number]
> &
  (Definition extends Readonly<{ readonly commands: infer Commands }>
    ? Readonly<{ readonly commands: ClosedRootCommands<Commands> }>
    : unknown);

type InvalidFieldIdentities<Fields extends FieldDefinitions> = {
  [Field in keyof Fields & string]: IsLowerCamelCase<Field> extends true
    ? never
    : Field;
}[keyof Fields & string];

type FieldIdentityContract<
  Command extends string,
  Fields extends FieldDefinitions,
> = string extends keyof Fields
  ? unknown
  :
        | InvalidFieldIdentities<Fields>
        | Extract<
            keyof Fields,
            (typeof reservedFieldNames)[number]
          > extends never
    ? unknown
    : ContractTypeError<
        "invalidFieldIdentity",
        Readonly<{
          readonly command: Command;
          readonly field: InvalidFieldIdentities<Fields> extends never
            ? Extract<keyof Fields, (typeof reservedFieldNames)[number]>
            : InvalidFieldIdentities<Fields>;
          readonly reason: InvalidFieldIdentities<Fields> extends never
            ? "reservedName"
            : "lowerCamelCase";
          readonly hint: InvalidFieldIdentities<Fields> extends never
            ? "rename the field key and update the schema Input key and its references; the CLI spelling may stay unchanged"
            : "start with a lowercase letter, letters and digits only";
        }>
      >;

export type RawValueOptionInputForSchema<InputSchema extends ContractSchema> =
  Readonly<{
    [Field in Extract<keyof ContractSchemaInput<InputSchema>, string>]?: string;
  }>;

export interface ContractTypeError<Code extends string, Evidence> {
  readonly contractTypeError: Readonly<{ readonly code: Code } & Evidence>;
}

type HelpFactTemplateAllowedPlaceholder<Slot extends keyof HelpFactWording> =
  (typeof helpTemplateSpecifications)[Slot]["placeholders"][number];

type ParsedHelpFactTemplate<
  Template extends string,
  Allowed extends string,
  Seen extends string = never,
> = Template extends `${infer Prefix}{${infer Tail}`
  ? Prefix extends `${string}}${string}`
    ? false
    : Tail extends `${infer Placeholder}}${infer Rest}`
      ? Placeholder extends Allowed
        ? ParsedHelpFactTemplate<Rest, Allowed, Seen | Placeholder>
        : false
      : false
  : Template extends `${string}}${string}`
    ? false
    : Exclude<Allowed, Seen> extends never
      ? true
      : false;

type HelpTemplateWhitespace =
  | " "
  | "\t"
  | "\v"
  | "\f"
  | "\u00a0"
  | "\u1680"
  | "\u2000"
  | "\u2001"
  | "\u2002"
  | "\u2003"
  | "\u2004"
  | "\u2005"
  | "\u2006"
  | "\u2007"
  | "\u2008"
  | "\u2009"
  | "\u200a"
  | "\u2028"
  | "\u2029"
  | "\u202f"
  | "\u205f"
  | "\u3000"
  | "\ufeff";

type TrimHelpTemplateWhitespace<Template extends string> =
  Template extends `${HelpTemplateWhitespace}${infer Rest}`
    ? TrimHelpTemplateWhitespace<Rest>
    : Template extends `${infer Rest}${HelpTemplateWhitespace}`
      ? TrimHelpTemplateWhitespace<Rest>
      : Template;

type HelpFactTemplateFailureReason<
  Slot extends keyof HelpFactWording,
  Template extends string,
> = Template extends
  | `${string}\r${string}`
  | `${string}\n${string}`
  | `${string}\0${string}`
  ? "singleLine"
  : TrimHelpTemplateWhitespace<Template> extends ""
    ? "empty"
    : Slot extends "commandPlaceholder"
      ? Template extends `${string}<${string}` | `${string}>${string}`
        ? "placeholder"
        : ParsedHelpFactTemplate<
              Template,
              HelpFactTemplateAllowedPlaceholder<Slot>
            > extends true
          ? never
          : "placeholder"
      : ParsedHelpFactTemplate<
            Template,
            HelpFactTemplateAllowedPlaceholder<Slot>
          > extends true
        ? never
        : "placeholder";

type IsValidStaticHelpFactTemplate<
  Slot extends keyof HelpFactWording,
  Template extends string,
> = HelpFactTemplateFailureReason<Slot, Template> extends never ? true : false;

type HelpFactTemplateValueContract<
  Slot extends keyof HelpFactWording,
  Value,
> = [Exclude<Value, undefined>] extends [never]
  ? never
  : [Exclude<Value, undefined>] extends [string]
    ? string extends Exclude<Value, undefined>
      ? never
      : IsValidStaticHelpFactTemplate<
            Slot,
            Extract<Exclude<Value, undefined>, string>
          > extends true
        ? never
        : ContractTypeError<
            "invalidHelpFactTemplate",
            Readonly<{
              readonly slot: Slot;
              readonly received: Extract<Exclude<Value, undefined>, string>;
              readonly reason: HelpFactTemplateFailureReason<
                Slot,
                Extract<Exclude<Value, undefined>, string>
              >;
            }>
          >
    : ContractTypeError<
        "invalidHelpFactTemplate",
        Readonly<{
          readonly slot: Slot;
          readonly received: Value;
          readonly reason: "singleLine";
        }>
      >;

type HelpFactWordingMemberIssues<Wording> =
  | {
      [
        Slot in keyof Wording & keyof HelpFactWording
      ]: HelpFactTemplateValueContract<Slot, Wording[Slot]>;
    }[keyof Wording & keyof HelpFactWording]
  | HelpFactWordingUnknownPropertyIssues<Wording>;

type HelpFactWordingIssues<Wording> = Wording extends unknown
  ? HelpFactWordingMemberIssues<Wording>
  : never;

type HelpFactWordingUnknownPropertyIssues<Wording> = {
  [
    Property in Exclude<Extract<keyof Wording, string>, keyof HelpFactWording>
  ]: ContractTypeError<
    "unknownDefinitionProperty",
    Readonly<{
      readonly path: readonly ["help", "wording", Property];
      readonly property: Property;
    }>
  >;
}[Exclude<Extract<keyof Wording, string>, keyof HelpFactWording>];

type HelpFactWordingContract<Wording> = [
  HelpFactWordingIssues<Wording>,
] extends [never]
  ? unknown
  : HelpFactWordingIssues<Wording>;

type HelpCapabilityWording<Definition> = Definition extends unknown
  ? Definition extends Readonly<{ readonly wording?: infer Wording }>
    ? Exclude<Wording, undefined>
    : never
  : never;

type HelpCapabilityTemplateContract<Definition> = [
  HelpCapabilityWording<Definition>,
] extends [never]
  ? unknown
  : [
        Extract<
          HelpCapabilityWording<Definition>,
          (...arguments_: never[]) => unknown
        >,
      ] extends [never]
    ? HelpFactWordingContract<HelpCapabilityWording<Definition>>
    : never;

type InputStringKeys<Input> = Extract<keyof Input, string>;

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type IsUnion<Value, Whole = Value> =
  IsAny<Value> extends true
    ? false
    : Value extends unknown
      ? [Whole] extends [Value]
        ? false
        : true
      : never;

type NormalizeNarrowStringLeaf<Value> =
  IsAny<Value> extends true
    ? Value
    : [Value] extends [never]
      ? Value
      : [Exclude<Value, undefined>] extends [never]
        ? Value
        : [Exclude<Value, undefined>] extends [string]
          ? string | (undefined extends Value ? undefined : never)
          : Value;

type NormalizeNarrowStringArray<Value extends readonly unknown[]> = {
  [Index in keyof Value]: NormalizeNarrowStringLeaf<Value[Index]>;
};

type NormalizeNarrowStrings<Value> =
  IsAny<Value> extends true
    ? Value
    : [Value] extends [never]
      ? Value
      : [Exclude<Value, undefined>] extends [readonly unknown[]]
        ? IsUnion<Exclude<Value, undefined>> extends true
          ? Value
          :
              | NormalizeNarrowStringArray<
                  Extract<Exclude<Value, undefined>, readonly unknown[]>
                >
              | (undefined extends Value ? undefined : never)
        : NormalizeNarrowStringLeaf<Value>;

type IncompatibleRawInputKeys<Fields extends FieldDefinitions, Input> = {
  [Field in keyof Fields & InputStringKeys<Input>]: RawSchemaInputValue<
    Fields[Field]
  > extends NormalizeNarrowStrings<Input[Field]>
    ? never
    : Field;
}[keyof Fields & InputStringKeys<Input>];

type RawFieldInputContract<
  Command extends string,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
> =
  IncompatibleRawInputKeys<
    Fields,
    ContractSchemaInput<InputSchema>
  > extends never
    ? unknown
    : IncompatibleRawInputIssues<
        Command,
        Fields,
        ContractSchemaInput<InputSchema>
      >;

type InvalidVariantNames<Variants> = {
  [Variant in keyof Variants & string]: IsLowerCamelCase<Variant> extends true
    ? never
    : Variant;
}[keyof Variants & string];

type InvalidDataVariantNames<Variants> = InvalidVariantNames<Variants>;

type DataVariantNameContract<Command extends string, Variants> =
  InvalidDataVariantNames<Variants> extends never
    ? unknown
    : ContractTypeError<
        "invalidVariantName",
        Readonly<{
          readonly command: Command;
          readonly location: "data";
          readonly variant: InvalidDataVariantNames<Variants>;
          readonly reason: "lowerCamelCase";
        }>
      >;

type InvalidFailureVariantNames<Failures> = InvalidVariantNames<Failures>;

type FailureVariantNameContract<Command extends string, Failures> =
  InvalidFailureVariantNames<Failures> extends never
    ? unknown
    : ContractTypeError<
        "invalidVariantName",
        Readonly<{
          readonly command: Command;
          readonly location: "failure";
          readonly variant: InvalidFailureVariantNames<Failures>;
          readonly reason: "lowerCamelCase";
        }>
      >;

/**
 * Handler context for a completion execution. `input` is the validated command
 * input; `outcome` constructors accept each result schema's Input, and the core
 * validates the payload before any presenter reads its Output.
 */
export interface CompletionHandlerContext<
  Command extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions,
  Input = EmptyCliInput,
> {
  readonly input: Input;
  readonly dependencies: Dependencies;
  readonly outcome: CompletionOutcome<Command> &
    FailureOutcome<Command, Failures>;
}

/**
 * Handler context for a data execution. `input` is the validated command input;
 * `outcome` constructors accept each result schema's Input, and the core validates
 * the payload before any presenter reads its Output.
 */
export interface DataHandlerContext<
  Command extends string,
  Dependencies,
  Input,
  Variants extends DataVariantDefinitions,
  Failures extends FailureVariantDefinitions,
> {
  readonly input: Input;
  readonly dependencies: Dependencies;
  readonly outcome: DataOutcome<Command, Variants> &
    FailureOutcome<Command, Failures>;
}

/**
 * Handler context for a stream execution. `input` is the validated command input;
 * `outcome.record` constructors accept each record schema's Input and are yielded
 * one by one, while `outcome.streamSuccess()` or a named failure is returned as the
 * terminal fact. The core validates payloads before presenters read their Output.
 */
export interface StreamHandlerContext<
  Command extends string,
  Dependencies,
  Input,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
> {
  readonly input: Input;
  readonly dependencies: Dependencies;
  readonly outcome: StreamOutcome<Command, Records> &
    FailureOutcome<Command, Failures>;
}

type StreamRecordNameContract<Command extends string, Records> =
  InvalidVariantNames<Records> extends never
    ? unknown
    : ContractTypeError<
        "invalidVariantName",
        Readonly<{
          readonly command: Command;
          readonly location: "record";
          readonly variant: InvalidVariantNames<Records>;
          readonly reason: "lowerCamelCase";
        }>
      >;

export interface RootCommandDefinition<
  Command extends string = string,
  Dependencies = unknown,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly examples?: readonly CommandExampleDefinition[];
  readonly fields?: FieldDefinitions;
  readonly input: ContractSchema;
  readonly outputs: OutputModesAuthoring<Command, Dependencies>;
}

export interface RootGroupDefinition {
  readonly kind: "rootGroup";
  readonly parent?: never;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly handler?: never;
}

export interface CommandGroupDefinition<Parent extends string = string> {
  readonly kind: "commandGroup";
  readonly parent: Parent;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly handler?: never;
}

type HierarchyCommandFactsDefinition<Parent extends string = string> =
  Readonly<{
    readonly kind: "command";
    readonly parent: Parent;
    readonly aliases?: readonly string[];
    readonly helpSupplement?: TextLines;
  }>;

type HierarchyCommandFacts<Parent extends string = string> =
  HierarchyCommandFactsDefinition<Parent> & CommandCombinationBrand;

export declare abstract class CommandCombinationBrand {
  private readonly commandCombinationBrand: void;
}

export type CommandCombination<
  Command extends string,
  Definition extends object,
  Parent extends string = string,
> = Readonly<Record<Command, Definition & HierarchyCommandFacts<Parent>>>;

export type ExecutableCommandDefinition<
  Command extends string = string,
  Dependencies = unknown,
> = Omit<RootCommandDefinition<Command, Dependencies>, "kind"> &
  HierarchyCommandFacts;

export type CommandNodeDefinition =
  | CommandGroupDefinition
  | RootCommandDefinition
  | (HierarchyCommandFacts &
      Readonly<{
        readonly name: string;
        readonly description: string;
        readonly fields?: unknown;
        readonly input: ContractSchema;
        readonly outputs: OutputModesAuthoring | OutputModesDefinition;
        readonly examples?: readonly CommandExampleDefinition[];
      }>)
  | RootGroupDefinition;

type HierarchyRawInput<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
  }>
    ? RawFieldInput<HierarchyCommandFields<Commands[Command]>>
    : never;
}[keyof Commands];

type HierarchyResult<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
    readonly input: infer InputSchema extends ContractSchema;
    readonly outputs: infer RawOutputs;
  }>
    ? OutputModesResult<
        Extract<Command, string>,
        DeclaredNodeOutputs<Extract<Command, string>, InputSchema, RawOutputs>
      >
    : never;
}[keyof Commands];

type HierarchyCommandFields<Node> =
  Node extends Readonly<{
    readonly kind: "command" | "rootCommand";
    readonly fields: infer Fields extends FieldDefinitions;
  }>
    ? Fields
    : Readonly<Record<never, never>>;

type KnownInputKeys<Input> = string extends keyof Input
  ? never
  : Extract<keyof Input, string>;

type EffectiveFieldSetMismatch<Fields, Input> =
  | Exclude<Extract<keyof Fields, string>, KnownInputKeys<Input>>
  | Exclude<KnownInputKeys<Input>, Extract<keyof Fields, string>>;

type IncompatibleRawInputIssues<
  Command extends string,
  Fields extends FieldDefinitions,
  Input,
> = {
  [Field in IncompatibleRawInputKeys<Fields, Input>]: ContractTypeError<
    "fieldInputMustAcceptRawValue",
    Readonly<{
      readonly command: Command;
      readonly field: Field;
      readonly rawValue: RawSchemaInputValue<Fields[Field]>;
      readonly schemaInput: Field extends keyof Input ? Input[Field] : never;
    }>
  >;
}[IncompatibleRawInputKeys<Fields, Input>];

type HierarchyInputIssues<Commands> = {
  [Command in keyof Commands & string]: Commands[Command] extends Readonly<{
    readonly kind: "command";
    readonly input: infer InputSchema extends ContractSchema;
  }>
    ? EffectiveFieldSetMismatch<
        HierarchyCommandFields<Commands[Command]>,
        ContractSchemaInput<InputSchema>
      > extends never
      ? IncompatibleRawInputKeys<
          HierarchyCommandFields<Commands[Command]>,
          ContractSchemaInput<InputSchema>
        > extends never
        ? never
        : IncompatibleRawInputIssues<
            Command,
            HierarchyCommandFields<Commands[Command]>,
            ContractSchemaInput<InputSchema>
          >
      : ContractTypeError<
          "fieldSetDoesNotMatchSchemaInput",
          Readonly<{
            readonly command: Command;
            readonly fieldsWithoutSchemaInput: Exclude<
              keyof HierarchyCommandFields<Commands[Command]> & string,
              KnownInputKeys<ContractSchemaInput<InputSchema>>
            >;
            readonly schemaInputWithoutFields: Exclude<
              KnownInputKeys<ContractSchemaInput<InputSchema>>,
              keyof HierarchyCommandFields<Commands[Command]>
            >;
          }>
        >
    : never;
}[keyof Commands & string];

type HierarchyUsageConstraints<Node> =
  Node extends Readonly<{
    readonly usageConstraints?: infer Constraints;
  }>
    ? Exclude<Constraints, undefined>
    : never;

type ConditionalUsageConstraints<Constraints> =
  Constraints extends readonly (infer Constraint)[]
    ? Extract<Constraint, Readonly<{ readonly kind: "when" }>>
    : never;

type UsageConstraintFactsForNode<Node> = ConditionalUsageConstraints<
  HierarchyUsageConstraints<Node>
>;

type HierarchyUsageConstraintFacts<Commands> = Readonly<{
  [Command in keyof Commands]: UsageConstraintFactsForNode<Commands[Command]>;
}>;

type RootUsageConstraintFacts<Root extends string, Commands> = Readonly<{
  [Command in Root]: RootNodeFromCommands<Root, Commands> extends infer Node
    ? UsageConstraintFactsForNode<Node>
    : never;
}>;

type UsageConstraintFactFields<Facts> = Facts extends readonly (infer Fact)[]
  ? Fact extends Readonly<{ readonly field: infer Field extends string }>
    ? Field
    : never
  : never;

type LastRequiredTupleItem<Items extends readonly unknown[]> =
  Items extends readonly [...unknown[], infer Last] ? Last : never;

type PopRequiredTupleItem<Items extends readonly unknown[]> =
  Items extends readonly [...infer Prefix, unknown]
    ? readonly [...Prefix]
    : never;

type StaticallyKnownTupleSuffixItems<Items extends readonly unknown[]> = [
  LastRequiredTupleItem<Items>,
] extends [never]
  ? never
  : string extends LastRequiredTupleItem<Items>
    ? StaticallyKnownTupleSuffixItems<PopRequiredTupleItem<Items>>
    :
        | LastRequiredTupleItem<Items>
        | StaticallyKnownTupleSuffixItems<PopRequiredTupleItem<Items>>;

type StaticallyKnownUsageFact<Fact> =
  Fact extends Readonly<{
    readonly field: infer Field extends string;
  }>
    ? string extends Field
      ? never
      : IsUnion<Field> extends true
        ? never
        : Fact
    : never;

type StaticallyKnownUsageTupleFacts<Facts extends readonly unknown[]> =
  Facts extends readonly [infer Fact, ...infer Remaining]
    ? StaticallyKnownUsageFact<Fact> | StaticallyKnownUsageTupleFacts<Remaining>
    : StaticallyKnownTupleSuffixItems<Facts> extends infer Fact
      ? StaticallyKnownUsageFact<Fact>
      : never;

type IsNarrowUsageFactValue<Value> = [Value] extends [string | boolean]
  ? string extends Value
    ? false
    : boolean extends Value
      ? false
      : true
  : false;

type AreDisjointKnownUsageFactValues<Left, Right> =
  IsNarrowUsageFactValue<Left> extends true
    ? IsNarrowUsageFactValue<Right> extends true
      ? [Left & Right] extends [never]
        ? true
        : false
      : false
    : false;

type ConflictingEqualsUsageFactFields<First, Others> =
  First extends Readonly<{
    readonly kind: "equals";
    readonly field: infer Field extends string;
    readonly value: infer Value;
  }>
    ? Extract<
        Others,
        Readonly<{ readonly kind: "equals"; readonly field: Field }>
      > extends infer SameFieldFacts
      ? SameFieldFacts extends Readonly<{
          readonly kind: "equals";
          readonly value: infer OtherValue;
        }>
        ? AreDisjointKnownUsageFactValues<Value, OtherValue> extends true
          ? Field
          : never
        : never
      : never
    : never;

type ContradictoryUsageFactUnionFields<
  Fact,
  Facts = Fact,
> = Fact extends unknown
  ? ConflictingEqualsUsageFactFields<Fact, Exclude<Facts, Fact>>
  : never;

type ContradictoryUsageFactFields<Facts extends readonly unknown[]> =
  Facts extends unknown
    ? ContradictoryUsageFactUnionFields<StaticallyKnownUsageTupleFacts<Facts>>
    : never;

type InvalidUsageFactForFields<
  Command extends string,
  Fact,
  Fields extends FieldDefinitions,
  Input,
  Constraint extends "when" | "forbiddenCombination" = "forbiddenCombination",
> =
  Fact extends Readonly<{
    readonly kind: "present";
    readonly field: infer Field extends string;
  }>
    ? Exclude<Field, keyof Fields> extends never
      ? never
      : ContractTypeError<
          "unknownUsageConstraintField",
          Readonly<{
            readonly command: Command;
            readonly constraint: Constraint;
            readonly member: "all.field";
            readonly field: Exclude<Field, keyof Fields>;
          }>
        >
    : Fact extends Readonly<{
          readonly kind: "equals";
          readonly field: infer Field extends string;
          readonly value: infer Actual;
        }>
      ? Exclude<Field, keyof Fields> extends never
        ? Field extends keyof Fields & string
          ? [UsageFactValue<Fields, Input, Field>] extends [never]
            ? ContractTypeError<
                "inapplicableUsageConstraintField",
                Readonly<{
                  readonly command: Command;
                  readonly constraint: Constraint;
                  readonly member: "all.field";
                  readonly field: Field;
                  readonly kind: Fields[Field]["kind"];
                }>
              >
            : [Actual] extends [UsageFactValue<Fields, Input, Field>]
              ? never
              : ContractTypeError<
                  "invalidUsageConstraintValue",
                  Readonly<{
                    readonly command: Command;
                    readonly constraint: Constraint;
                    readonly member: "all.value";
                    readonly field: Field;
                    readonly actual: Actual;
                    readonly expected: UsageFactValue<Fields, Input, Field>;
                  }>
                >
          : never
        : ContractTypeError<
            "unknownUsageConstraintField",
            Readonly<{
              readonly command: Command;
              readonly constraint: Constraint;
              readonly member: "all.field";
              readonly field: Exclude<Field, keyof Fields>;
            }>
          >
      : ContractTypeError<
          "invalidUsageConstraint",
          Readonly<{
            readonly command: Command;
            readonly constraint: Constraint;
            readonly member: "all";
          }>
        >;

type InvalidForbiddenCombinationFacts<
  Command extends string,
  Facts extends readonly unknown[],
  Fields extends FieldDefinitions,
  Input,
> = Facts extends readonly [infer Fact, ...infer Remaining]
  ? [InvalidUsageFactForFields<Command, Fact, Fields, Input>] extends [never]
    ? InvalidForbiddenCombinationFacts<Command, Remaining, Fields, Input>
    : InvalidUsageFactForFields<Command, Fact, Fields, Input>
  : InvalidUsageFactForFields<
      Command,
      StaticallyKnownUsageTupleFacts<Facts>,
      Fields,
      Input
    >;

type InvalidWhenFacts<
  Command extends string,
  Facts extends readonly unknown[],
  Fields extends FieldDefinitions,
  Input,
> = Facts extends readonly [infer Fact, ...infer Remaining]
  ? [InvalidUsageFactForFields<Command, Fact, Fields, Input, "when">] extends [
      never,
    ]
    ? InvalidWhenFacts<Command, Remaining, Fields, Input>
    : InvalidUsageFactForFields<Command, Fact, Fields, Input, "when">
  : InvalidUsageFactForFields<
      Command,
      StaticallyKnownUsageTupleFacts<Facts>,
      Fields,
      Input,
      "when"
    >;

type UnknownUsageFactProperty<Fact> =
  Fact extends Readonly<{
    readonly kind: "present";
  }>
    ? Exclude<
        keyof Fact,
        (typeof definitionPropertyKeys.usage.fact.present)[number]
      >
    : Fact extends Readonly<{ readonly kind: "equals" }>
      ? Exclude<
          keyof Fact,
          (typeof definitionPropertyKeys.usage.fact.equals)[number]
        >
      : never;

type UnknownUsageFactProperties<Facts extends readonly unknown[]> =
  UnknownUsageFactProperty<Facts[number]>;

type UnknownForbiddenCombinationConstraintProperties<Constraint> = Exclude<
  keyof Constraint,
  (typeof definitionPropertyKeys.usage.forbiddenCombination)[number]
>;

type UnknownForbiddenCombinationFactProperties<Facts> =
  Facts extends readonly unknown[] ? UnknownUsageFactProperties<Facts> : never;

type InvalidForbiddenCombinationShape<
  Command extends string,
  Constraint,
  Facts,
> =
  | ([UnknownForbiddenCombinationConstraintProperties<Constraint>] extends [
      never,
    ]
      ? never
      : ContractTypeError<
          "unknownDefinitionProperty",
          Readonly<{
            readonly command: Command;
            readonly constraint: "forbiddenCombination";
            readonly member: "forbiddenCombination";
            readonly property: UnknownForbiddenCombinationConstraintProperties<Constraint>;
          }>
        >)
  | ([UnknownForbiddenCombinationFactProperties<Facts>] extends [never]
      ? never
      : ContractTypeError<
          "unknownDefinitionProperty",
          Readonly<{
            readonly command: Command;
            readonly constraint: "forbiddenCombination";
            readonly member: "all";
            readonly property: UnknownForbiddenCombinationFactProperties<Facts>;
          }>
        >);

type UnknownWhenEffectProperty<Effect> = Effect extends object
  ? Exclude<keyof Effect, (typeof definitionPropertyKeys.usage.effect)[number]>
  : never;

type UnknownWhenConstraintProperty<Constraint> = Constraint extends object
  ? Exclude<
      keyof Constraint,
      (typeof definitionPropertyKeys.usage.when)[number]
    >
  : never;

type InvalidWhenEffectProperties<
  Command extends string,
  Branch,
  Effect,
> = Effect extends object
  ? [UnknownWhenEffectProperty<Effect>] extends [never]
    ? never
    : ContractTypeError<
        "unknownDefinitionProperty",
        Readonly<{
          readonly command: Command;
          readonly constraint: "when";
          readonly member: Branch;
          readonly property: UnknownWhenEffectProperty<Effect>;
        }>
      >
  : never;

type InvalidWhenProperties<Command extends string, Constraint, Facts> =
  | ([UnknownWhenConstraintProperty<Constraint>] extends [never]
      ? never
      : ContractTypeError<
          "unknownDefinitionProperty",
          Readonly<{
            readonly command: Command;
            readonly constraint: "when";
            readonly member: "when";
            readonly property: UnknownWhenConstraintProperty<Constraint>;
          }>
        >)
  | (Facts extends readonly unknown[]
      ? [UnknownUsageFactProperties<Facts>] extends [never]
        ? never
        : ContractTypeError<
            "unknownDefinitionProperty",
            Readonly<{
              readonly command: Command;
              readonly constraint: "when";
              readonly member: "all";
              readonly property: UnknownUsageFactProperties<Facts>;
            }>
          >
      : never)
  | (Constraint extends Readonly<{ readonly onMatch?: infer OnMatch }>
      ? InvalidWhenEffectProperties<Command, "onMatch", OnMatch>
      : never)
  | (Constraint extends Readonly<{ readonly otherwise?: infer Otherwise }>
      ? InvalidWhenEffectProperties<Command, "otherwise", Otherwise>
      : never);

type InvalidClosedUsageConstraintProperties<
  Command extends string,
  Constraint,
> =
  Constraint extends Readonly<{
    readonly kind: "when";
    readonly all: infer Facts;
  }>
    ? InvalidWhenProperties<Command, Constraint, Facts>
    : Constraint extends Readonly<{
          readonly kind: "forbiddenCombination";
          readonly all: infer Facts;
        }>
      ? InvalidForbiddenCombinationShape<Command, Constraint, Facts>
      : Constraint extends Readonly<{ readonly kind: "count" }>
        ? [
            Exclude<
              keyof Constraint,
              (typeof definitionPropertyKeys.usage.count)[number]
            >,
          ] extends [never]
          ? never
          : ContractTypeError<
              "unknownDefinitionProperty",
              Readonly<{
                readonly command: Command;
                readonly constraint: "count";
                readonly member: "count";
                readonly property: Exclude<
                  keyof Constraint,
                  (typeof definitionPropertyKeys.usage.count)[number]
                >;
              }>
            >
        : never;

type CountDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type CountDigitTuple = {
  readonly "0": readonly [];
  readonly "1": readonly [unknown];
  readonly "2": readonly [unknown, unknown];
  readonly "3": readonly [unknown, unknown, unknown];
  readonly "4": readonly [unknown, unknown, unknown, unknown];
  readonly "5": readonly [unknown, unknown, unknown, unknown, unknown];
  readonly "6": readonly [unknown, unknown, unknown, unknown, unknown, unknown];
  readonly "7": readonly [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
  ];
  readonly "8": readonly [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
  ];
  readonly "9": readonly [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
  ];
};

type CountStringLength<
  Value extends string,
  Cursor extends readonly unknown[] = [],
> = Value extends `${infer _Character}${infer Remaining}`
  ? CountStringLength<Remaining, [...Cursor, unknown]>
  : Cursor;

type CompareCountDigit<
  Left extends CountDigit,
  Right extends CountDigit,
> = Left extends Right
  ? "equal"
  : CountDigitTuple[Left] extends readonly [
        ...CountDigitTuple[Right],
        unknown,
        ...unknown[],
      ]
    ? "greater"
    : "less";

type CompareCountDigitStrings<
  Left extends string,
  Right extends string,
> = Left extends `${infer LeftDigit extends CountDigit}${infer LeftRest}`
  ? Right extends `${infer RightDigit extends CountDigit}${infer RightRest}`
    ? CompareCountDigit<LeftDigit, RightDigit> extends infer Comparison
      ? Comparison extends "equal"
        ? CompareCountDigitStrings<LeftRest, RightRest>
        : Comparison
      : never
    : "greater"
  : Right extends ""
    ? "equal"
    : "less";

type CompareCountStringLengths<Left extends string, Right extends string> =
  CountStringLength<Left> extends readonly [
    ...CountStringLength<Right>,
    ...infer Remaining,
  ]
    ? Remaining extends readonly []
      ? "equal"
      : "greater"
    : "less";

type CompareCountUnsignedIntegers<Left extends string, Right extends string> =
  CompareCountStringLengths<Left, Right> extends infer LengthOrder
    ? LengthOrder extends "equal"
      ? CompareCountDigitStrings<Left, Right>
      : LengthOrder
    : never;

type CompareCountFractions<
  Left extends string,
  Right extends string,
> = Left extends `${infer LeftDigit extends CountDigit}${infer LeftRest}`
  ? Right extends `${infer RightDigit extends CountDigit}${infer RightRest}`
    ? CompareCountDigit<LeftDigit, RightDigit> extends infer Comparison
      ? Comparison extends "equal"
        ? CompareCountFractions<LeftRest, RightRest>
        : Comparison
      : never
    : CompareCountDigit<LeftDigit, "0"> extends infer Comparison
      ? Comparison extends "equal"
        ? CompareCountFractions<LeftRest, "">
        : Comparison
      : never
  : Right extends `${infer RightDigit extends CountDigit}${infer RightRest}`
    ? CompareCountDigit<"0", RightDigit> extends infer Comparison
      ? Comparison extends "equal"
        ? CompareCountFractions<"", RightRest>
        : Comparison
      : never
    : "equal";

type CompareCountCoefficients<
  Left extends string,
  Right extends string,
> = Left extends `${infer LeftWhole extends CountDigit}.${infer LeftFraction}`
  ? Right extends `${infer RightWhole extends CountDigit}.${infer RightFraction}`
    ? CompareCountDigit<LeftWhole, RightWhole> extends infer Comparison
      ? Comparison extends "equal"
        ? CompareCountFractions<LeftFraction, RightFraction>
        : Comparison
      : never
    : never
  : never;

type NormalizeCountCoefficient<Coefficient extends string> =
  Coefficient extends `${string}.${string}` ? Coefficient : `${Coefficient}.0`;

type CountScientificParts<Value extends number> =
  `${Value}` extends `${infer Coefficient}e+${infer Exponent}`
    ? Readonly<{
        readonly exponent: Exponent;
        readonly coefficient: NormalizeCountCoefficient<Coefficient>;
      }>
    : `${Value}` extends `${infer First extends CountDigit}${infer Remaining}`
      ? Readonly<{
          readonly exponent: CountStringLength<`${Value}`> extends readonly [
            ...infer RemainingDigits,
            unknown,
          ]
            ? `${RemainingDigits["length"]}`
            : "0";
          readonly coefficient: `${First}.${Remaining extends "" ? "0" : Remaining}`;
        }>
      : never;

type CompareCountNumbers<Left extends number, Right extends number> =
  CountScientificParts<Left> extends Readonly<{
    readonly exponent: infer LeftExponent extends string;
    readonly coefficient: infer LeftCoefficient extends string;
  }>
    ? CountScientificParts<Right> extends Readonly<{
        readonly exponent: infer RightExponent extends string;
        readonly coefficient: infer RightCoefficient extends string;
      }>
      ? CompareCountUnsignedIntegers<
          LeftExponent,
          RightExponent
        > extends infer ExponentOrder
        ? ExponentOrder extends "equal"
          ? CompareCountCoefficients<LeftCoefficient, RightCoefficient>
          : ExponentOrder
        : never
      : never
    : never;

type IsCountIntegerLiteral<Value extends number> =
  `${Value}` extends `${bigint}`
    ? true
    : `${Value}` extends `${infer Coefficient}e+${infer Exponent}`
      ? Coefficient extends `${bigint}`
        ? true
        : Coefficient extends `${string}.${infer Fraction}`
          ? CompareCountUnsignedIntegers<
              Exponent,
              `${CountStringLength<Fraction>["length"]}`
            > extends "less"
            ? false
            : true
          : false
      : false;

type CountFieldRange<
  Fields extends readonly unknown[],
  Cursor extends readonly unknown[] = [],
> = number extends Fields["length"]
  ? number
  : Cursor["length"] extends Fields["length"]
    ? Cursor["length"]
    : Cursor["length"] | CountFieldRange<Fields, [...Cursor, unknown]>;

type CountFieldMaximum<Fields extends readonly unknown[]> = Fields["length"];

type CountFieldDuplicates<
  Fields extends readonly unknown[],
  Seen = never,
> = Fields extends readonly [infer Field, ...infer Remaining]
  ? string extends Field
    ? CountFieldDuplicates<Remaining, Seen>
    : IsUnion<Field> extends true
      ? CountFieldDuplicates<Remaining, Seen>
      : Field extends Seen
        ? Field
        : CountFieldDuplicates<Remaining, Seen | Field>
  : CountFieldSuffixDuplicates<Fields, Seen>;

type CountFieldSuffixDuplicates<Fields extends readonly unknown[], Seen> = [
  LastRequiredTupleItem<Fields>,
] extends [never]
  ? never
  : LastRequiredTupleItem<Fields> extends infer Field
    ? string extends Field
      ? CountFieldSuffixDuplicates<PopRequiredTupleItem<Fields>, Seen>
      : IsUnion<Field> extends true
        ? CountFieldSuffixDuplicates<PopRequiredTupleItem<Fields>, Seen>
        : Field extends Seen
          ?
              | Field
              | CountFieldSuffixDuplicates<
                  PopRequiredTupleItem<Fields>,
                  Seen | Field
                >
          : CountFieldSuffixDuplicates<
              PopRequiredTupleItem<Fields>,
              Seen | Field
            >
    : never;

type CountEndpoint<
  Constraint,
  Member extends "min" | "max",
> = Member extends keyof Constraint
  ? Exclude<Constraint[Member], undefined>
  : never;

type CountEndpointIssue<
  Command extends string,
  Member extends "min" | "max",
  Value,
  Allowed extends number,
  Maximum extends number,
> =
  IsAny<Value> extends true
    ? never
    : number extends Value
      ? never
      : Value extends number
        ? `${Value}` extends `-${string}`
          ? ContractTypeError<
              "invalidCountConstraint",
              Readonly<{
                readonly command: Command;
                readonly constraint: "count";
                readonly member: Member;
                readonly reason: "nonNegative";
                readonly actual: Value;
              }>
            >
          : IsCountIntegerLiteral<Value> extends true
            ? Exclude<Value, Allowed> extends infer Outside extends number
              ? [Outside] extends [never]
                ? never
                : ContractTypeError<
                    "invalidCountConstraint",
                    Readonly<{
                      readonly command: Command;
                      readonly constraint: "count";
                      readonly member: Member;
                      readonly reason: "fieldCount";
                      readonly actual: Outside;
                      readonly maximum: Maximum;
                    }>
                  >
              : never
            : ContractTypeError<
                "invalidCountConstraint",
                Readonly<{
                  readonly command: Command;
                  readonly constraint: "count";
                  readonly member: Member;
                  readonly reason: "integer";
                  readonly actual: Value;
                }>
              >
        : never;

type CountEndpointValidationIssue<
  Command extends string,
  Constraint,
  Fields extends readonly unknown[],
  Member extends "min" | "max",
> = CountEndpointIssue<
  Command,
  Member,
  CountEndpoint<Constraint, Member>,
  CountFieldRange<Fields>,
  CountFieldMaximum<Fields>
>;

type CountRangeOrderIssue<
  Command extends string,
  Minimum,
  Maximum,
> = Minimum extends number
  ? Maximum extends number
    ? CompareCountNumbers<Minimum, Maximum> extends "greater"
      ? ContractTypeError<
          "invalidCountConstraint",
          Readonly<{
            readonly command: Command;
            readonly constraint: "count";
            readonly member: "min";
            readonly reason: "ordered";
            readonly actual: Minimum;
            readonly maximum: Maximum;
          }>
        >
      : never
    : never
  : never;

type StaticallyKnownCountTupleFields<Fields extends readonly unknown[]> =
  Fields extends readonly [infer Field, ...infer Remaining]
    ? string extends Field
      ? StaticallyKnownCountTupleFields<Remaining>
      : Field | StaticallyKnownCountTupleFields<Remaining>
    : StaticallyKnownTupleSuffixItems<Fields>;

type CountUnknownFieldIssue<
  Command extends string,
  Fields extends FieldDefinitions,
  CountFields extends readonly unknown[],
> =
  Exclude<
    StaticallyKnownCountTupleFields<CountFields>,
    keyof Fields
  > extends infer UnknownField
    ? [UnknownField] extends [never]
      ? never
      : ContractTypeError<
          "unknownUsageConstraintField",
          Readonly<{
            readonly command: Command;
            readonly constraint: "count";
            readonly member: "fields";
            readonly field: Extract<UnknownField, string>;
          }>
        >
    : never;

type CountDuplicateFieldIssue<
  Command extends string,
  CountFields extends readonly unknown[],
> = [CountFieldDuplicates<CountFields>] extends [never]
  ? never
  : ContractTypeError<
      "invalidCountConstraint",
      Readonly<{
        readonly command: Command;
        readonly constraint: "count";
        readonly member: "fields";
        readonly reason: "duplicateFields";
        readonly fields: CountFieldDuplicates<CountFields>;
      }>
    >;

type CountEndpointRangeIssue<
  Command extends string,
  Constraint,
  CountFields extends readonly unknown[],
> = [
  CountEndpoint<Constraint, "min"> | CountEndpoint<Constraint, "max">,
] extends [never]
  ? ContractTypeError<
      "invalidCountConstraint",
      Readonly<{
        readonly command: Command;
        readonly constraint: "count";
        readonly member: "min";
        readonly reason: "endpointRequired";
      }>
    >
  : [
        CountEndpointValidationIssue<Command, Constraint, CountFields, "min">,
      ] extends [never]
    ? [
        CountEndpointValidationIssue<Command, Constraint, CountFields, "max">,
      ] extends [never]
      ? number extends
          | CountEndpoint<Constraint, "min">
          | CountEndpoint<Constraint, "max">
        ? never
        : CountRangeOrderIssue<
            Command,
            CountEndpoint<Constraint, "min">,
            CountEndpoint<Constraint, "max">
          >
      : CountEndpointValidationIssue<Command, Constraint, CountFields, "max">
    : CountEndpointValidationIssue<Command, Constraint, CountFields, "min">;

type InvalidCountConstraintForFields<
  Command extends string,
  Constraint,
  Fields extends FieldDefinitions,
> =
  Constraint extends Readonly<{
    readonly fields: infer CountFields extends readonly unknown[];
  }>
    ? [CountUnknownFieldIssue<Command, Fields, CountFields>] extends [never]
      ? [CountFields["length"]] extends [0]
        ? ContractTypeError<
            "invalidCountConstraint",
            Readonly<{
              readonly command: Command;
              readonly constraint: "count";
              readonly member: "fields";
              readonly reason: "nonEmpty";
            }>
          >
        : [CountDuplicateFieldIssue<Command, CountFields>] extends [never]
          ? CountEndpointRangeIssue<Command, Constraint, CountFields>
          : CountDuplicateFieldIssue<Command, CountFields>
      : CountUnknownFieldIssue<Command, Fields, CountFields>
    : ContractTypeError<
        "invalidCountConstraint",
        Readonly<{
          readonly command: Command;
          readonly constraint: "count";
          readonly member: "fields";
          readonly reason: "nonEmpty";
        }>
      >;

type UsageEffectFields<Effect, Member extends "require" | "forbid"> =
  Effect extends Readonly<Record<Member, readonly unknown[]>>
    ? StaticallyKnownCountTupleFields<
        Extract<Effect[Member], readonly unknown[]>
      >
    : never;

type UsageEffectFieldArrays<
  Effect,
  Member extends "require" | "forbid",
> = Effect extends object
  ? Member extends keyof Effect
    ? {} extends Pick<Effect, Member>
      ? never
      : Extract<Effect[Member], readonly unknown[]>
    : never
  : never;

type StaticallyGuaranteedUsageTupleFields<Fields extends readonly unknown[]> =
  Fields extends readonly [infer Field, ...infer Remaining]
    ? string extends Field
      ? StaticallyGuaranteedUsageTupleFields<Remaining>
      : IsUnion<Field> extends true
        ? StaticallyGuaranteedUsageTupleFields<Remaining>
        : Field extends string
          ? Field | StaticallyGuaranteedUsageTupleFields<Remaining>
          : StaticallyGuaranteedUsageTupleFields<Remaining>
    : StaticallyGuaranteedUsageTupleSuffixFields<Fields>;

type StaticallyGuaranteedUsageTupleSuffixFields<
  Fields extends readonly unknown[],
> = [LastRequiredTupleItem<Fields>] extends [never]
  ? never
  : LastRequiredTupleItem<Fields> extends infer Field
    ? string extends Field
      ? StaticallyGuaranteedUsageTupleSuffixFields<PopRequiredTupleItem<Fields>>
      : IsUnion<Field> extends true
        ? StaticallyGuaranteedUsageTupleSuffixFields<
            PopRequiredTupleItem<Fields>
          >
        : Field extends string
          ?
              | Field
              | StaticallyGuaranteedUsageTupleSuffixFields<
                  PopRequiredTupleItem<Fields>
                >
          : StaticallyGuaranteedUsageTupleSuffixFields<
              PopRequiredTupleItem<Fields>
            >
    : never;

type UsageArrayBranchesMissingGuaranteedField<
  Arrays,
  Field extends string,
> = Arrays extends readonly unknown[]
  ? Field extends StaticallyGuaranteedUsageTupleFields<Arrays>
    ? never
    : Arrays
  : never;

type GuaranteedUsageFieldsAcrossArrays<Arrays> =
  StaticallyKnownCountTupleFields<
    Extract<Arrays, readonly unknown[]>
  > extends infer Candidate
    ? Candidate extends string
      ? [UsageArrayBranchesMissingGuaranteedField<Arrays, Candidate>] extends [
          never,
        ]
        ? Candidate
        : never
      : never
    : never;

type GuaranteedUsageEffectFields<
  Effect,
  Member extends "require" | "forbid",
> = GuaranteedUsageFieldsAcrossArrays<UsageEffectFieldArrays<Effect, Member>>;

type UnknownUsageEffectFields<
  Command extends string,
  Branch extends "onMatch" | "otherwise",
  Member extends "require" | "forbid",
  Effect,
  Fields extends FieldDefinitions,
> =
  UsageEffectFields<Effect, Member> extends infer Field extends string
    ? string extends Field
      ? never
      : Exclude<Field, keyof Fields> extends never
        ? never
        : ContractTypeError<
            "unknownUsageConstraintField",
            Readonly<{
              readonly command: Command;
              readonly constraint: "when";
              readonly member: `${Branch}.${Member}`;
              readonly field: Exclude<Field, keyof Fields>;
            }>
          >
    : never;

type DefinitelyEmptyUsageEffectMember<
  Effect,
  Member extends "require" | "forbid",
> = Effect extends undefined
  ? true
  : Effect extends object
    ? Member extends keyof Effect
      ? [Exclude<Effect[Member], undefined>] extends [never]
        ? true
        : Exclude<Effect[Member], undefined> extends readonly []
          ? true
          : false
      : true
    : true;

type DefinitelyEmptyUsageEffect<Effect> =
  DefinitelyEmptyUsageEffectMember<Effect, "require"> extends true
    ? DefinitelyEmptyUsageEffectMember<Effect, "forbid"> extends true
      ? true
      : false
    : false;

type ContradictoryUsageEffectFields<Effect> = Effect extends unknown
  ? Extract<
      GuaranteedUsageEffectFields<Effect, "require">,
      GuaranteedUsageEffectFields<Effect, "forbid">
    >
  : never;

type InvalidUsageEffectForFields<
  Command extends string,
  Branch extends "onMatch" | "otherwise",
  Effect,
  Fields extends FieldDefinitions,
> =
  | UnknownUsageEffectFields<Command, Branch, "require", Effect, Fields>
  | UnknownUsageEffectFields<Command, Branch, "forbid", Effect, Fields>
  | ([ContradictoryUsageEffectFields<Effect>] extends [never]
      ? never
      : ContractTypeError<
          "contradictoryUsageConstraint",
          Readonly<{
            readonly command: Command;
            readonly constraint: "when";
            readonly member: Branch;
            readonly fields: ContradictoryUsageEffectFields<Effect>;
          }>
        >);

type WhenEffectForConstraint<
  Constraint,
  Branch extends "onMatch" | "otherwise",
> = Constraint extends object
  ? Branch extends keyof Constraint
    ? Exclude<Constraint[Branch], undefined>
    : undefined
  : undefined;

type InvalidWhenHasNoEffects<
  Command extends string,
  Constraint,
> = Constraint extends unknown
  ? [
      DefinitelyEmptyUsageEffect<
        WhenEffectForConstraint<Constraint, "onMatch">
      >,
    ] extends [true]
    ? [
        DefinitelyEmptyUsageEffect<
          WhenEffectForConstraint<Constraint, "otherwise">
        >,
      ] extends [true]
      ? ContractTypeError<
          "invalidUsageConstraint",
          Readonly<{
            readonly command: Command;
            readonly constraint: "when";
            readonly member: "effects";
          }>
        >
      : never
    : never
  : never;

type InvalidUsageConstraintForFields<
  Command extends string,
  Constraint,
  Fields extends FieldDefinitions,
  Input,
> =
  Constraint extends Readonly<{
    readonly kind: "when";
    readonly all: infer Facts extends readonly unknown[];
  }>
    ? [InvalidWhenProperties<Command, Constraint, Facts>] extends [never]
      ? Facts extends readonly []
        ? ContractTypeError<
            "invalidUsageConstraint",
            Readonly<{
              readonly command: Command;
              readonly constraint: "when";
              readonly member: "all";
            }>
          >
        : [InvalidWhenFacts<Command, Facts, Fields, Input>] extends [never]
          ? Exclude<
              UsageConstraintFactFields<Facts>,
              keyof Fields
            > extends never
            ? [ContradictoryUsageFactFields<Facts>] extends [never]
              ? [
                  InvalidUsageEffectForFields<
                    Command,
                    "onMatch",
                    Constraint extends Readonly<{
                      readonly onMatch?: infer OnMatch;
                    }>
                      ? OnMatch
                      : undefined,
                    Fields
                  >,
                ] extends [never]
                ? [
                    InvalidUsageEffectForFields<
                      Command,
                      "otherwise",
                      Constraint extends Readonly<{
                        readonly otherwise?: infer Otherwise;
                      }>
                        ? Otherwise
                        : undefined,
                      Fields
                    >,
                  ] extends [never]
                  ? [InvalidWhenHasNoEffects<Command, Constraint>] extends [
                      never,
                    ]
                    ? Constraint extends WhenUsageConstraint<Fields, Input>
                      ? never
                      : ContractTypeError<
                          "invalidUsageConstraint",
                          Readonly<{
                            readonly command: Command;
                            readonly constraint: "when";
                            readonly member: "when";
                          }>
                        >
                    : InvalidWhenHasNoEffects<Command, Constraint>
                  : InvalidUsageEffectForFields<
                      Command,
                      "otherwise",
                      Constraint extends Readonly<{
                        readonly otherwise?: infer Otherwise;
                      }>
                        ? Otherwise
                        : undefined,
                      Fields
                    >
                : InvalidUsageEffectForFields<
                    Command,
                    "onMatch",
                    Constraint extends Readonly<{
                      readonly onMatch?: infer OnMatch;
                    }>
                      ? OnMatch
                      : undefined,
                    Fields
                  >
              : ContractTypeError<
                  "contradictoryUsageConstraint",
                  Readonly<{
                    readonly command: Command;
                    readonly constraint: "when";
                    readonly member: "all";
                    readonly fields: ContradictoryUsageFactFields<Facts>;
                  }>
                >
            : ContractTypeError<
                "unknownUsageConstraintField",
                Readonly<{
                  readonly command: Command;
                  readonly constraint: "when";
                  readonly member: "all.field";
                  readonly field: Exclude<
                    UsageConstraintFactFields<Facts>,
                    keyof Fields
                  >;
                }>
              >
          : InvalidWhenFacts<Command, Facts, Fields, Input>
      : InvalidWhenProperties<Command, Constraint, Facts>
    : Constraint extends Readonly<{ readonly kind: "count" }>
      ? InvalidCountConstraintForFields<Command, Constraint, Fields>
      : Constraint extends Readonly<{
            readonly kind: "forbiddenCombination";
            readonly all: infer Facts extends readonly unknown[];
          }>
        ? [
            InvalidForbiddenCombinationShape<Command, Constraint, Facts>,
          ] extends [never]
          ? Exclude<
              UsageConstraintFactFields<Facts>,
              keyof Fields
            > extends never
            ? [
                InvalidForbiddenCombinationFacts<Command, Facts, Fields, Input>,
              ] extends [never]
              ? [ContradictoryUsageFactFields<Facts>] extends [never]
                ? Constraint extends ForbiddenCombinationUsageConstraint<
                    Fields,
                    Input
                  >
                  ? never
                  : ContractTypeError<
                      "invalidUsageConstraint",
                      Readonly<{
                        readonly command: Command;
                        readonly constraint: "forbiddenCombination";
                        readonly member: "all";
                      }>
                    >
                : ContractTypeError<
                    "contradictoryUsageConstraint",
                    Readonly<{
                      readonly command: Command;
                      readonly constraint: "forbiddenCombination";
                      readonly member: "all";
                      readonly fields: ContradictoryUsageFactFields<Facts>;
                    }>
                  >
              : InvalidForbiddenCombinationFacts<Command, Facts, Fields, Input>
            : ContractTypeError<
                "unknownUsageConstraintField",
                Readonly<{
                  readonly command: Command;
                  readonly constraint: "forbiddenCombination";
                  readonly member: "all.field";
                  readonly field: Exclude<
                    UsageConstraintFactFields<Facts>,
                    keyof Fields
                  >;
                }>
              >
          : ContractTypeError<
              "invalidUsageConstraint",
              Readonly<{
                readonly command: Command;
                readonly constraint: "forbiddenCombination";
                readonly member: "all";
              }>
            >
        : ContractTypeError<
            "invalidEffectiveUsageConstraint",
            Readonly<{ readonly command: Command }>
          >;

type InvalidCommandUsageConstraintIssues<Commands> = {
  [Command in keyof Commands & string]: Commands[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
  }>
    ? HierarchyUsageConstraints<Commands[Command]> extends never
      ? never
      : HierarchyUsageConstraints<
            Commands[Command]
          > extends readonly (infer Constraint)[]
        ? InvalidUsageConstraintForFields<
            Command,
            Constraint,
            HierarchyCommandFields<Commands[Command]>,
            HierarchyCommandInputSchema<Commands[Command]>
          > extends never
          ? never
          : InvalidUsageConstraintForFields<
              Command,
              Constraint,
              HierarchyCommandFields<Commands[Command]>,
              HierarchyCommandInputSchema<Commands[Command]>
            >
        : ContractTypeError<
            "invalidEffectiveUsageConstraint",
            Readonly<{ readonly command: Command }>
          >
    : never;
}[keyof Commands & string];

type HierarchyCommandInputSchema<Node> =
  Node extends Readonly<{
    readonly input: infer InputSchema extends ContractSchema;
  }>
    ? ContractSchemaInput<InputSchema>
    : unknown;

type RootIdentityContract<Root extends string> = string extends Root
  ? unknown
  : IsLowerCamelCase<Root> extends true
    ? unknown
    : ContractTypeError<
        "invalidCommandIdentity",
        Readonly<{
          readonly command: Root;
          readonly reason: "lowerCamelCase";
        }>
      >;

type RootCliDefinitionBase<Root extends string> = RootIdentityContract<Root> & {
  readonly root: Root;
  readonly help: HelpCapability;
  readonly version?: VersionCapability;
  readonly schema?: SchemaCapability;
  readonly usageFailureExitCode: number;
};

export type RootCliDefinition<
  Root extends string,
  Dependencies,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: RootCommandDefinition<Command, Dependencies>;
    }>;
  }>;

interface FieldGrammarBase<Field extends string> {
  readonly key: Field;
  readonly description: string;
  readonly required: boolean;
  readonly default?: JsonValue;
  readonly choices?: readonly string[];
}

export interface PositionalGrammar<
  Field extends string = string,
> extends FieldGrammarBase<Field> {
  readonly kind: "positional";
}

export interface VariadicPositionalGrammar<
  Field extends string = string,
> extends FieldGrammarBase<Field> {
  readonly kind: "variadicPositional";
}

export interface FlagGrammar<
  Field extends string = string,
> extends FieldGrammarBase<Field> {
  readonly kind: "flag";
  readonly longOption: CanonicalLongOption<string>;
  readonly shortAlias?: ShortOptionAlias<string>;
  readonly negatedLongOption?: CanonicalLongOption<string>;
}

export interface RepeatableOptionGrammar<
  Field extends string = string,
> extends FieldGrammarBase<Field> {
  readonly kind: "repeatableOption";
  readonly longOption: CanonicalLongOption<string>;
  readonly shortAlias?: ShortOptionAlias<string>;
}

export interface ValueOptionGrammar<
  Field extends string = string,
> extends FieldGrammarBase<Field> {
  readonly kind: "valueOption";
  readonly longOption: CanonicalLongOption<string>;
  readonly shortAlias?: ShortOptionAlias<string>;
}

export type FieldGrammar<Field extends string = string> =
  | FlagGrammar<Field>
  | PositionalGrammar<Field>
  | RepeatableOptionGrammar<Field>
  | VariadicPositionalGrammar<Field>
  | ValueOptionGrammar<Field>;

export interface RootCommandGrammar<
  Root extends string,
  Outputs extends OutputModesGrammar = OutputModesGrammar,
> {
  readonly kind: "rootCommand";
  readonly id: Root;
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly outputs: Outputs;
  readonly usage: CommandUsage<Root>;
}

export interface OutputModeGrammar {
  readonly description: string;
  readonly delivery: OutputDelivery;
  readonly format: OutputFormat;
}

export interface OutputModesGrammar<
  Modes extends Readonly<Record<string, OutputModeGrammar>> = Readonly<
    Record<string, OutputModeGrammar>
  >,
  Default extends string = string,
> {
  readonly selector: "--output";
  readonly default: Default;
  readonly modes: Modes;
}

interface GroupGrammarBase<Command extends string> {
  readonly id: Command;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly usage: CommandUsage<Command>;
}

export interface RootGroupGrammar<
  Root extends string,
> extends GroupGrammarBase<Root> {
  readonly kind: "rootGroup";
}

export interface CommandGroupGrammar<
  Command extends string = string,
> extends GroupGrammarBase<Command> {
  readonly kind: "commandGroup";
  readonly parent: string;
}

export interface ExecutableCommandGrammar<
  Command extends string = string,
  Outputs extends OutputModesGrammar = OutputModesGrammar,
> extends GroupGrammarBase<Command> {
  readonly kind: "command";
  readonly parent: string;
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly outputs: Outputs;
}

export type CommandGrammar<Command extends string = string> =
  | CommandGroupGrammar<Command>
  | ExecutableCommandGrammar<Command>;

export type CliRootKind = "rootCommand" | "rootGroup";

export interface CliGrammar<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
  RootOutputs = OutputModesDefinition,
> {
  readonly root: RootKind extends "rootGroup"
    ? RootGroupGrammar<Root>
    : RootCommandGrammar<Root, OutputModesGrammarProjection<RootOutputs>>;
  readonly nodes: RootKind extends "rootGroup"
    ? readonly CommandGrammar[]
    : readonly [];
  readonly controls: Readonly<{
    readonly help: Readonly<{
      readonly longOption: "--help";
      readonly shortAlias?: "-h";
      readonly headings?: HelpHeadings;
      readonly wording?: HelpFactWording;
    }>;
    readonly version?: Readonly<{
      readonly longOption: "--version";
      readonly shortAlias?: "-V";
      readonly value: string;
      readonly description?: string;
    }>;
    readonly schema?: Readonly<{
      readonly longOption: "--schema";
      readonly description: string;
    }>;
  }>;
}

export interface SchemaManifest {
  readonly inputSchema: JsonObject;
  readonly outputSchema: JsonObject;
}

export interface DataVariantManifest extends SchemaManifest {
  readonly description: string;
  readonly exitCode: number;
}

export type FailureVariantManifest = DataVariantManifest;

export type CommandSuccessManifest =
  | Readonly<{ readonly kind: "completion" }>
  | Readonly<{
      readonly kind: "data";
      readonly variants: Readonly<Record<string, DataVariantManifest>>;
    }>
  | Readonly<{
      readonly kind: "stream";
      readonly records: Readonly<Record<string, StreamRecordManifest>>;
      readonly text?: Readonly<{ readonly recordFraming: "fragment" }>;
    }>;

export interface OutputModeManifest {
  readonly description: string;
  readonly delivery: OutputDelivery;
  readonly format: OutputFormat;
  readonly success: CommandSuccessManifest;
  readonly failures: Readonly<Record<string, FailureVariantManifest>>;
}

export interface OutputModesManifest<
  Modes extends Readonly<Record<string, OutputModeManifest>> = Readonly<
    Record<string, OutputModeManifest>
  >,
  Default extends string = string,
> {
  readonly default: Default;
  readonly modes: Modes;
}

type NodeOutputs<Node> =
  Node extends Readonly<{
    readonly outputs: infer Outputs;
  }>
    ? Outputs
    : never;

type OutputModeGrammarProjection<Mode> =
  Mode extends Readonly<{
    readonly description: infer Description extends string;
    readonly delivery: infer Delivery extends OutputDelivery;
    readonly format: infer Format extends OutputFormat;
  }>
    ? Readonly<{
        readonly description: Description;
        readonly delivery: Delivery;
        readonly format: Format;
      }>
    : never;

/** Project a bound mode table to closed grammar keys and a literal default; a wide table stays wide. */
type OutputModesGrammarProjection<Outputs> =
  Outputs extends Readonly<{
    readonly modes: infer Modes;
    readonly default: infer Default extends string;
  }>
    ? OutputModesGrammar<
        Readonly<{
          [Name in keyof Modes]: OutputModeGrammarProjection<Modes[Name]>;
        }>,
        Default
      >
    : OutputModesGrammar;

type OutputModeManifestProjection<Mode> =
  Mode extends Readonly<{
    readonly description: infer Description extends string;
    readonly delivery: infer Delivery extends OutputDelivery;
    readonly format: infer Format extends OutputFormat;
  }>
    ? Readonly<{
        readonly description: Description;
        readonly delivery: Delivery;
        readonly format: Format;
        readonly success: CommandSuccessManifest;
        readonly failures: Readonly<Record<string, FailureVariantManifest>>;
      }>
    : never;

/** Project a bound mode table to closed manifest keys and a literal default; a wide table stays wide. */
type OutputModesManifestProjection<Outputs> =
  Outputs extends Readonly<{
    readonly modes: infer Modes;
    readonly default: infer Default extends string;
  }>
    ? OutputModesManifest<
        Readonly<{
          [Name in keyof Modes]: OutputModeManifestProjection<Modes[Name]>;
        }>,
        Default
      >
    : OutputModesManifest;

/**
 * Mode names an example may select. The conditional keeps `Outputs` covariant, so a
 * closed manifest still satisfies wide consumers; a wide table stays wide.
 */
type ExampleModeKeys<Outputs> =
  Outputs extends Readonly<{ readonly modes: infer Modes }>
    ? Extract<keyof Modes, string>
    : string;

export interface RootCommandManifest<
  Outputs extends OutputModesManifest = OutputModesManifest,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly examples?: readonly CommandExampleManifest<
    ExampleModeKeys<Outputs>
  >[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly input: SchemaManifest;
  readonly outputs: Outputs;
}

export interface CommandGroupManifest {
  readonly kind: "rootGroup" | "commandGroup";
  readonly parent?: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly helpSupplement?: readonly string[];
}

export interface ExecutableCommandManifest<
  Outputs extends OutputModesManifest = OutputModesManifest,
> extends Omit<RootCommandManifest<Outputs>, "kind"> {
  readonly kind: "command";
  readonly parent: string;
  readonly aliases: readonly string[];
  readonly helpSupplement?: readonly string[];
}

/** Example facts after formal parsing and input validation; shell is a POSIX invocation line including the root command name. */
export interface CommandExampleManifest<Mode extends string = string> {
  readonly argv: readonly string[];
  readonly shell: string;
  readonly outputMode?: Mode;
}

export type { CountUsageConstraintGrammar, UsageConstraintGrammar };

export interface CliManifest<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
  RootOutputs = OutputModesDefinition,
> {
  readonly schemaVersion: "5";
  readonly root: Root;
  readonly commands: RootKind extends "rootGroup"
    ? Readonly<Record<string, CommandGroupManifest | ExecutableCommandManifest>>
    : Readonly<
        Record<
          Root,
          RootCommandManifest<OutputModesManifestProjection<RootOutputs>>
        >
      >;
  readonly controls: CliGrammar<Root, RootKind>["controls"];
  readonly usageFailure: Readonly<{
    readonly exitCode: number;
    readonly wire: JsonObject;
  }>;
  readonly wire: RootKind extends "rootGroup"
    ? Readonly<Record<string, CommandWireManifest>>
    : CommandWireManifest;
}

export interface OutputModeWireManifest {
  readonly completion?: JsonObject;
  readonly data?: Readonly<Record<string, JsonObject>>;
  readonly failure?: Readonly<Record<string, JsonObject>>;
  readonly stream?: Readonly<{
    readonly header: JsonObject;
    readonly records: Readonly<Record<string, JsonObject>>;
    readonly terminal: JsonObject;
    readonly line: JsonObject;
  }>;
}

export type CommandWireManifest = Readonly<
  Record<string, OutputModeWireManifest>
>;

type HierarchyGrammarNode<Command extends string, Node> =
  Node extends Readonly<{
    readonly kind: "commandGroup";
    readonly parent: infer Parent extends string;
  }>
    ? CommandGroupGrammar<Command> & Readonly<{ readonly parent: Parent }>
    : Node extends Readonly<{
          readonly kind: "command";
          readonly parent: infer Parent extends string;
        }>
      ? ExecutableCommandGrammar<
          Command,
          OutputModesGrammarProjection<NodeOutputs<Node>>
        > &
          Readonly<{ readonly parent: Parent }>
      : never;

type HierarchyNodeUnion<Commands, Root extends string> = {
  [Command in Exclude<keyof Commands, Root>]: HierarchyGrammarNode<
    Extract<Command, string>,
    Commands[Command]
  >;
}[Exclude<keyof Commands, Root>];

export interface HierarchyCliGrammar<Root extends string, Commands> {
  readonly root: RootGroupGrammar<Root>;
  readonly nodes: readonly HierarchyNodeUnion<Commands, Root>[];
  readonly controls: CliGrammar<Root, "rootGroup">["controls"];
}

type HierarchyManifestNode<Node> =
  Node extends Readonly<{
    readonly kind: "rootGroup";
  }>
    ? CommandGroupManifest & Readonly<{ readonly kind: "rootGroup" }>
    : Node extends Readonly<{
          readonly kind: "commandGroup";
          readonly parent: infer Parent extends string;
        }>
      ? CommandGroupManifest &
          Readonly<{ readonly kind: "commandGroup"; readonly parent: Parent }>
      : Node extends Readonly<{
            readonly kind: "command";
            readonly parent: infer Parent extends string;
          }>
        ? ExecutableCommandManifest<
            OutputModesManifestProjection<NodeOutputs<Node>>
          > &
            Readonly<{ readonly parent: Parent }>
        : never;

type HierarchyExecutableKeys<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
  }>
    ? Command
    : never;
}[keyof Commands];

export interface HierarchyCliManifest<Root extends string, Commands> {
  readonly schemaVersion: "5";
  readonly root: Root;
  readonly commands: Readonly<{
    [Command in keyof Commands]: HierarchyManifestNode<Commands[Command]>;
  }>;
  readonly controls: HierarchyCliGrammar<Root, Commands>["controls"];
  readonly usageFailure: Readonly<{
    readonly exitCode: number;
    readonly wire: JsonObject;
  }>;
  readonly wire: Readonly<{
    [Command in HierarchyExecutableKeys<Commands>]: CommandWireManifest;
  }>;
}

export interface CliContract<
  Root extends string = string,
  Dependencies = unknown,
  RawInput = Readonly<Record<string, unknown>>,
  Result extends OutcomeFact = OutcomeFact,
  RootKind extends CliRootKind = CliRootKind,
  Commands = never,
  UsageFacts = Readonly<Record<string, unknown>>,
  RootOutputs = OutputModesDefinition,
> {
  readonly grammar: [Commands] extends [never]
    ? CliGrammar<Root, RootKind, RootOutputs>
    : HierarchyCliGrammar<Root, Commands>;
  readonly manifest: [Commands] extends [never]
    ? CliManifest<Root, RootKind, RootOutputs>
    : HierarchyCliManifest<Root, Commands>;
  readonly [cliContractType]: Readonly<{
    readonly dependencies: Dependencies;
    readonly rawInput: RawInput;
    readonly result: Result;
    readonly root: Root;
    readonly commands: [Commands] extends [never] ? Root : keyof Commands;
    readonly usageFacts: UsageFacts;
  }>;
}

export type AnyCliContract = Readonly<{
  readonly [cliContractType]: Readonly<{
    readonly dependencies: unknown;
    readonly rawInput: unknown;
    readonly result: OutcomeFact;
    readonly root: string;
    readonly commands: string;
    readonly usageFacts: unknown;
  }>;
}>;

export type CliContractUsageFacts<Contract> =
  Contract extends Readonly<{
    readonly [cliContractType]: Readonly<{
      readonly usageFacts: infer UsageFacts;
    }>;
  }>
    ? UsageFacts
    : never;

export type CliContractDependencies<Contract> =
  Contract extends Readonly<{
    readonly [cliContractType]: Readonly<{
      readonly dependencies: infer Dependencies;
    }>;
  }>
    ? Dependencies
    : never;

export type CliContractRawInput<Contract> =
  Contract extends Readonly<{
    readonly [cliContractType]: Readonly<{ readonly rawInput: infer RawInput }>;
  }>
    ? RawInput
    : never;

export type CliContractResult<Contract> =
  Contract extends Readonly<{
    readonly [cliContractType]: Readonly<{ readonly result: infer Result }>;
  }>
    ? Result
    : never;

export type CliContractRoot<Contract> =
  Contract extends Readonly<{
    readonly [cliContractType]: Readonly<{
      readonly commands: infer Commands;
    }>;
  }>
    ? Extract<Commands, string>
    : never;

type HierarchyUsageValidation<Commands> = [
  InvalidCommandUsageConstraintIssues<Commands>,
] extends [never]
  ? [HierarchyInputIssues<Commands>] extends [never]
    ? readonly []
    : readonly [HierarchyInputIssues<Commands>]
  : readonly [InvalidCommandUsageConstraintIssues<Commands>];

type ValidationIntersection<Validation extends readonly unknown[]> =
  Validation extends readonly []
    ? unknown
    : Validation extends readonly [infer Error]
      ? Error
      : never;

type EmptyRawObject = Readonly<Record<never, never>>;

type DistributedInputStringKeys<Input> = Input extends unknown
  ? Extract<keyof Input, string>
  : never;

type MissingRootFallbackFieldsContract<
  Command extends string,
  InputSchema extends ContractSchema,
> = ContractTypeError<
  "fieldSetDoesNotMatchSchemaInput",
  Readonly<{
    readonly command: Command;
    readonly fieldsWithoutSchemaInput: never;
    readonly schemaInputWithoutFields: DistributedInputStringKeys<
      ContractSchemaInput<InputSchema>
    >;
  }>
>;

type RootFallbackRawFieldInputContract<
  Command extends string,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
> =
  FieldsOmitted<Fields> extends true
    ? EmptyRawObject extends ContractSchemaInput<InputSchema>
      ? unknown
      : MissingRootFallbackFieldsContract<Command, InputSchema>
    : RawFieldInputContract<Command, Fields, InputSchema>;

type RootNodeFromCommands<Root extends string, Commands> =
  Commands extends Readonly<Record<Root, infer Node>> ? Node : never;

type RootCommandRawInput<Root extends string, Commands> =
  RootNodeFromCommands<Root, Commands> extends Readonly<{
    readonly fields: infer Fields extends FieldDefinitions;
  }>
    ? RawFieldInput<Fields>
    : EmptyCliInput;

type ExampleFields<Node> =
  Node extends Readonly<{
    readonly fields: infer Fields extends FieldDefinitions;
  }>
    ? Fields
    : Readonly<Record<never, never>>;

type CommandExampleOutputModeContract<
  Command extends string,
  Outputs,
  Example,
> = "outputMode" extends keyof Example
  ? Example extends Readonly<{ readonly outputMode?: infer Mode }>
    ? Exclude<Mode, undefined> extends OutputModeKeys<
        NoInfer<Outputs> extends Readonly<{ readonly modes: infer Modes }>
          ? Modes
          : never
      >
      ? unknown
      : ContractTypeError<
          "invalidCommandExampleOutputMode",
          Readonly<{
            readonly command: Command;
            readonly outputMode: Exclude<Mode, undefined>;
            readonly available: OutputModeKeys<
              NoInfer<Outputs> extends Readonly<{ readonly modes: infer Modes }>
                ? Modes
                : never
            >;
          }>
        >
    : unknown
  : unknown;

type CommandExampleContract<
  Command extends string,
  Example,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Outputs,
> =
  Example extends Readonly<{ readonly input: infer Input }>
    ? Example &
        RejectUnknownProperties<
          Example,
          (typeof definitionPropertyKeys.example)[number]
        > &
        Readonly<{
          readonly input: Input &
            ContractSchemaInput<NoInfer<InputSchema>> &
            RawFieldInput<NoInfer<Fields>> &
            RejectUnknownProperties<
              Input,
              Extract<keyof NoInfer<Fields>, string>
            >;
        }> &
        CommandExampleOutputModeContract<Command, Outputs, Example>
    : ContractTypeError<
        "invalidCommandExampleShape",
        Readonly<{ readonly command: Command; readonly member: "input" }>
      >;

type CommandExamplesContract<
  Command extends string,
  Node,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Outputs,
> =
  Node extends Readonly<{
    readonly examples: infer Examples extends readonly unknown[];
  }>
    ? Readonly<{
        readonly examples: readonly CommandExampleContract<
          Command,
          Examples[number],
          NoInfer<Fields>,
          NoInfer<InputSchema>,
          NoInfer<Outputs>
        >[];
      }>
    : unknown;

/** Normalize an inline callback or a bound command combination to its named mode table. */
type DeclaredNodeOutputs<
  Command extends string,
  InputSchema extends ContractSchema,
  Outputs,
> = Outputs extends (...args: never[]) => infer Declaration
  ? OutputModesFromDeclaration<Command, InputSchema, Declaration>
  : Outputs;

type ExecutableNodeContract<
  Command extends string,
  Node,
  CheckRaw extends boolean = true,
> =
  Node extends Readonly<{
    readonly kind: "command" | "rootCommand";
    readonly input: infer InputSchema extends ContractSchema;
    readonly outputs: infer RawOutputs;
  }>
    ? ExecutableNodeOutputsContract<
        Command,
        Node,
        InputSchema,
        DeclaredNodeOutputs<Command, InputSchema, RawOutputs>,
        CheckRaw
      >
    : never;

type ExecutableNodeOutputsContract<
  Command extends string,
  Node,
  InputSchema extends ContractSchema,
  Outputs,
  CheckRaw extends boolean,
> =
  Outputs extends OutputModesDefinition<Command, InputSchema>
    ? Node extends Readonly<{
        readonly fields: infer Fields extends FieldDefinitions;
      }>
      ? Readonly<{
          readonly fields: CheckedFieldDefinitions<Fields, Command> &
            FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
            FieldIdentityContract<Command, Fields>;
        }> &
          (CheckRaw extends true
            ? RawFieldInputContract<Command, Fields, InputSchema>
            : unknown) &
          CommandExamplesContract<Command, Node, Fields, InputSchema, Outputs>
      : Readonly<{ readonly fields?: never }> &
          (CheckRaw extends true
            ? RootFallbackRawFieldInputContract<
                Command,
                FieldDefinitions,
                InputSchema
              >
            : unknown) &
          CommandExamplesContract<
            Command,
            Node,
            ExampleFields<Node>,
            InputSchema,
            Outputs
          >
    : ContractTypeError<
        "outputModesMustMatchCommand",
        Readonly<{ readonly command: Command }>
      >;

type ExecutableNodesContract<Commands> = {
  [Command in keyof Commands & string]: Commands[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
  }>
    ? ExecutableNodeContract<Command, Commands[Command]>
    : unknown;
};

/* oxlint-disable typescript/no-unnecessary-type-parameters -- Public signature generics participate in nested contract constraints; do not remove them mechanically by occurrence count. */
export interface DefineCli<Dependencies> {
  /** Bind a leaf command and its outputs. Spread the returned record into the command tree. */
  readonly command: <const Command extends string>(
    command: Command,
  ) => DefineCommand<Command, Dependencies>;

  /**
   * Assemble a root group and its bound descendants, or define an executable root.
   * For an executable root the outputs callback receives the root command context
   * and runs once when the contract is defined.
   */
  <
    const Root extends string,
    InputSchema extends ContractSchema,
    const Table extends OutputModeTableDeclaration<
      NoInfer<Root>,
      NoInfer<InputSchema>
    >,
    const Fields extends FieldDefinitions,
    const Node extends object & CommandDefinitionExampleContext,
    const Commands extends Readonly<Record<string, CommandNodeDefinition>>,
    const Definition extends object,
  >(
    definition: Definition &
      ClosedRootDefinition<NoInfer<Definition>> &
      RootCliDefinitionBase<Root> &
      Readonly<{
        readonly commands:
          | (Commands &
              ClosedRootCommands<Commands> &
              ExecutableNodesContract<Commands> &
              Readonly<Record<Root, RootGroupDefinition>>)
          | {
              readonly [Command in Root]: Node &
                Omit<
                  RootCommandDefinition<Command, Dependencies>,
                  "input" | "outputs" | "examples" | "fields"
                > &
                Readonly<{
                  readonly fields?: Fields;
                  readonly input: InputSchema;
                  readonly outputs: (
                    factory: OutputExecutionFactory<
                      NoInfer<Root>,
                      Dependencies,
                      NoInfer<InputSchema>
                    >,
                  ) => Table & OutputModesTypeContract<NoInfer<Table>>;
                }> &
                ExecutableNodeContract<
                  Command,
                  CompiledRootCommands<
                    Command,
                    NoInfer<Node>,
                    NoInfer<Fields>,
                    NoInfer<InputSchema>,
                    NoInfer<Table>
                  >[Command],
                  false
                >;
            };
      }> &
      (Commands extends Readonly<Record<Root, { readonly kind: "rootGroup" }>>
        ? ValidationIntersection<HierarchyUsageValidation<Commands>>
        : ValidationIntersection<
            HierarchyUsageValidation<
              CompiledRootCommands<
                NoInfer<Root>,
                NoInfer<Node>,
                NoInfer<Fields>,
                NoInfer<InputSchema>,
                NoInfer<Table>
              >
            >
          > &
            RootFallbackRawFieldInputContract<
              NoInfer<Root>,
              NoInfer<Fields>,
              NoInfer<InputSchema>
            >),
  ): Commands extends Readonly<Record<Root, { readonly kind: "rootGroup" }>>
    ? CliContract<
        Root,
        Dependencies,
        HierarchyRawInput<Commands>,
        HierarchyResult<Commands>,
        "rootGroup",
        Commands,
        HierarchyUsageConstraintFacts<Commands>
      >
    : CliContract<
        Root,
        Dependencies,
        RootCommandRawInput<
          Root,
          CompiledRootCommands<Root, Node, Fields, InputSchema, Table>
        >,
        OutputModesResult<Root, Table>,
        "rootCommand",
        never,
        RootUsageConstraintFacts<
          Root,
          CompiledRootCommands<Root, Node, Fields, InputSchema, Table>
        >,
        OutputModesFromDeclaration<Root, InputSchema, Table>
      >;
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */

/* oxlint-disable typescript/no-unnecessary-type-parameters -- Public command signatures use generics to connect fields, schemas, results and handlers. */
/** Produce a definition for a named leaf command that spreads into the root contract's `commands`. Its outputs callback runs once at definition time. */
export interface DefineCommand<Command extends string, Dependencies> {
  <
    InputSchema extends ContractSchema,
    const Table extends OutputModeTableDeclaration<
      Command,
      NoInfer<InputSchema>
    >,
    const Fields extends FieldDefinitions,
    const Definition extends object & CommandDefinitionExampleContext,
    const Parent extends string,
  >(
    definition: Definition &
      ClosedCommandDefinition<NoInfer<Definition>, Command> &
      Omit<
        ExecutableCommandDefinition<Command, Dependencies>,
        "kind" | "input" | "outputs" | "examples" | "fields"
      > &
      HierarchyCommandFactsDefinition<Parent> &
      Readonly<{
        readonly fields?: Fields;
        readonly input: InputSchema;
        readonly outputs: (
          factory: OutputExecutionFactory<
            Command,
            Dependencies,
            NoInfer<InputSchema>
          >,
        ) => Table & OutputModesTypeContract<NoInfer<Table>>;
      }> &
      ExecutableNodeContract<
        Command,
        CompiledExecutableNode<
          Command,
          NoInfer<Definition>,
          NoInfer<Fields>,
          NoInfer<InputSchema>,
          NoInfer<Table>,
          "command"
        >
      >,
  ): CommandCombination<
    Command,
    CompiledExecutableNode<
      Command,
      Definition,
      Fields,
      InputSchema,
      Table,
      "command"
    >,
    Parent
  >;
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */

interface RuntimeCompiledCli {
  readonly contract: CliContract;
  readonly root: string;
  readonly usageFailureExitCode: number;
  readonly commands: Readonly<Record<string, RuntimeCompiledCommand>>;
}

interface EncodedCommandExample {
  readonly manifest: CommandExampleManifest;
  readonly rawInput: Readonly<Record<string, unknown>>;
  readonly expectedOutputMode: string;
}

interface PendingCommandExampleValidation {
  readonly command: string;
  readonly input: ContractSchema;
  readonly examples: readonly EncodedCommandExample[];
}

type RuntimeCompiledSuccess =
  | Readonly<{ readonly kind: "completion"; readonly text?: unknown }>
  | Readonly<{
      readonly kind: "data";
      readonly variants: Readonly<Record<string, RuntimeAtomicVariant>>;
    }>
  | Readonly<{
      readonly kind: "stream";
      readonly records: Readonly<Record<string, RuntimeStreamRecord>>;
      readonly text?: unknown;
    }>;

interface RuntimeCompiledResultContract {
  readonly success: RuntimeCompiledSuccess;
  readonly failures: Readonly<Record<string, RuntimeAtomicVariant>>;
  readonly handler: unknown;
}

interface CompiledResultContract {
  readonly runtime: RuntimeCompiledResultContract;
  readonly manifest: Readonly<{
    readonly success: CommandSuccessManifest;
    readonly failures: Readonly<Record<string, FailureVariantManifest>>;
  }>;
  readonly wire: OutputModeWireManifest;
}

interface RuntimeCompiledOutputMode {
  readonly id: string;
  readonly description: string;
  readonly delivery: OutputDelivery;
  readonly format: OutputFormat;
  readonly resultContract: RuntimeCompiledResultContract;
}

interface RuntimeOutputModeDefinition {
  readonly delivery: OutputDelivery;
  readonly description: string;
  readonly format: OutputFormat;
  readonly success: RuntimeCompiledSuccess;
  readonly failures: FailureVariantDefinitions;
  readonly handler: unknown;
}

interface RuntimeOutputModesDefinition {
  readonly default: string;
  readonly modes: Readonly<Record<string, RuntimeOutputModeDefinition>>;
}

interface RuntimeCompiledCommandBase {
  readonly id: string;
  readonly parent?: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly usage: CommandUsage<string>;
}

interface RuntimeCompiledGroup extends RuntimeCompiledCommandBase {
  readonly kind: "commandGroup" | "rootGroup";
}

export interface RuntimeCompiledExecutable extends RuntimeCompiledCommandBase {
  readonly kind: "command" | "rootCommand";
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints: readonly UsageConstraintGrammar[];
  readonly input: ContractSchema;
  readonly defaultOutputMode: string;
  readonly outputModes: Readonly<Record<string, RuntimeCompiledOutputMode>>;
  readonly examples?: readonly CommandExampleManifest[];
}

type RuntimeCompiledCommand = RuntimeCompiledGroup | RuntimeCompiledExecutable;

export function isCompiledExecutable(
  command: RuntimeCompiledCommand,
): command is RuntimeCompiledExecutable {
  return command.kind === "rootCommand" || command.kind === "command";
}

type RuntimeExecutableDefinition = Readonly<{
  readonly kind: "command" | "rootCommand";
  readonly parent?: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly usageConstraints?: readonly UsageConstraint[];
  readonly fields?: FieldDefinitions;
  readonly input: ContractSchema;
  readonly outputs: RuntimeOutputModesDefinition;
  readonly examples?: readonly CommandExampleDefinition[];
}>;

type RuntimeGroupDefinition = Readonly<{
  readonly kind: "commandGroup" | "rootGroup";
  readonly parent?: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: TextLines;
}>;

type RuntimeCommandDefinition =
  | RuntimeExecutableDefinition
  | RuntimeGroupDefinition;

type RuntimeCliDefinition = RootCliDefinitionBase<string> &
  Readonly<{
    readonly commands: Readonly<Record<string, RuntimeCommandDefinition>>;
  }>;

/**
 * Assemble help for the whole tree explicitly. `headings` are optional section
 * titles; `wording` supplies the templates required by the help facts that actually
 * appear, with completeness checked by defineCli. The core generates no default
 * natural language.
 */
export function helpCapability<
  const Definition extends HelpCapabilityDefinitionForTypeCheck =
    HelpCapabilityDefinition,
>(
  definition?: Definition &
    RejectUnknownProperties<
      Definition,
      (typeof definitionPropertyKeys.capability.help)[number]
    > &
    (Definition extends Readonly<{ readonly headings: infer Headings }>
      ? Readonly<{
          readonly headings: RejectUnknownProperties<
            Headings,
            keyof HelpHeadings
          >;
        }>
      : unknown) &
    HelpCapabilityTemplateContract<Definition>,
): HelpCapability;
export function helpCapability(
  definition: HelpCapabilityDefinition = {},
): HelpCapability {
  assertKnownCapabilityOptions(
    definition,
    definitionPropertyKeys.capability.help,
    "help",
  );
  if (definition.shortAlias !== undefined && definition.shortAlias !== "-h") {
    throw new TypeError("The help short alias must be -h");
  }
  const copiedWording =
    definition.wording === undefined
      ? undefined
      : copyHelpFactWording(definition.wording);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- helpCapability is issued by this factory and registered in the WeakSet; the type brand is not emitted at runtime.
  const capability = Object.freeze({
    kind: "helpCapability" as const,
    longOption: "--help" as const,
    ...(definition.shortAlias === undefined
      ? {}
      : { shortAlias: definition.shortAlias }),
    ...(definition.headings === undefined
      ? {}
      : { headings: copyHelpHeadings(definition.headings) }),
    ...(copiedWording === undefined ? {} : { wording: copiedWording.wording }),
  }) as HelpCapability;
  helpCapabilities.add(capability);
  if (copiedWording !== undefined && copiedWording.invalidValues.size > 0) {
    invalidHelpFactWordingValues.set(capability, copiedWording.invalidValues);
  }
  return capability;
}

function copyHelpHeadings(value: unknown): HelpHeadings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Help headings must be an object");
  }
  const allowed = new Set([
    "usage",
    "commands",
    "arguments",
    "options",
    "constraints",
    "schema",
    "examples",
    "supplement",
  ]);
  const headings: Record<string, string> = {};
  for (const [key, heading] of Object.entries(value)) {
    if (!allowed.has(key))
      throw new TypeError("Help headings contain an unknown section");
    headings[key] = copySingleLineText(heading, `Help heading ${key}`);
  }
  return Object.freeze(headings);
}

function copyHelpFactWording(value: unknown): Readonly<{
  readonly wording: HelpFactWording;
  readonly invalidValues: ReadonlyMap<string, unknown>;
}> {
  if (!isPlainRecord(value)) {
    throw new TypeError("Help fact wording must be an object");
  }
  const wording: Record<string, string> = {};
  const invalidValues = new Map<string, unknown>();
  const unknownSlotIssues: ContractDefinitionIssue[] = [];
  for (const [slot, raw] of Object.entries(value)) {
    if (!isHelpTemplateSlot(slot)) {
      unknownSlotIssues.push({
        code: "unknownDefinitionProperty",
        path: ["help", "wording", slot],
      });
      continue;
    }
    if (typeof raw === "string") {
      wording[slot] = raw;
    } else {
      invalidValues.set(slot, raw);
      wording[slot] = "";
    }
  }
  const [firstUnknownSlotIssue, ...otherUnknownSlotIssues] = unknownSlotIssues;
  if (firstUnknownSlotIssue !== undefined) {
    const templateIssues: ContractDefinitionIssue[] = [];
    collectHelpFactTemplateIssues(wording, templateIssues, invalidValues);
    throw new ContractDefinitionError([
      firstUnknownSlotIssue,
      ...otherUnknownSlotIssues,
      ...templateIssues,
    ]);
  }
  return Object.freeze({
    wording: Object.freeze(wording),
    invalidValues,
  });
}

function isHelpTemplateSlot(
  slot: string,
): slot is keyof typeof helpTemplateSpecifications {
  return Object.hasOwn(helpTemplateSpecifications, slot);
}

function collectHelpFactTemplateIssues(
  wording: HelpFactWording,
  issues: ContractDefinitionIssue[],
  invalidValues: ReadonlyMap<string, unknown> = new Map(),
): void {
  for (const [slot, template] of Object.entries(wording)) {
    if (!isHelpTemplateSlot(slot)) continue;
    const path = ["help", "wording", slot];
    let reason: "singleLine" | "empty" | "placeholder" | undefined;
    if (invalidValues.has(slot) || !isSingleLineText(template)) {
      reason = "singleLine";
    } else if (template.trim().length === 0) {
      reason = "empty";
    } else {
      const allowed = new Set<string>(
        helpTemplateSpecifications[slot].placeholders,
      );
      const placeholders = [
        ...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g),
      ].map((match) => match[1] ?? "");
      const outside = template.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, "");
      if (
        outside.includes("{") ||
        outside.includes("}") ||
        placeholders.some((placeholder) => !allowed.has(placeholder)) ||
        [...allowed].some(
          (placeholder) => !placeholders.includes(placeholder),
        ) ||
        (slot === "commandPlaceholder" &&
          (template.includes("<") || template.includes(">")))
      ) {
        reason = "placeholder";
      }
    }
    if (reason !== undefined) {
      issues.push({
        code: "invalidHelpFactTemplate",
        path,
        slot,
        received: invalidValues.has(slot) ? invalidValues.get(slot) : template,
        reason,
      });
    }
  }
}

/**
 * Assemble the eager version request on the root contract explicitly; it covers the
 * whole command tree automatically. `value` and the optional `description` are owned
 * by the consumer; the core only registers the fixed spelling, projects help and
 * writes the value. It reads no package metadata, adds no prefix or default
 * description, and never treats the version as command input.
 */
export function versionCapability<
  const Definition extends VersionCapabilityDefinition,
>(
  definition: Definition &
    RejectUnknownProperties<
      Definition,
      (typeof definitionPropertyKeys.capability.version)[number]
    >,
): VersionCapability {
  assertKnownCapabilityOptions(
    definition,
    definitionPropertyKeys.capability.version,
    "version",
  );
  const value = copyTextLine(definition.value, "Version value");
  const description =
    definition.description === undefined
      ? undefined
      : copySingleLineText(definition.description, "Version description");
  if (definition.shortAlias !== undefined && definition.shortAlias !== "-V") {
    throw new TypeError("The version short alias must be -V");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- versionCapability is issued by this factory and registered in the WeakSet; the type brand is not emitted at runtime.
  const capability = Object.freeze({
    kind: "versionCapability" as const,
    value,
    ...(description === undefined ? {} : { description }),
    ...(definition.shortAlias === undefined
      ? {}
      : { shortAlias: definition.shortAlias }),
  }) as VersionCapability;
  versionCapabilities.add(capability);
  return capability;
}

/**
 * Assemble contract discovery for the whole tree on the root contract explicitly.
 * The author supplies the description once; the core owns query facts, help and responses.
 */
export function schemaCapability<
  const Definition extends SchemaCapabilityDefinition,
>(
  definition: Definition &
    RejectUnknownProperties<
      Definition,
      (typeof definitionPropertyKeys.capability.schema)[number]
    >,
): SchemaCapability {
  assertKnownCapabilityOptions(
    definition,
    definitionPropertyKeys.capability.schema,
    "schema",
  );
  const description = copyTextLine(
    definition.description,
    "Schema description",
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- schemaCapability is issued by this factory and registered in the WeakSet.
  const capability = Object.freeze({
    kind: "schemaCapability" as const,
    longOption: "--schema" as const,
    description,
  }) as SchemaCapability;
  schemaCapabilities.add(capability);
  return capability;
}

function copyTextLine(value: unknown, label: string): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    value.kind !== "line" ||
    !("value" in value)
  ) {
    throw new TypeError(`${label} must be a text.line projection`);
  }
  return copySingleLineText(value.value, label);
}

function compileHelpSupplement(
  command: string,
  value: unknown,
  issues: ContractDefinitionIssue[],
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!isIssuedTextProjection(value) || value.kind !== "lines") {
    issues.push({ code: "invalidHelpSupplement", command });
    return undefined;
  }
  return deepFreeze([...value.lines]);
}

function compileControls(definition: RuntimeCliDefinition) {
  const version = isVersionCapability(definition.version)
    ? definition.version
    : undefined;
  const schema = isSchemaCapability(definition.schema)
    ? definition.schema
    : undefined;
  return deepFreeze({
    help: {
      longOption: definition.help.longOption,
      ...(definition.help.shortAlias === undefined
        ? {}
        : { shortAlias: definition.help.shortAlias }),
      ...(definition.help.headings === undefined
        ? {}
        : { headings: definition.help.headings }),
      ...(definition.help.wording === undefined
        ? {}
        : { wording: definition.help.wording }),
    },
    ...(version === undefined
      ? {}
      : {
          version: {
            longOption: "--version" as const,
            ...(version.shortAlias === undefined
              ? {}
              : { shortAlias: version.shortAlias }),
            value: version.value,
            ...(version.description === undefined
              ? {}
              : { description: version.description }),
          },
        }),
    ...(schema === undefined
      ? {}
      : {
          schema: {
            longOption: "--schema" as const,
            description: schema.description,
          },
        }),
  });
}

function assertKnownCapabilityOptions(
  definition: object,
  allowed: readonly string[],
  capability: string,
): void {
  for (const property of Object.keys(definition)) {
    if (!allowed.includes(property)) {
      throw new TypeError(
        `The ${capability} capability contains an unknown property ${property}`,
      );
    }
  }
}

/**
 * Define a closed CLI contract. Each executable command declares named output modes
 * and their result projections. Dynamic declarations still report
 * `ContractDefinitionError` at definition time; that is no substitute for type
 * checking statically decidable declarations.
 * @see {@link https://github.com/YKDZ/cli-contract/tree/main/packages/example | End-to-end example}
 */
export function defineCli<Dependencies = undefined>(): DefineCli<Dependencies> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The public generic definition interface is implemented by this runtime compilation entry; type parameters only constrain callers.
  const define = ((definition: RuntimeCliAuthoring) =>
    compileCli(definition)) as unknown as DefineCli<Dependencies>;
  Object.defineProperty(define, "command", {
    configurable: true,
    value: (command: string) => (definition: RuntimeExecutableAuthoring) => {
      const node = Object.freeze(bindCommandOutputs(command, definition));
      boundCommandNodes.set(node, node);
      return Object.freeze({ [command]: node });
    },
  });
  return define;
}

type RuntimeExecution = Readonly<{
  readonly structured: (options: unknown) => object;
  readonly text: (options: unknown) => object;
}>;

type RuntimeOutputFactory = Readonly<{
  readonly atomic: (declaration: unknown) => RuntimeExecution;
  readonly stream: (declaration: unknown) => RuntimeExecution;
}>;

function captureResultTable(table: unknown): unknown {
  if (!isPlainRecord(table)) return table;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(table).map(([name, definition]) => [
        name,
        isPlainRecord(definition)
          ? Object.freeze({ ...definition })
          : definition,
      ]),
    ),
  );
}

/**
 * Capture one execution's handler and result definition when it is declared, so
 * edits made between two derivations cannot split their results or exit codes.
 * Only the plain authoring records are copied and frozen: a structured mode
 * exposes these framework-owned snapshots, so writing back through them is
 * rejected. Schemas, handlers and every other author value keep the identity
 * the author gave them and are never frozen.
 */
function captureExecutionDeclaration(
  declaration: unknown,
  delivery: OutputDelivery,
): unknown {
  if (!isPlainRecord(declaration)) return declaration;
  const captured: Record<string, unknown> = { ...declaration };
  if (Object.hasOwn(captured, "failures")) {
    captured.failures = captureResultTable(captured.failures);
  }
  if (delivery === "stream") {
    if (Object.hasOwn(captured, "records")) {
      captured.records = captureResultTable(captured.records);
    }
    return Object.freeze(captured);
  }
  const success = captured.success;
  if (isPlainRecord(success)) {
    captured.success = Object.freeze(
      Object.hasOwn(success, "variants")
        ? { ...success, variants: captureResultTable(success.variants) }
        : { ...success },
    );
  }
  return Object.freeze(captured);
}

/**
 * Read each presentation property at most once, on demand. The key checks and
 * the expansion have to work from the same material, and a presentation that
 * fails the checks must not be expanded.
 */
function capturePresentation(presentation: unknown): unknown {
  if (!isPlainRecord(presentation)) return presentation;
  const source = presentation;
  const reads = new Map<string, unknown>();
  const captured = {};
  for (const key of Object.keys(source)) {
    Object.defineProperty(captured, key, {
      enumerable: true,
      get: () => {
        if (!reads.has(key)) reads.set(key, Reflect.get(source, key));
        return reads.get(key);
      },
    });
  }
  return captured;
}

function presentVariants(definitions: unknown, presenters: unknown): unknown {
  if (!isPlainRecord(definitions)) return definitions;
  const table = isPlainRecord(presenters) ? presenters : {};
  // Assigning a variant named __proto__ would move it to the prototype and hide
  // it from the naming checks, so define every entry as an own property.
  return Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([name, definition]) => [
        name,
        isPlainRecord(definition)
          ? Object.freeze({
              ...definition,
              text: Object.hasOwn(table, name) ? table[name] : undefined,
            })
          : definition,
      ]),
    ),
  );
}

function buildOutputMode(
  declaration: unknown,
  presentation: unknown,
  delivery: OutputDelivery,
  format: OutputFormat,
): object {
  const source = isPlainRecord(declaration) ? declaration : {};
  const options = isPlainRecord(presentation) ? presentation : {};
  const failures =
    format === "text"
      ? presentVariants(source.failures, options.failures)
      : source.failures;
  if (delivery === "stream") {
    return Object.freeze({
      delivery,
      description: options.description,
      format,
      success: Object.freeze({
        kind: "stream" as const,
        records:
          format === "text"
            ? presentVariants(source.records, options.records)
            : source.records,
        ...(format === "text" ? { text: options.terminal } : {}),
      }),
      failures,
      handler: source.handler,
    });
  }
  const success: unknown = source.success;
  const presented =
    format === "text" && isPlainRecord(success)
      ? success.kind === "completion"
        ? Object.freeze({ ...success, text: options.success })
        : Object.freeze({
            ...success,
            variants: presentVariants(success.variants, options.success),
          })
      : success;
  return Object.freeze({
    delivery,
    description: options.description,
    format,
    success: presented,
    failures,
    handler: source.handler,
  });
}

/**
 * Use a fresh binding for every command construction, including commands with
 * identical names and schemas. Every derived mode keeps its execution’s binding.
 */
function invokeOutputCallback(
  command: string,
  input: ContractSchema,
  callback: (factory: RuntimeOutputFactory) => unknown,
): RuntimeOutputModesDefinition {
  const binding = {};
  const createExecution = (
    declaration: unknown,
    delivery: OutputDelivery,
  ): RuntimeExecution => {
    // Validate the declaration's own keys once, before reading any value: a key
    // added or removed after atomic() must not change a later derivation, and
    // an unknown getter must not be evaluated by the snapshot spread.
    const declarationIssues: OutputAuthoringIssue[] = [];
    collectUnknownOwnProperties(
      declaration,
      [],
      delivery === "atomic"
        ? ["success", "failures", "handler"]
        : ["records", "failures", "handler"],
      declarationIssues,
    );
    const captured =
      declarationIssues.length === 0
        ? captureExecutionDeclaration(declaration, delivery)
        : undefined;
    const issueMode = (presentation: unknown, format: OutputFormat) => {
      // Copy the fixed declaration issues, then check the options' own keys
      // before capturing their values. Paths stay relative to the mode name.
      const authoringIssues: OutputAuthoringIssue[] = [...declarationIssues];
      collectUnknownOwnProperties(
        presentation,
        [],
        format === "structured"
          ? ["description"]
          : delivery === "atomic"
            ? ["description", "success", "failures"]
            : ["description", "records", "failures", "terminal"],
        authoringIssues,
      );
      let mode: object = Object.freeze({});
      if (authoringIssues.length === 0) {
        const material = capturePresentation(presentation);
        collectOutputAuthoringProperties(
          { declaration: captured, presentation: material, delivery, format },
          authoringIssues,
        );
        if (authoringIssues.length === 0) {
          mode = buildOutputMode(captured, material, delivery, format);
        }
      }
      outputModeDefinitions.add(mode);
      outputModeDefinitionMetadata.set(mode, {
        command,
        input,
        binding,
        authoringIssues,
      });
      return mode;
    };
    return Object.freeze({
      structured: (options: unknown) => issueMode(options, "structured"),
      text: (options: unknown) => issueMode(options, "text"),
    });
  };
  const declared: unknown = callback({
    atomic: (declaration) => createExecution(declaration, "atomic"),
    stream: (declaration) => createExecution(declaration, "stream"),
  });
  const record = isPlainRecord(declared) ? declared : {};
  const authoringIssues: OutputAuthoringIssue[] = [];
  collectUnknownOwnProperties(
    record,
    ["commands", command, "outputs"],
    definitionPropertyKeys.outputModes,
    authoringIssues,
  );
  const declaredModes = Object.hasOwn(record, "modes")
    ? record.modes
    : undefined;
  const modes = isPlainRecord(declaredModes) ? declaredModes : {};
  const modeNames = Object.keys(modes);
  const hasDefault = Object.hasOwn(record, "default");
  const table = Object.freeze({
    ...(hasDefault
      ? { default: Reflect.get(record, "default") }
      : modeNames.length === 1
        ? { default: modeNames[0] }
        : {}),
    modes: Object.freeze({ ...modes }),
  });
  outputModes.add(table);
  outputModeMetadata.set(table, { command, input, binding, authoringIssues });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- compileOutputModes validates dynamic entries and emits definition issues.
  return table as unknown as RuntimeOutputModesDefinition;
}

type RuntimeExecutableAuthoring = Omit<
  RuntimeExecutableDefinition,
  "outputs"
> & {
  readonly outputs:
    | RuntimeOutputModesDefinition
    | ((factory: RuntimeOutputFactory) => unknown);
};

function bindCommandOutputs(
  command: string,
  node: RuntimeExecutableAuthoring,
): RuntimeExecutableDefinition {
  const { outputs } = node;
  if (typeof outputs === "function") {
    return {
      ...node,
      outputs: invokeOutputCallback(command, node.input, outputs),
    };
  }
  if (outputModes.has(outputs)) {
    throw new ContractDefinitionError([
      { code: "invalidOutputModes", command, reason: "mismatchedBinding" },
    ]);
  }
  return { ...node, outputs };
}

type RuntimeCliAuthoring = Omit<RuntimeCliDefinition, "commands"> & {
  readonly commands: Readonly<
    Record<string, RuntimeExecutableAuthoring | RuntimeGroupDefinition>
  >;
};

function expandOutputDeclarations(
  definition: RuntimeCliAuthoring,
): RuntimeCliDefinition {
  const commands = Object.fromEntries(
    Object.entries(definition.commands).map(([id, node]) => {
      switch (node.kind) {
        case "command":
        case "rootCommand":
          return [
            id,
            boundCommandNodes.get(node) ?? bindCommandOutputs(id, node),
          ] as const;
        default:
          return [id, node] as const;
      }
    }),
  );
  return { ...definition, commands };
}

function compileCli(raw: RuntimeCliAuthoring): CliContract {
  const issues: ContractDefinitionIssue[] = [];
  const definition = expandOutputDeclarations(raw);
  collectUnknownDefinitionProperties(definition, issues);
  const isHierarchy =
    definition.commands[definition.root]?.kind === "rootGroup";
  const helpWording = helpCapabilities.has(definition.help)
    ? definition.help.wording
    : undefined;
  if (helpWording !== undefined) {
    collectHelpFactTemplateIssues(
      helpWording,
      issues,
      invalidHelpFactWordingValues.get(definition.help),
    );
  }
  let orderedIds: readonly string[];
  if (isHierarchy) {
    collectCliBaseIssues(definition, issues);
    orderedIds = orderHierarchy(definition, issues);
    if (helpWording?.commandPlaceholder === undefined) {
      reportMissingHelpFactTemplate(
        issues,
        definition.root,
        "commandPlaceholder",
      );
    }
  } else {
    orderedIds =
      collectRootDefinitionIssues(definition, issues) === undefined
        ? []
        : [definition.root];
  }
  if (isHierarchy && hasUnsafeCommandHierarchyIssue(issues)) {
    throw new ContractDefinitionError(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- issues.length was checked positive; the dynamic array regains its non-empty tuple type here.
      issues as [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
    );
  }

  const runtimeCommands: Record<string, RuntimeCompiledCommand> = {};
  const grammarNodes: CommandGrammar[] = [];
  const manifestCommands: Record<
    string,
    RootCommandManifest | CommandGroupManifest | ExecutableCommandManifest
  > = {};
  const wire: Record<string, CommandWireManifest> = {};
  const examplesToValidate: PendingCommandExampleValidation[] = [];

  for (const id of orderedIds) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- orderedIds comes from validated command keys or the root key.
    const node = definition.commands[id] as RuntimeCommandDefinition;
    const aliases = Object.freeze([...(node.aliases ?? [])]);
    const helpSupplement = compileHelpSupplement(
      id,
      node.helpSupplement,
      issues,
    );
    if (node.kind === "rootGroup" || node.kind === "commandGroup") {
      const usage = deepFreeze({
        command: id,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The hierarchy contract checked commandPlaceholder as required before entering the loop.
        synopsis: `${commandPath(id, definition.commands)} <${helpWording?.commandPlaceholder as string}>`,
      });
      const compiledNode: RuntimeCompiledCommand = {
        id,
        kind: node.kind,
        ...(node.parent === undefined ? {} : { parent: node.parent }),
        name: node.name,
        aliases,
        description: node.description,
        ...(helpSupplement === undefined ? {} : { helpSupplement }),
        usage,
      };
      runtimeCommands[id] = compiledNode;
      if (id !== definition.root) {
        grammarNodes.push(
          deepFreeze({
            kind: "commandGroup" as const,
            id,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The parent of a non-root command group was confirmed by the hierarchy definition checks.
            parent: node.parent as string,
            name: node.name,
            aliases,
            description: node.description,
            ...(helpSupplement === undefined ? {} : { helpSupplement }),
            usage,
          }),
        );
      }
      manifestCommands[id] = deepFreeze({
        kind: node.kind,
        ...(node.parent === undefined ? {} : { parent: node.parent }),
        name: node.name,
        aliases,
        description: node.description,
        ...(helpSupplement === undefined ? {} : { helpSupplement }),
      });
      continue;
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command-group branch already continued to the next iteration; remaining nodes compile as executable definitions.
    const executable = node as RuntimeExecutableDefinition;
    const input = compileContractSchema(
      executable.input,
      { command: id, location: "input" },
      issues,
    );
    const compiledOutputs = compileOutputModes(
      id,
      executable.input,
      executable.outputs,
      issues,
    );
    const fields =
      input === undefined
        ? []
        : compileInputFields(
            executable.fields ?? {},
            input.inputSchema,
            id,
            issues,
          );
    const compiledExamples = compileCommandExamples(
      id,
      executable.examples,
      fields,
      commandPathTokens(id, definition.commands),
      compiledOutputs.default,
      compiledOutputs.runtime,
      issues,
    );
    const manifestExamples =
      compiledExamples === undefined
        ? undefined
        : Object.freeze(
            compiledExamples.map(({ manifest: example }) => example),
          );
    if (compiledExamples !== undefined) {
      examplesToValidate.push({
        command: id,
        input: executable.input,
        examples: compiledExamples,
      });
    }
    if (Object.keys(compiledOutputs.runtime).length > 0) {
      if (helpWording?.choices === undefined) {
        reportMissingHelpFactTemplate(issues, id, "choices");
      }
      if (helpWording?.default === undefined) {
        reportMissingHelpFactTemplate(issues, id, "default");
      }
    }
    if (
      fields.some((field) => field.choices !== undefined) &&
      helpWording?.choices === undefined
    ) {
      reportMissingHelpFactTemplate(issues, id, "choices");
    }
    if (
      fields.some((field) => field.default !== undefined) &&
      helpWording?.default === undefined
    ) {
      reportMissingHelpFactTemplate(issues, id, "default");
    }
    const describedInput =
      input === undefined ? undefined : projectFieldDescriptions(input, fields);
    collectControlFieldConflicts(id, fields, definition, issues);
    const usageCompilation = compileUsageConstraints(
      executable.usageConstraints === undefined
        ? []
        : executable.usageConstraints,
      fields,
      id,
      issues,
      describedInput,
    );
    const usageConstraints = usageCompilation.constraints;
    for (const slot of usageCompilation.requiredHelpTemplates) {
      if (helpWording?.[slot] === undefined) {
        reportMissingHelpFactTemplate(issues, id, slot);
      }
    }
    const usage = deepFreeze({
      command: id,
      synopsis: createUsageSynopsis(
        commandPath(id, definition.commands),
        fields,
        true,
      ),
    });
    runtimeCommands[id] = Object.freeze({
      id,
      kind: executable.kind,
      ...(executable.parent === undefined ? {} : { parent: executable.parent }),
      name: executable.name,
      aliases,
      description: executable.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      fields,
      usageConstraints,
      usage,
      input: executable.input,
      defaultOutputMode: compiledOutputs.default,
      outputModes: compiledOutputs.runtime,
      ...(manifestExamples === undefined ? {} : { examples: manifestExamples }),
    });
    if (executable.kind === "command") {
      grammarNodes.push(
        deepFreeze({
          kind: "command" as const,
          id,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- When kind is command, the hierarchy definition checks confirmed parent.
          parent: executable.parent as string,
          name: executable.name,
          aliases,
          description: executable.description,
          ...(helpSupplement === undefined ? {} : { helpSupplement }),
          fields,
          ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
          outputs: compiledOutputs.grammar,
          usage,
        }),
      );
    }
    if (usageCompilation.inputProjection === undefined) continue;
    const manifestDetails = {
      description: executable.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      ...(manifestExamples === undefined ? {} : { examples: manifestExamples }),
      fields,
      ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
      input: usageCompilation.inputProjection,
      outputs: compiledOutputs.manifest,
    };
    manifestCommands[id] =
      executable.kind === "command"
        ? deepFreeze({
            kind: "command" as const,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- When kind is command, the hierarchy definition checks confirmed parent.
            parent: executable.parent as string,
            name: executable.name,
            aliases,
            ...manifestDetails,
          })
        : deepFreeze({
            kind: "rootCommand" as const,
            name: executable.name,
            ...manifestDetails,
          });
    wire[id] = compiledOutputs.wire;
  }
  if (issues.length > 0)
    throw new ContractDefinitionError(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- issues.length was checked positive; the dynamic array regains its non-empty tuple type here.
      issues as [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
    );

  const controls = compileControls(definition);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- After the definition checks pass, the root command was written into the map by the compilation loop.
  const rootCommand = runtimeCommands[
    definition.root
  ] as RuntimeCompiledCommand;
  const rootGrammar = isCompiledExecutable(rootCommand)
    ? {
        kind: "rootCommand" as const,
        id: rootCommand.id,
        name: rootCommand.name,
        description: rootCommand.description,
        ...(rootCommand.helpSupplement === undefined
          ? {}
          : { helpSupplement: rootCommand.helpSupplement }),
        fields: rootCommand.fields,
        ...(rootCommand.usageConstraints.length === 0
          ? {}
          : { usageConstraints: rootCommand.usageConstraints }),
        outputs: outputModesGrammar(
          rootCommand.outputModes,
          rootCommand.defaultOutputMode,
        ),
        usage: rootCommand.usage,
      }
    : {
        kind: "rootGroup" as const,
        id: rootCommand.id,
        name: rootCommand.name,
        aliases: rootCommand.aliases,
        description: rootCommand.description,
        ...(rootCommand.helpSupplement === undefined
          ? {}
          : { helpSupplement: rootCommand.helpSupplement }),
        usage: rootCommand.usage,
      };
  const grammar = deepFreeze({
    root: rootGrammar,
    nodes: grammarNodes,
    controls,
  });
  const manifest = deepFreeze({
    schemaVersion: "5" as const,
    root: definition.root,
    commands: manifestCommands,
    controls,
    usageFailure: {
      exitCode: definition.usageFailureExitCode,
      wire: createUsageFailureWireSchema(
        Object.values(runtimeCommands).map((command) => ({
          command: command.id,
          usage: command.usage.synopsis,
          helpArgv: usageFailureHelpArgv(runtimeCommands, command.id),
        })),
      ),
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The root command's wire was written into the map by the same compilation loop.
    wire: isHierarchy ? wire : (wire[definition.root] as CommandWireManifest),
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The contract type brand is issued by the compiler and registered in compiledCliContracts.
  const contract = Object.freeze({
    grammar,
    manifest,
  }) as unknown as CliContract;
  compiledCliContracts.set(contract, {
    contract,
    root: definition.root,
    usageFailureExitCode: definition.usageFailureExitCode,
    commands: deepFreeze(runtimeCommands),
  });
  validateCommandExamples(contract, examplesToValidate, issues);
  if (issues.length > 0) {
    compiledCliContracts.delete(contract);
    throw new ContractDefinitionError(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- issues.length was checked positive.
      issues as [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
    );
  }
  return contract;
}

function compileCommandExamples(
  command: string,
  examples: unknown,
  fields: readonly FieldGrammar[],
  pathTokens: readonly string[],
  defaultOutputMode: string,
  availableModes: Readonly<Record<string, RuntimeCompiledOutputMode>>,
  issues: ContractDefinitionIssue[],
): readonly EncodedCommandExample[] | undefined {
  if (examples === undefined) return undefined;
  if (!Array.isArray(examples)) {
    issues.push({
      code: "invalidCommandExample",
      command,
      index: 0,
      reason: "invalidShape",
    });
    return undefined;
  }
  if (examples.length === 0) return undefined;

  const encoded: EncodedCommandExample[] = [];
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  examples.forEach((example, index) => {
    if (!isPlainRecord(example)) {
      issues.push({
        code: "invalidCommandExample",
        command,
        index,
        reason: "invalidShape",
      });
      return;
    }
    const inputDescriptor = Object.getOwnPropertyDescriptor(example, "input");
    if (
      inputDescriptor === undefined ||
      !("value" in inputDescriptor) ||
      !isPlainRecord(inputDescriptor.value)
    ) {
      issues.push({
        code: "invalidCommandExample",
        command,
        index,
        reason: "invalidShape",
      });
      return;
    }

    const rawInput: Record<string, unknown> = Object.create(null);
    for (const fieldKey of Reflect.ownKeys(inputDescriptor.value)) {
      if (typeof fieldKey !== "string" || !fieldByKey.has(fieldKey)) {
        issues.push({
          code: "invalidCommandExample",
          command,
          index,
          reason: "unknownField",
          field: String(fieldKey),
        });
        return;
      }
      const valueDescriptor = Object.getOwnPropertyDescriptor(
        inputDescriptor.value,
        fieldKey,
      );
      if (valueDescriptor === undefined || !("value" in valueDescriptor)) {
        issues.push({
          code: "invalidCommandExample",
          command,
          index,
          reason: "unencodableFieldValue",
          field: fieldKey,
        });
        return;
      }
      rawInput[fieldKey] = valueDescriptor.value;
    }

    const hasFixedOutputMode = Object.hasOwn(example, "outputMode");
    const outputModeDescriptor = hasFixedOutputMode
      ? Object.getOwnPropertyDescriptor(example, "outputMode")
      : undefined;
    const outputModeValue =
      outputModeDescriptor !== undefined && "value" in outputModeDescriptor
        ? outputModeDescriptor.value
        : undefined;
    if (
      hasFixedOutputMode &&
      (typeof outputModeValue !== "string" ||
        !Object.hasOwn(availableModes, outputModeValue))
    ) {
      issues.push({
        code: "invalidCommandExample",
        command,
        index,
        reason: "invalidOutputMode",
        received:
          typeof outputModeValue === "string"
            ? outputModeValue
            : String(outputModeValue),
      });
      return;
    }
    const fixedOutputMode =
      hasFixedOutputMode && typeof outputModeValue === "string"
        ? outputModeValue
        : undefined;
    const expectedOutputMode = fixedOutputMode ?? defaultOutputMode;
    const encodedFields = encodeCommandExampleFields(
      command,
      index,
      rawInput,
      fields,
      issues,
    );
    if (encodedFields === undefined) return;

    const outputSelector =
      fixedOutputMode !== undefined ? [`--output=${fixedOutputMode}`] : [];
    const argv = Object.freeze([
      ...pathTokens.slice(1),
      ...outputSelector,
      ...encodedFields.options,
      ...(encodedFields.positionals.length === 0
        ? []
        : ["--", ...encodedFields.positionals]),
    ]);
    const shellTokens = [
      ...pathTokens,
      ...outputSelector,
      ...encodedFields.options,
    ];
    if (encodedFields.positionals.length > 0) {
      shellTokens.push("--", ...encodedFields.positionals);
    }
    if (shellTokens.some((token) => !isPosixArgvToken(token))) {
      issues.push({
        code: "invalidCommandExample",
        command,
        index,
        reason: "unencodableFieldValue",
      });
      return;
    }
    const manifest: CommandExampleManifest = deepFreeze({
      argv,
      shell: shellTokens.map(quotePosixShellToken).join(" "),
      ...(fixedOutputMode === undefined ? {} : { outputMode: fixedOutputMode }),
    });
    encoded.push({
      manifest,
      rawInput: Object.freeze(rawInput),
      expectedOutputMode,
    });
  });
  return encoded.length === 0 ? undefined : Object.freeze(encoded);
}

function encodeCommandExampleFields(
  command: string,
  index: number,
  rawInput: Readonly<Record<string, unknown>>,
  fields: readonly FieldGrammar[],
  issues: ContractDefinitionIssue[],
):
  | Readonly<{
      readonly options: readonly string[];
      readonly positionals: readonly string[];
    }>
  | undefined {
  const options: string[] = [];
  const positionals: string[] = [];
  for (const field of fields) {
    if (!Object.hasOwn(rawInput, field.key)) continue;
    const value = rawInput[field.key];
    if (field.kind === "flag") {
      if (value === true) {
        options.push(field.longOption);
      } else if (value === false && field.negatedLongOption !== undefined) {
        options.push(field.negatedLongOption);
      } else {
        reportUnencodableCommandExampleField(issues, command, index, field.key);
        return undefined;
      }
      continue;
    }
    if (field.kind === "valueOption") {
      if (typeof value !== "string" || !isPosixArgvToken(value)) {
        reportUnencodableCommandExampleField(issues, command, index, field.key);
        return undefined;
      }
      options.push(`${field.longOption}=${value}`);
      continue;
    }
    if (field.kind === "repeatableOption") {
      if (!isNonEmptyStringArray(value)) {
        reportUnencodableCommandExampleField(issues, command, index, field.key);
        return undefined;
      }
      for (const item of value) {
        if (!isPosixArgvToken(item)) {
          reportUnencodableCommandExampleField(
            issues,
            command,
            index,
            field.key,
          );
          return undefined;
        }
        options.push(`${field.longOption}=${item}`);
      }
      continue;
    }
    if (field.kind === "positional") {
      if (typeof value !== "string" || !isPosixArgvToken(value)) {
        reportUnencodableCommandExampleField(issues, command, index, field.key);
        return undefined;
      }
      positionals.push(value);
      continue;
    }
    if (!isNonEmptyStringArray(value)) {
      reportUnencodableCommandExampleField(issues, command, index, field.key);
      return undefined;
    }
    for (const item of value) {
      if (!isPosixArgvToken(item)) {
        reportUnencodableCommandExampleField(issues, command, index, field.key);
        return undefined;
      }
      positionals.push(item);
    }
  }
  return Object.freeze({
    options: Object.freeze(options),
    positionals: Object.freeze(positionals),
  });
}

function reportUnencodableCommandExampleField(
  issues: ContractDefinitionIssue[],
  command: string,
  index: number,
  field: string,
): void {
  issues.push({
    code: "invalidCommandExample",
    command,
    index,
    reason: "unencodableFieldValue",
    field,
  });
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      return false;
    }
  }
  return true;
}

function isPosixArgvToken(value: string): boolean {
  if (value.includes("\0")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function quotePosixShellToken(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function validateCommandExamples(
  contract: CliContract,
  pending: readonly PendingCommandExampleValidation[],
  issues: ContractDefinitionIssue[],
): void {
  for (const commandExamples of pending) {
    for (const [index, example] of commandExamples.examples.entries()) {
      const invocation = parseCliInvocation(contract, example.manifest.argv);
      if (invocation.kind !== "parsed") {
        issues.push({
          code: "invalidCommandExample",
          command: commandExamples.command,
          index,
          reason: "parseDidNotComplete",
          received: invocation.kind,
          ...(invocation.kind === "usageFailure"
            ? { usageIssues: invocation.issues }
            : {}),
        });
        continue;
      }
      if (invocation.command !== commandExamples.command) {
        issues.push({
          code: "invalidCommandExample",
          command: commandExamples.command,
          index,
          reason: "wrongCommand",
          expected: commandExamples.command,
          received: invocation.command,
        });
        continue;
      }
      if (invocation.outputMode !== example.expectedOutputMode) {
        issues.push({
          code: "invalidCommandExample",
          command: commandExamples.command,
          index,
          reason: "wrongOutputMode",
          expected: example.expectedOutputMode,
          received: invocation.outputMode,
        });
        continue;
      }
      const mismatchedFields = rawInputMismatchFields(
        example.rawInput,
        invocation.input,
      );
      if (mismatchedFields.length > 0) {
        issues.push({
          code: "invalidCommandExample",
          command: commandExamples.command,
          index,
          reason: "rawInputMismatch",
          mismatchedFields,
        });
        continue;
      }
      const validation = validateCliInput(
        commandExamples.input,
        invocation.input,
        commandExamples.command,
      );
      if (validation.kind === "rejected") {
        issues.push({
          code: "invalidCommandExample",
          command: commandExamples.command,
          index,
          reason: "inputRejected",
          evidence: validation.evidence,
        });
      }
    }
  }
}

function rawInputMismatchFields(
  expected: Readonly<Record<string, unknown>>,
  received: Readonly<Record<string, unknown>>,
): readonly string[] {
  const keys = new Set<PropertyKey>([
    ...Reflect.ownKeys(expected),
    ...Reflect.ownKeys(received),
  ]);
  const mismatched = [...keys].filter((key) => {
    const expectedDescriptor = Object.getOwnPropertyDescriptor(expected, key);
    const receivedDescriptor = Object.getOwnPropertyDescriptor(received, key);
    if (
      (expectedDescriptor === undefined) !==
      (receivedDescriptor === undefined)
    ) {
      return true;
    }
    if (expectedDescriptor === undefined || receivedDescriptor === undefined) {
      return false;
    }
    if (!("value" in expectedDescriptor) || !("value" in receivedDescriptor)) {
      return true;
    }
    const expectedValue = expectedDescriptor.value;
    const receivedValue = receivedDescriptor.value;
    if (Array.isArray(expectedValue) || Array.isArray(receivedValue)) {
      return (
        !Array.isArray(expectedValue) ||
        !Array.isArray(receivedValue) ||
        expectedValue.length !== receivedValue.length ||
        expectedValue.some(
          (value, index) => !Object.is(value, receivedValue[index]),
        )
      );
    }
    return !Object.is(expectedValue, receivedValue);
  });
  return Object.freeze(mismatched.map(String).toSorted());
}

function reportMissingHelpFactTemplate(
  issues: ContractDefinitionIssue[],
  command: string,
  slot: Extract<
    ContractDefinitionIssue,
    { readonly code: "missingHelpFactTemplate" }
  >["slot"],
): void {
  if (
    issues.some(
      (issue) =>
        issue.code === "missingHelpFactTemplate" &&
        issue.command === command &&
        issue.slot === slot,
    )
  ) {
    return;
  }
  issues.push({ code: "missingHelpFactTemplate", command, slot });
}

function hasUnsafeCommandHierarchyIssue(
  issues: readonly ContractDefinitionIssue[],
): boolean {
  return issues.some(
    (issue) =>
      issue.code === "invalidCommandParent" ||
      issue.code === "invalidRootCommandKind" ||
      issue.code === "invalidCommandNodeKind" ||
      issue.code === "commandHierarchyCycle",
  );
}

function collectUnknownProperties(
  value: unknown,
  path: readonly string[],
  allowed: readonly string[],
  issues: ContractDefinitionIssue[],
): void {
  if (!isPlainRecord(value)) return;
  for (const property of Object.keys(value)) {
    if (!allowed.includes(property)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: [...path, property],
      });
    }
  }
}

function collectUnknownVariantProperties(
  definitions: unknown,
  path: readonly string[],
  allowed: readonly string[],
  issues: ContractDefinitionIssue[],
): void {
  if (!isPlainRecord(definitions)) return;
  for (const [variant, definition] of Object.entries(definitions)) {
    collectUnknownProperties(definition, [...path, variant], allowed, issues);
  }
}

/**
 * New authoring records check every own key, including the non-enumerable
 * strings and symbols that Object.keys hides. Only the keys are inspected, so
 * an unknown property's getter is never evaluated.
 */
function collectUnknownOwnProperties(
  value: unknown,
  path: readonly string[],
  allowed: readonly string[],
  issues: ContractDefinitionIssue[],
): void {
  if (!isPlainRecord(value)) return;
  for (const property of Reflect.ownKeys(value)) {
    const name = String(property);
    if (!allowed.includes(name)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: [...path, name],
      });
    }
  }
}

/**
 * Check a result table together with the presenters paired with it.
 * `declarationPath` locates a key in the compiled mode, while `presenterPath`
 * locates an extra presenter in the `.text(...)` table the author wrote.
 */
function collectOutputVariantProperties(
  definitions: unknown,
  presenters: unknown,
  declarationPath: readonly string[],
  presenterPath: readonly string[],
  allowed: readonly string[],
  issues: OutputAuthoringIssue[],
): void {
  collectUnknownVariantProperties(
    definitions,
    declarationPath,
    allowed,
    issues,
  );
  if (!isPlainRecord(presenters)) {
    // An omitted presenter table is valid for an empty result set, but an
    // explicitly provided non-object table is not a valid empty table.
    if (presenters !== undefined) {
      issues.push({ code: "invalidPresenterTable", path: presenterPath });
    }
    return;
  }
  const declared = isPlainRecord(definitions) ? definitions : {};
  // Own keys include non-enumerable strings and symbols, which Object.keys
  // hides; an extra presenter must be reported before the table is expanded.
  for (const name of Reflect.ownKeys(presenters)) {
    if (!Object.hasOwn(declared, name)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: [...presenterPath, String(name)],
      });
    }
  }
}

function collectOutputAuthoringProperties(
  authoring: Readonly<{
    declaration: unknown;
    presentation: unknown;
    delivery: OutputDelivery;
    format: OutputFormat;
  }>,
  issues: OutputAuthoringIssue[],
): void {
  const { delivery, format } = authoring;
  const declaration = isPlainRecord(authoring.declaration)
    ? authoring.declaration
    : {};
  const presenters =
    format === "text" && isPlainRecord(authoring.presentation)
      ? authoring.presentation
      : {};
  // In structured modes, the existing result compiler reports an embedded
  // presenter as unexpectedTextPresenter. A text mode would overwrite it.
  const atomicVariantProperties =
    format === "text"
      ? declaredAtomicVariantProperties
      : definitionPropertyKeys.atomicVariant;
  collectOutputVariantProperties(
    declaration.failures,
    presenters.failures,
    ["failures"],
    ["failures"],
    atomicVariantProperties,
    issues,
  );
  if (delivery === "stream") {
    collectOutputVariantProperties(
      declaration.records,
      presenters.records,
      ["success", "records"],
      ["records"],
      format === "text"
        ? declaredStreamRecordProperties
        : definitionPropertyKeys.streamRecord,
      issues,
    );
    return;
  }
  const success = declaration.success;
  if (!isPlainRecord(success)) return;
  const successProperties =
    success.kind === "data"
      ? ["kind", "variants"]
      : success.kind === "completion" && format === "structured"
        ? ["kind", "text"]
        : ["kind"];
  collectUnknownProperties(success, ["success"], successProperties, issues);
  if (success.kind === "data") {
    collectOutputVariantProperties(
      success.variants,
      presenters.success,
      ["success", "variants"],
      ["success"],
      atomicVariantProperties,
      issues,
    );
  }
}

function collectUnknownDefinitionProperties(
  definition: RuntimeCliDefinition,
  issues: ContractDefinitionIssue[],
): void {
  collectUnknownProperties(definition, [], definitionPropertyKeys.cli, issues);
  if (!isPlainRecord(definition.commands)) return;
  for (const [command, node] of Object.entries(definition.commands)) {
    const path = ["commands", command];
    if (!isPlainRecord(node)) continue;
    if (node.kind === "rootGroup" || node.kind === "commandGroup") {
      collectUnknownProperties(
        node,
        path,
        definitionPropertyKeys.group,
        issues,
      );
      continue;
    }
    if (node.kind !== "rootCommand" && node.kind !== "command") continue;
    collectUnknownProperties(
      node,
      path,
      definitionPropertyKeys.command,
      issues,
    );
    if (isPlainRecord(node.fields)) {
      for (const [field, fieldDefinition] of Object.entries(node.fields)) {
        const fieldPath = [...path, "fields", field];
        if (!isPlainRecord(fieldDefinition)) continue;
        const allowed =
          fieldDefinition.kind === "flag"
            ? definitionPropertyKeys.field.flag
            : fieldDefinition.kind === "valueOption" ||
                fieldDefinition.kind === "repeatableOption"
              ? definitionPropertyKeys.field.option
              : fieldDefinition.kind === "positional" ||
                  fieldDefinition.kind === "variadicPositional"
                ? definitionPropertyKeys.field.positional
                : undefined;
        if (allowed !== undefined) {
          collectUnknownProperties(fieldDefinition, fieldPath, allowed, issues);
        }
      }
    }
    if (Array.isArray(node.examples)) {
      node.examples.forEach((example, index) => {
        collectUnknownProperties(
          example,
          [...path, "examples", String(index)],
          definitionPropertyKeys.example,
          issues,
        );
      });
    }
    collectUnknownUsageConstraintDefinitionProperties(
      node.usageConstraints,
      [...path, "usageConstraints"],
      issues,
    );
    if (!isPlainRecord(node.outputs)) continue;
    const outputsPath = [...path, "outputs"];
    collectUnknownProperties(
      node.outputs,
      outputsPath,
      definitionPropertyKeys.outputModes,
      issues,
    );
    if (!isPlainRecord(node.outputs.modes)) continue;
    for (const [modeName, rawMode] of Object.entries(node.outputs.modes)) {
      const modePath = [...outputsPath, "modes", modeName];
      if (!isPlainRecord(rawMode)) continue;
      collectUnknownProperties(
        rawMode,
        modePath,
        definitionPropertyKeys.outputMode,
        issues,
      );
      const success = rawMode.success;
      if (isPlainRecord(success)) {
        const successPath = [...modePath, "success"];
        if (success.kind === "completion") {
          collectUnknownProperties(
            success,
            successPath,
            ["kind", "text"],
            issues,
          );
        } else if (success.kind === "data") {
          collectUnknownProperties(
            success,
            successPath,
            definitionPropertyKeys.atomicSuccess,
            issues,
          );
          collectUnknownVariantProperties(
            success.variants,
            [...successPath, "variants"],
            definitionPropertyKeys.atomicVariant,
            issues,
          );
        } else if (success.kind === "stream") {
          collectUnknownProperties(
            success,
            successPath,
            definitionPropertyKeys.streamSuccess,
            issues,
          );
          collectUnknownVariantProperties(
            success.records,
            [...successPath, "records"],
            definitionPropertyKeys.streamRecord,
            issues,
          );
        }
      }
      collectUnknownVariantProperties(
        rawMode.failures,
        [...modePath, "failures"],
        definitionPropertyKeys.atomicVariant,
        issues,
      );
    }
  }
}

export function getCompiledCli(contract: AnyCliContract): RuntimeCompiledCli {
  const compiled = compiledCliContracts.get(contract);
  if (compiled === undefined) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return compiled;
}

function collectRootDefinitionIssues(
  definition: RuntimeCliDefinition,
  issues: ContractDefinitionIssue[],
): RuntimeExecutableDefinition | undefined {
  collectCliBaseIssues(definition, issues);
  const commandKeys = Object.keys(definition.commands);
  const command = definition.commands[definition.root];
  if (command === undefined || commandKeys.length !== 1) {
    issues.push({
      code: "invalidRootCommandSet",
      root: definition.root,
      // oxlint-disable-next-line unicorn/no-array-sort -- commandKeys comes from Object.keys and is not reused; sorting in place does not affect the command object.
      receivedCommands: commandKeys.sort(),
    });
  }
  if (command === undefined) return undefined;
  if (command.kind !== "rootCommand") {
    issues.push({
      code: "invalidRootCommandKind",
      command: definition.root,
      received: typeof command.kind === "string" ? command.kind : null,
    });
    return undefined;
  }
  if (command.name.length === 0) {
    issues.push({
      code: "missingCommandText",
      command: definition.root,
      field: "name",
    });
  }
  if (!isSingleLineText(command.description)) {
    issues.push({
      code: "invalidDescription",
      command: definition.root,
      location: "command",
      received:
        typeof command.description === "string" ? command.description : null,
    });
  }
  return command;
}

function collectCliBaseIssues(
  definition: RuntimeCliDefinition,
  issues: ContractDefinitionIssue[],
): void {
  if (!/^[a-z][A-Za-z0-9]*$/.test(definition.root)) {
    issues.push({
      code: "invalidCommandIdentity",
      command: definition.root,
    });
  }
  if (!helpCapabilities.has(definition.help)) {
    issues.push({ code: "invalidCapability", capability: "help" });
  }
  if (
    definition.version !== undefined &&
    !versionCapabilities.has(definition.version)
  ) {
    issues.push({ code: "invalidCapability", capability: "version" });
  }
  if (
    definition.schema !== undefined &&
    !schemaCapabilities.has(definition.schema)
  ) {
    issues.push({ code: "invalidCapability", capability: "schema" });
  }
  if (
    !Number.isInteger(definition.usageFailureExitCode) ||
    definition.usageFailureExitCode < 1 ||
    definition.usageFailureExitCode > 255
  ) {
    issues.push({
      code: "invalidUsageFailureExitCode",
      received:
        typeof definition.usageFailureExitCode === "number"
          ? definition.usageFailureExitCode
          : null,
      minimum: 1,
      maximum: 255,
    });
  }
}

function orderHierarchy(
  definition: RuntimeCliDefinition,
  issues: ContractDefinitionIssue[],
): string[] {
  const ids = Object.keys(definition.commands);
  if (!ids.some((id) => definition.commands[id]?.parent === definition.root)) {
    issues.push({ code: "rootGroupWithoutChildren", command: definition.root });
  }
  for (const id of ids) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- id comes from Object.keys(definition.commands); the same object is read here.
    const node = definition.commands[id] as RuntimeCommandDefinition;
    if (!/^[a-z][A-Za-z0-9]*$/.test(id))
      issues.push({ code: "invalidCommandIdentity", command: id });
    if (node.name.length === 0)
      issues.push({ code: "missingCommandText", command: id, field: "name" });
    if (!isSingleLineText(node.description))
      issues.push({
        code: "invalidDescription",
        command: id,
        location: "command",
        received:
          typeof node.description === "string" ? node.description : null,
      });
    if (id === definition.root && node.kind !== "rootGroup") {
      issues.push({
        code: "invalidRootCommandKind",
        command: id,
        received: node.kind,
      });
    }
    if (id === definition.root && node.parent !== undefined) {
      issues.push({
        code: "invalidCommandParent",
        command: id,
        parent: node.parent,
      });
    }
    if (
      id !== definition.root &&
      (node.kind === "rootGroup" || node.kind === "rootCommand")
    ) {
      issues.push({
        code: "invalidCommandNodeKind",
        command: id,
        received: node.kind,
      });
    }
    if (
      (node.kind === "rootGroup" || node.kind === "commandGroup") &&
      "handler" in node
    ) {
      issues.push({ code: "invalidCommandHandler", command: id });
    }
    if (
      id !== definition.root &&
      (node.parent === undefined ||
        definition.commands[node.parent] === undefined)
    ) {
      issues.push({
        code: "invalidCommandParent",
        command: id,
        parent: node.parent ?? null,
      });
    } else if (
      id !== definition.root &&
      node.parent !== undefined &&
      definition.commands[node.parent]?.kind !== "rootGroup" &&
      definition.commands[node.parent]?.kind !== "commandGroup"
    ) {
      issues.push({
        code: "invalidCommandParent",
        command: id,
        parent: node.parent,
      });
    }
    for (const spelling of [node.name, ...(node.aliases ?? [])]) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spelling)) {
        issues.push({ code: "invalidCommandSpelling", command: id, spelling });
      }
    }
  }

  const cycleMembers = ids.filter((id) => {
    const visited = new Set<string>();
    let current: string | undefined = id;
    while (
      current !== undefined &&
      definition.commands[current] !== undefined
    ) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = definition.commands[current]?.parent;
    }
    return false;
  });
  if (cycleMembers.length > 0)
    issues.push({
      code: "commandHierarchyCycle",
      commands: Object.freeze(cycleMembers),
    });

  for (const parent of ids) {
    const spellings = new Map<string, string[]>();
    for (const child of ids.filter(
      (id) => definition.commands[id]?.parent === parent,
    )) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- child comes from the key set of the same command object.
      const node = definition.commands[child] as RuntimeCommandDefinition;
      for (const spelling of [node.name, ...(node.aliases ?? [])]) {
        const owners = spellings.get(spelling) ?? [];
        owners.push(child);
        spellings.set(spelling, owners);
      }
    }
    for (const [spelling, commands] of spellings) {
      if (commands.length > 1) {
        issues.push({
          code: "duplicateCommandSpelling",
          parent,
          spelling,
          commands: Object.freeze(commands),
        });
      }
    }
  }

  const ordered: string[] = [];
  const visit = (id: string): void => {
    if (ordered.includes(id)) return;
    ordered.push(id);
    for (const child of ids)
      if (definition.commands[child]?.parent === id) visit(child);
  };
  if (definition.commands[definition.root] !== undefined)
    visit(definition.root);
  return [...ordered, ...ids.filter((id) => !ordered.includes(id))];
}

function commandPath(
  id: string,
  commands: RuntimeCliDefinition["commands"],
): string {
  return commandPathTokens(id, commands).join(" ");
}

function commandPathTokens(
  id: string,
  commands: RuntimeCliDefinition["commands"],
): string[] {
  const names: string[] = [];
  let current: string | undefined = id;
  while (current !== undefined) {
    const node: RuntimeCommandDefinition | undefined = commands[current];
    if (node === undefined) break;
    names.unshift(node.name);
    current = node.parent;
  }
  return names;
}

export function usageFailureHelpArgv(
  commands: Readonly<
    Record<
      string,
      Readonly<{ readonly name: string; readonly parent?: string }>
    >
  >,
  command: string,
): readonly string[] {
  const path: string[] = [];
  let current = commands[command];
  while (current !== undefined) {
    path.unshift(current.name);
    current =
      current.parent === undefined ? undefined : commands[current.parent];
  }
  return [...path, "--help"];
}

function compileFailures(
  command: string,
  outputMode: string,
  failures: FailureVariantDefinitions,
  issues: ContractDefinitionIssue[],
): Readonly<{
  readonly runtime: Readonly<Record<string, RuntimeAtomicVariant>>;
  readonly manifest: Readonly<Record<string, FailureVariantManifest>>;
  readonly wire: Readonly<Record<string, JsonObject>>;
}> {
  const compiled = compileAtomicVariants(
    command,
    "failure",
    failures,
    1,
    (command, variant, schema) =>
      createFailureWireSchema(command, outputMode, variant, schema),
    issues,
  );
  return {
    runtime: compiled.runtime,
    manifest: compiled.manifest,
    wire: compiled.wire,
  };
}

function compileOutputModes(
  command: string,
  input: ContractSchema,
  definition: RuntimeOutputModesDefinition,
  issues: ContractDefinitionIssue[],
): Readonly<{
  readonly default: string;
  readonly runtime: Readonly<Record<string, RuntimeCompiledOutputMode>>;
  readonly manifest: OutputModesManifest;
  readonly wire: CommandWireManifest;
  readonly grammar: OutputModesGrammar;
}> {
  const outputObject = definition as object;
  const metadata = outputModeMetadata.get(outputObject);
  if (!outputModes.has(outputObject)) {
    issues.push({
      code: "invalidOutputModes",
      command,
      reason: "notFactoryOutputModes",
    });
  } else if (metadata === undefined || metadata.command !== command) {
    issues.push({
      code: "invalidOutputModes",
      command,
      reason: "mismatchedCommand",
    });
  } else if (metadata.input !== input) {
    issues.push({
      code: "invalidOutputModes",
      command,
      reason: "mismatchedInput",
    });
  } else {
    for (const issue of metadata.authoringIssues) {
      issues.push(issue);
    }
  }

  const rawModes: unknown = definition.modes;
  if (!isPlainRecord(rawModes)) {
    issues.push({
      code: "invalidOutputModes",
      command,
      reason: "emptyModes",
    });
  }
  const entries = isPlainRecord(rawModes) ? Object.entries(rawModes) : [];
  if (entries.length === 0) {
    issues.push({
      code: "invalidOutputModes",
      command,
      reason: "emptyModes",
    });
  }
  const names = entries.map(([name]) => name);
  const requestedDefault: unknown = definition.default;
  const hasDefault = Object.hasOwn(definition, "default");
  const defaultMode = hasDefault
    ? typeof requestedDefault === "string" && names.includes(requestedDefault)
      ? requestedDefault
      : undefined
    : names.length === 1
      ? names[0]
      : undefined;
  if (defaultMode === undefined) {
    issues.push({
      code: "invalidDefaultOutputMode",
      command,
      received: typeof requestedDefault === "string" ? requestedDefault : null,
    });
  }

  const runtime: Record<string, RuntimeCompiledOutputMode> = {};
  const manifestModes: Record<string, OutputModeManifest> = {};
  const wire: Record<string, OutputModeWireManifest> = {};
  for (const [modeName, rawMode] of entries) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(modeName)) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidName",
      });
    }
    if (!isPlainRecord(rawMode)) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidSuccess",
      });
      continue;
    }
    const mode = rawMode;
    const modeMetadata = outputModeDefinitionMetadata.get(mode);
    if (!outputModeDefinitions.has(mode) || modeMetadata === undefined) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidSuccess",
      });
      continue;
    }
    // An issued mode belongs to the construction that declared its execution,
    // so a foreign command, input or binding is a mis-binding, not a bad shape.
    if (
      modeMetadata.command !== command ||
      modeMetadata.input !== input ||
      metadata === undefined ||
      modeMetadata.binding !== metadata.binding
    ) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "mismatchedBinding",
      });
      continue;
    }
    if (modeMetadata.authoringIssues.length > 0) {
      for (const issue of modeMetadata.authoringIssues) {
        issues.push({
          code: issue.code,
          path: [
            "commands",
            command,
            "outputs",
            "modes",
            modeName,
            ...issue.path,
          ],
        });
      }
      continue;
    }
    if (!isSingleLineText(mode.description)) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidDescription",
      });
    }
    const delivery = mode.delivery;
    if (delivery !== "atomic" && delivery !== "stream") {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidDelivery",
      });
      continue;
    }
    const format = mode.format;
    if (format !== "structured" && format !== "text") {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidFormat",
      });
      continue;
    }
    if (typeof mode.handler !== "function") {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "missingHandler",
      });
    }
    if (!isPlainRecord(mode.failures)) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidFailures",
      });
      continue;
    }
    if (!isPlainRecord(mode.success)) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidSuccess",
      });
      continue;
    }
    const successKind = mode.success.kind;
    if (
      (delivery === "atomic" &&
        successKind !== "completion" &&
        successKind !== "data") ||
      (delivery === "stream" && successKind !== "stream")
    ) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidSuccess",
      });
      continue;
    }

    if (
      collectResultDefinitionIssues(
        command,
        modeName,
        delivery,
        mode.success,
        mode.failures,
        issues,
      )
    ) {
      continue;
    }
    const runtimeMode = mode as unknown as RuntimeOutputModeDefinition;
    const description = isSingleLineText(mode.description)
      ? mode.description
      : "";
    const resultContract = compileResultContract(
      command,
      modeName,
      runtimeMode,
      format === "text",
      issues,
    );
    runtime[modeName] = Object.freeze({
      id: modeName,
      description,
      delivery,
      format,
      resultContract: resultContract.runtime,
    });
    manifestModes[modeName] = deepFreeze({
      description,
      delivery,
      format,
      success: resultContract.manifest.success,
      failures: resultContract.manifest.failures,
    });
    wire[modeName] = resultContract.wire;
  }

  const resolvedDefault = defaultMode ?? "";
  const frozenRuntime = deepFreeze(runtime);
  return deepFreeze({
    default: resolvedDefault,
    runtime: frozenRuntime,
    manifest: { default: resolvedDefault, modes: manifestModes },
    wire,
    grammar: outputModesGrammar(frozenRuntime, resolvedDefault),
  });
}

function outputModesGrammar(
  modes: Readonly<Record<string, RuntimeCompiledOutputMode>>,
  defaultMode: string,
): OutputModesGrammar {
  return deepFreeze({
    selector: "--output" as const,
    default: defaultMode,
    modes: Object.fromEntries(
      Object.entries(modes).map(([name, mode]) => [
        name,
        {
          description: mode.description,
          delivery: mode.delivery,
          format: mode.format,
        },
      ]),
    ),
  });
}

function collectResultDefinitionIssues(
  command: string,
  mode: string,
  delivery: OutputDelivery,
  success: unknown,
  failures: unknown,
  issues: ContractDefinitionIssue[],
): boolean {
  let invalid = false;
  const report = (
    location: "data" | "failure" | "record",
    reason: "missingTable" | "invalidEntry",
    variant?: string,
  ): void => {
    issues.push({
      code: "invalidResultDefinition",
      command,
      mode,
      location,
      reason,
      ...(variant === undefined ? {} : { variant }),
    });
    invalid = true;
  };
  if (isPlainRecord(failures)) {
    for (const [variant, definition] of Object.entries(failures)) {
      if (!isPlainRecord(definition))
        report("failure", "invalidEntry", variant);
    }
  }
  if (!isPlainRecord(success)) return invalid;
  if (delivery === "stream") {
    if (!isPlainRecord(success.records)) {
      report("record", "missingTable");
    } else {
      for (const [variant, definition] of Object.entries(success.records)) {
        if (!isPlainRecord(definition)) {
          report("record", "invalidEntry", variant);
        }
      }
    }
  } else if (success.kind === "data") {
    if (!isPlainRecord(success.variants)) {
      report("data", "missingTable");
    } else {
      for (const [variant, definition] of Object.entries(success.variants)) {
        if (!isPlainRecord(definition)) {
          report("data", "invalidEntry", variant);
        }
      }
    }
  }
  return invalid;
}

function compileResultContract(
  command: string,
  outputMode: string,
  definition: RuntimeOutputModeDefinition,
  textEnabled: boolean,
  issues: ContractDefinitionIssue[],
): CompiledResultContract {
  const success = compileSuccess(
    command,
    outputMode,
    definition.success,
    textEnabled,
    issues,
  );
  const failures = compileFailures(
    command,
    outputMode,
    definition.failures,
    issues,
  );
  collectTextPresenterIssues(
    command,
    textEnabled,
    definition.success,
    definition.failures,
    issues,
  );
  return deepFreeze({
    runtime: {
      success: success.runtime,
      failures: failures.runtime,
      handler: definition.handler,
    },
    manifest: {
      success: success.manifest,
      failures: failures.manifest,
    },
    wire: {
      ...success.wire,
      ...(Object.keys(failures.wire).length === 0
        ? {}
        : { failure: failures.wire }),
    },
  });
}

function collectTextPresenterIssues(
  command: string,
  textEnabled: boolean,
  success: RuntimeCompiledSuccess,
  failures: FailureVariantDefinitions,
  issues: ContractDefinitionIssue[],
): void {
  if (success.kind === "completion") {
    collectTextPresenterIssue(
      command,
      textEnabled,
      "completion",
      success,
      issues,
    );
  } else if (success.kind === "data") {
    for (const [variant, definition] of Object.entries(success.variants)) {
      collectTextPresenterIssue(
        command,
        textEnabled,
        "data",
        definition,
        issues,
        variant,
      );
    }
  } else {
    collectTextPresenterIssue(
      command,
      textEnabled,
      "streamSuccess",
      success,
      issues,
    );
    for (const [variant, definition] of Object.entries(success.records)) {
      collectTextPresenterIssue(
        command,
        textEnabled,
        "record",
        definition,
        issues,
        variant,
      );
    }
  }
  for (const [variant, definition] of Object.entries(failures)) {
    collectTextPresenterIssue(
      command,
      textEnabled,
      "failure",
      definition,
      issues,
      variant,
    );
  }
}

function isSchemaCapability(value: unknown): value is SchemaCapability {
  return (
    typeof value === "object" && value !== null && schemaCapabilities.has(value)
  );
}

function isVersionCapability(value: unknown): value is VersionCapability {
  return (
    typeof value === "object" &&
    value !== null &&
    versionCapabilities.has(value)
  );
}

function collectControlFieldConflicts(
  command: string,
  fields: readonly FieldGrammar[],
  definition: RuntimeCliDefinition,
  issues: ContractDefinitionIssue[],
): void {
  const controls = new Map<
    string,
    "help" | "outputMode" | "version" | "schema"
  >([
    ["--help", "help"],
    ["--output", "outputMode"],
  ]);
  if (
    helpCapabilities.has(definition.help) &&
    definition.help.shortAlias !== undefined
  ) {
    controls.set(definition.help.shortAlias, "help");
  }
  if (isVersionCapability(definition.version)) {
    const version = definition.version;
    controls.set("--version", "version");
    if (version.shortAlias !== undefined) {
      controls.set(version.shortAlias, "version");
    }
  }
  if (isSchemaCapability(definition.schema)) {
    controls.set("--schema", "schema");
  }
  for (const field of fields) {
    if (field.kind === "positional" || field.kind === "variadicPositional") {
      continue;
    }
    for (const spelling of [
      field.longOption,
      field.shortAlias,
      ...(field.kind === "flag" ? [field.negatedLongOption] : []),
    ]) {
      const control =
        spelling === undefined ? undefined : controls.get(spelling);
      if (spelling !== undefined && control !== undefined) {
        issues.push({
          code: "fieldOptionConflictsWithControl",
          command,
          field: field.key,
          spelling,
          control,
        });
      }
    }
  }
}

function collectTextPresenterIssue(
  command: string,
  textEnabled: boolean,
  location: "completion" | "data" | "failure" | "record" | "streamSuccess",
  definition: object,
  issues: ContractDefinitionIssue[],
  variant?: string,
): void {
  // A structured declaration owns no presenter slot, so an explicit undefined
  // still counts as an embedded presenter. A text mode supplies the slot itself
  // and only a callable presenter fills it.
  const hasPresenter = textEnabled
    ? "text" in definition && typeof definition.text === "function"
    : Object.hasOwn(definition, "text");
  if (textEnabled === hasPresenter) return;
  issues.push({
    code: textEnabled ? "missingTextPresenter" : "unexpectedTextPresenter",
    command,
    location,
    ...(variant === undefined ? {} : { variant }),
  });
}

function compileSuccess(
  command: string,
  outputMode: string,
  success: RuntimeCompiledSuccess,
  textEnabled: boolean,
  issues: ContractDefinitionIssue[],
): Readonly<{
  readonly runtime: RuntimeCompiledSuccess;
  readonly manifest: CommandSuccessManifest;
  readonly wire: OutputModeWireManifest;
}> {
  if (success.kind === "completion") {
    return {
      runtime: Object.freeze({
        kind: "completion",
        ...("text" in success ? { text: success.text } : {}),
      }),
      manifest: Object.freeze({ kind: "completion" }),
      wire: Object.freeze({
        completion: deepFreeze(createCompletionWireSchema(command, outputMode)),
      }),
    };
  }

  if (success.kind === "stream") {
    const records = compileStreamRecords(command, success.records, issues);
    if (Object.keys(records.runtime).length === 0) {
      issues.push({ code: "missingStreamRecord", command });
    }
    const header = deepFreeze(
      createStreamHeaderWireSchema(command, outputMode),
    );
    const terminal = deepFreeze(createStreamSuccessWireSchema());
    const recordWire = Object.fromEntries(
      Object.entries(records.wire).map(([variant, schema]) => [
        variant,
        deepFreeze(
          createStreamRecordWireSchema(command, outputMode, variant, schema),
        ),
      ]),
    ) as Readonly<Record<string, JsonObject>>;
    return deepFreeze({
      runtime: {
        kind: "stream" as const,
        records: records.runtime,
        ...("text" in success ? { text: success.text } : {}),
      },
      manifest: {
        kind: "stream" as const,
        records: records.manifest,
        ...(textEnabled
          ? { text: { recordFraming: "fragment" as const } }
          : {}),
      },
      wire: {
        stream: {
          header,
          records: recordWire,
          terminal,
          line: deepFreeze({
            $schema: "https://json-schema.org/draft/2020-12/schema",
            oneOf: [header, ...Object.values(recordWire), terminal],
          }),
        },
      },
    });
  }

  const variants = compileAtomicVariants(
    command,
    "data",
    success.variants,
    0,
    (command, variant, schema) =>
      createDataWireSchema(command, outputMode, variant, schema),
    issues,
  );
  if (Object.keys(variants.runtime).length === 0) {
    issues.push({ code: "missingDataVariant", command });
  }

  return deepFreeze({
    runtime: { kind: "data" as const, variants: variants.runtime },
    manifest: {
      kind: "data" as const,
      variants: variants.manifest,
    },
    wire: { data: variants.wire },
  });
}

function createUsageSynopsis(
  commandName: string,
  fields: readonly FieldGrammar[],
  outputSelectable = false,
): string {
  return [
    commandName,
    ...(outputSelectable ? ["[--output <mode>]"] : []),
    ...fields.map((field) => formatFieldUsage(field)),
  ].join(" ");
}

export function formatFieldUsage(
  field: FieldGrammar,
  includeShortAlias = false,
): string {
  const value =
    field.kind === "positional"
      ? `<${field.key}>`
      : field.kind === "variadicPositional"
        ? `<${field.key}...>`
        : field.kind === "flag"
          ? [
              field.longOption,
              ...(includeShortAlias && field.shortAlias !== undefined
                ? [field.shortAlias]
                : []),
              field.negatedLongOption,
            ]
              .filter((spelling) => spelling !== undefined)
              .join(includeShortAlias ? ", " : "|")
          : `${[
              field.longOption,
              ...(includeShortAlias && field.shortAlias !== undefined
                ? [field.shortAlias]
                : []),
            ].join(", ")} <${field.key}>`;
  if (field.kind === "repeatableOption") {
    return field.required ? `(${value})...` : `[${value}]...`;
  }
  return field.required ? value : `[${value}]`;
}
