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
} from "#/contract-schema";
import {
  compileContractSchema,
  compileInputFields,
} from "#/contract-schema-compiler";
import { deepFreeze } from "#/json-value";
import type {
  CompletionFact,
  CompletionOutcome,
  DataFactUnion,
  DataOutcome,
  DataVariantDefinitions,
  FailureFactUnion,
  FailureOutcome,
  FailureVariantDefinitions,
  OutcomeFact,
} from "#/outcome-fact";
import {
  createCompletionWireSchema,
  createDataWireSchema,
  createFailureWireSchema,
} from "#/outcome-wire";
export {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  isIssuedOutcomeFact,
} from "#/outcome-fact";
export type {
  CompletionFact,
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
} from "#/outcome-fact";

const cliContractType = Symbol("CliContract.type");
const executableCommandType = Symbol("ExecutableCommand.type");
const helpCapabilities = new WeakSet<object>();
const outputCapabilities = new WeakSet<object>();
const compiledCliContracts = new WeakMap<object, RuntimeCompiledCli>();

export interface HelpCapability {
  readonly kind: "helpCapability";
  readonly longOption: "--help";
  readonly [cliContractType]: "help";
}

export interface OutputCapability {
  readonly kind: "outputCapability";
  readonly defaultFormat: "structured";
  readonly formats: readonly ["structured"];
  readonly [cliContractType]: "output";
}

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

export interface CompletionRootCommandDefinition<
  Command extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions = Readonly<Record<never, never>>,
  Fields extends FieldDefinitions = Readonly<Record<never, never>>,
  InputSchema extends ContractSchema = ContractSchema<EmptyCliInput>,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: string;
  readonly fields?: CheckedFieldDefinitions<Fields> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Fields>;
  readonly input: InputSchema & RawFieldInputContract<Fields, InputSchema>;
  readonly success: Readonly<{ readonly kind: "completion" }>;
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
  readonly helpSupplement?: string;
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
    >;

export interface RootGroupDefinition {
  readonly kind: "rootGroup";
  readonly parent?: never;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: string;
  readonly handler?: never;
}

export interface CommandGroupDefinition<Parent extends string = string> {
  readonly kind: "commandGroup";
  readonly parent: Parent;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly helpSupplement?: string;
  readonly handler?: never;
}

type HierarchyCommandFacts<Parent extends string = string> = Readonly<{
  readonly kind: "command";
  readonly parent: Parent;
  readonly aliases?: readonly string[];
  readonly helpSupplement?: string;
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
      HierarchyCommandFacts);

export type CommandNodeDefinition =
  | CommandGroupDefinition
  | (HierarchyCommandFacts &
      Readonly<{
        readonly name: string;
        readonly description: string;
        readonly fields?: FieldDefinitions;
        readonly input: ContractSchema;
        readonly success:
          | Readonly<{ readonly kind: "completion" }>
          | Readonly<{
              readonly kind: "data";
              readonly variants: DataVariantDefinitions;
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
    readonly fields: infer Fields extends FieldDefinitions;
  }>
    ? RawFieldInput<Fields>
    : Commands[Command] extends Readonly<{ readonly kind: "command" }>
      ? EmptyCliInput
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
      : never;
}[keyof Commands];

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
  readonly output: OutputCapability;
  readonly usageFailureExitCode: number;
};

export type CompletionRootCliDefinition<
  Root extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions = Readonly<Record<never, never>>,
  Fields extends FieldDefinitions = Readonly<Record<never, never>>,
  InputSchema extends ContractSchema = ContractSchema<EmptyCliInput>,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: CompletionRootCommandDefinition<
        Command,
        Dependencies,
        Failures,
        Fields,
        InputSchema
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
    >;

interface FieldGrammarBase<Field extends string> {
  readonly key: Field;
  readonly description: string;
  readonly required: boolean;
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
  readonly helpSupplement?: string;
  readonly fields: readonly FieldGrammar[];
  readonly usage: CommandUsage<Root>;
}

interface GroupGrammarBase<Command extends string> {
  readonly id: Command;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly helpSupplement?: string;
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
    readonly help: Readonly<{ readonly longOption: "--help" }>;
    readonly output: Readonly<{
      readonly defaultFormat: "structured";
      readonly formats: readonly ["structured"];
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
    }>;

export interface RootCommandManifest {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: string;
  readonly fields: readonly FieldGrammar[];
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
  readonly helpSupplement?: string;
}

export interface ExecutableCommandManifest extends Omit<
  RootCommandManifest,
  "kind"
> {
  readonly kind: "command";
  readonly parent: string;
  readonly aliases: readonly string[];
  readonly helpSupplement?: string;
}

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

export interface DefineCli<Dependencies> {
  readonly command: <const Command extends string>(
    command: Command,
  ) => DefineCommand<Command, Dependencies>;

