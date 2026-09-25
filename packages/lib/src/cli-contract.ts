import {
  compileAtomicVariants,
  type RuntimeAtomicVariant,
} from "#/atomic-variant-compiler";
import type { CommandUsage } from "#/cli-invocation";
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
import { deepFreeze } from "#/json-value";
import type {
  AtomicTextPresenter,
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
  TextLine,
  TextLines,
  StreamOutcome,
  StreamTextPresenter,
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
export {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  createStreamRecordFact,
  createStreamSuccessFact,
  isIssuedOutcomeFact,
  text,
} from "#/outcome-fact";
export type {
  CompletionFact,
  CompletionTextPresenter,
  CompletionOutcome,
  DataFact,
  DataFactUnion,
  DataOutcome,
  DataVariantDefinition,
  DataVariantDefinitions,
  FailureFact,
  FailureFactUnion,
  FailureOutcome,
  FailureVariantDefinition,
  FailureVariantDefinitions,
  OutcomeFact,
  StreamOutcome,
  StreamRecordDefinition,
  StreamRecordDefinitions,
  StreamRecordFact,
  StreamRecordFactUnion,
  StreamSuccessFact,
  StreamTextPresenter,
  SilentText,
  TextLine,
  TextLines,
  TextFragment,
} from "#/outcome-fact";

const cliContractType = Symbol("CliContract.type");
const executableCommandType = Symbol("ExecutableCommand.type");
const helpCapabilities = new WeakSet<object>();
const outputCapabilities = new WeakSet<object>();
const versionCapabilities = new WeakSet<object>();
const compiledCliContracts = new WeakMap<object, RuntimeCompiledCli>();

// 类型约束与定义期检查共用已知属性，避免拼错的声明被静默丢弃。
const definitionPropertyKeys = {
  cli: [
    "root",
    "help",
    "version",
    "output",
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
    "fields",
    "input",
    "success",
    "failures",
    "handler",
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
  usage: {
    requires: ["kind", "field", "requires"],
    exclusive: ["kind", "fields"],
    forbiddenCombination: ["kind", "values"],
    value: ["field", "value"],
  },
  success: {
    completion: ["kind", "text"],
    data: ["kind", "variants"],
    stream: ["kind", "records", "text"],
  },
  atomicVariant: ["description", "schema", "exitCode", "text"],
  streamRecord: ["description", "schema", "text"],
  capability: {
    help: ["shortAlias", "headings", "wording"],
    version: ["value", "description", "shortAlias"],
    output: ["defaultFormat", "text", "compatibilityFlags"],
  },
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
 * 根级帮助中既定段落的可选标题。未声明标题时仍保留对应机械内容和缩进，
 * 不会由核心补写默认文案。
 */
export interface HelpHeadings {
  readonly usage?: string;
  readonly commands?: string;
  readonly arguments?: string;
  readonly options?: string;
  readonly constraints?: string;
  readonly supplement?: string;
}

export interface HelpFactWording {
  /** 命令组占位词本身，核心为它添加尖括号。 */
  readonly commandPlaceholder?: string;
  /** 字段或输出格式的候选集合，必须包含 `{choices}`。 */
  readonly choices?: string;
  /** 字段或输出格式的默认 JSON 值，必须包含 `{value}`。 */
  readonly default?: string;
  /** 字段依赖关系，必须包含 `{field}` 与 `{requires}`。 */
  readonly requires?: string;
  /** 互斥字段集合，必须包含 `{fields}`。 */
  readonly exclusive?: string;
  /** 禁止同时出现的字段和值，必须包含 `{values}`。 */
  readonly forbiddenCombination?: string;
}

/** 根契约一次装配的帮助配置；标题可省略，实际出现的事实必须有文案。 */
export interface HelpCapabilityDefinition {
  readonly shortAlias?: "-h";
  readonly headings?: HelpHeadings;
  readonly wording?: HelpFactWording;
}

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

export type OutputFormat = "structured" | "text";

export interface OutputCapability<
  Formats extends readonly OutputFormat[] = readonly OutputFormat[],
> {
  readonly kind: "outputCapability";
  readonly defaultFormat: Formats[number];
  readonly formats: Formats;
  readonly compatibilityFlags: Readonly<Record<string, OutputFormat>>;
  readonly [cliContractType]: "output";
}

type OutputCapabilityDefinition = Readonly<{
  readonly defaultFormat: OutputFormat;
  readonly text?: boolean;
  readonly compatibilityFlags?: Readonly<Record<`--${string}`, OutputFormat>>;
}>;

type OutputFormatsFor<Definition extends OutputCapabilityDefinition> =
  Definition["defaultFormat"] extends "text"
    ? readonly ["structured", "text"]
    : Definition["text"] extends true
      ? readonly ["structured", "text"]
      : readonly ["structured"];

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

export type FieldDefinitions = Readonly<Record<string, FieldDefinition>>;

/**
 * 由调用语法拥有、可同时投影到 parser 和 Draft 2020-12 的字段关系。
 * `requires` 与 `exclusive` 作用于可选 option；`forbiddenCombination`
 * 的离散值只作用于 flag 或 value option。动态声明在定义期检查这些前提。
 */
export type UsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
> =
  | RequiresUsageConstraint<Extract<keyof Fields, string>>
  | ExclusiveUsageConstraint<Extract<keyof Fields, string>>
  | ForbiddenCombinationUsageConstraint<Fields>;

export interface RequiresUsageConstraint<Field extends string = string> {
  readonly kind: "requires";
  readonly field: Field;
  readonly requires: Field;
}

export interface ExclusiveUsageConstraint<Field extends string = string> {
  readonly kind: "exclusive";
  readonly fields: readonly [Field, Field, ...Field[]];
}

type DiscreteUsageValue<Field extends FieldDefinition> =
  Field extends FlagDefinition
    ? boolean
    : Field extends ValueOptionDefinition
      ? string
      : never;

export type ForbiddenCombinationValue<
  Fields extends FieldDefinitions = FieldDefinitions,
> = {
  [Field in keyof Fields & string]: DiscreteUsageValue<
    Fields[Field]
  > extends never
    ? never
    : Readonly<{
        readonly field: Field;
        readonly value: DiscreteUsageValue<Fields[Field]>;
      }>;
}[keyof Fields & string];

export interface ForbiddenCombinationUsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
> {
  readonly kind: "forbiddenCombination";
  readonly values: readonly [
    ForbiddenCombinationValue<Fields>,
    ForbiddenCombinationValue<Fields>,
    ...ForbiddenCombinationValue<Fields>[],
  ];
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

type CheckedFieldDefinition<
  Field extends FieldDefinition,
  Key,
> = Field extends PositionalDefinition
  ? Field
  : Field extends VariadicPositionalDefinition
    ? Field
    : Field extends FlagDefinition<infer LongOption, infer ShortAlias>
      ? CheckedNegatedFlagDefinition<Field, Key, LongOption, ShortAlias>
      : Field extends RepeatableOptionDefinition<
            infer LongOption,
            infer ShortAlias
          >
        ? CheckedOptionDefinition<Field, Key, LongOption, ShortAlias>
        : Field extends ValueOptionDefinition<
              infer LongOption,
              infer ShortAlias
            >
          ? CheckedOptionDefinition<Field, Key, LongOption, ShortAlias>
          : never;

type CheckedNegatedFlagDefinition<
  Field,
  Key,
  LongOption extends `--${string}`,
  ShortAlias extends `-${string}` | undefined,
> =
  CheckedOptionDefinition<Field, Key, LongOption, ShortAlias> extends Field
    ? Field extends {
        readonly negatedLongOption: infer NegatedLongOption extends
          `--${string}`;
      }
      ? NegatedLongOption extends CanonicalLongOption<NegatedLongOption>
        ? Field
        : ContractTypeError<
            "invalidNegatedLongOption",
            Readonly<{
              readonly field: Key;
              readonly received: NegatedLongOption;
            }>
          >
      : Field
    : CheckedOptionDefinition<Field, Key, LongOption, ShortAlias>;

type CheckedOptionDefinition<
  Field,
  Key,
  LongOption extends `--${string}`,
  ShortAlias extends `-${string}` | undefined,
> =
  LongOption extends CanonicalLongOption<LongOption>
    ? ShortAlias extends undefined
      ? Field
      : ShortAlias extends ShortOptionAlias<Extract<ShortAlias, string>>
        ? Field
        : ContractTypeError<
            "invalidShortOptionAlias",
            Readonly<{ readonly field: Key; readonly received: ShortAlias }>
          >
    : ContractTypeError<
        "invalidCanonicalLongOption",
        Readonly<{ readonly field: Key; readonly received: LongOption }>
      >;

type CheckedFieldDefinitions<Fields extends FieldDefinitions> = {
  readonly [Field in keyof Fields]: CheckedFieldDefinition<
    Fields[Field],
    Field
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

type ClosedAtomicVariants<Variants> = ClosedVariantDefinitions<
  Variants,
  (typeof definitionPropertyKeys.atomicVariant)[number]
>;

type ClosedStreamRecords<Records> = ClosedVariantDefinitions<
  Records,
  (typeof definitionPropertyKeys.streamRecord)[number]
>;

type ClosedFieldDefinitions<Fields> = Readonly<{
  [Field in keyof Fields]: RejectUnknownProperties<
    Fields[Field],
    AllowedFieldProperties<Fields[Field]>
  >;
}>;

type ClosedUsageConstraint<Constraint> =
  Constraint extends Readonly<{ readonly kind: "requires" }>
    ? RejectUnknownProperties<
        Constraint,
        (typeof definitionPropertyKeys.usage.requires)[number]
      >
    : Constraint extends Readonly<{ readonly kind: "exclusive" }>
      ? RejectUnknownProperties<
          Constraint,
          (typeof definitionPropertyKeys.usage.exclusive)[number]
        >
      : Constraint extends Readonly<{
            readonly kind: "forbiddenCombination";
            readonly values: infer Values extends readonly unknown[];
          }>
        ? RejectUnknownProperties<
            Constraint,
            (typeof definitionPropertyKeys.usage.forbiddenCombination)[number]
          > &
            Readonly<{
              readonly values: {
                [Index in keyof Values]: Values[Index] &
                  RejectUnknownProperties<
                    Values[Index],
                    (typeof definitionPropertyKeys.usage.value)[number]
                  >;
              };
            }>
        : unknown;

type ClosedUsageConstraints<Constraints> =
  Constraints extends readonly (infer Constraint)[]
    ? readonly (Constraint & ClosedUsageConstraint<Constraint>)[]
    : unknown;

type ClosedSuccessDefinition<Success> =
  Success extends Readonly<{
    readonly kind: "data";
    readonly variants: infer Variants;
  }>
    ? RejectUnknownProperties<
        Success,
        (typeof definitionPropertyKeys.success.data)[number]
      > &
        Readonly<{ readonly variants: ClosedAtomicVariants<Variants> }>
    : Success extends Readonly<{
          readonly kind: "stream";
          readonly records: infer Records;
        }>
      ? RejectUnknownProperties<
          Success,
          (typeof definitionPropertyKeys.success.stream)[number]
        > &
          Readonly<{ readonly records: ClosedStreamRecords<Records> }>
      : RejectUnknownProperties<
          Success,
          (typeof definitionPropertyKeys.success.completion)[number]
        >;

type ClosedCommandDefinition<Definition> = RejectUnknownProperties<
  Definition,
  (typeof definitionPropertyKeys.command)[number] | typeof executableCommandType
> &
  (Definition extends Readonly<{ readonly success: infer Success }>
    ? Readonly<{ readonly success: ClosedSuccessDefinition<Success> }>
    : unknown) &
  (Definition extends Readonly<{ readonly failures: infer Failures }>
    ? Readonly<{ readonly failures: ClosedAtomicVariants<Failures> }>
    : unknown) &
  (Definition extends Readonly<{ readonly fields: infer Fields }>
    ? Readonly<{ readonly fields: ClosedFieldDefinitions<Fields> }>
    : unknown) &
  (Definition extends Readonly<{
    readonly usageConstraints: infer Constraints;
  }>
    ? Readonly<{
        readonly usageConstraints: ClosedUsageConstraints<Constraints>;
      }>
    : unknown);

type ClosedRootCommands<Commands> = Readonly<{
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
  }>
    ? ClosedCommandDefinition<Commands[Command]>
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

type FieldIdentityContract<Fields extends FieldDefinitions> =
  string extends keyof Fields
    ? unknown
    : InvalidFieldIdentities<Fields> extends never
      ? unknown
      : ContractTypeError<
          "fieldMustBeLowerCamelCase",
          Readonly<{ readonly fields: InvalidFieldIdentities<Fields> }>
        >;

export type RawValueOptionInputForSchema<InputSchema extends ContractSchema> =
  Readonly<{
    [Field in Extract<keyof ContractSchemaInput<InputSchema>, string>]?: string;
  }>;

export interface ContractTypeError<Code extends string, Evidence> {
  readonly contractTypeError: Readonly<{ readonly code: Code } & Evidence>;
}

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

type DataVariantNameContract<Variants> =
  InvalidDataVariantNames<Variants> extends never
    ? unknown
    : ContractTypeError<
        "dataVariantMustBeLowerCamelCase",
        Readonly<{
          readonly variants: InvalidDataVariantNames<Variants>;
        }>
      >;

type InvalidFailureVariantNames<Failures> = InvalidVariantNames<Failures>;

type FailureVariantNameContract<Failures> =
  InvalidFailureVariantNames<Failures> extends never
    ? unknown
    : ContractTypeError<
        "failureVariantMustBeLowerCamelCase",
        Readonly<{
          readonly variants: InvalidFailureVariantNames<Failures>;
        }>
      >;

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

type CompletionSuccessDefinition<
  Command extends string,
  TextEnabled extends boolean,
> = TextEnabled extends true
  ?
      | Readonly<{
          readonly kind: "completion";
          readonly text: CompletionTextPresenter;
        }>
      | (Readonly<{ readonly kind: "completion" }> &
          ContractTypeError<
            "missingTextPresenter",
            Readonly<{
              readonly command: Command;
              readonly location: "completion";
              readonly missing: "text";
            }>
          >)
  : TextEnabled extends false
    ? Readonly<{ readonly kind: "completion"; readonly text?: never }>
    : Readonly<{
        readonly kind: "completion";
        readonly text?: CompletionTextPresenter;
      }>;

type MissingVariantTextPresenters<Variants> = {
  [Variant in keyof Variants & string]: Variants[Variant] extends Readonly<{
    readonly text: unknown;
  }>
    ? never
    : Variant;
}[keyof Variants & string];

type NamedVariantTextContract<
  Command extends string,
  Location extends "data" | "failure" | "record",
  Variants,
  TextEnabled extends boolean,
  TextDisabledDefinition,
> = [TextEnabled] extends [true]
  ? MissingVariantTextPresenters<Variants> extends never
    ? unknown
    : ContractTypeError<
        "missingTextPresenter",
        Readonly<{
          readonly command: Command;
          readonly location: Location;
          readonly variant: MissingVariantTextPresenters<Variants>;
          readonly missing: "text";
        }>
      >
  : [TextEnabled] extends [false]
    ? TextDisabledDefinition
    : unknown;

type DataVariantTextContract<
  Command extends string,
  Variants,
  TextEnabled extends boolean,
> = NamedVariantTextContract<
  Command,
  "data",
  Variants,
  TextEnabled,
  DataVariantDefinitions<false>
>;

type AtomicTextPresenterContract<Payload, TextEnabled extends boolean> = [
  TextEnabled,
] extends [true]
  ? Readonly<{ readonly text: AtomicTextPresenter<Payload> }>
  : [TextEnabled] extends [false]
    ? Readonly<{ readonly text?: never }>
    : Readonly<{ readonly text?: AtomicTextPresenter<Payload> }>;

type AtomicVariantDefinitionForSchema<
  Schema extends ContractSchema,
  TextEnabled extends boolean,
> = Readonly<{
  readonly description: string;
  readonly schema: Schema;
  readonly exitCode: number;
}> &
  AtomicTextPresenterContract<ContractSchemaOutput<Schema>, TextEnabled>;

type VariantSchemaMap = Record<string, ContractSchema>;

type DataVariantDefinitionsForSchemas<
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly [Variant in keyof Schemas]: AtomicVariantDefinitionForSchema<
    Schemas[Variant],
    TextEnabled
  >;
}>;

type FailureVariantDefinitionsForSchemas<
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly [Variant in keyof Schemas]: AtomicVariantDefinitionForSchema<
    Schemas[Variant],
    TextEnabled
  >;
}>;

type FailureVariantTextContract<
  Command extends string,
  Failures,
  TextEnabled extends boolean,
> = NamedVariantTextContract<
  Command,
  "failure",
  Failures,
  TextEnabled,
  FailureVariantDefinitions<false>
>;

type StreamRecordTextContract<
  Command extends string,
  Records,
  TextEnabled extends boolean,
> = NamedVariantTextContract<
  Command,
  "record",
  Records,
  TextEnabled,
  StreamRecordDefinitions<false>
>;

type StreamRecordNameContract<Records> =
  InvalidVariantNames<Records> extends never
    ? unknown
    : ContractTypeError<
        "streamRecordMustBeLowerCamelCase",
        Readonly<{
          readonly records: InvalidVariantNames<Records>;
        }>
      >;

type StreamRecordDefinitionForSchema<
  Schema extends ContractSchema,
  TextEnabled extends boolean,
> = Readonly<{
  readonly description: string;
  readonly schema: Schema;
}> &
  ([TextEnabled] extends [false]
    ? Readonly<{ readonly text?: never }>
    : Readonly<{
        readonly text?: StreamTextPresenter<ContractSchemaOutput<Schema>>;
      }>);

type StreamRecordDefinitionsForSchemas<
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly [Variant in keyof Schemas]: StreamRecordDefinitionForSchema<
    Schemas[Variant],
    TextEnabled
  >;
}>;

export interface CompletionRootCommandDefinition<
  Command extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions = Readonly<Record<never, never>>,
  Fields extends FieldDefinitions = Readonly<Record<never, never>>,
  InputSchema extends ContractSchema = ContractSchema<EmptyCliInput>,
  TextEnabled extends boolean = boolean,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly usageConstraints?: readonly UsageConstraint<Fields>[];
  readonly fields?: CheckedFieldDefinitions<Fields> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Fields>;
  readonly input: InputSchema &
    RawFieldInputContract<Command, Fields, InputSchema>;
  readonly success: CompletionSuccessDefinition<Command, TextEnabled>;
  readonly failures: Failures &
    ClosedAtomicVariants<Failures> &
    FailureVariantNameContract<Failures> &
    FailureVariantTextContract<Command, Failures, TextEnabled>;
  readonly handler: (
    context: CompletionHandlerContext<
      Command,
      Dependencies,
      Failures,
      ContractSchemaOutput<InputSchema>
    >,
  ) =>
    | CompletionFact<Command>
    | FailureFactUnion<Command, Failures>
    | Promise<CompletionFact<Command> | FailureFactUnion<Command, Failures>>;
}

export interface DataRootCommandDefinition<
  Command extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Variants extends DataVariantDefinitions,
  Failures extends FailureVariantDefinitions,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly usageConstraints?: readonly UsageConstraint<Fields>[];
  readonly fields: CheckedFieldDefinitions<Fields> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Fields>;
  readonly input: InputSchema &
    RawFieldInputContract<Command, Fields, InputSchema>;
  readonly success: Readonly<{
    readonly kind: "data";
    readonly variants: Variants &
      ClosedAtomicVariants<Variants> &
      DataVariantNameContract<Variants>;
  }>;
  readonly failures: Failures &
    ClosedAtomicVariants<Failures> &
    FailureVariantNameContract<Failures>;
  readonly handler: (
    context: DataHandlerContext<
      Command,
      Dependencies,
      ContractSchemaOutput<InputSchema>,
      Variants,
      Failures
    >,
  ) =>
    | DataFactUnion<Command, Variants>
    | FailureFactUnion<Command, Failures>
    | Promise<
        DataFactUnion<Command, Variants> | FailureFactUnion<Command, Failures>
      >;
}

