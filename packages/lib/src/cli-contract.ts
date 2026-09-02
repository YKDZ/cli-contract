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
  readonly fields: readonly FieldGrammar[];
  readonly usage: CommandUsage<Root>;
}

export interface CliGrammar<Root extends string> {
  readonly root: RootCommandGrammar<Root>;
  readonly nodes: readonly [];
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
  readonly fields: readonly FieldGrammar[];
  readonly input: SchemaManifest;
  readonly success: CommandSuccessManifest;
  readonly failures: Readonly<Record<string, FailureVariantManifest>>;
}

export interface CliManifest<Root extends string> {
  readonly schemaVersion: "1";
  readonly root: Root;
  readonly commands: Readonly<Record<Root, RootCommandManifest>>;
  readonly controls: CliGrammar<Root>["controls"];
  readonly usageFailure: Readonly<{ readonly exitCode: number }>;
  readonly wire: Readonly<{
    readonly completion?: JsonObject;
    readonly data?: Readonly<Record<string, JsonObject>>;
    readonly failure?: Readonly<Record<string, JsonObject>>;
  }>;
}

export interface CliContract<
  Root extends string = string,
  Dependencies = unknown,
  RawInput = Readonly<Record<string, unknown>>,
  Result extends OutcomeFact = OutcomeFact,
> {
  readonly grammar: CliGrammar<Root>;
  readonly manifest: CliManifest<Root>;
  readonly [cliContractType]: Readonly<{
    readonly dependencies: Dependencies;
    readonly rawInput: RawInput;
    readonly result: Result;
    readonly root: Root;
  }>;
}

export type CliContractDependencies<Contract> =
  Contract extends CliContract<string, infer Dependencies, unknown>
    ? Dependencies
    : never;

export type CliContractRawInput<Contract> =
  Contract extends CliContract<string, unknown, infer RawInput>
    ? RawInput
    : never;

export type CliContractResult<Contract> =
  Contract extends CliContract<string, unknown, unknown, infer Result>
    ? Result
    : never;

export type CliContractRoot<Contract> =
  Contract extends CliContract<infer Root, unknown, unknown> ? Root : never;

export interface DefineCli<Dependencies> {
  <const Root extends string, const Failures extends FailureVariantDefinitions>(
    definition: CompletionRootCliDefinition<Root, Dependencies, Failures>,
  ): CliContract<
    Root,
    Dependencies,
    EmptyCliInput,
    CompletionFact<Root> | FailureFactUnion<Root, Failures>
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
    CompletionFact<Root> | FailureFactUnion<Root, Failures>
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
    DataFactUnion<Root, Variants> | FailureFactUnion<Root, Failures>
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
}

type RuntimeCommandDefinition = Readonly<{
  readonly kind: "rootCommand";
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
}>;

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
  return compileCli as DefineCli<Dependencies>;
}

function compileCli(definition: RuntimeCliDefinition): CliContract {
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
  const contract = Object.freeze({ grammar, manifest }) as CliContract;

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
): RuntimeCommandDefinition | undefined {
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
  success: RuntimeCommandDefinition["success"],
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