  <
    const Root extends string,
    const Commands extends Readonly<Record<string, CommandNodeDefinition>>,
  >(
    definition: HierarchyCliDefinition<Root> &
      Readonly<{ readonly commands: Commands }>,
  ): CliContract<
    Root,
    Dependencies,
    HierarchyRawInput<Commands>,
    HierarchyResult<Commands>,
    "rootGroup",
    Commands
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

export interface DefineCommand<Command extends string, Dependencies> {
  <
    const Parent extends string,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: HierarchyCommandInput<
      CompletionRootCommandDefinition<Command, Dependencies, Failures>
    > &
      Readonly<{ readonly parent: Parent }>,
  ): Readonly<
    Record<
      Command,
      Omit<
        CompletionRootCommandDefinition<Command, Dependencies, Failures>,
        "kind"
      > &
        HierarchyCommandFacts<Parent>
    >
  >;

  <
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Parent extends string,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: HierarchyCommandInput<
      CompletionRootCommandDefinition<
        Command,
        Dependencies,
        Failures,
        Fields,
        InputSchema
      >
    > &
      Readonly<{ readonly fields: Fields; readonly parent: Parent }>,
  ): Readonly<
    Record<
      Command,
      Omit<
        CompletionRootCommandDefinition<
          Command,
          Dependencies,
          Failures,
          Fields,
          InputSchema
        >,
        "kind"
      > &
        HierarchyCommandFacts<Parent>
    >
  >;

  <
    const Fields extends FieldDefinitions,
    InputSchema extends ContractSchema,
    const Parent extends string,
    const Variants extends DataVariantDefinitions,
    const Failures extends FailureVariantDefinitions,
  >(
    definition: HierarchyCommandInput<
      DataRootCommandDefinition<
        Command,
        Dependencies,
        Fields,
        InputSchema,
        Variants,
        Failures
      >
    > &
      Readonly<{ readonly parent: Parent }>,
  ): Readonly<
    Record<
      Command,
      Omit<
        DataRootCommandDefinition<
          Command,
          Dependencies,
          Fields,
          InputSchema,
          Variants,
          Failures
        >,
        "kind"
      > &
        HierarchyCommandFacts<Parent>
    >
  >;
}