export interface StreamRootCommandDefinition<
  Command extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
  TextEnabled extends boolean = boolean,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly usageConstraints?: readonly UsageConstraint<Fields>[];
  readonly fields?: CheckedFieldDefinitions<Fields> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Fields>;
  readonly input: InputSchema &
    RawFieldInputContract<Command, Fields, InputSchema>;
  readonly success: Readonly<{
    readonly kind: "stream";
    readonly records: Records &
      StreamRecordDefinitions<TextEnabled> &
      ClosedStreamRecords<Records> &
      StreamRecordNameContract<Records>;
  }> &
    (TextEnabled extends true
      ? Readonly<{ readonly text: CompletionTextPresenter }>
      : TextEnabled extends false
        ? Readonly<{ readonly text?: never }>
        : Readonly<{ readonly text?: CompletionTextPresenter }>);
  readonly failures: Failures &
    ClosedAtomicVariants<Failures> &
    FailureVariantNameContract<Failures>;
  readonly handler: (
    context: StreamHandlerContext<
      Command,
      Dependencies,
      ContractSchemaOutput<InputSchema>,
      Records,
      Failures
    >,
  ) => AsyncGenerator<
    StreamRecordFactUnion<Command, Records>,
    StreamSuccessFact<Command> | FailureFactUnion<Command, Failures>,
    void
  >;
}

