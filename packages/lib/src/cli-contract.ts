import {
  compileAtomicVariants,
  type RuntimeAtomicVariant,
} from "#/atomic-variant-compiler";
import type { CommandUsage } from "#/cli-invocation";
import {
  ContractDefinitionError,
  type ContractDefinitionIssue,
} from "#/contract-definition-error";
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
        : IsCanonicalKebabBody<Rest, true>
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
  : Value extends `--${infer Body}`
    ? IsCanonicalKebabBody<Body> extends true
      ? Value
      : never
    : never;

export interface ValueOptionDefinition<
  LongOption extends `--${string}` = `--${string}`,
> {
  readonly kind: "valueOption";
  readonly longOption: LongOption;
  readonly description: string;
}

export type ValueOptionDefinitions = Readonly<
  Record<string, ValueOptionDefinition>
>;

export type RawValueOptionInput<Fields extends ValueOptionDefinitions> =
  Readonly<{ [Field in keyof Fields]?: string }>;

export type ValueOptionDefinitionsForInput<Input> = Readonly<{
  [Field in Extract<keyof Input, string>]: ValueOptionDefinition;
}>;

type CheckedValueOptionDefinitions<Fields extends ValueOptionDefinitions> = {
  readonly [Field in keyof Fields]: Fields[Field] extends ValueOptionDefinition<
    infer LongOption
  >
    ? LongOption extends CanonicalLongOption<LongOption>
      ? Fields[Field]
      : ContractTypeError<
          "invalidCanonicalLongOption",
          Readonly<{ readonly field: Field; readonly received: LongOption }>
        >
    : never;
};

export type RawValueOptionInputForSchema<InputSchema extends ContractSchema> =
  Readonly<{
    [Field in Extract<keyof ContractSchemaInput<InputSchema>, string>]?: string;
  }>;

export interface ContractTypeError<Code extends string, Evidence> {
  readonly contractTypeError: Readonly<{ readonly code: Code } & Evidence>;
}

type InputStringKeys<Input> = Extract<keyof Input, string>;

type NonStringInputKeys<Input> = {
  [Field in InputStringKeys<Input>]: string extends Input[Field]
    ? never
    : Field;
}[InputStringKeys<Input>];

