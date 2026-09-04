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

export interface HelpCapability {
  readonly kind: "helpCapability";
  readonly longOption: "--help";
  readonly shortAlias?: "-h";
  readonly [cliContractType]: "help";
}

export interface HelpCapabilityDefinition {
  readonly shortAlias?: "-h";
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

/** 由调用语法拥有、可同时投影到 parser 和 Draft 2020-12 的字段关系。 */
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

export type SharedOptionDefinition =
  | FlagDefinition
  | RepeatableOptionDefinition
  | ValueOptionDefinition;
export type SharedOptionDefinitions = Readonly<
  Record<string, SharedOptionDefinition>
>;

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
  >;
};

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

type IncompatibleRawInputKeys<Fields extends FieldDefinitions, Input> = {
  [Field in keyof Fields & InputStringKeys<Input>]: RawSchemaInputValue<
    Fields[Field]
  > extends Input[Field]
    ? never
    : Field;
}[keyof Fields & InputStringKeys<Input>];

type RawFieldInputContract<
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
> =
  IncompatibleRawInputKeys<
    Fields,
    ContractSchemaInput<InputSchema>
  > extends never
    ? unknown
    : ContractTypeError<
        "fieldInputMustAcceptRawValue",
        Readonly<{
          readonly fields: IncompatibleRawInputKeys<
            Fields,
            ContractSchemaInput<InputSchema>
          >;
        }>
      >;

type InvalidDataVariantNames<Variants extends DataVariantDefinitions> = {
  [Variant in keyof Variants & string]: IsLowerCamelCase<Variant> extends true
    ? never
    : Variant;
}[keyof Variants & string];

type DataVariantNameContract<Variants extends DataVariantDefinitions> =
  InvalidDataVariantNames<Variants> extends never
    ? unknown
    : ContractTypeError<
        "dataVariantMustBeLowerCamelCase",
        Readonly<{
          readonly variants: InvalidDataVariantNames<Variants>;
        }>
      >;

type InvalidFailureVariantNames<Failures extends FailureVariantDefinitions> = {
  [Variant in keyof Failures & string]: IsLowerCamelCase<Variant> extends true
    ? never
    : Variant;
}[keyof Failures & string];

type FailureVariantNameContract<Failures extends FailureVariantDefinitions> =
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
  readonly input: InputSchema & RawFieldInputContract<Fields, InputSchema>;
  readonly success: Readonly<{ readonly kind: "completion" }> &
    (TextEnabled extends true
      ? Readonly<{ readonly text: CompletionTextPresenter }>
      : TextEnabled extends false
        ? Readonly<{ readonly text?: never }>
        : Readonly<{ readonly text?: CompletionTextPresenter }>);
  readonly failures: Failures & FailureVariantNameContract<Failures>;
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
  readonly input: InputSchema & RawFieldInputContract<Fields, InputSchema>;
  readonly success: Readonly<{
    readonly kind: "data";
    readonly variants: Variants & DataVariantNameContract<Variants>;
  }>;
  readonly failures: Failures & FailureVariantNameContract<Failures>;
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
  readonly input: InputSchema & RawFieldInputContract<Fields, InputSchema>;
  readonly success: Readonly<{
    readonly kind: "stream";
    readonly records: Records & StreamRecordDefinitions<TextEnabled>;
  }> &
    (TextEnabled extends true
      ? Readonly<{ readonly text: CompletionTextPresenter }>
      : TextEnabled extends false
        ? Readonly<{ readonly text?: never }>
        : Readonly<{ readonly text?: CompletionTextPresenter }>);
  readonly failures: Failures & FailureVariantNameContract<Failures>;
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
  readonly sharedOptions?: SharedOptionDefinitions;
}