export type RootCommandDefinition<Command extends string, Dependencies> =
  | CompletionRootCommandDefinition<
      Command,
      Dependencies,
      FailureVariantDefinitions,
      FieldDefinitions,
      ContractSchema
    >
  | DataRootCommandDefinition<
      Command,
      Dependencies,
      FieldDefinitions,
      ContractSchema,
      DataVariantDefinitions,
      FailureVariantDefinitions
    >
  | StreamRootCommandDefinition<
      Command,
      Dependencies,
      FieldDefinitions,
      ContractSchema,
      StreamRecordDefinitions,
      FailureVariantDefinitions
    >;

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

type HierarchyCommandFacts<Parent extends string = string> = Readonly<{
  readonly kind: "command";
  readonly parent: Parent;
  readonly aliases?: readonly string[];
  readonly helpSupplement?: TextLines;
  readonly [executableCommandType]: true;
}>;

export type ExecutableCommandDefinition<
  Command extends string = string,
  Dependencies = unknown,
> =
  | (Omit<
      CompletionRootCommandDefinition<
        Command,
        Dependencies,
        FailureVariantDefinitions,
        FieldDefinitions,
        ContractSchema
      >,
      "kind"
    > &
      HierarchyCommandFacts)
  | (Omit<
      DataRootCommandDefinition<
        Command,
        Dependencies,
        FieldDefinitions,
        ContractSchema,
        DataVariantDefinitions,
        FailureVariantDefinitions
      >,
      "kind"
    > &
      HierarchyCommandFacts)
  | (Omit<
      StreamRootCommandDefinition<
        Command,
        Dependencies,
        FieldDefinitions,
        ContractSchema,
        StreamRecordDefinitions,
        FailureVariantDefinitions
      >,
      "kind"
    > &
      HierarchyCommandFacts);

export type CommandNodeDefinition =
  | CommandGroupDefinition
  | (HierarchyCommandFacts &
      Readonly<{
        readonly name: string;
        readonly description: string;
        readonly fields?: unknown;
        readonly input: ContractSchema;
        readonly success:
          | Readonly<{ readonly kind: "completion" }>
          | Readonly<{
              readonly kind: "data";
              readonly variants: DataVariantDefinitions;
            }>
          | Readonly<{
              readonly kind: "stream";
              readonly records: StreamRecordDefinitions;
              readonly text?: CompletionTextPresenter;
            }>;
        readonly failures: FailureVariantDefinitions;
        readonly handler: unknown;
      }>)
  | RootGroupDefinition;

export type HierarchyCliDefinition<Root extends string> =
  RootCliDefinitionBase<Root> &
    Readonly<{
      readonly commands: Readonly<Record<string, CommandNodeDefinition>> &
        Readonly<Record<Root, RootGroupDefinition>>;
    }>;

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
    readonly success: Readonly<{
      readonly kind: "data";
      readonly variants: infer Variants extends DataVariantDefinitions;
    }>;
    readonly failures: infer Failures extends FailureVariantDefinitions;
  }>
    ?
        | DataFactUnion<Extract<Command, string>, Variants>
        | FailureFactUnion<Extract<Command, string>, Failures>
    : Commands[Command] extends Readonly<{
          readonly kind: "command";
          readonly success: Readonly<{ readonly kind: "completion" }>;
          readonly failures: infer Failures extends FailureVariantDefinitions;
        }>
      ?
          | CompletionFact<Extract<Command, string>>
          | FailureFactUnion<Extract<Command, string>, Failures>
      : Commands[Command] extends Readonly<{
            readonly kind: "command";
            readonly success: Readonly<{
              readonly kind: "stream";
              readonly records: StreamRecordDefinitions;
            }>;
            readonly failures: infer Failures extends FailureVariantDefinitions;
          }>
        ?
            | StreamSuccessFact<Extract<Command, string>>
            | FailureFactUnion<Extract<Command, string>, Failures>
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

type UsageConstraintValueFields<Values> =
  Values extends readonly (infer Value)[]
    ? Value extends Readonly<{ readonly field: infer Field extends string }>
      ? Field
      : never
    : never;

type InvalidUsageConstraintForFields<
  Command extends string,
  Constraint,
  Fields extends FieldDefinitions,
> =
  Constraint extends Readonly<{
    readonly kind: "requires";
    readonly field: infer Field extends string;
    readonly requires: infer Required extends string;
  }>
    ? Exclude<Field, keyof Fields> extends never
      ? Exclude<Required, keyof Fields> extends never
        ? never
        : ContractTypeError<
            "unknownUsageConstraintField",
            Readonly<{
              readonly command: Command;
              readonly constraint: "requires";
              readonly member: "requires";
              readonly field: Exclude<Required, keyof Fields>;
            }>
          >
      : ContractTypeError<
          "unknownUsageConstraintField",
          Readonly<{
            readonly command: Command;
            readonly constraint: "requires";
            readonly member: "field";
            readonly field: Exclude<Field, keyof Fields>;
          }>
        >
    : Constraint extends Readonly<{
          readonly kind: "exclusive";
          readonly fields: readonly (infer Field extends string)[];
        }>
      ? Exclude<Field, keyof Fields> extends never
        ? never
        : ContractTypeError<
            "unknownUsageConstraintField",
            Readonly<{
              readonly command: Command;
              readonly constraint: "exclusive";
              readonly member: "fields";
              readonly field: Exclude<Field, keyof Fields>;
            }>
          >
      : Constraint extends Readonly<{
            readonly kind: "forbiddenCombination";
            readonly values: infer Values extends readonly unknown[];
          }>
        ? Exclude<
            UsageConstraintValueFields<Values>,
            keyof Fields
          > extends never
          ? Constraint extends ForbiddenCombinationUsageConstraint<Fields>
            ? never
            : ContractTypeError<
                "invalidEffectiveUsageConstraint",
                Readonly<{ readonly command: Command }>
              >
          : ContractTypeError<
              "unknownUsageConstraintField",
              Readonly<{
                readonly command: Command;
                readonly constraint: "forbiddenCombination";
                readonly member: "values.field";
                readonly field: Exclude<
                  UsageConstraintValueFields<Values>,
                  keyof Fields
                >;
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
            HierarchyCommandFields<Commands[Command]>
          > extends never
          ? never
          : InvalidUsageConstraintForFields<
              Command,
              Constraint,
              HierarchyCommandFields<Commands[Command]>
            >
        : ContractTypeError<
            "invalidEffectiveUsageConstraint",
            Readonly<{ readonly command: Command }>
          >
    : never;
}[keyof Commands & string];

type RootIdentityContract<Root extends string> = string extends Root
  ? unknown
  : IsLowerCamelCase<Root> extends true
    ? unknown
    : ContractTypeError<
        "commandMustBeLowerCamelCase",
        Readonly<{ readonly command: Root }>
      >;

type RootCliDefinitionBase<Root extends string> = RootIdentityContract<Root> & {
  readonly root: Root;
  readonly help: HelpCapability;
  readonly version?: VersionCapability;
  readonly output: OutputCapability;
  readonly usageFailureExitCode: number;
};

export type CompletionRootCliDefinition<
  Root extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions = Readonly<Record<never, never>>,
  Fields extends FieldDefinitions = Readonly<Record<never, never>>,
  InputSchema extends ContractSchema = ContractSchema<EmptyCliInput>,
  TextEnabled extends boolean = boolean,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: CompletionRootCommandDefinition<
        Command,
        Dependencies,
        Failures,
        Fields,
        InputSchema,
        TextEnabled
      >;
    }>;
  }>;

export type DataRootCliDefinition<
  Root extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Variants extends DataVariantDefinitions,
  Failures extends FailureVariantDefinitions,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: DataRootCommandDefinition<
        Command,
        Dependencies,
        Fields,
        InputSchema,
        Variants,
        Failures
      >;
    }>;
  }>;

export type StreamRootCliDefinition<
  Root extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
  TextEnabled extends boolean = boolean,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: StreamRootCommandDefinition<
        Command,
        Dependencies,
        Fields,
        InputSchema,
        Records,
        Failures,
        TextEnabled
      >;
    }>;
  }>;

export type RootCliDefinition<Root extends string, Dependencies> =
  | CompletionRootCliDefinition<
      Root,
      Dependencies,
      FailureVariantDefinitions,
      FieldDefinitions,
      ContractSchema
    >
  | DataRootCliDefinition<
      Root,
      Dependencies,
      FieldDefinitions,
      ContractSchema,
      DataVariantDefinitions,
      FailureVariantDefinitions
    >
  | StreamRootCliDefinition<
      Root,
      Dependencies,
      FieldDefinitions,
      ContractSchema,
      StreamRecordDefinitions,
      FailureVariantDefinitions
    >;

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