type RawStringInputContract<InputSchema extends ContractSchema> =
  NonStringInputKeys<ContractSchemaInput<InputSchema>> extends never
    ? unknown
    : ContractTypeError<
        "fieldInputMustAcceptRawString",
        Readonly<{
          readonly fields: NonStringInputKeys<ContractSchemaInput<InputSchema>>;
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
> {
  readonly input: EmptyCliInput;
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
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly input: ContractSchema<EmptyCliInput>;
  readonly success: Readonly<{ readonly kind: "completion" }>;
  readonly failures: Failures & FailureVariantNameContract<Failures>;
  readonly handler: (
    context: CompletionHandlerContext<Command, Dependencies, Failures>,
  ) =>
    | CompletionFact<Command>
    | FailureFactUnion<Command, Failures>
    | Promise<CompletionFact<Command> | FailureFactUnion<Command, Failures>>;
}

export interface DataRootCommandDefinition<
  Command extends string,
  Dependencies,
  Fields extends ValueOptionDefinitions,
  InputSchema extends ContractSchema,
  Variants extends DataVariantDefinitions,
  Failures extends FailureVariantDefinitions,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly fields: Fields &
    ValueOptionDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    CheckedValueOptionDefinitions<Fields>;
  readonly input: InputSchema & RawStringInputContract<InputSchema>;
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
      FailureVariantDefinitions
    >
  | DataRootCommandDefinition<
      Command,
      Dependencies,
      ValueOptionDefinitions,
      ContractSchema,
      DataVariantDefinitions,
      FailureVariantDefinitions
    >;

interface RootCliDefinitionBase<Root extends string> {
  readonly root: Root;
  readonly help: HelpCapability;
  readonly output: OutputCapability;
  readonly usageFailureExitCode: number;
}

export type CompletionRootCliDefinition<
  Root extends string,
  Dependencies,
  Failures extends FailureVariantDefinitions = Readonly<Record<never, never>>,
> = RootCliDefinitionBase<Root> &
  Readonly<{
    readonly commands: Readonly<{
      readonly [Command in Root]: CompletionRootCommandDefinition<
        Command,
        Dependencies,
        Failures
      >;
    }>;
  }>;

export type DataRootCliDefinition<
  Root extends string,
  Dependencies,
  Fields extends ValueOptionDefinitions,
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
  | CompletionRootCliDefinition<Root, Dependencies, FailureVariantDefinitions>
  | DataRootCliDefinition<
      Root,
      Dependencies,
      ValueOptionDefinitions,
      ContractSchema,
      DataVariantDefinitions,
      FailureVariantDefinitions
    >;

export interface ValueOptionGrammar<Field extends string = string> {
  readonly kind: "valueOption";
  readonly key: Field;
  readonly longOption: CanonicalLongOption<string>;
  readonly description: string;
  readonly required: boolean;
}

export interface RootCommandGrammar<Root extends string> {
  readonly kind: "rootCommand";
  readonly id: Root;
  readonly name: string;
  readonly description: string;
  readonly fields: readonly ValueOptionGrammar[];
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
  readonly fields: readonly ValueOptionGrammar[];
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
  Contract extends CliContract<string, infer Dependencies, unknown, OutcomeFact>
    ? Dependencies
    : never;

export type CliContractRawInput<Contract> =
  Contract extends CliContract<string, unknown, infer RawInput, OutcomeFact>
    ? RawInput
    : never;

export type CliContractResult<Contract> =
  Contract extends CliContract<string, unknown, unknown, infer Result>
    ? Result
    : never;

export type CliContractRoot<Contract> =
  Contract extends CliContract<infer Root, unknown, unknown, OutcomeFact>
    ? Root
    : never;

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
    const Fields extends ValueOptionDefinitions,
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
    RawValueOptionInput<Fields>,
    DataFactUnion<Root, Variants> | FailureFactUnion<Root, Failures>
  >;
}

interface RuntimeCompiledCli {
  readonly contract: CliContract;
  readonly root: string;
  readonly description: string;
  readonly fields: readonly ValueOptionGrammar[];
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
  readonly fields?: ValueOptionDefinitions;
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
  assertRootDefinition(definition);
  const definitionIssues: ContractDefinitionIssue[] = [];
  const command = definition.commands[
    definition.root
  ] as RuntimeCommandDefinition;
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
  if (input === undefined) {
    throw new TypeError("契约模式投影缺失");
  }
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
        input,
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
    throw new TypeError("CLI 契约必须由 defineCli 创建");
  }
  return compiled;
}

function assertRootDefinition(definition: RuntimeCliDefinition): void {
  if (!helpCapabilities.has(definition.help)) {
    throw new TypeError("help 必须由 helpCapability 创建");
  }
  if (!outputCapabilities.has(definition.output)) {
    throw new TypeError("output 必须由 outputCapability 创建");
  }
  if (
    !Number.isInteger(definition.usageFailureExitCode) ||
    definition.usageFailureExitCode < 1 ||
    definition.usageFailureExitCode > 255
  ) {
    throw new TypeError("用法失败退出码必须是 1 到 255 之间的整数");
  }

  const command = definition.commands[definition.root];
  if (command === undefined) {
    throw new TypeError("根命令必须存在");
  }
  if (Object.keys(definition.commands).length !== 1) {
    throw new TypeError("RootCommand CLI 必须且只能包含一个命令");
  }
  if (command.kind !== "rootCommand") {
    throw new TypeError("根命令 kind 必须是 rootCommand");
  }
  if (command.name.length === 0 || command.description.length === 0) {
    throw new TypeError("根命令名称和描述不能为空");
  }
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
    throw new TypeError("data 命令必须声明至少一个具名变体");
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
  fields: readonly ValueOptionGrammar[],
): string {
  return [
    commandName,
    ...fields.map((field) => {
      const value = `${field.longOption} <value>`;
      return field.required ? value : `[${value}]`;
    }),
  ].join(" ");
}