export interface CommandGroupDefinition<Parent extends string = string> {
  readonly kind: "commandGroup";
  readonly parent: Parent;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly handler?: never;
  readonly sharedOptions?: SharedOptionDefinitions;
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
    ? RawFieldInput<EffectiveHierarchyFields<Command, Commands>>
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

type OwnHierarchyFields<Node> =
  Node extends Readonly<{
    readonly kind: "rootGroup" | "commandGroup";
    readonly sharedOptions: infer Fields extends SharedOptionDefinitions;
  }>
    ? Fields
    : Node extends Readonly<{
          readonly kind: "command";
          readonly fields: infer Fields extends FieldDefinitions;
        }>
      ? Fields
      : Readonly<Record<never, never>>;

type EffectiveHierarchyFields<
  Command extends PropertyKey,
  Commands,
  Seen extends PropertyKey = never,
> = Command extends Seen
  ? Readonly<Record<never, never>>
  : Command extends keyof Commands
    ? Commands[Command] extends Readonly<{
        readonly parent: infer Parent extends keyof Commands;
      }>
      ? EffectiveHierarchyFields<Parent, Commands, Seen | Command> &
          OwnHierarchyFields<Commands[Command]>
      : OwnHierarchyFields<Commands[Command]>
    : Readonly<Record<never, never>>;

type KnownInputKeys<Input> = string extends keyof Input
  ? never
  : Extract<keyof Input, string>;

type EffectiveFieldSetMismatch<Fields, Input> =
  | Exclude<Extract<keyof Fields, string>, KnownInputKeys<Input>>
  | Exclude<KnownInputKeys<Input>, Extract<keyof Fields, string>>;

type InvalidHierarchyInputCommands<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
    readonly input: infer InputSchema extends ContractSchema;
  }>
    ? EffectiveFieldSetMismatch<
        EffectiveHierarchyFields<Command, Commands>,
        ContractSchemaInput<InputSchema>
      > extends never
      ? IncompatibleRawInputKeys<
          EffectiveHierarchyFields<Command, Commands>,
          ContractSchemaInput<InputSchema>
        > extends never
        ? never
        : Command
      : Command
    : never;
}[keyof Commands];

type HierarchyUsageConstraints<Node> =
  Node extends Readonly<{
    readonly usageConstraints?: infer Constraints;
  }>
    ? Exclude<Constraints, undefined>
    : never;

type InvalidUsageConstraintForFields<
  Constraint,
  Fields extends FieldDefinitions,
> =
  Constraint extends RequiresUsageConstraint<infer Field>
    ? Exclude<Field | Constraint["requires"], keyof Fields> extends never
      ? never
      : Constraint
    : Constraint extends ExclusiveUsageConstraint<infer Field>
      ? Exclude<Field, keyof Fields> extends never
        ? never
        : Constraint
      : Constraint extends ForbiddenCombinationUsageConstraint<Fields>
        ? never
        : Constraint;

type InvalidHierarchyUsageConstraintCommands<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
  }>
    ? HierarchyUsageConstraints<Commands[Command]> extends never
      ? never
      : HierarchyUsageConstraints<
            Commands[Command]
          > extends readonly (infer Constraint)[]
        ? InvalidUsageConstraintForFields<
            Constraint,
            EffectiveHierarchyFields<Command, Commands>
          > extends never
          ? never
          : Command
        : Command
    : never;
}[keyof Commands];

type HasSharedOptions<Commands> = true extends {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly sharedOptions: SharedOptionDefinitions;
  }>
    ? true
    : false;
}[keyof Commands]
  ? true
  : false;

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
  readonly sharedOptions: readonly Exclude<
    FieldGrammar,
    PositionalGrammar | VariadicPositionalGrammar
  >[];
}

export interface CommandGroupGrammar<
  Command extends string = string,
> extends GroupGrammarBase<Command> {
  readonly kind: "commandGroup";
  readonly parent: string;
  readonly sharedOptions: readonly Exclude<
    FieldGrammar,
    PositionalGrammar | VariadicPositionalGrammar
  >[];
}

export interface ExecutableCommandGrammar<
  Command extends string = string,
> extends GroupGrammarBase<Command> {
  readonly kind: "command";
  readonly parent: string;
  readonly fields: readonly FieldGrammar[];
  readonly effectiveFields: readonly FieldGrammar[];
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
  readonly sharedOptions: readonly Exclude<
    FieldGrammar,
    PositionalGrammar | VariadicPositionalGrammar
  >[];
}

export interface ExecutableCommandManifest extends Omit<
  RootCommandManifest,
  "kind"
> {
  readonly kind: "command";
  readonly parent: string;
  readonly aliases: readonly string[];
  readonly helpSupplement?: readonly string[];
  readonly effectiveFields: readonly FieldGrammar[];
}

export type UsageConstraintGrammar =
  | RequiresUsageConstraint
  | ExclusiveUsageConstraint
  | ForbiddenCombinationUsageConstraint;