export interface RootCommandGrammar<Root extends string> {
  readonly kind: "rootCommand";
  readonly id: Root;
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly usage: CommandUsage<Root>;
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
> extends GroupGrammarBase<Command> {
  readonly kind: "command";
  readonly parent: string;
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
}

export type CommandGrammar<Command extends string = string> =
  | CommandGroupGrammar<Command>
  | ExecutableCommandGrammar<Command>;

export type CliRootKind = "rootCommand" | "rootGroup";

export interface CliGrammar<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
> {
  readonly root: RootKind extends "rootGroup"
    ? RootGroupGrammar<Root>
    : RootCommandGrammar<Root>;
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
    readonly output: Readonly<{
      readonly defaultFormat: OutputFormat;
      readonly formats: readonly OutputFormat[];
      readonly selector?: "--output-format";
      readonly compatibilityFlags?: Readonly<Record<string, OutputFormat>>;
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

export interface RootCommandManifest {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly input: SchemaManifest;
  readonly success: CommandSuccessManifest;
  readonly failures: Readonly<Record<string, FailureVariantManifest>>;
}

export interface CommandGroupManifest {
  readonly kind: "rootGroup" | "commandGroup";
  readonly parent?: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly helpSupplement?: readonly string[];
}

export interface ExecutableCommandManifest extends Omit<
  RootCommandManifest,
  "kind"
> {
  readonly kind: "command";
  readonly parent: string;
  readonly aliases: readonly string[];
  readonly helpSupplement?: readonly string[];
}

export type UsageConstraintGrammar =
  | RequiresUsageConstraint
  | ExclusiveUsageConstraint
  | ForbiddenCombinationUsageConstraint;

export interface CliManifest<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
> {
  readonly schemaVersion: "3";
  readonly root: Root;
  readonly commands: RootKind extends "rootGroup"
    ? Readonly<Record<string, CommandGroupManifest | ExecutableCommandManifest>>
    : Readonly<Record<Root, RootCommandManifest>>;
  readonly controls: CliGrammar<Root, RootKind>["controls"];
  readonly usageFailure: Readonly<{
    readonly exitCode: number;
    readonly wire: JsonObject;
  }>;
  readonly wire: RootKind extends "rootGroup"
    ? Readonly<Record<string, CommandWireManifest>>
    : CommandWireManifest;
}

export interface CommandWireManifest {
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
      ? ExecutableCommandGrammar<Command> &
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
        ? ExecutableCommandManifest & Readonly<{ readonly parent: Parent }>
        : never;

type HierarchyExecutableKeys<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
  }>
    ? Command
    : never;
}[keyof Commands];

export interface HierarchyCliManifest<Root extends string, Commands> {
  readonly schemaVersion: "3";
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
> {
  readonly grammar: [Commands] extends [never]
    ? CliGrammar<Root, RootKind>
    : HierarchyCliGrammar<Root, Commands>;
  readonly manifest: [Commands] extends [never]
    ? CliManifest<Root, RootKind>
    : HierarchyCliManifest<Root, Commands>;
  readonly [cliContractType]: Readonly<{
    readonly dependencies: Dependencies;
    readonly rawInput: RawInput;
    readonly result: Result;
    readonly root: Root;
    readonly commands: [Commands] extends [never] ? Root : keyof Commands;
  }>;
}

export type CliContractDependencies<Contract> =
  Contract extends CliContract<
    infer _Root,
    infer Dependencies,
    unknown,
    OutcomeFact,
    CliRootKind,
    infer _Commands
  >
    ? Dependencies
    : never;

export type CliContractRawInput<Contract> =
  Contract extends CliContract<
    infer _Root,
    unknown,
    infer RawInput,
    OutcomeFact,
    CliRootKind,
    infer _Commands
  >
    ? RawInput
    : never;

export type CliContractResult<Contract> =
  Contract extends CliContract<
    infer _Root,
    unknown,
    unknown,
    infer Result,
    CliRootKind,
    infer _Commands
  >
    ? Result
    : never;

export type CliContractRoot<Contract> =
  Contract extends CliContract<
    infer Root,
    unknown,
    unknown,
    OutcomeFact,
    CliRootKind,
    infer Commands
  >
    ? [Commands] extends [never]
      ? Root
      : Extract<keyof Commands, string>
    : never;

type HasTextPresenter<Value> =
  Value extends Readonly<{ readonly text: unknown }> ? true : false;

type PresentTextVariants<Variants> = {
  [Variant in keyof Variants & string]: HasTextPresenter<
    Variants[Variant]
  > extends true
    ? Variant
    : never;
}[keyof Variants & string];

type UnexpectedVariantTextIssue<
  Command extends string,
  Location extends "data" | "failure" | "record",
  Variants,
> = [PresentTextVariants<Variants>] extends [never]
  ? never
  : ContractTypeError<
      "unexpectedTextPresenter",
      Readonly<{
        readonly command: Command;
        readonly location: Location;
        readonly variant: PresentTextVariants<Variants>;
        readonly unexpected: "text";
      }>
    >;

type UnexpectedSuccessTextIssue<
  Command extends string,
  Location extends "completion" | "streamSuccess",
  Success,
> =
  HasTextPresenter<Success> extends true
    ? ContractTypeError<
        "unexpectedTextPresenter",
        Readonly<{
          readonly command: Command;
          readonly location: Location;
          readonly unexpected: "text";
        }>
      >
    : never;

type UnexpectedHierarchyTextIssues<Commands> = {
  [Command in keyof Commands & string]: Commands[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
    readonly success: infer Success;
    readonly failures: infer Failures;
  }>
    ? Success extends Readonly<{ readonly kind: "completion" }>
      ?
          | UnexpectedSuccessTextIssue<Command, "completion", Success>
          | UnexpectedVariantTextIssue<Command, "failure", Failures>
      : Success extends Readonly<{ readonly variants: infer Variants }>
        ?
            | UnexpectedVariantTextIssue<Command, "data", Variants>
            | UnexpectedVariantTextIssue<Command, "failure", Failures>
        : Success extends Readonly<{
              readonly kind: "stream";
              readonly records: infer Records;
            }>
          ?
              | UnexpectedSuccessTextIssue<Command, "streamSuccess", Success>
              | UnexpectedVariantTextIssue<Command, "record", Records>
              | UnexpectedVariantTextIssue<Command, "failure", Failures>
          : never
    : never;
}[keyof Commands & string];

type HierarchyUsageValidation<Commands> = [
  InvalidCommandUsageConstraintIssues<Commands>,
] extends [never]
  ? [HierarchyInputIssues<Commands>] extends [never]
    ? readonly []
    : readonly [HierarchyInputIssues<Commands>]
  : readonly [InvalidCommandUsageConstraintIssues<Commands>];

type HierarchyCommandTextContract<Command extends string, Definition> =
  Definition extends Readonly<{
    readonly success: infer Success;
    readonly failures: infer Failures;
  }>
    ? Success extends Readonly<{ readonly kind: "completion" }>
      ? FailureVariantTextContract<Command, Failures, true> &
          (HasTextPresenter<Success> extends true
            ? unknown
            : ContractTypeError<
                "missingTextPresenter",
                Readonly<{
                  readonly command: Command;
                  readonly location: "completion";
                  readonly missing: "text";
                }>
              >)
      : Success extends Readonly<{
            readonly kind: "data";
            readonly variants: infer Variants;
          }>
        ? DataVariantTextContract<Command, Variants, true> &
            FailureVariantTextContract<Command, Failures, true>
        : Success extends Readonly<{
              readonly kind: "stream";
              readonly records: infer Records;
            }>
          ? StreamRecordTextContract<Command, Records, true> &
              FailureVariantTextContract<Command, Failures, true> &
              (HasTextPresenter<Success> extends true
                ? unknown
                : ContractTypeError<
                    "missingTextPresenter",
                    Readonly<{
                      readonly command: Command;
                      readonly location: "streamSuccess";
                      readonly missing: "text";
                    }>
                  >)
          : unknown
    : unknown;

type HierarchyTextIssues<Commands> = {
  [
    Command in keyof Commands & string
  ]: Commands[Command] extends HierarchyCommandTextContract<
    Command,
    Commands[Command]
  >
    ? never
    : HierarchyCommandTextContract<Command, Commands[Command]>;
}[keyof Commands & string];

type HierarchyTextValidation<Commands> = [
  HierarchyTextIssues<Commands>,
] extends [never]
  ? unknown
  : HierarchyTextIssues<Commands>;

type HierarchyOutputValidation<Commands, Output extends OutputCapability> =
  Output extends OutputCapability<infer Formats>
    ? [Formats] extends [readonly ["structured", "text"]]
      ? [HierarchyTextIssues<Commands>] extends [never]
        ? HierarchyUsageValidation<Commands>
        : readonly [HierarchyTextIssues<Commands>]
      : [Formats] extends [readonly ["structured"]]
        ? [UnexpectedHierarchyTextIssues<Commands>] extends [never]
          ? HierarchyUsageValidation<Commands>
          : readonly [UnexpectedHierarchyTextIssues<Commands>]
        : HierarchyUsageValidation<Commands>
    : HierarchyUsageValidation<Commands>;

type ValidationIntersection<Validation extends readonly unknown[]> =
  Validation extends readonly []
    ? unknown
    : Validation extends readonly [infer Error]
      ? Error
      : never;

type HierarchyContract<Commands, Output extends OutputCapability> = [
  TextEnabledForOutput<Output>,
] extends [true]
  ? HierarchyTextValidation<Commands> &
      ValidationIntersection<HierarchyUsageValidation<Commands>>
  : ValidationIntersection<HierarchyOutputValidation<Commands, Output>>;

type TextEnabledForOutput<Output extends OutputCapability> =
  Output extends OutputCapability<infer Formats>
    ? [Formats] extends [never]
      ? boolean
      : [Formats] extends [readonly ["structured", "text"]]
        ? true
        : [Formats] extends [readonly ["structured"]]
          ? false
          : boolean
    : boolean;

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
> = FieldDefinitions extends Fields
  ? EmptyRawObject extends ContractSchemaInput<InputSchema>
    ? unknown
    : MissingRootFallbackFieldsContract<Command, InputSchema>
  : RawFieldInputContract<Command, Fields, InputSchema>;

type RootFallbackKind = "completion" | "data" | "stream";

type RootFallbackHandlerContext<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  Variants extends DataVariantDefinitions,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
  Kind extends RootFallbackKind,
> = {
  readonly completion: CompletionHandlerContext<
    Command,
    Dependencies,
    Failures,
    ContractSchemaOutput<InputSchema>
  >;
  readonly data: DataHandlerContext<
    Command,
    Dependencies,
    ContractSchemaOutput<InputSchema>,
    Variants,
    Failures
  >;
  readonly stream: StreamHandlerContext<
    Command,
    Dependencies,
    ContractSchemaOutput<InputSchema>,
    Records,
    Failures
  >;
}[Kind];

type RootFallbackHandlerResult<
  Command extends string,
  Variants extends DataVariantDefinitions,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
  Kind extends RootFallbackKind,
> = {
  readonly completion:
    | CompletionFact<Command>
    | FailureFactUnion<Command, Failures>
    | Promise<CompletionFact<Command> | FailureFactUnion<Command, Failures>>;
  readonly data:
    | DataFactUnion<Command, Variants>
    | FailureFactUnion<Command, Failures>
    | Promise<
        DataFactUnion<Command, Variants> | FailureFactUnion<Command, Failures>
      >;
  readonly stream: AsyncGenerator<
    StreamRecordFactUnion<Command, Records>,
    StreamSuccessFact<Command> | FailureFactUnion<Command, Failures>,
    void
  >;
}[Kind];

type RootNodeFromCommands<Root extends string, Commands> =
  Commands extends Readonly<Record<Root, infer Node>> ? Node : never;

type RootCommandRawInput<Root extends string, Commands> =
  RootNodeFromCommands<Root, Commands> extends Readonly<{
    readonly fields: infer Fields extends FieldDefinitions;
  }>
    ? RawFieldInput<Fields>
    : EmptyCliInput;

type RootCommandResult<Root extends string, Commands> =
  RootNodeFromCommands<Root, Commands> extends Readonly<{
    readonly success: infer Success;
    readonly failures: infer Failures extends FailureVariantDefinitions;
  }>
    ? Success extends Readonly<{ readonly kind: "completion" }>
      ? CompletionFact<Root> | FailureFactUnion<Root, Failures>
      : Success extends Readonly<{
            readonly kind: "data";
            readonly variants: infer Variants extends DataVariantDefinitions;
          }>
        ? DataFactUnion<Root, Variants> | FailureFactUnion<Root, Failures>
        : Success extends Readonly<{ readonly kind: "stream" }>
          ? StreamSuccessFact<Root> | FailureFactUnion<Root, Failures>
          : never
    : never;

type RootFallbackCliDefinition<
  Root extends string,
  _Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  VariantSchemas extends VariantSchemaMap,
  Variants,
  RecordSchemas extends VariantSchemaMap,
  Records,
  FailureSchemas extends VariantSchemaMap,
  Failures,
  TextEnabled extends boolean,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: Readonly<{
        readonly kind: "rootCommand";
        readonly name: string;
        readonly description: string;
        readonly helpSupplement?: TextLines;
        readonly usageConstraints?: readonly UsageConstraint[];
      }> &
        Readonly<{
          readonly input: InputSchema &
            RootFallbackRawFieldInputContract<Command, Fields, InputSchema>;
          readonly failures: Failures &
            FailureVariantDefinitionsForSchemas<FailureSchemas, boolean> &
            FailureVariantNameContract<Failures> &
            FailureVariantTextContract<Command, Failures, TextEnabled>;
        }> &
        (
          | Readonly<{
              readonly fields: CheckedFieldDefinitions<Fields> &
                FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
                FieldIdentityContract<Fields>;
              readonly success: Readonly<{
                readonly kind: "data";
                readonly variants: Variants &
                  DataVariantDefinitionsForSchemas<VariantSchemas, boolean> &
                  DataVariantNameContract<Variants> &
                  DataVariantTextContract<Command, Variants, TextEnabled>;
              }>;
            }>
          | Readonly<{
              readonly fields?: CheckedFieldDefinitions<Fields> &
                FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
                FieldIdentityContract<Fields>;
              readonly success: CompletionSuccessDefinition<Root, TextEnabled>;
            }>
          | Readonly<{
              readonly fields?: CheckedFieldDefinitions<Fields> &
                FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
                FieldIdentityContract<Fields>;
              readonly success:
                | (Readonly<{
                    readonly kind: "stream";
                    readonly records: Records &
                      StreamRecordDefinitionsForSchemas<
                        RecordSchemas,
                        boolean
                      > &
                      StreamRecordNameContract<Records>;
                    readonly text: CompletionTextPresenter;
                  }> &
                    StreamRecordTextContract<Command, Records, TextEnabled>)
                | (Readonly<{
                    readonly kind: "stream";
                    readonly records: Records &
                      StreamRecordDefinitionsForSchemas<
                        RecordSchemas,
                        boolean
                      > &
                      StreamRecordNameContract<Records>;
                    readonly text?: never;
                  }> &
                    ([TextEnabled] extends [true]
                      ? ContractTypeError<
                          "missingTextPresenter",
                          Readonly<{
                            readonly command: Command;
                            readonly location: "streamSuccess";
                            readonly missing: "text";
                          }>
                        >
                      : unknown));
            }>
        );
    }>;
  }>;

type RootFallbackHandlerDefinition<
  Root extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  Variants extends DataVariantDefinitions,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
  Kind extends RootFallbackKind,
> = Readonly<{
  readonly commands: Readonly<{
    readonly [Command in Root]: Readonly<{
      readonly success: Readonly<{ readonly kind: Kind }>;
      readonly handler: (
        context: RootFallbackHandlerContext<
          Command,
          Dependencies,
          InputSchema,
          Variants,
          Records,
          Failures,
          NoInfer<Kind>
        >,
      ) => RootFallbackHandlerResult<
        Command,
        Variants,
        Records,
        Failures,
        NoInfer<Kind>
      >;
    }>;
  }>;
}>;

type RootFallbackNodeDefinition<
  Root extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  VariantSchemas extends VariantSchemaMap,
  Variants,
  RecordSchemas extends VariantSchemaMap,
  Records,
  FailureSchemas extends VariantSchemaMap,
  Failures,
  TextEnabled extends boolean,
  Kind extends RootFallbackKind,
> = (RootFallbackCliDefinition<
  Root,
  Dependencies,
  Fields,
  InputSchema,
  VariantSchemas,
  Variants,
  RecordSchemas,
  Records,
  FailureSchemas,
  Failures,
  TextEnabled
> &
  RootFallbackHandlerDefinition<
    Root,
    Dependencies,
    InputSchema,
    DataVariantDefinitionsForSchemas<VariantSchemas, boolean>,
    StreamRecordDefinitionsForSchemas<RecordSchemas, boolean>,
    FailureVariantDefinitionsForSchemas<FailureSchemas, boolean>,
    Kind
  >)["commands"][Root];

/* oxlint-disable typescript/no-unnecessary-type-parameters -- 公共签名的泛型参与嵌套契约约束，不能按单次出现次数机械删除。 */
export interface DefineCli<Dependencies> {
  /**
   * 为命令组创建可执行后代，再把返回记录展开到同一个 `commands` 对象中交给
   * `defineCli()` 装配。后代只声明自己的输入和结果；根级 output 的全树约束在最终
   * 装配处统一判定。
   */
  readonly command: <const Command extends string>(
    command: Command,
  ) => DefineCommand<Command, Dependencies>;