interface RuntimeCompiledCli {
  readonly contract: CliContract;
  readonly root: string;
  readonly description: string;
  readonly fields: readonly FieldGrammar[];
  readonly usage: CommandUsage<string>;
  readonly usageFailureExitCode: number;
  readonly input: ContractSchema;
  readonly success:
    | Readonly<{ readonly kind: "completion" }>
    | Readonly<{
        readonly kind: "data";
        readonly variants: Readonly<Record<string, RuntimeAtomicVariant>>;
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
  readonly helpSupplement?: string;
  readonly fields: readonly FieldGrammar[];
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
  readonly helpSupplement?: string;
  readonly fields?: FieldDefinitions;
  readonly input: ContractSchema;
  readonly success:
    | Readonly<{ readonly kind: "completion" }>
    | Readonly<{
        readonly kind: "data";
        readonly variants: DataVariantDefinitions;
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
  readonly helpSupplement?: string;
}>;

type RuntimeCommandDefinition =
  | RuntimeExecutableDefinition
  | RuntimeGroupDefinition;

type RuntimeCliDefinition = RootCliDefinitionBase<string> &
  Readonly<{
    readonly commands: Readonly<Record<string, RuntimeCommandDefinition>>;
  }>;

export function helpCapability(): HelpCapability {
  const capability = Object.freeze({
    kind: "helpCapability" as const,
    longOption: "--help" as const,
  }) as HelpCapability;
  helpCapabilities.add(capability);
  return capability;
}

export function outputCapability(
  definition: Readonly<{ readonly defaultFormat: "structured" }>,
): OutputCapability {
  const capability = Object.freeze({
    kind: "outputCapability" as const,
    defaultFormat: definition.defaultFormat,
    formats: Object.freeze(["structured"] as const),
  }) as OutputCapability;
  outputCapabilities.add(capability);
  return capability;
}

export function defineCli<Dependencies = undefined>(): DefineCli<Dependencies> {
  const define = ((definition: RuntimeCliDefinition) =>
    compileCli(definition)) as DefineCli<Dependencies>;
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
    definitionIssues,
  );
  const compiledFailures = compileFailures(
    definition.root,
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
  if (definitionIssues.length > 0) {
    throw new ContractDefinitionError(
      definitionIssues as [
        ContractDefinitionIssue,
        ...ContractDefinitionIssue[],
      ],
    );
  }
  const validInput = input as SchemaManifest;
  const usage = deepFreeze({
    command: definition.root,
    synopsis: createUsageSynopsis(command.name, fields),
  });
  const controls = deepFreeze({
    help: { longOption: definition.help.longOption },
    output: {
      defaultFormat: definition.output.defaultFormat,
      formats: definition.output.formats,
    },
  });
  const grammar = deepFreeze({
    root: {
      kind: "rootCommand" as const,
      id: definition.root,
      name: command.name,
      description: command.description,
      ...(command.helpSupplement === undefined
        ? {}
        : { helpSupplement: command.helpSupplement }),
      fields,
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
        ...(command.helpSupplement === undefined
          ? {}
          : { helpSupplement: command.helpSupplement }),
        fields,
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
        ...(command.helpSupplement === undefined
          ? {}
          : { helpSupplement: command.helpSupplement }),
        fields,
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

  const controls = deepFreeze({
    help: { longOption: definition.help.longOption },
    output: {
      defaultFormat: definition.output.defaultFormat,
      formats: definition.output.formats,
    },
  });
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
    const usage = deepFreeze({
      command: id,
      synopsis:
        node.kind === "rootGroup" || node.kind === "commandGroup"
          ? `${commandPath(id, definition.commands)} <command>`
          : createUsageSynopsis(commandPath(id, definition.commands), []),
    });
    if (node.kind === "rootGroup" || node.kind === "commandGroup") {
      const compiledNode: RuntimeCompiledCommand = {
        id,
        kind: node.kind,
        ...(node.parent === undefined ? {} : { parent: node.parent }),
        name: node.name,
        aliases,
        description: node.description,
        ...(node.helpSupplement === undefined
          ? {}
          : { helpSupplement: node.helpSupplement }),
        fields: Object.freeze([]),
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
            ...(node.helpSupplement === undefined
              ? {}
              : { helpSupplement: node.helpSupplement }),
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
        ...(node.helpSupplement === undefined
          ? {}
          : { helpSupplement: node.helpSupplement }),
      });
      continue;
    }

    const executable = node as RuntimeExecutableDefinition;
    const input = compileContractSchema(
      executable.input,
      { command: id, location: "input" },
      issues,
    );
    const compiledSuccess = compileSuccess(id, executable.success, issues);
    const compiledFailures = compileFailures(id, executable.failures, issues);
    const fields =
      input === undefined
        ? []
        : compileInputFields(
            executable.fields ?? {},
            input.inputSchema,
            id,
            issues,
          );
    const leafUsage = deepFreeze({
      command: id,
      synopsis: createUsageSynopsis(
        commandPath(id, definition.commands),
        fields,
      ),
    });
    runtimeCommands[id] = {
      id,
      kind: "command",
      parent: executable.parent as string,
      name: executable.name,
      aliases,
      description: executable.description,
      ...(executable.helpSupplement === undefined
        ? {}
        : { helpSupplement: executable.helpSupplement }),
      fields,
      usage: leafUsage,
      input: executable.input,
      success: compiledSuccess.runtime,
      failures: compiledFailures.runtime,
      handler: executable.handler,
    };
    grammarNodes.push(
      deepFreeze({
        kind: "command" as const,
        id,
        parent: executable.parent as string,
        name: executable.name,
        aliases,
        description: executable.description,
        ...(executable.helpSupplement === undefined
          ? {}
          : { helpSupplement: executable.helpSupplement }),
        fields,
        usage: leafUsage,
      }),
    );
    manifestCommands[id] = deepFreeze({
      kind: "command" as const,
      parent: executable.parent as string,
      name: executable.name,
      aliases,
      description: executable.description,
      ...(executable.helpSupplement === undefined
        ? {}
        : { helpSupplement: executable.helpSupplement }),
      fields,
      input: input as SchemaManifest,
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
  if (command.description.length === 0) {
    issues.push({
      code: "missingCommandText",
      command: definition.root,
      field: "description",
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
  if (!outputCapabilities.has(definition.output)) {
    issues.push({ code: "invalidCapability", capability: "output" });
  } else if (definition.output.defaultFormat !== "structured") {
    issues.push({
      code: "invalidOutputFormat",
      expected: "structured",
      received:
        typeof definition.output.defaultFormat === "string"
          ? definition.output.defaultFormat
          : null,
    });
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
    if (node.description.length === 0)
      issues.push({
        code: "missingCommandText",
        command: id,
        field: "description",
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

function compileSuccess(
  command: string,
  success: RuntimeExecutableDefinition["success"],
  issues: ContractDefinitionIssue[],
): Readonly<{
  readonly runtime: RuntimeCompiledCli["success"];
  readonly manifest: CommandSuccessManifest;
  readonly wire: CliManifest<string>["wire"];
}> {
  if (success.kind === "completion") {
    return {
      runtime: Object.freeze({ kind: "completion" }),
      manifest: Object.freeze({ kind: "completion" }),
      wire: Object.freeze({
        completion: deepFreeze(createCompletionWireSchema(command)),
      }),
    };
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
  ].join(" ");
}