export interface CliManifest<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
> {
  readonly schemaVersion: "1";
  readonly root: Root;
  readonly commands: RootKind extends "rootGroup"
    ? Readonly<Record<string, CommandGroupManifest | ExecutableCommandManifest>>
    : Readonly<Record<Root, RootCommandManifest>>;
  readonly controls: CliGrammar<Root, RootKind>["controls"];
  readonly usageFailure: Readonly<{ readonly exitCode: number }>;
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
  readonly schemaVersion: "1";
  readonly root: Root;
  readonly commands: Readonly<{
    [Command in keyof Commands]: HierarchyManifestNode<Commands[Command]>;
  }>;
  readonly controls: HierarchyCliGrammar<Root, Commands>["controls"];
  readonly usageFailure: Readonly<{ readonly exitCode: number }>;
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
type AllTextPresenters<Definitions> =
  Exclude<
    {
      [Key in keyof Definitions]: HasTextPresenter<Definitions[Key]>;
    }[keyof Definitions],
    true
  > extends never
    ? true
    : false;
type MissingHierarchyTextCommands<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
    readonly success: infer Success;
    readonly failures: infer Failures;
  }>
    ? Success extends Readonly<{ readonly kind: "completion" }>
      ? HasTextPresenter<Success> extends true
        ? AllTextPresenters<Failures> extends true
          ? never
          : Command
        : Command
      : Success extends Readonly<{ readonly variants: infer Variants }>
        ? AllTextPresenters<Variants> extends true
          ? AllTextPresenters<Failures> extends true
            ? never
            : Command
          : Command
        : Success extends Readonly<{
              readonly kind: "stream";
              readonly records: infer Records;
            }>
          ? HasTextPresenter<Success> extends true
            ? AllTextPresenters<Records> extends true
              ? AllTextPresenters<Failures> extends true
                ? never
                : Command
              : Command
            : Command
          : Command
    : never;
}[keyof Commands];

type HasAnyTextPresenter<Definitions> = true extends {
  [Key in keyof Definitions]: HasTextPresenter<Definitions[Key]>;
}[keyof Definitions]
  ? true
  : false;

type UnexpectedHierarchyTextCommands<Commands> = {
  [Command in keyof Commands]: Commands[Command] extends Readonly<{
    readonly kind: "command";
    readonly success: infer Success;
    readonly failures: infer Failures;
  }>
    ? Success extends Readonly<{ readonly kind: "completion" }>
      ? HasTextPresenter<Success> extends true
        ? Command
        : HasAnyTextPresenter<Failures> extends true
          ? Command
          : never
      : Success extends Readonly<{ readonly variants: infer Variants }>
        ? HasAnyTextPresenter<Variants> extends true
          ? Command
          : HasAnyTextPresenter<Failures> extends true
            ? Command
            : never
        : Success extends Readonly<{
              readonly kind: "stream";
              readonly records: infer Records;
            }>
          ? HasTextPresenter<Success> extends true
            ? Command
            : HasAnyTextPresenter<Records> extends true
              ? Command
              : HasAnyTextPresenter<Failures> extends true
                ? Command
                : never
          : never
    : never;
}[keyof Commands];

type HierarchyUsageValidation<Commands> =
  InvalidHierarchyUsageConstraintCommands<Commands> extends never
    ? HasSharedOptions<Commands> extends false
      ? readonly []
      : InvalidHierarchyInputCommands<Commands> extends never
        ? readonly []
        : readonly [
            ContractTypeError<
              "invalidEffectiveCommandInput",
              Readonly<{
                readonly commands: InvalidHierarchyInputCommands<Commands>;
              }>
            >,
          ]
    : readonly [
        ContractTypeError<
          "invalidEffectiveUsageConstraint",
          Readonly<{
            readonly commands: InvalidHierarchyUsageConstraintCommands<Commands>;
          }>
        >,
      ];

type HierarchyOutputValidation<Commands, Output extends OutputCapability> =
  Output extends OutputCapability<infer Formats>
    ? [Formats] extends [readonly ["structured", "text"]]
      ? MissingHierarchyTextCommands<Commands> extends never
        ? HierarchyUsageValidation<Commands>
        : readonly [
            ContractTypeError<
              "missingHierarchyTextPresenter",
              Readonly<{
                readonly commands: MissingHierarchyTextCommands<Commands>;
              }>
            >,
          ]
      : [Formats] extends [readonly ["structured"]]
        ? UnexpectedHierarchyTextCommands<Commands> extends never
          ? HierarchyUsageValidation<Commands>
          : readonly [
              ContractTypeError<
                "unexpectedHierarchyTextPresenter",
                Readonly<{
                  readonly commands: UnexpectedHierarchyTextCommands<Commands>;
                }>
              >,
            ]
        : HierarchyUsageValidation<Commands>
    : HierarchyUsageValidation<Commands>;