  /**
   * 装配根命令或命令组。命令组的后代在 `commands` 中合并后统一检查
   * 根级 output 与每个结果位置的关系；静态事实在这里被拒绝，动态值
   * 继续由定义期的闭合问题说明原因。
   */
  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const VariantSchemas extends VariantSchemaMap,
    const Variants,
    const RecordSchemas extends VariantSchemaMap,
    const Records,
    const FailureSchemas extends VariantSchemaMap,
    const Failures,
    const Output extends OutputCapability,
    const Kind extends RootFallbackKind,
    const Commands,
    const Definition extends object,
  >(
    definition: Definition &
      ClosedRootDefinition<Definition> &
      RootCliDefinitionBase<Root> &
      Readonly<{
        readonly output: Output;
        readonly commands: Commands &
          ClosedRootCommands<Commands> &
          Readonly<
            Record<
              Root,
              | RootFallbackNodeDefinition<
                  Root,
                  Dependencies,
                  Fields,
                  InputSchema,
                  VariantSchemas,
                  Variants,
                  RecordSchemas,
                  Records,
                  FailureSchemas,
                  Failures,
                  boolean,
                  Kind
                >
              | RootGroupDefinition
            >
          >;
      }> &
      (Commands extends Readonly<Record<Root, { readonly kind: "rootGroup" }>>
        ? HierarchyCliDefinition<Root> & HierarchyContract<Commands, Output>
        : ValidationIntersection<HierarchyOutputValidation<Commands, Output>>),
  ): Commands extends Readonly<Record<Root, { readonly kind: "rootGroup" }>>
    ? CliContract<
        Root,
        Dependencies,
        HierarchyRawInput<Commands>,
        HierarchyResult<Commands>,
        "rootGroup",
        Commands
      >
    : CliContract<
        Root,
        Dependencies,
        RootCommandRawInput<Root, Commands>,
        RootCommandResult<Root, Commands>,
        "rootCommand"
      >;
}

type HierarchyCommandInput<Definition> = Omit<Definition, "kind"> &
  Omit<HierarchyCommandFacts, typeof executableCommandType>;

type HierarchyCompletionCommandDefinition<
  Command extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
> = Omit<
  CompletionRootCommandDefinition<
    Command,
    Dependencies,
    Failures,
    Fields,
    InputSchema
  >,
  "fields" | "input" | "usageConstraints"
> &
  Readonly<{
    readonly fields?: CheckedFieldDefinitions<Fields> &
      FieldIdentityContract<Fields>;
    readonly input: InputSchema;
  }>;

type HierarchyDataCommandDefinition<
  Command extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Variants extends DataVariantDefinitions,
  Failures extends FailureVariantDefinitions,
> = Omit<
  DataRootCommandDefinition<
    Command,
    Dependencies,
    Fields,
    InputSchema,
    Variants,
    Failures
  >,
  "fields" | "input" | "usageConstraints"
> &
  Readonly<{
    readonly fields: CheckedFieldDefinitions<Fields> &
      FieldIdentityContract<Fields>;
    readonly input: InputSchema;
  }>;

type HierarchyStreamCommandDefinition<
  Command extends string,
  Dependencies,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
  Records extends StreamRecordDefinitions,
  Failures extends FailureVariantDefinitions,
> = Omit<
  StreamRootCommandDefinition<
    Command,
    Dependencies,
    Fields,
    InputSchema,
    Records,
    Failures
  >,
  "fields" | "input" | "usageConstraints"
> &
  Readonly<{
    readonly fields: CheckedFieldDefinitions<Fields> &
      FieldIdentityContract<Fields>;
    readonly input: InputSchema;
  }>;

type UsageConstraintProperty<Constraints> =
  Constraints extends readonly unknown[]
    ? Readonly<{ readonly usageConstraints: Constraints }>
    : unknown;

type ActualFailureDefinitions<Failures> =
  Failures extends FailureVariantDefinitions ? Failures : never;

type RootFallbackFieldsProperty<
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
> =
  | Readonly<{
      readonly fields: CheckedFieldDefinitions<Fields> &
        FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
        FieldIdentityContract<Fields>;
      readonly success: Readonly<{ readonly kind: "data" | "stream" }>;
    }>
  | Readonly<{
      readonly fields?: CheckedFieldDefinitions<Fields> &
        FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
        FieldIdentityContract<Fields>;
      readonly success: Readonly<{ readonly kind: "completion" }>;
    }>;

/* oxlint-disable typescript/no-unnecessary-type-parameters -- 公共命令重载用泛型连接字段、模式、结果与 handler。 */
/** 为具名叶命令生成可展开到根契约 `commands` 的定义。 */
export interface DefineCommand<Command extends string, Dependencies> {
  <
    const Definition extends object,
    const Parent extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const VariantSchemas extends VariantSchemaMap,
    const Variants,
    const RecordSchemas extends VariantSchemaMap,
    const Records,
    const FailureSchemas extends VariantSchemaMap,
    const Failures,
    const Kind extends RootFallbackKind,
  >(
    definition: Definition &
      ClosedCommandDefinition<Definition> &
      Omit<
        RootFallbackCliDefinition<
          Command,
          Dependencies,
          Fields,
          InputSchema,
          VariantSchemas,
          Variants,
          RecordSchemas,
          Records,
          FailureSchemas,
          Failures,
          boolean
        >["commands"][Command],
        "kind" | "fields"
      > &
      RootFallbackFieldsProperty<Fields, InputSchema> &
      RootFallbackHandlerDefinition<
        Command,
        Dependencies,
        InputSchema,
        DataVariantDefinitionsForSchemas<VariantSchemas, boolean>,
        StreamRecordDefinitionsForSchemas<RecordSchemas, boolean>,
        ActualFailureDefinitions<Failures>,
        Kind
      >["commands"][Command] &
      Omit<HierarchyCommandFacts<Parent>, typeof executableCommandType>,
  ): Readonly<Record<Command, Definition & HierarchyCommandFacts<Parent>>>;

  <
    const Definition extends object,
    const Parent extends string,
    const Failures extends FailureVariantDefinitions,
    const Constraints extends readonly unknown[] | undefined = undefined,
  >(
    definition: Definition &
      ClosedCommandDefinition<Definition> &
      HierarchyCommandInput<
        HierarchyCompletionCommandDefinition<
          Command,
          Dependencies,
          Failures,
          Readonly<Record<never, never>>,
          ContractSchema<EmptyCliInput>
        >
      > &
      Readonly<{
        readonly parent: Parent;
        readonly usageConstraints?: Constraints & readonly UsageConstraint[];
      }>,
  ): Readonly<
    Record<
      Command,
      Definition &
        Omit<
          HierarchyCompletionCommandDefinition<
            Command,
            Dependencies,
            Failures,
            Readonly<Record<never, never>>,
            ContractSchema<EmptyCliInput>
          >,
          "kind" | "success" | "failures"
        > &
        UsageConstraintProperty<Constraints> &
        HierarchyCommandFacts<Parent>
    >
  >;

  <
    const Definition extends object,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Parent extends string,
    const Failures extends FailureVariantDefinitions,
    const Constraints extends readonly unknown[] | undefined = undefined,
  >(
    definition: Definition &
      ClosedCommandDefinition<Definition> &
      HierarchyCommandInput<
        HierarchyCompletionCommandDefinition<
          Command,
          Dependencies,
          Failures,
          Fields,
          InputSchema
        >
      > &
      Readonly<{
        readonly fields: Fields;
        readonly parent: Parent;
        readonly usageConstraints?: Constraints & readonly UsageConstraint[];
      }>,
  ): Readonly<
    Record<
      Command,
      Definition &
        Omit<
          HierarchyCompletionCommandDefinition<
            Command,
            Dependencies,
            Failures,
            Fields,
            InputSchema
          >,
          "kind" | "success" | "failures"
        > &
        UsageConstraintProperty<Constraints> &
        HierarchyCommandFacts<Parent>
    >
  >;

  <
    const Definition extends object,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Parent extends string,
    const Variants extends DataVariantDefinitions,
    const Failures extends FailureVariantDefinitions,
    const Constraints extends readonly unknown[] | undefined = undefined,
  >(
    definition: Definition &
      ClosedCommandDefinition<Definition> &
      HierarchyCommandInput<
        HierarchyDataCommandDefinition<
          Command,
          Dependencies,
          Fields,
          InputSchema,
          Variants,
          Failures
        >
      > &
      Readonly<{
        readonly parent: Parent;
        readonly usageConstraints?: Constraints & readonly UsageConstraint[];
      }>,
  ): Readonly<
    Record<
      Command,
      Definition &
        Omit<
          HierarchyDataCommandDefinition<
            Command,
            Dependencies,
            Fields,
            InputSchema,
            Variants,
            Failures
          >,
          "kind" | "success" | "failures"
        > &
        UsageConstraintProperty<Constraints> &
        HierarchyCommandFacts<Parent>
    >
  >;

  <
    const Definition extends object,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Parent extends string,
    const Records extends StreamRecordDefinitions,
    const Failures extends FailureVariantDefinitions,
    const Constraints extends readonly unknown[] | undefined = undefined,
  >(
    definition: Definition &
      ClosedCommandDefinition<Definition> &
      HierarchyCommandInput<
        HierarchyStreamCommandDefinition<
          Command,
          Dependencies,
          Fields,
          InputSchema,
          Records,
          Failures
        >
      > &
      Readonly<{
        readonly parent: Parent;
        readonly usageConstraints?: Constraints & readonly UsageConstraint[];
      }>,
  ): Readonly<
    Record<
      Command,
      Definition &
        Omit<
          HierarchyStreamCommandDefinition<
            Command,
            Dependencies,
            Fields,
            InputSchema,
            Records,
            Failures
          >,
          "kind" | "success" | "failures"
        > &
        UsageConstraintProperty<Constraints> &
        HierarchyCommandFacts<Parent>
    >
  >;
}

interface RuntimeCompiledCli {
  readonly contract: CliContract;
  readonly root: string;
  readonly usageFailureExitCode: number;
  readonly commands: Readonly<Record<string, RuntimeCompiledCommand>>;
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
  readonly success: RuntimeCompiledSuccess;
  readonly failures: Readonly<Record<string, RuntimeAtomicVariant>>;
  readonly handler: unknown;
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
  readonly success:
    | Readonly<{ readonly kind: "completion" }>
    | Readonly<{
        readonly kind: "data";
        readonly variants: DataVariantDefinitions;
      }>
    | Readonly<{
        readonly kind: "stream";
        readonly records: StreamRecordDefinitions;
        readonly text?: CompletionTextPresenter;
      }>;
  readonly failures: FailureVariantDefinitions;
  readonly handler: unknown;
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
 * 显式装配全树帮助。`headings` 是可选段落标题；`wording` 按实际帮助事实
 * 提供必要模板，由 defineCli 检查完整性；核心不生成默认自然语言。
 */
export function helpCapability(definition?: undefined): HelpCapability;
export function helpCapability<
  const Definition extends HelpCapabilityDefinition,
>(
  definition: Definition &
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
    (Definition extends Readonly<{ readonly wording: infer Wording }>
      ? Readonly<{
          readonly wording: RejectUnknownProperties<
            Wording,
            keyof HelpFactWording
          >;
        }>
      : unknown),
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
    throw new TypeError("帮助短别名必须是 -h");
  }
  const capability = Object.freeze({
    kind: "helpCapability" as const,
    longOption: "--help" as const,
    ...(definition.shortAlias === undefined
      ? {}
      : { shortAlias: definition.shortAlias }),
    ...(definition.headings === undefined
      ? {}
      : { headings: copyHelpHeadings(definition.headings) }),
    ...(definition.wording === undefined
      ? {}
      : { wording: copyHelpFactWording(definition.wording) }),
  }) as HelpCapability;
  helpCapabilities.add(capability);
  return capability;
}

function copyHelpHeadings(value: unknown): HelpHeadings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("帮助标题必须是对象");
  }
  const allowed = new Set([
    "usage",
    "commands",
    "arguments",
    "options",
    "constraints",
    "supplement",
  ]);
  const headings: Record<string, string> = {};
  for (const [key, heading] of Object.entries(value)) {
    if (!allowed.has(key)) throw new TypeError("帮助标题包含未知段落");
    headings[key] = copySingleLineText(heading, `帮助标题 ${key}`);
  }
  return Object.freeze(headings);
}

const helpTemplatePlaceholders = {
  choices: ["choices"],
  default: ["value"],
  requires: ["field", "requires"],
  exclusive: ["fields"],
  forbiddenCombination: ["values"],
} as const;

function copyHelpFactWording(value: unknown): HelpFactWording {
  if (!isPlainRecord(value)) {
    throw new TypeError("帮助事实文案必须是对象");
  }
  const wording: Record<string, string> = {};
  for (const [slot, raw] of Object.entries(value)) {
    if (slot === "commandPlaceholder") {
      const label = copySingleLineText(raw, "命令组占位词");
      if (
        label.trim().length === 0 ||
        label.includes("<") ||
        label.includes(">")
      ) {
        throw new TypeError("命令组占位词无效");
      }
      wording[slot] = label;
      continue;
    }
    if (!Object.hasOwn(helpTemplatePlaceholders, slot)) {
      throw new TypeError(`帮助事实文案包含未知槽位 ${slot}`);
    }
    const template = copySingleLineText(raw, `帮助事实模板 ${slot}`);
    const required = new Set<string>(
      helpTemplatePlaceholders[slot as keyof typeof helpTemplatePlaceholders],
    );
    const placeholders = [
      ...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g),
    ].map((match) => match[1] ?? "");
    const outside = template.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, "");
    if (
      template.trim().length === 0 ||
      outside.includes("{") ||
      outside.includes("}") ||
      placeholders.some((placeholder) => !required.has(placeholder)) ||
      [...required].some((placeholder) => !placeholders.includes(placeholder))
    ) {
      throw new TypeError(`帮助事实模板 ${slot} 的占位符无效`);
    }
    wording[slot] = template;
  }
  return Object.freeze(wording);
}