export interface DefineCli<Dependencies> {
  readonly command: <const Command extends string>(
    command: Command,
  ) => DefineCommand<Command, Dependencies>;

  <
    const Root extends string,
    InputSchema extends ContractSchema,
    const Records extends StreamRecordDefinitions<true>,
    const Failures extends FailureVariantDefinitions<true>,
  >(
    definition: StreamRootCliDefinition<
      Root,
      Dependencies,
      Readonly<Record<never, never>>,
      InputSchema,
      Records,
      Failures,
      true
    > &
      Readonly<{
        readonly output: OutputCapability<readonly ["structured", "text"]>;
      }>,
  ): CliContract<
    Root,
    Dependencies,
    EmptyCliInput,
    StreamSuccessFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    InputSchema extends ContractSchema,
    const Records extends StreamRecordDefinitions,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: StreamRootCliDefinition<
      Root,
      Dependencies,
      Readonly<Record<never, never>>,
      InputSchema,
      Records,
      Failures
    > &
      Readonly<{ readonly output: OutputCapability<readonly ["structured"]> }>,
  ): CliContract<
    Root,
    Dependencies,
    EmptyCliInput,
    StreamSuccessFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Commands extends Readonly<Record<string, CommandNodeDefinition>>,
    const Output extends OutputCapability,
  >(
    definition: HierarchyCliDefinition<Root> &
      Readonly<{ readonly commands: Commands; readonly output: Output }>,
    ...validation: HierarchyOutputValidation<Commands, Output>
  ): CliContract<
    Root,
    Dependencies,
    HierarchyRawInput<Commands>,
    HierarchyResult<Commands>,
    "rootGroup",
    Commands
  >;

  <
    const Root extends string,
    const Failures extends FailureVariantDefinitions<true>,
  >(
    definition: CompletionRootCliDefinition<
      Root,
      Dependencies,
      Failures,
      Readonly<Record<never, never>>,
      ContractSchema<EmptyCliInput>,
      true
    > &
      Readonly<{
        readonly output: OutputCapability<readonly ["structured", "text"]>;
      }>,
  ): CliContract<
    Root,
    Dependencies,
    EmptyCliInput,
    CompletionFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Failures extends FailureVariantDefinitions<true>,
  >(
    definition: CompletionRootCliDefinition<
      Root,
      Dependencies,
      Failures,
      Fields,
      InputSchema,
      true
    > &
      Readonly<{
        readonly output: OutputCapability<readonly ["structured", "text"]>;
        readonly commands: Readonly<{
          readonly [Command in Root]: Readonly<{ readonly fields: Fields }>;
        }>;
      }>,
  ): CliContract<
    Root,
    Dependencies,
    RawFieldInput<Fields>,
    CompletionFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Variants extends DataVariantDefinitions<true>,
    const Failures extends FailureVariantDefinitions<true>,
  >(
    definition: DataRootCliDefinition<
      Root,
      Dependencies,
      Fields,
      InputSchema,
      Variants,
      Failures
    > &
      Readonly<{
        readonly output: OutputCapability<readonly ["structured", "text"]>;
      }>,
  ): CliContract<
    Root,
    Dependencies,
    RawFieldInput<Fields>,
    DataFactUnion<Root, Variants> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Records extends StreamRecordDefinitions<true>,
    const Failures extends FailureVariantDefinitions<true>,
  >(
    definition: StreamRootCliDefinition<
      Root,
      Dependencies,
      Fields,
      InputSchema,
      Records,
      Failures,
      true
    > &
      Readonly<{
        readonly output: OutputCapability<readonly ["structured", "text"]>;
      }>,
  ): CliContract<
    Root,
    Dependencies,
    RawFieldInput<Fields>,
    StreamSuccessFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Records extends StreamRecordDefinitions,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: StreamRootCliDefinition<
      Root,
      Dependencies,
      Fields,
      InputSchema,
      Records,
      Failures
    > &
      Readonly<{ readonly output: OutputCapability<readonly ["structured"]> }>,
  ): CliContract<
    Root,
    Dependencies,
    RawFieldInput<Fields>,
    StreamSuccessFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <const Root extends string, const Failures extends FailureVariantDefinitions>(
    definition: CompletionRootCliDefinition<Root, Dependencies, Failures>,
  ): CliContract<
    Root,
    Dependencies,
    EmptyCliInput,
    CompletionFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: CompletionRootCliDefinition<
      Root,
      Dependencies,
      Failures,
      Fields,
      InputSchema
    > &
      Readonly<{
        readonly commands: Readonly<{
          readonly [Command in Root]: Readonly<{ readonly fields: Fields }>;
        }>;
      }>,
  ): CliContract<
    Root,
    Dependencies,
    RawFieldInput<Fields>,
    CompletionFact<Root> | FailureFactUnion<Root, Failures>,
    "rootCommand"
  >;

  <
    const Root extends string,
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Variants extends DataVariantDefinitions,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: DataRootCliDefinition<
      Root,
      Dependencies,
      Fields,
      InputSchema,
      Variants,
      Failures
    >,
  ): CliContract<
    Root,
    Dependencies,
    RawFieldInput<Fields>,
    DataFactUnion<Root, Variants> | FailureFactUnion<Root, Failures>,
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