/**
 * 在根契约显式装配版本提前请求，并自动覆盖整棵命令树。`value` 与可选
 * `description` 均由消费者拥有；核心只注册固定 spelling、投影帮助并写出 value，
 * 不读取包元数据、不添加前缀或默认说明，也不把版本当作命令输入。
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
  const value = copyVersionTextLine(definition.value);
  const description =
    definition.description === undefined
      ? undefined
      : copyVersionLine(definition.description);
  if (definition.shortAlias !== undefined && definition.shortAlias !== "-V") {
    throw new TypeError("版本短别名必须是 -V");
  }
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

function copyVersionTextLine(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as TextLine).kind !== "line"
  ) {
    throw new TypeError("版本值必须是合法单行文本");
  }
  return copySingleLineText((value as TextLine).value, "版本值");
}

function copyVersionLine(value: unknown, label = "版本描述"): string {
  return copySingleLineText(value, label);
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
  const version = versionCapabilities.has(definition.version as object)
    ? (definition.version as VersionCapability)
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
    output: {
      defaultFormat: definition.output.defaultFormat,
      formats: definition.output.formats,
      ...(definition.output.formats.includes("text")
        ? { selector: "--output-format" as const }
        : {}),
      ...(Object.keys(definition.output.compatibilityFlags).length === 0
        ? {}
        : { compatibilityFlags: definition.output.compatibilityFlags }),
    },
  });
}

/**
 * 在根契约显式装配一次应用结果的输出格式能力，并自动覆盖整棵命令树。
 * 它把 selector 与兼容 flag 保留为调用控制，不进入命令 input 或 handler；帮助、版本
 * 与用法失败使用各自固定投影。`defaultFormat`、text 支持和兼容映射必须由消费者
 * 显式选择，不能在命令节点另行装配格式或输出 profile。
 */
export function outputCapability<
  const Definition extends OutputCapabilityDefinition,
>(
  definition: Definition &
    RejectUnknownProperties<
      Definition,
      (typeof definitionPropertyKeys.capability.output)[number]
    >,
): OutputCapability<OutputFormatsFor<Definition>> {
  assertKnownCapabilityOptions(
    definition,
    definitionPropertyKeys.capability.output,
    "output",
  );
  const formats =
    definition.defaultFormat === "text" || definition.text === true
      ? (["structured", "text"] as const)
      : (["structured"] as const);
  const capability = Object.freeze({
    kind: "outputCapability" as const,
    defaultFormat: definition.defaultFormat,
    formats: Object.freeze(formats),
    compatibilityFlags: Object.freeze(
      definition.compatibilityFlags === undefined
        ? {}
        : definition.compatibilityFlags,
    ),
  }) as OutputCapability<OutputFormatsFor<Definition>>;
  outputCapabilities.add(capability);
  return capability;
}

function assertKnownCapabilityOptions(
  definition: object,
  allowed: readonly string[],
  capability: string,
): void {
  for (const property of Object.keys(definition)) {
    if (!allowed.includes(property)) {
      throw new TypeError(`${capability} 能力包含未知属性 ${property}`);
    }
  }
}

/**
 * 定义一个闭合 CLI 契约。根级 help 与 output 能力在此处一次装配，并据此约束根命令的结果投影；
 * 动态声明仍会在定义期报告 `ContractDefinitionError`，不能以它替代静态可判定声明的类型检查。
 * @see {@link https://github.com/YKDZ/cli-contract/tree/main/packages/example | 端到端示例}
 */
export function defineCli<Dependencies = undefined>(): DefineCli<Dependencies> {
  const define = ((definition: RuntimeCliDefinition) =>
    compileCli(definition)) as unknown as DefineCli<Dependencies>;
  Object.defineProperty(define, "command", {
    configurable: true,
    value: (command: string) => (definition: object) =>
      Object.freeze({
        [command]: Object.freeze({
          ...definition,
          [executableCommandType]: true,
        }),
      }),
  });
  return define;
}

function compileCli(definition: RuntimeCliDefinition): CliContract {
  const issues: ContractDefinitionIssue[] = [];
  collectUnknownDefinitionProperties(definition, issues);
  const isHierarchy =
    definition.commands[definition.root]?.kind === "rootGroup";
  const helpWording = helpCapabilities.has(definition.help)
    ? definition.help.wording
    : undefined;
  if (isTextOutputEnabled(definition.output)) {
    for (const slot of ["choices", "default"] as const) {
      if (helpWording?.[slot] === undefined) {
        reportMissingHelpFactTemplate(issues, definition.root, slot);
      }
    }
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
  if (isHierarchy && issues.length > 0) {
    throw new ContractDefinitionError(
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

  for (const id of orderedIds) {
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

    const executable = node as RuntimeExecutableDefinition;
    const input = compileContractSchema(
      executable.input,
      { command: id, location: "input" },
      issues,
    );
    const compiledSuccess = compileSuccess(
      id,
      executable.success,
      isTextOutputEnabled(definition.output),
      issues,
    );
    const compiledFailures = compileFailures(id, executable.failures, issues);
    collectTextPresenterIssues(
      id,
      isTextOutputEnabled(definition.output),
      executable.success,
      executable.failures,
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
    const usageConstraints = compileUsageConstraints(
      executable.usageConstraints === undefined
        ? []
        : executable.usageConstraints,
      fields,
      id,
      issues,
    );
    for (const slot of new Set(
      usageConstraints.map((constraint) => constraint.kind),
    )) {
      if (helpWording?.[slot] === undefined) {
        reportMissingHelpFactTemplate(issues, id, slot);
      }
    }
    const usage = deepFreeze({
      command: id,
      synopsis: createUsageSynopsis(
        commandPath(id, definition.commands),
        fields,
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
      success: compiledSuccess.runtime,
      failures: compiledFailures.runtime,
      handler: executable.handler,
    });
    if (executable.kind === "command") {
      grammarNodes.push(
        deepFreeze({
          kind: "command" as const,
          id,
          parent: executable.parent as string,
          name: executable.name,
          aliases,
          description: executable.description,
          ...(helpSupplement === undefined ? {} : { helpSupplement }),
          fields,
          ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
          usage,
        }),
      );
    }
    const manifestDetails = {
      description: executable.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      fields,
      ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
      input: projectUsageConstraints(
        describedInput as SchemaManifest,
        usageConstraints,
      ),
      success: compiledSuccess.manifest,
      failures: compiledFailures.manifest,
    };
    manifestCommands[id] =
      executable.kind === "command"
        ? deepFreeze({
            kind: "command" as const,
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
    wire[id] = deepFreeze({
      ...compiledSuccess.wire,
      ...(Object.keys(compiledFailures.wire).length === 0
        ? {}
        : { failure: compiledFailures.wire }),
    });
  }
  if (issues.length > 0)
    throw new ContractDefinitionError(
      issues as [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
    );

  const controls = compileControls(definition);
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
    schemaVersion: "3" as const,
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
    wire: isHierarchy ? wire : (wire[definition.root] as CommandWireManifest),
  });
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
  return contract;
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
    if (Array.isArray(node.usageConstraints)) {
      node.usageConstraints.forEach((constraint, index) => {
        const constraintPath = [...path, "usageConstraints", String(index)];
        if (!isPlainRecord(constraint)) return;
        const allowed =
          constraint.kind === "requires"
            ? definitionPropertyKeys.usage.requires
            : constraint.kind === "exclusive"
              ? definitionPropertyKeys.usage.exclusive
              : constraint.kind === "forbiddenCombination"
                ? definitionPropertyKeys.usage.forbiddenCombination
                : undefined;
        if (allowed === undefined) return;
        collectUnknownProperties(constraint, constraintPath, allowed, issues);
        if (
          constraint.kind === "forbiddenCombination" &&
          Array.isArray(constraint.values)
        ) {
          constraint.values.forEach((value, valueIndex) =>
            collectUnknownProperties(
              value,
              [...constraintPath, "values", String(valueIndex)],
              definitionPropertyKeys.usage.value,
              issues,
            ),
          );
        }
      });
    }
    if (isPlainRecord(node.success)) {
      const successPath = [...path, "success"];
      const success = node.success;
      if (success.kind === "completion") {
        collectUnknownProperties(
          success,
          successPath,
          definitionPropertyKeys.success.completion,
          issues,
        );
      } else if (success.kind === "data") {
        collectUnknownProperties(
          success,
          successPath,
          definitionPropertyKeys.success.data,
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
          definitionPropertyKeys.success.stream,
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
      node.failures,
      [...path, "failures"],
      definitionPropertyKeys.atomicVariant,
      issues,
    );
  }
}

export function getCompiledCli(contract: CliContract): RuntimeCompiledCli {
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
  if (!outputCapabilities.has(definition.output)) {
    issues.push({ code: "invalidCapability", capability: "output" });
  } else if (
    !definition.output.formats.includes(definition.output.defaultFormat)
  ) {
    issues.push({
      code: "invalidOutputFormat",
      expected: "structured|text",
      received:
        typeof definition.output.defaultFormat === "string"
          ? definition.output.defaultFormat
          : null,
    });
  } else if (!isPlainRecord(definition.output.compatibilityFlags)) {
    issues.push({
      code: "invalidOutputCompatibilityFlags",
      received: outputCompatibilityFlagsKind(
        definition.output.compatibilityFlags,
      ),
    });
  } else {
    for (const [flag, format] of Object.entries(
      definition.output.compatibilityFlags,
    )) {
      if (
        !/^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(flag) ||
        flag === "--help" ||
        flag === "--output-format" ||
        (versionCapabilities.has(definition.version as object) &&
          flag === "--version") ||
        !definition.output.formats.includes(format)
      ) {
        issues.push({
          code: "invalidOutputCompatibilityFlag",
          flag,
          received: typeof format === "string" ? format : null,
        });
      }
    }
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

function compileUsageConstraints(
  definitions: unknown,
  fields: readonly FieldGrammar[],
  command: string,
  issues: ContractDefinitionIssue[],
): readonly UsageConstraintGrammar[] {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const compiled: UsageConstraintGrammar[] = [];
  if (!Array.isArray(definitions)) {
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index: null,
      aspect: "collection",
      received: null,
    });
    return deepFreeze(compiled);
  }
  for (const [index, definition] of definitions.entries()) {
    if (typeof definition !== "object" || definition === null) {
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "entry",
        received: null,
      });
      continue;
    }
    const candidate = definition as Readonly<Record<string, unknown>>;
    if (
      candidate.kind !== "requires" &&
      candidate.kind !== "exclusive" &&
      candidate.kind !== "forbiddenCombination"
    ) {
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "kind",
        received: typeof candidate.kind === "string" ? candidate.kind : null,
      });
      continue;
    }
    if (candidate.kind === "requires") {
      if (
        typeof candidate.field !== "string" ||
        typeof candidate.requires !== "string"
      ) {
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: "requires",
        });
        continue;
      }
      const field = fieldsByKey.get(candidate.field);
      const required = fieldsByKey.get(candidate.requires);
      if (field === undefined)
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint: "requires",
          index,
          member: "field",
          field: candidate.field,
        });
      if (required === undefined)
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint: "requires",
          index,
          member: "requires",
          field: candidate.requires,
        });
      if (field !== undefined && required !== undefined) {
        if (!isOptionalOption(field) || !isOptionalOption(required)) {
          for (const candidate of [field, required])
            if (!isOptionalOption(candidate))
              issues.push({
                code: "inapplicableUsageConstraintField",
                command,
                constraint: "requires",
                field: candidate.key,
                kind: candidate.kind,
              });
        }
        if (field.key === required.key)
          issues.push({
            code: "contradictoryUsageConstraint",
            command,
            constraint: "requires",
            fields: Object.freeze([field.key]),
          });
        compiled.push(
          deepFreeze({
            kind: "requires" as const,
            field: field.key,
            requires: required.key,
          }),
        );
      }
      continue;
    }
    if (candidate.kind === "exclusive") {
      if (
        !Array.isArray(candidate.fields) ||
        candidate.fields.length < 2 ||
        !candidate.fields.every((field) => typeof field === "string")
      ) {
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: "exclusive",
        });
        continue;
      }
      const selected = candidate.fields.map((key) => fieldsByKey.get(key));
      for (const [fieldIndex, field] of selected.entries()) {
        if (field === undefined) {
          issues.push({
            code: "unknownUsageConstraintField",
            command,
            constraint: "exclusive",
            index,
            member: "fields",
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fields 已逐项检查为字符串，索引来自对应 selected 数组。
            field: candidate.fields[fieldIndex] as string,
          });
        } else if (!isOptionalOption(field)) {
          issues.push({
            code: "inapplicableUsageConstraintField",
            command,
            constraint: "exclusive",
            field: field.key,
            kind: field.kind,
          });
        }
      }
      const fieldsInConstraint = candidate.fields;
      if (new Set(fieldsInConstraint).size !== fieldsInConstraint.length)
        issues.push({
          code: "contradictoryUsageConstraint",
          command,
          constraint: "exclusive",
          fields: Object.freeze([...fieldsInConstraint]),
        });
      if (selected.every((field) => field !== undefined))
        compiled.push(
          deepFreeze({
            kind: "exclusive" as const,
            fields: Object.freeze([...fieldsInConstraint]) as [
              string,
              string,
              ...string[],
            ],
          }),
        );
      continue;
    }
    if (candidate.kind === "forbiddenCombination") {
      if (
        !Array.isArray(candidate.values) ||
        candidate.values.length < 2 ||
        !candidate.values.every(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            typeof value.field === "string" &&
            (typeof value.value === "string" ||
              typeof value.value === "boolean"),
        )
      ) {
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: "forbiddenCombination",
        });
        continue;
      }
      const values: Array<{
        readonly field: string;
        readonly value: boolean | string;
      }> = [];
      for (const value of candidate.values) {
        const discreteValue = value as Readonly<{
          readonly field: string;
          readonly value: boolean | string;
        }>;
        const field = fieldsByKey.get(discreteValue.field);
        if (field === undefined) {
          issues.push({
            code: "unknownUsageConstraintField",
            command,
            constraint: "forbiddenCombination",
            index,
            member: "values.field",
            field: discreteValue.field,
          });
          continue;
        }
        if (field.kind !== "flag" && field.kind !== "valueOption") {
          issues.push({
            code: "inapplicableUsageConstraintField",
            command,
            constraint: "forbiddenCombination",
            field: field.key,
            kind: field.kind,
          });
          continue;
        }
        if (
          (field.kind === "flag" && typeof discreteValue.value !== "boolean") ||
          (field.kind === "valueOption" &&
            typeof discreteValue.value !== "string")
        ) {
          issues.push({
            code: "invalidUsageConstraintValue",
            command,
            field: field.key,
            expected: field.kind === "flag" ? "boolean" : "string",
          });
          continue;
        }
        values.push({ field: field.key, value: discreteValue.value });
      }
      const duplicateValueField = values.some(
        (value, index) =>
          values.findIndex(({ field }) => field === value.field) !== index,
      );
      if (duplicateValueField)
        issues.push({
          code: "contradictoryUsageConstraint",
          command,
          constraint: "forbiddenCombination",
          fields: Object.freeze(values.map(({ field }) => field)),
        });
      if (values.length === candidate.values.length)
        compiled.push(
          deepFreeze({
            kind: "forbiddenCombination" as const,
            values: Object.freeze(values) as [
              { readonly field: string; readonly value: boolean | string },
              { readonly field: string; readonly value: boolean | string },
              ...{ readonly field: string; readonly value: boolean | string }[],
            ],
          }),
        );
      continue;
    }
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "kind",
      received: null,
    });
  }
  for (const constraint of compiled) {
    if (constraint.kind !== "requires") continue;
    if (constraint.field === constraint.requires) continue;
    const exclusive = compiled.find(
      (candidate): candidate is ExclusiveUsageConstraint =>
        candidate.kind === "exclusive" &&
        candidate.fields.includes(constraint.field) &&
        candidate.fields.includes(constraint.requires),
    );
    if (exclusive !== undefined)
      issues.push({
        code: "contradictoryUsageConstraint",
        command,
        constraint: "requires",
        fields: Object.freeze([constraint.field, constraint.requires]),
      });
  }
  return deepFreeze(compiled);
}

function isOptionalOption(field: FieldGrammar): boolean {
  return (
    !field.required &&
    field.kind !== "positional" &&
    field.kind !== "variadicPositional"
  );
}

function projectUsageConstraints(
  schema: SchemaManifest,
  constraints: readonly UsageConstraintGrammar[],
): SchemaManifest {
  if (constraints.length === 0) return schema;
  const constraintSchemas: JsonObject[] = [];
  for (const constraint of constraints) {
    if (constraint.kind === "requires") {
      constraintSchemas.push(
        Object.fromEntries([
          ["if", { required: [constraint.field] }],
          // oxlint-disable-next-line unicorn/no-thenable -- Draft 2020-12 固定关键字。
          ["then", { required: [constraint.requires] }],
        ]),
      );
      continue;
    }
    if (constraint.kind === "exclusive") {
      constraintSchemas.push({
        not: {
          anyOf: constraint.fields.flatMap((field, index) =>
            constraint.fields.slice(index + 1).map((other) => ({
              required: [field, other],
            })),
          ),
        },
      });
      continue;
    }
    constraintSchemas.push({
      not: {
        allOf: constraint.values.map(({ field, value }) => ({
          properties: { [field]: { const: value } },
          required: [field],
        })),
      },
    });
  }
  return deepFreeze({
    inputSchema: {
      ...schema.inputSchema,
      allOf: [
        ...(Array.isArray(schema.inputSchema.allOf)
          ? schema.inputSchema.allOf
          : []),
        ...constraintSchemas,
      ],
    },
    outputSchema: schema.outputSchema,
  });
}

function compileFailures(
  command: string,
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
    createFailureWireSchema,
    issues,
  );
  return {
    runtime: compiled.runtime,
    manifest: compiled.manifest,
    wire: compiled.wire,
  };
}

function collectTextPresenterIssues(
  command: string,
  textEnabled: boolean,
  success: RuntimeExecutableDefinition["success"],
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

function isTextOutputEnabled(output: unknown): boolean {
  return (
    outputCapabilities.has(output as object) &&
    (output as OutputCapability).formats.includes("text")
  );
}

function collectControlFieldConflicts(
  command: string,
  fields: readonly FieldGrammar[],
  definition: RuntimeCliDefinition,
  issues: ContractDefinitionIssue[],
): void {
  const controls = new Map<string, "help" | "outputFormat" | "version">([
    ["--help", "help"],
  ]);
  if (
    helpCapabilities.has(definition.help) &&
    definition.help.shortAlias !== undefined
  ) {
    controls.set(definition.help.shortAlias, "help");
  }
  if (
    outputCapabilities.has(definition.output) &&
    isPlainRecord(definition.output.compatibilityFlags)
  ) {
    for (const spelling of Object.keys(definition.output.compatibilityFlags)) {
      controls.set(spelling, "outputFormat");
    }
    if (definition.output.formats.includes("text")) {
      controls.set("--output-format", "outputFormat");
    }
  }
  if (versionCapabilities.has(definition.version as object)) {
    const version = definition.version as VersionCapability;
    controls.set("--version", "version");
    if (version.shortAlias !== undefined) {
      controls.set(version.shortAlias, "version");
    }
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

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function outputCompatibilityFlagsKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function collectTextPresenterIssue(
  command: string,
  textEnabled: boolean,
  location: "completion" | "data" | "failure" | "record" | "streamSuccess",
  definition: Readonly<Record<string, unknown>>,
  issues: ContractDefinitionIssue[],
  variant?: string,
): void {
  const hasPresenter = typeof definition.text === "function";
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
  success: RuntimeExecutableDefinition["success"],
  textEnabled: boolean,
  issues: ContractDefinitionIssue[],
): Readonly<{
  readonly runtime: RuntimeCompiledExecutable["success"];
  readonly manifest: CommandSuccessManifest;
  readonly wire: CliManifest<string>["wire"];
}> {
  if (success.kind === "completion") {
    return {
      runtime: Object.freeze({
        kind: "completion",
        ...("text" in success ? { text: success.text } : {}),
      }),
      manifest: Object.freeze({ kind: "completion" }),
      wire: Object.freeze({
        completion: deepFreeze(createCompletionWireSchema(command)),
      }),
    };
  }

  if (success.kind === "stream") {
    const records = compileStreamRecords(command, success.records, issues);
    if (Object.keys(records.runtime).length === 0) {
      issues.push({ code: "missingStreamRecord", command });
    }
    const header = deepFreeze(createStreamHeaderWireSchema(command));
    const terminal = deepFreeze(createStreamSuccessWireSchema());
    const recordWire = Object.fromEntries(
      Object.entries(records.wire).map(([variant, schema]) => [
        variant,
        deepFreeze(createStreamRecordWireSchema(variant, schema)),
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
    createDataWireSchema,
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
): string {
  return [commandName, ...fields.map((field) => formatFieldUsage(field))].join(
    " ",
  );
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