export interface DefineCommand<Command extends string, Dependencies> {
  <
    const Definition extends object,
    const Parent extends string,
    const Failures extends FailureVariantDefinitions,
    const Constraints extends readonly unknown[] | undefined = undefined,
  >(
    definition: Definition &
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
  readonly description: string;
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints: readonly UsageConstraintGrammar[];
  readonly usage: CommandUsage<string>;
  readonly usageFailureExitCode: number;
  readonly input: ContractSchema;
  readonly success:
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
  readonly failures: Readonly<Record<string, RuntimeAtomicVariant>>;
  readonly handler: unknown;
  readonly commands: Readonly<Record<string, RuntimeCompiledCommand>>;
}

interface RuntimeCompiledCommand {
  readonly id: string;
  readonly kind: "command" | "commandGroup" | "rootCommand" | "rootGroup";
  readonly parent?: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints: readonly UsageConstraintGrammar[];
  readonly usage: CommandUsage<string>;
  readonly input?: ContractSchema;
  readonly success?: RuntimeCompiledCli["success"];
  readonly failures?: Readonly<Record<string, RuntimeAtomicVariant>>;
  readonly handler?: unknown;
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
  readonly sharedOptions?: SharedOptionDefinitions;
}>;

type RuntimeCommandDefinition =
  | RuntimeExecutableDefinition
  | RuntimeGroupDefinition;

type RuntimeCliDefinition = RootCliDefinitionBase<string> &
  Readonly<{
    readonly commands: Readonly<Record<string, RuntimeCommandDefinition>>;
  }>;

export function helpCapability(
  definition: HelpCapabilityDefinition = {},
): HelpCapability {
  if (definition.shortAlias !== undefined && definition.shortAlias !== "-h") {
    throw new TypeError("帮助短别名必须是 -h");
  }
  const capability = Object.freeze({
    kind: "helpCapability" as const,
    longOption: "--help" as const,
    ...(definition.shortAlias === undefined
      ? {}
      : { shortAlias: definition.shortAlias }),
  }) as HelpCapability;
  helpCapabilities.add(capability);
  return capability;
}

export function versionCapability(
  definition: VersionCapabilityDefinition,
): VersionCapability {
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

export function outputCapability<
  const Definition extends OutputCapabilityDefinition,
>(definition: Definition): OutputCapability<OutputFormatsFor<Definition>> {
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
  if (definition.commands[definition.root]?.kind === "rootGroup") {
    return compileHierarchyCli(definition);
  }
  const definitionIssues: ContractDefinitionIssue[] = [];
  const command = collectRootDefinitionIssues(definition, definitionIssues);
  if (command === undefined) {
    throw new ContractDefinitionError(
      definitionIssues as [
        ContractDefinitionIssue,
        ...ContractDefinitionIssue[],
      ],
    );
  }
  const helpSupplement = compileHelpSupplement(
    definition.root,
    command.helpSupplement,
    definitionIssues,
  );
  const input = compileContractSchema(
    command.input,
    {
      command: definition.root,
      location: "input",
    },
    definitionIssues,
  );
  const compiledSuccess = compileSuccess(
    definition.root,
    command.success,
    isTextOutputEnabled(definition.output),
    definitionIssues,
  );
  const compiledFailures = compileFailures(
    definition.root,
    command.failures,
    definitionIssues,
  );
  collectTextPresenterIssues(
    definition.root,
    isTextOutputEnabled(definition.output),
    command.success,
    command.failures,
    definitionIssues,
  );
  const fields =
    input === undefined
      ? []
      : compileInputFields(
          command.fields ?? {},
          input.inputSchema,
          definition.root,
          definitionIssues,
        );
  const describedInput =
    input === undefined ? undefined : projectFieldDescriptions(input, fields);
  collectControlFieldConflicts(
    definition.root,
    fields,
    definition,
    definitionIssues,
  );
  const usageConstraints = compileUsageConstraints(
    command.usageConstraints === undefined ? [] : command.usageConstraints,
    fields,
    definition.root,
    definitionIssues,
  );
  if (definitionIssues.length > 0) {
    throw new ContractDefinitionError(
      definitionIssues as [
        ContractDefinitionIssue,
        ...ContractDefinitionIssue[],
      ],
    );
  }
  const validInput = projectUsageConstraints(
    describedInput as SchemaManifest,
    usageConstraints,
  );
  const usage = deepFreeze({
    command: definition.root,
    synopsis: createUsageSynopsis(command.name, fields, usageConstraints),
  });
  const controls = compileControls(definition);
  const grammar = deepFreeze({
    root: {
      kind: "rootCommand" as const,
      id: definition.root,
      name: command.name,
      description: command.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      fields,
      ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
      usage,
    },
    nodes: [] as const,
    controls,
  });
  const manifest = deepFreeze({
    schemaVersion: "1" as const,
    root: definition.root,
    commands: {
      [definition.root]: {
        kind: "rootCommand" as const,
        name: command.name,
        description: command.description,
        ...(helpSupplement === undefined ? {} : { helpSupplement }),
        fields,
        ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
        input: validInput,
        success: compiledSuccess.manifest,
        failures: compiledFailures.manifest,
      },
    },
    controls,
    usageFailure: { exitCode: definition.usageFailureExitCode },
    wire: deepFreeze({
      ...compiledSuccess.wire,
      ...(Object.keys(compiledFailures.wire).length === 0
        ? {}
        : { failure: compiledFailures.wire }),
    }),
  });
  const contract = Object.freeze({
    grammar,
    manifest,
  }) as unknown as CliContract;

  compiledCliContracts.set(contract, {
    contract,
    root: definition.root,
    description: command.description,
    fields,
    usageConstraints,
    usage,
    usageFailureExitCode: definition.usageFailureExitCode,
    input: command.input,
    success: compiledSuccess.runtime,
    failures: compiledFailures.runtime,
    handler: command.handler,
    commands: {
      [definition.root]: {
        id: definition.root,
        kind: "rootCommand",
        name: command.name,
        aliases: Object.freeze([]),
        description: command.description,
        ...(helpSupplement === undefined ? {} : { helpSupplement }),
        fields,
        usageConstraints,
        usage,
        input: command.input,
        success: compiledSuccess.runtime,
        failures: compiledFailures.runtime,
        handler: command.handler,
      },
    },
  });

  return contract;
}

function compileHierarchyCli(definition: RuntimeCliDefinition): CliContract {
  const issues: ContractDefinitionIssue[] = [];
  collectCliBaseIssues(definition, issues);
  const orderedIds = orderHierarchy(definition, issues);
  if (issues.length > 0) {
    throw new ContractDefinitionError(
      issues as [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
    );
  }

  const controls = compileControls(definition);
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
      const sharedOptions = compileSharedOptions(
        node.sharedOptions ?? {},
        id,
        issues,
      );
      collectControlFieldConflicts(id, sharedOptions, definition, issues);
      const scopeOptions = deepFreeze([
        ...(node.parent === undefined
          ? []
          : (runtimeCommands[node.parent]?.fields ?? [])),
        ...sharedOptions,
      ]);
      const usage = deepFreeze({
        command: id,
        synopsis: `${createUsageSynopsis(commandPath(id, definition.commands), scopeOptions)} <command>`,
      });
      const compiledNode: RuntimeCompiledCommand = {
        id,
        kind: node.kind,
        ...(node.parent === undefined ? {} : { parent: node.parent }),
        name: node.name,
        aliases,
        description: node.description,
        ...(helpSupplement === undefined ? {} : { helpSupplement }),
        fields: scopeOptions,
        usageConstraints: Object.freeze([]),
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
            sharedOptions,
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
        sharedOptions,
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
    const effectiveDefinitions = collectEffectiveFieldDefinitions(
      id,
      definition.commands,
      issues,
    );
    const effectiveFields =
      input === undefined
        ? []
        : compileInputFields(
            effectiveDefinitions,
            input.inputSchema,
            id,
            issues,
          );
    const describedInput =
      input === undefined
        ? undefined
        : projectFieldDescriptions(input, effectiveFields);
    const localKeys = new Set(Object.keys(executable.fields ?? {}));
    const fields = deepFreeze(
      effectiveFields.filter((field) => localKeys.has(field.key)),
    );
    collectControlFieldConflicts(id, fields, definition, issues);
    const usageConstraints = compileUsageConstraints(
      executable.usageConstraints === undefined
        ? []
        : executable.usageConstraints,
      effectiveFields,
      id,
      issues,
    );
    const leafUsage = deepFreeze({
      command: id,
      synopsis: createUsageSynopsis(
        commandPath(id, definition.commands),
        effectiveFields,
        usageConstraints,
      ),
    });
    runtimeCommands[id] = Object.freeze({
      id,
      kind: "command",
      parent: executable.parent as string,
      name: executable.name,
      aliases,
      description: executable.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      fields: effectiveFields,
      usageConstraints,
      usage: leafUsage,
      input: executable.input,
      success: compiledSuccess.runtime,
      failures: compiledFailures.runtime,
      handler: executable.handler,
    });
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
        effectiveFields,
        ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
        usage: leafUsage,
      }),
    );
    manifestCommands[id] = deepFreeze({
      kind: "command" as const,
      parent: executable.parent as string,
      name: executable.name,
      aliases,
      description: executable.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      fields,
      effectiveFields,
      ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
      input: projectUsageConstraints(
        describedInput as SchemaManifest,
        usageConstraints,
      ),
      success: compiledSuccess.manifest,
      failures: compiledFailures.manifest,
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

  const rootCommand = runtimeCommands[
    definition.root
  ] as RuntimeCompiledCommand;
  const grammar = deepFreeze({
    root: {
      kind: "rootGroup" as const,
      id: rootCommand.id,
      name: rootCommand.name,
      aliases: rootCommand.aliases,
      description: rootCommand.description,
      ...(rootCommand.helpSupplement === undefined
        ? {}
        : { helpSupplement: rootCommand.helpSupplement }),
      usage: rootCommand.usage,
      sharedOptions: rootCommand.fields,
    },
    nodes: grammarNodes,
    controls,
  });
  const manifest = deepFreeze({
    schemaVersion: "1" as const,
    root: definition.root,
    commands: manifestCommands,
    controls,
    usageFailure: { exitCode: definition.usageFailureExitCode },
    wire,
  });
  const contract = Object.freeze({
    grammar,
    manifest,
  }) as unknown as CliContract;
  compiledCliContracts.set(contract, {
    contract,
    root: definition.root,
    description: rootCommand.description,
    fields: rootCommand.fields,
    usageConstraints: rootCommand.usageConstraints,
    usage: rootCommand.usage,
    usageFailureExitCode: definition.usageFailureExitCode,
    input: undefined as unknown as ContractSchema,
    success: { kind: "completion" },
    failures: {},
    handler: undefined,
    commands: deepFreeze(runtimeCommands),
  });
  return contract;
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
  const names: string[] = [];
  let current: string | undefined = id;
  while (current !== undefined) {
    const node: RuntimeCommandDefinition | undefined = commands[current];
    if (node === undefined) break;
    names.unshift(node.name);
    current = node.parent;
  }
  return names.join(" ");
}

function compileSharedOptions(
  definitions: SharedOptionDefinitions,
  command: string,
  issues: ContractDefinitionIssue[],
): readonly Exclude<
  FieldGrammar,
  PositionalGrammar | VariadicPositionalGrammar
>[] {
  for (const [field, definition] of Object.entries(definitions)) {
    const dynamicDefinition = definition as FieldDefinition;
    if (
      dynamicDefinition.kind === "positional" ||
      dynamicDefinition.kind === "variadicPositional"
    ) {
      issues.push({
        code: "invalidSharedOptionKind",
        command,
        field,
        received: dynamicDefinition.kind,
      });
      continue;
    }
  }
  const properties = Object.fromEntries(
    Object.entries(definitions).map(([field, definition]) => [
      field,
      definition.kind === "flag"
        ? { type: "boolean" }
        : definition.kind === "repeatableOption"
          ? { type: "array", items: { type: "string" } }
          : { type: "string" },
    ]),
  );
  return compileInputFields(
    definitions,
    { type: "object", properties, required: [] },
    command,
    issues,
  ) as readonly Exclude<
    FieldGrammar,
    PositionalGrammar | VariadicPositionalGrammar
  >[];
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
          field: candidate.field,
        });
      if (required === undefined)
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint: "requires",
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
      for (const [index, field] of selected.entries()) {
        if (field === undefined) {
          issues.push({
            code: "unknownUsageConstraintField",
            command,
            constraint: "exclusive",
            field: candidate.fields[index] as string,
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

function collectEffectiveFieldDefinitions(
  command: string,
  commands: RuntimeCliDefinition["commands"],
  issues: ContractDefinitionIssue[],
): FieldDefinitions {
  const lineage: RuntimeCommandDefinition[] = [];
  let current: string | undefined = command;
  while (current !== undefined) {
    const node: RuntimeCommandDefinition | undefined = commands[current];
    if (node === undefined) break;
    lineage.unshift(node);
    current = node.parent;
  }

  const effective: Record<string, FieldDefinition> = {};
  const spellingOwners = new Map<string, string>();
  for (const node of lineage) {
    const definitions: FieldDefinitions =
      node.kind === "rootGroup" || node.kind === "commandGroup"
        ? (node.sharedOptions ?? {})
        : ((node as RuntimeExecutableDefinition).fields ?? {});
    for (const [field, definition] of Object.entries(definitions)) {
      if (effective[field] !== undefined) {
        issues.push({
          code: "duplicateInheritedFieldIdentity",
          command,
          field,
        });
        continue;
      }
      effective[field] = definition;
      if (
        definition.kind === "positional" ||
        definition.kind === "variadicPositional"
      ) {
        continue;
      }
      for (const spelling of [
        definition.longOption,
        definition.shortAlias,
        definition.kind === "flag" ? definition.negatedLongOption : undefined,
      ]) {
        if (spelling === undefined) continue;
        const owner = spellingOwners.get(spelling);
        if (owner !== undefined) {
          issues.push({
            code: "duplicateInheritedOptionSpelling",
            command,
            spelling,
            fields: Object.freeze([owner, field]),
          });
        } else {
          spellingOwners.set(spelling, field);
        }
      }
    }
  }
  return effective;
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
      success as Readonly<Record<string, unknown>>,
      issues,
    );
  } else if (success.kind === "data") {
    for (const [variant, definition] of Object.entries(success.variants)) {
      collectTextPresenterIssue(
        command,
        textEnabled,
        "data",
        definition as Readonly<Record<string, unknown>>,
        issues,
        variant,
      );
    }
  } else {
    collectTextPresenterIssue(
      command,
      textEnabled,
      "streamSuccess",
      success as Readonly<Record<string, unknown>>,
      issues,
    );
    for (const [variant, definition] of Object.entries(success.records)) {
      collectTextPresenterIssue(
        command,
        textEnabled,
        "record",
        definition as Readonly<Record<string, unknown>>,
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
      definition as Readonly<Record<string, unknown>>,
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
  readonly runtime: RuntimeCompiledCli["success"];
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
  usageConstraints: readonly UsageConstraintGrammar[] = [],
): string {
  return [
    commandName,
    ...fields.map((field) => {
      const value =
        field.kind === "positional"
          ? `<${field.key}>`
          : field.kind === "variadicPositional"
            ? `<${field.key}...>`
            : field.kind === "flag"
              ? [field.longOption, field.negatedLongOption]
                  .filter((spelling) => spelling !== undefined)
                  .join("|")
              : field.kind === "repeatableOption"
                ? `${field.longOption} <value>`
                : `${field.longOption} <value>`;
      if (field.kind === "repeatableOption") {
        return field.required ? `(${value})...` : `[${value}]...`;
      }
      return field.required ? value : `[${value}]`;
    }),
    ...usageConstraints.map(formatUsageConstraintSynopsis),
  ].join(" ");
}

function formatUsageConstraintSynopsis(
  constraint: UsageConstraintGrammar,
): string {
  if (constraint.kind === "requires")
    return `[requires ${constraint.field} ${constraint.requires}]`;
  if (constraint.kind === "exclusive")
    return `[exclusive ${constraint.fields.join("|")}]`;
  return `[forbidden ${constraint.values
    .map(({ field, value }) => `${field}=${String(value)}`)
    .join(",")}]`;
}
