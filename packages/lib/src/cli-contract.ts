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
  DataVariantDefinition,
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
  StreamRecordDefinition,
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
const outputModes = new WeakSet<object>();
const outputModeMetadata = new WeakMap<
  object,
  Readonly<{
    readonly command: string;
    readonly input: ContractSchema;
  }>
>();
const outputModeDefinitions = new WeakSet<object>();
const outputModeDefinitionMetadata = new WeakMap<
  object,
  Readonly<{
    readonly command: string;
    readonly input: ContractSchema;
  }>
>();
const versionCapabilities = new WeakSet<object>();
const compiledCliContracts = new WeakMap<object, RuntimeCompiledCli>();

// 类型约束与定义期检查共用已知属性，避免拼错的声明被静默丢弃。
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
  atomicVariant: ["description", "schema", "exitCode", "text"],
  streamRecord: ["description", "schema", "text"],
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
 * 根级帮助中既定段落的可选标题。未声明标题时仍保留对应机械内容和缩进，
 * 不会由核心补写默认文案。
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
  /** 命令组占位词本身，核心为它添加尖括号。 */
  readonly commandPlaceholder?: string;
  /** 字段或输出格式的候选集合，必须包含 `{choices}`。 */
  readonly choices?: string;
  /** 字段或输出格式的默认 JSON 值，必须包含 `{value}`。 */
  readonly default?: string;
  /** 有效的成立分支，必须包含 `{facts}` 与 `{onMatch}`。 */
  readonly whenOnMatch?: string;
  /** 有效的不成立分支，必须包含 `{facts}` 与 `{otherwise}`。 */
  readonly whenOtherwise?: string;
  /** 两侧均有效的条件分支，必须包含 `{facts}`、`{onMatch}` 与 `{otherwise}`。 */
  readonly whenOnMatchOtherwise?: string;
  /** 效果中的必需字段组，必须包含 `{fields}`。 */
  readonly require?: string;
  /** 效果中的禁止字段组，必须包含 `{fields}`。 */
  readonly forbid?: string;
  /** 字段出现事实，必须包含 `{field}`。 */
  readonly present?: string;
  /** 字段等值事实，必须包含 `{field}` 与 `{value}`。 */
  readonly equals?: string;
  /** 禁止同时成立的字段事实组，必须包含 `{facts}`。 */
  readonly forbiddenCombination?: string;
  /** 字段数必须恰好为 `{count}`，包含 `{fields}`。 */
  readonly countExactly?: string;
  /** 字段数至少为 `{min}`，包含 `{fields}`。 */
  readonly countAtLeast?: string;
  /** 字段数至多为 `{max}`，包含 `{fields}`。 */
  readonly countAtMost?: string;
  /** 字段数位于 `{min}` 到 `{max}`，包含 `{fields}`。 */
  readonly countBetween?: string;
}

/** 帮助事实槽位及其必需替换参数的唯一规格。 */
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

/** 按帮助槽位推导的替换参数闭合形状。 */
export type HelpFactTemplateParameters = {
  readonly [Slot in keyof typeof helpTemplateSpecifications]: Readonly<
    Record<
      (typeof helpTemplateSpecifications)[Slot]["placeholders"][number],
      string
    >
  >;
};

/** 根契约一次装配的帮助配置；标题可省略，实际出现的事实必须有文案。 */
export interface HelpCapabilityDefinition {
  readonly shortAlias?: "-h";
  readonly headings?: HelpHeadings;
  readonly wording?: HelpFactWording;
}

type HelpCapabilityDefinitionForTypeCheck = Omit<
  HelpCapabilityDefinition,
  "wording"
> & {
  /** 保留未知槽位的字面键，让局部闭合诊断提供可行动身份。 */
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

/** 根级契约发现能力；说明文案一次装配后会投影到全树帮助。 */
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

/** 与可执行命令同位的调用样本；省略 outputMode 表示采用命令默认方式。 */
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

type OutputFormatTextEnabled<Format extends OutputFormat> =
  Format extends "text" ? true : false;

type OutputModeSetDeclaration = Readonly<{
  readonly default?: string;
  readonly modes: Readonly<Record<string, unknown>>;
}>;

type OutputModeKeys<Modes> = Extract<keyof Modes, string>;

type OutputModeDefaultContract<Definition> =
  Definition extends Readonly<{
    readonly modes: infer Modes;
    readonly default: infer Default;
  }>
    ? IsUnion<OutputModeKeys<Modes>> extends true
      ? Default extends OutputModeKeys<Modes>
        ? unknown
        : ContractTypeError<
            "invalidDefaultOutputMode",
            Readonly<{ readonly default: Default }>
          >
      : Default extends OutputModeKeys<Modes>
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

export type OutputModeDefinition =
  | AtomicOutputModeDefinition<
      string,
      ContractSchema,
      OutputFormat,
      | Readonly<{ readonly kind: "completion" }>
      | Readonly<{
          readonly kind: "data";
          readonly variants: DataVariantDefinitions;
        }>,
      object
    >
  | StreamOutputModeDefinition<
      string,
      ContractSchema,
      OutputFormat,
      StreamRecordDefinitions,
      object
    >;

export type OutputModeMap = Readonly<Record<string, OutputModeDefinition>>;

type AtomicModeFailures<
  _Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = FailureVariantDefinitionsForSchemas<Schemas, TextEnabled>;

type AtomicModeFailuresContract<
  Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = AtomicModeFailures<Command, Schemas, TextEnabled> &
  ClosedAtomicVariants<AtomicModeFailures<Command, Schemas, TextEnabled>> &
  FailureVariantTextContract<
    Command,
    AtomicModeFailures<Command, Schemas, TextEnabled>,
    TextEnabled
  >;

type AtomicModeDataSuccess<
  _Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly kind: "data";
  readonly variants: DataVariantDefinitionsForSchemas<Schemas, TextEnabled>;
}>;

type AtomicModeDataSuccessContract<
  Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = AtomicModeDataSuccess<Command, Schemas, TextEnabled> &
  Readonly<{
    readonly variants: ClosedAtomicVariants<
      DataVariantDefinitionsForSchemas<Schemas, TextEnabled>
    > &
      DataVariantTextContract<
        Command,
        DataVariantDefinitionsForSchemas<Schemas, TextEnabled>,
        TextEnabled
      >;
  }>;

type StreamRecordDefinitionsForSchemas<
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly [Variant in keyof Schemas]: Schemas[Variant] extends ContractSchema
    ? StreamRecordDefinition<
        ContractSchemaInput<Schemas[Variant]>,
        TextEnabled,
        ContractSchemaOutput<Schemas[Variant]>
      > &
        Readonly<{ readonly schema: Schemas[Variant] }>
    : never;
}>;

type StreamModeRecords<
  _Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = StreamRecordDefinitionsForSchemas<Schemas, TextEnabled>;

type StreamModeRecordsContract<
  Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = StreamModeRecords<Command, Schemas, TextEnabled> &
  ClosedStreamRecords<StreamRecordDefinitionsForSchemas<Schemas, TextEnabled>> &
  StreamRecordNameContract<
    Command,
    StreamRecordDefinitionsForSchemas<Schemas, TextEnabled>
  > &
  StreamRecordTextContract<
    Command,
    StreamRecordDefinitionsForSchemas<Schemas, TextEnabled>,
    TextEnabled
  >;

type StreamModeFailures<
  Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = AtomicModeFailures<Command, Schemas, TextEnabled>;

type StreamModeFailuresContract<
  Command extends string,
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = AtomicModeFailuresContract<Command, Schemas, TextEnabled>;

type ClosedRawAtomicSuccess<Success> = RejectUnknownProperties<
  Success,
  Success extends { readonly kind: "completion" }
    ? "kind" | "text"
    : "kind" | "text" | "variants"
> &
  (Success extends { readonly kind: "data"; readonly variants: infer Variants }
    ? { readonly variants: ClosedAtomicVariants<Variants> }
    : unknown);

export interface OutputModeFactory<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
> {
  readonly atomic: {
    <
      const Format extends OutputFormat,
      const RawDefinition extends object,
      const RawSuccess extends object,
      const RawFailures extends object,
      const Failures extends VariantSchemaMap = Readonly<Record<never, never>>,
    >(
      definition: RawDefinition &
        Readonly<{
          readonly description: string;
          readonly format: Format;
          readonly success: Readonly<{
            readonly kind: "completion";
            readonly text?: CompletionTextPresenter;
          }> &
            RawSuccess;
          readonly failures: AtomicModeFailures<Command, Failures, boolean> &
            RawFailures;
          readonly handler: (
            context: Readonly<{
              readonly input: ContractSchemaOutput<InputSchema>;
              readonly dependencies: Dependencies;
              readonly outcome: CompletionOutcome<Command> &
                FailureOutcome<
                  Command,
                  AtomicModeFailures<Command, Failures, boolean>
                >;
            }>,
          ) =>
            | CompletionFact<Command>
            | FailureFactUnion<
                Command,
                AtomicModeFailures<Command, Failures, boolean>
              >
            | Promise<
                | CompletionFact<Command>
                | FailureFactUnion<
                    Command,
                    AtomicModeFailures<Command, Failures, boolean>
                  >
              >;
        }> &
        RejectUnknownProperties<
          NoInfer<RawDefinition>,
          Exclude<
            (typeof definitionPropertyKeys.outputMode)[number],
            "delivery"
          >
        > &
        Readonly<{
          readonly success: ClosedRawAtomicSuccess<NoInfer<RawSuccess>>;
          readonly failures: ClosedAtomicVariants<NoInfer<RawFailures>>;
        }> &
        Readonly<{
          readonly failures: AtomicModeFailuresContract<
            Command,
            NoInfer<Failures>,
            boolean
          >;
        }>,
    ): AtomicOutputModeDefinition<
      Command,
      InputSchema,
      Format,
      RawSuccess,
      RawFailures
    >;
    <
      const Format extends OutputFormat,
      const RawDefinition extends object,
      const RawSuccess extends object,
      const RawFailures extends object,
      const Schemas extends VariantSchemaMap,
      const Failures extends VariantSchemaMap = Readonly<Record<never, never>>,
    >(
      definition: RawDefinition &
        Readonly<{
          readonly description: string;
          readonly format: Format;
          readonly success: AtomicModeDataSuccess<Command, Schemas, boolean> &
            RawSuccess;
          readonly failures: AtomicModeFailures<Command, Failures, boolean> &
            RawFailures;
          readonly handler: (
            context: Readonly<{
              readonly input: ContractSchemaOutput<InputSchema>;
              readonly dependencies: Dependencies;
              readonly outcome: DataOutcome<
                Command,
                DataVariantDefinitionsForSchemas<Schemas, boolean>
              > &
                FailureOutcome<
                  Command,
                  AtomicModeFailures<Command, Failures, boolean>
                >;
            }>,
          ) =>
            | DataFactUnion<
                Command,
                DataVariantDefinitionsForSchemas<Schemas, boolean>
              >
            | FailureFactUnion<
                Command,
                AtomicModeFailures<Command, Failures, boolean>
              >
            | Promise<
                | DataFactUnion<
                    Command,
                    DataVariantDefinitionsForSchemas<Schemas, boolean>
                  >
                | FailureFactUnion<
                    Command,
                    AtomicModeFailures<Command, Failures, boolean>
                  >
              >;
        }> &
        RejectUnknownProperties<
          NoInfer<RawDefinition>,
          Exclude<
            (typeof definitionPropertyKeys.outputMode)[number],
            "delivery"
          >
        > &
        Readonly<{
          readonly success: ClosedRawAtomicSuccess<NoInfer<RawSuccess>>;
          readonly failures: ClosedAtomicVariants<NoInfer<RawFailures>>;
        }> &
        Readonly<{
          readonly success: AtomicModeDataSuccessContract<
            Command,
            NoInfer<Schemas>,
            boolean
          >;
          readonly failures: AtomicModeFailuresContract<
            Command,
            NoInfer<Failures>,
            boolean
          >;
        }>,
    ): AtomicOutputModeDefinition<
      Command,
      InputSchema,
      Format,
      RawSuccess,
      RawFailures
    >;
  };
  readonly stream: <
    const Format extends OutputFormat,
    const RawDefinition extends object,
    const RawSuccess extends object,
    const Schemas extends VariantSchemaMap,
    const Failures extends VariantSchemaMap = Readonly<Record<never, never>>,
  >(
    definition: RawDefinition &
      Readonly<{
        readonly description: string;
        readonly format: Format;
        readonly success: Readonly<{
          readonly kind: "stream";
          readonly records: StreamModeRecords<
            Command,
            Schemas,
            OutputFormatTextEnabled<Format> extends false ? false : boolean
          >;
        }> &
          RawSuccess &
          (OutputFormatTextEnabled<Format> extends true
            ? Readonly<{ readonly text?: CompletionTextPresenter }>
            : Readonly<{ readonly text?: never }>);
        readonly failures: StreamModeFailures<
          Command,
          Failures,
          OutputFormatTextEnabled<Format>
        >;
        readonly handler: (
          context: StreamHandlerContext<
            Command,
            Dependencies,
            ContractSchemaOutput<InputSchema>,
            StreamModeRecords<
              Command,
              Schemas,
              OutputFormatTextEnabled<Format> extends false ? false : boolean
            >,
            StreamModeFailures<
              Command,
              Failures,
              OutputFormatTextEnabled<Format>
            >
          >,
        ) => AsyncGenerator<
          StreamRecordFactUnion<
            Command,
            StreamModeRecords<
              Command,
              Schemas,
              OutputFormatTextEnabled<Format> extends false ? false : boolean
            >
          >,
          | StreamSuccessFact<Command>
          | FailureFactUnion<
              Command,
              StreamModeFailures<
                Command,
                Failures,
                OutputFormatTextEnabled<Format>
              >
            >,
          void
        >;
      }> &
      RejectUnknownProperties<
        NoInfer<RawDefinition>,
        Exclude<(typeof definitionPropertyKeys.outputMode)[number], "delivery">
      > &
      Readonly<{
        readonly success: ClosedRawStreamSuccess<NoInfer<RawSuccess>>;
      }> &
      Readonly<{
        readonly success: Readonly<{
          readonly records: StreamModeRecordsContract<
            Command,
            NoInfer<Schemas>,
            OutputFormatTextEnabled<Format> extends false ? false : boolean
          >;
        }> &
          (OutputFormatTextEnabled<Format> extends true
            ? Readonly<{ readonly text?: CompletionTextPresenter }>
            : Readonly<{ readonly text?: never }>);
        readonly failures: StreamModeFailuresContract<
          Command,
          NoInfer<Failures>,
          OutputFormatTextEnabled<Format>
        >;
      }>,
  ) => Omit<
    StreamOutputModeDefinition<
      Command,
      InputSchema,
      Format,
      RawStreamRecords<RawSuccess>,
      StreamModeFailures<Command, Failures, OutputFormatTextEnabled<Format>>
    >,
    "success"
  > &
    Readonly<{ readonly success: RawSuccess }>;
}

type OutputModesDefault<Definition> =
  Definition extends Readonly<{
    readonly modes: infer Modes;
    readonly default?: infer Default;
  }>
    ? Exclude<Default, undefined> extends never
      ? OutputModeKeys<Modes>
      : Extract<Exclude<Default, undefined>, OutputModeKeys<Modes>>
    : never;

type ModeVariantNames<Command extends string, Mode> =
  Mode extends Readonly<{
    readonly success: Readonly<{
      readonly kind: "data";
      readonly variants: infer Variants;
    }>;
  }>
    ? InvalidVariantNames<Variants> extends never
      ? ModeFailureNames<Command, Mode>
      : DataVariantNameContract<Command, Variants>
    : ModeFailureNames<Command, Mode>;

type ModeFailureNames<Command extends string, Mode> =
  Mode extends Readonly<{ readonly failures: infer Failures }>
    ? FailureVariantNameContract<Command, Failures>
    : unknown;

// 原子方式的呈现器覆盖按具名方式映射检查，以便诊断直接关联对应声明。
type VariantsWithText<Variants> = {
  [Variant in keyof Variants & string]: "text" extends keyof Variants[Variant]
    ? Variant
    : never;
}[keyof Variants & string];
type VariantPresenterContract<
  Command extends string,
  Location extends "data" | "failure",
  Variants,
  Format,
> = Format extends "text"
  ? NamedVariantTextContract<Command, Location, Variants, true, never>
  : VariantsWithText<Variants> extends never
    ? unknown
    : ContractTypeError<
        "unexpectedTextPresenter",
        Readonly<{
          readonly command: Command;
          readonly location: Location;
          readonly variant: VariantsWithText<Variants>;
          readonly unexpected: "text";
        }>
      >;
type SuccessPresenterContract<
  Command extends string,
  Success,
  Format,
> = Success extends { readonly kind: "completion" }
  ? Format extends "text"
    ? Success extends { readonly text: unknown }
      ? unknown
      : ContractTypeError<
          "missingTextPresenter",
          Readonly<{
            readonly command: Command;
            readonly location: "completion";
            readonly missing: "text";
          }>
        >
    : "text" extends keyof Success
      ? ContractTypeError<
          "unexpectedTextPresenter",
          Readonly<{
            readonly command: Command;
            readonly location: "completion";
            readonly unexpected: "text";
          }>
        >
      : unknown
  : Success extends { readonly kind: "data"; readonly variants: infer Variants }
    ? VariantPresenterContract<Command, "data", Variants, Format>
    : unknown;
type AtomicPresenterContract<Command extends string, Mode> = Mode extends {
  readonly delivery: "atomic";
  readonly format: infer Format;
  readonly success: infer Success;
  readonly failures: infer Failures;
}
  ? SuccessPresenterContract<
      Command,
      Success,
      Format
    > extends ContractTypeError<string, unknown>
    ? SuccessPresenterContract<Command, Success, Format>
    : VariantPresenterContract<Command, "failure", Failures, Format>
  : unknown;
type RawStreamRecords<Success> = Success extends {
  readonly records: infer Records extends StreamRecordDefinitions;
}
  ? Records
  : never;
type ClosedRawStreamSuccess<Success> = RejectUnknownProperties<
  Success,
  "kind" | "records" | "text"
> &
  (Success extends { readonly records: infer Records }
    ? { readonly records: ClosedStreamRecords<Records> }
    : unknown);
type StreamPresenterContract<Command extends string, Mode> = Mode extends {
  readonly delivery: "stream";
  readonly format: "text";
  readonly success: infer Success;
}
  ? Success extends { readonly records: infer Records }
    ? MissingVariantTextPresenters<Records> extends never
      ? Success extends { readonly text: unknown }
        ? unknown
        : ContractTypeError<
            "missingTextPresenter",
            Readonly<{
              readonly command: Command;
              readonly location: "streamSuccess";
              readonly missing: "text";
            }>
          >
      : StreamRecordTextContract<Command, Records, true>
    : unknown
  : unknown;

type LocalModeContract<Command extends string, Mode> =
  ModeVariantNames<Command, Mode> extends ContractTypeError<string, unknown>
    ? ModeVariantNames<Command, Mode>
    : Mode extends { readonly delivery: "stream" }
      ? StreamPresenterContract<Command, Mode>
      : AtomicPresenterContract<Command, Mode>;

type OutputModesVariantNames<Command extends string, Definition> =
  Definition extends Readonly<{ readonly modes: infer Modes }>
    ? Readonly<{
        readonly modes: {
          readonly [Mode in keyof Modes]: LocalModeContract<
            Command,
            Modes[Mode]
          >;
        };
      }>
    : unknown;

type OutputModesTypeContract<Definition> =
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
 * 字段键须符合 lowerCamelCase，且不能使用 constructor、hasOwnProperty、
 * isPrototypeOf、propertyIsEnumerable、toString、valueOf 或 toLocaleString。
 * 迁移字段键时同步模式 Input 键及引用，命令行拼写可保留。
 */
export type FieldDefinitions = Readonly<Record<string, FieldDefinition>>;

/**
 * 可投影到 parser 和 Draft 2020-12 的有限字段关系：`count` 限制 raw 字段出现数，`when` 根据 raw 事实选择必需或禁止效果，
 * `forbiddenCombination` 拒绝指定事实组合。字段必填、候选值与格式由输入模式表达；依赖实际值计算、时间或业务状态的规则由 handler 返回具名失败。
 */
export type UsageConstraint<
  Fields extends FieldDefinitions = FieldDefinitions,
  Input = unknown,
> =
  | CountUsageConstraint<Fields>
  | WhenUsageConstraint<Fields, Input>
  | ForbiddenCombinationUsageConstraint<Fields, Input>;

/**
 * 限制当前命令中 `fields` 所列 raw 输入字段的出现数量；字段组必须非空且无重复。
 * 规范化端点必须是有限整数，且满足 `0 <= min <= max <= fields.length`。每个 raw 自有属性只计一次，
 * 因而 `false` 也算出现，repeatable 或 variadic 字段的多个值仍只计一项；
 * 缺席的 variadic 字段没有属性，schema 默认值和转换结果也不会增加计数。
 * 缺省 `min` 为 0，缺省 `max` 为字段组长度，至少显式提供一个端点。
 * TypeScript 会拒绝静态可判定的错误；动态端点或字段成员在 CLI 定义时校验。
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
 * 条件分支只描述 raw 输入 facts 全部成立或未全部成立时的效果；空效果不增加限制，
 * 但整条规则至少需要一个非空分支。字段不会被赋值或补入默认值。
 */
export interface UsageConstraintEffect<Field extends string = string> {
  readonly require?: readonly Field[];
  readonly forbid?: readonly Field[];
}

/** 表示一个输入字段在 raw argv 解析结果中出现。 */
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

/** 从字段的 raw 标量和 schema Input 交集中推导可比较值。 */
export type UsageFactValue<
  Fields extends FieldDefinitions,
  Input,
  Field extends keyof Fields & string,
> = UsageFactInputValue<Input, Field, RawUsageFactValue<Fields[Field]>>;

/** 将字段身份关联到其可接受的 raw 等值操作数。 */
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

/** 字段出现或单值等值事实的闭合联合。 */
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

/** 所列事实同时成立时拒绝调用；`all` 保留非空顺序和重复项。 */
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
 * 平面 facts 合取选择成立或不成立分支。观察与效果都依据模式验证、默认和转换前的 raw input。
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
            ? "更换字段键，同步模式 Input 键及引用；CLI 拼写可保留"
            : "小写字母开头，仅含字母和数字";
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

type AtomicVariantDefinitionForSchema<
  Schema extends ContractSchema,
  TextEnabled extends boolean,
> = DataVariantDefinition<
  ContractSchemaInput<Schema>,
  TextEnabled,
  ContractSchemaOutput<Schema>
> &
  Readonly<{ readonly schema: Schema }>;

type VariantSchemaMap = object;

type DataVariantDefinitionsForSchemas<
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly [Variant in keyof Schemas]: Schemas[Variant] extends ContractSchema
    ? AtomicVariantDefinitionForSchema<Schemas[Variant], TextEnabled>
    : never;
}>;

type FailureVariantDefinitionsForSchemas<
  Schemas extends VariantSchemaMap,
  TextEnabled extends boolean,
> = Readonly<{
  readonly [Variant in keyof Schemas]: Schemas[Variant] extends ContractSchema
    ? AtomicVariantDefinitionForSchema<Schemas[Variant], TextEnabled>
    : never;
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
  _Dependencies = unknown,
> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: TextLines;
  readonly examples?: readonly CommandExampleDefinition[];
  readonly fields?: FieldDefinitions;
  readonly input: ContractSchema;
  readonly outputs: OutputModesDefinition<Command>;
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
        readonly outputs: OutputModesDefinition;
        readonly examples?: readonly CommandExampleDefinition[];
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
    readonly outputs: infer Outputs extends OutputModesDefinition<
      Extract<Command, string>
    >;
  }>
    ? OutputModesResult<Extract<Command, string>, Outputs>
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

export interface RootCommandGrammar<Root extends string> {
  readonly kind: "rootCommand";
  readonly id: Root;
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly outputs: OutputModesGrammar;
  readonly usage: CommandUsage<Root>;
}

export interface OutputModesGrammar {
  readonly selector: "--output";
  readonly default: string;
  readonly modes: Readonly<
    Record<
      string,
      Readonly<{
        readonly description: string;
        readonly delivery: OutputDelivery;
        readonly format: OutputFormat;
      }>
    >
  >;
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
  readonly outputs: OutputModesGrammar;
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

export interface OutputModesManifest {
  readonly default: string;
  readonly modes: Readonly<Record<string, OutputModeManifest>>;
}

export interface RootCommandManifest {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly helpSupplement?: readonly string[];
  readonly examples?: readonly CommandExampleManifest[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints?: readonly UsageConstraintGrammar[];
  readonly input: SchemaManifest;
  readonly outputs: OutputModesManifest;
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

/** 经正式解析和输入验证的示例事实；shell 为包含根命令名的 POSIX 调用行。 */
export interface CommandExampleManifest {
  readonly argv: readonly string[];
  readonly shell: string;
  readonly outputMode?: string;
}

export type { CountUsageConstraintGrammar, UsageConstraintGrammar };

export interface CliManifest<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
> {
  readonly schemaVersion: "5";
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
> = FieldDefinitions extends Fields
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

type RootCommandResult<Root extends string, Commands> =
  RootNodeFromCommands<Root, Commands> extends Readonly<{
    readonly outputs: infer Outputs;
  }>
    ? OutputModesResult<Root, Outputs>
    : never;

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

type ExecutableNodeContract<Command extends string, Node> =
  Node extends Readonly<{
    readonly kind: "command" | "rootCommand";
    readonly input: infer InputSchema extends ContractSchema;
    readonly outputs: infer Outputs;
  }>
    ? Outputs extends OutputModesDefinition<Command, InputSchema>
      ? Node extends Readonly<{
          readonly fields: infer Fields extends FieldDefinitions;
        }>
        ? Readonly<{
            readonly fields: CheckedFieldDefinitions<Fields, Command> &
              FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
              FieldIdentityContract<Command, Fields>;
          }> &
            RawFieldInputContract<Command, Fields, InputSchema> &
            CommandExamplesContract<Command, Node, Fields, InputSchema, Outputs>
        : Readonly<{ readonly fields?: never }> &
            RootFallbackRawFieldInputContract<
              Command,
              FieldDefinitions,
              InputSchema
            > &
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
        >
    : never;

type ExecutableNodesContract<Commands> = {
  [Command in keyof Commands & string]: Commands[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
  }>
    ? ExecutableNodeContract<Command, Commands[Command]>
    : unknown;
};

/* oxlint-disable typescript/no-unnecessary-type-parameters -- 公共签名的泛型参与嵌套契约约束，不能按单次出现次数机械删除。 */
export interface DefineCli<Dependencies> {
  /** 为命令组创建可执行后代，再把返回记录展开到最终命令树中统一装配。 */
  readonly command: <const Command extends string>(
    command: Command,
  ) => DefineCommand<Command, Dependencies>;

  /**
   * 为一个可执行命令定义共享输入下的具名输出方式。每种方式由独立的 atomic 或 stream
   * 契约构造器创建；输入模式也传入此处，以便处理器明确使用同一命令的验证后输入类型。
   */
  readonly outputModes: <
    const Command extends string,
    InputSchema extends ContractSchema,
    const Definition extends OutputModeSetDeclaration,
  >(
    command: Command,
    input: InputSchema,
    build: (
      mode: OutputModeFactory<Command, Dependencies, InputSchema>,
    ) => Definition &
      OutputModesTypeContract<Definition> &
      OutputModesVariantNames<Command, NoInfer<Definition>>,
  ) => OutputModesFromDeclaration<Command, InputSchema, Definition>;

  <
    const Root extends string,
    const Commands extends Readonly<Record<string, CommandNodeDefinition>>,
    const Definition extends object,
  >(
    definition: Definition &
      ClosedRootDefinition<Definition> &
      RootCliDefinitionBase<Root> &
      Readonly<{
        readonly commands: Commands &
          ClosedRootCommands<Commands> &
          ExecutableNodesContract<Commands> &
          Readonly<
            Record<
              Root,
              RootGroupDefinition | RootCommandDefinition<Root, Dependencies>
            >
          >;
      }> &
      ValidationIntersection<HierarchyUsageValidation<Commands>>,
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
        RootCommandRawInput<Root, Commands>,
        RootCommandResult<Root, Commands>,
        "rootCommand",
        never,
        RootUsageConstraintFacts<Root, Commands>
      >;
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */

/* oxlint-disable typescript/no-unnecessary-type-parameters -- 公共命令签名用泛型连接字段、模式、结果与 handler。 */
/** 为具名叶命令生成可展开到根契约 `commands` 的定义。 */
export interface DefineCommand<Command extends string, Dependencies> {
  <
    const Definition extends object & CommandDefinitionExampleContext,
    const Parent extends string,
  >(
    definition: Definition &
      ClosedCommandDefinition<Definition, Command> &
      Omit<ExecutableCommandDefinition<Command, Dependencies>, "kind"> &
      HierarchyCommandFactsDefinition<Parent> &
      ExecutableNodeContract<Command, Definition>,
  ): CommandCombination<Command, Definition, Parent>;
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
 * 显式装配全树帮助。`headings` 是可选段落标题；`wording` 按实际帮助事实
 * 提供必要模板，由 defineCli 检查完整性；核心不生成默认自然语言。
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
    throw new TypeError("帮助短别名必须是 -h");
  }
  const copiedWording =
    definition.wording === undefined
      ? undefined
      : copyHelpFactWording(definition.wording);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- helpCapability 由本工厂签发并登记到 WeakSet，类型品牌不在运行时输出。
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
    throw new TypeError("帮助标题必须是对象");
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
    if (!allowed.has(key)) throw new TypeError("帮助标题包含未知段落");
    headings[key] = copySingleLineText(heading, `帮助标题 ${key}`);
  }
  return Object.freeze(headings);
}

function copyHelpFactWording(value: unknown): Readonly<{
  readonly wording: HelpFactWording;
  readonly invalidValues: ReadonlyMap<string, unknown>;
}> {
  if (!isPlainRecord(value)) {
    throw new TypeError("帮助事实文案必须是对象");
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- versionCapability 由本工厂签发并登记到 WeakSet，类型品牌不在运行时输出。
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
 * 在根契约显式装配全树契约发现。说明文案由作者提供一次；核心负责查询事实、帮助和响应。
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
  const description = copyVersionTextLine(definition.description);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- schemaCapability 由本工厂签发并登记到 WeakSet。
  const capability = Object.freeze({
    kind: "schemaCapability" as const,
    longOption: "--schema" as const,
    description,
  }) as SchemaCapability;
  schemaCapabilities.add(capability);
  return capability;
}

function copyVersionTextLine(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    value.kind !== "line" ||
    !("value" in value)
  ) {
    throw new TypeError("版本值必须是合法单行文本");
  }
  return copySingleLineText(value.value, "版本值");
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
      throw new TypeError(`${capability} 能力包含未知属性 ${property}`);
    }
  }
}

/**
 * 定义一个闭合 CLI 契约。各可执行命令声明具名输出方式及其结果投影。
 * 动态声明仍会在定义期报告 `ContractDefinitionError`，不能以它替代静态可判定声明的类型检查。
 * @see {@link https://github.com/YKDZ/cli-contract/tree/main/packages/example | 端到端示例}
 */
export function defineCli<Dependencies = undefined>(): DefineCli<Dependencies> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 公共泛型定义接口由此运行时编译入口实现，类型参数只约束调用方。
  const define = ((definition: RuntimeCliDefinition) =>
    compileCli(definition)) as unknown as DefineCli<Dependencies>;
  Object.defineProperty(define, "command", {
    configurable: true,
    value: (command: string) => (definition: object) =>
      Object.freeze({
        [command]: Object.freeze({
          ...definition,
        }),
      }),
  });
  Object.defineProperty(define, "outputModes", {
    configurable: true,
    value: (
      command: string,
      input: ContractSchema,
      build: (mode: {
        readonly atomic: (definition: object) => object;
        readonly stream: (definition: object) => object;
      }) => OutputModeSetDeclaration,
    ) => {
      const issueMode = (definition: object, delivery: OutputDelivery) => {
        const mode = Object.freeze({ ...definition, delivery });
        outputModeDefinitions.add(mode);
        outputModeDefinitionMetadata.set(mode, { command, input });
        return mode;
      };
      const modes = build({
        atomic: (definition) => issueMode(definition, "atomic"),
        stream: (definition) => issueMode(definition, "stream"),
      });
      const modeNames = Object.keys(modes.modes);
      const hasDefault = Object.hasOwn(modes, "default");
      const outputDefinition = Object.freeze({
        ...(hasDefault
          ? { default: Reflect.get(modes, "default") }
          : modeNames.length === 1
            ? { default: modeNames[0] }
            : {}),
        modes: Object.freeze({ ...modes.modes }),
      });
      if (typeof outputDefinition === "object" && outputDefinition !== null) {
        outputModes.add(outputDefinition);
        outputModeMetadata.set(outputDefinition, { command, input });
      }
      return outputDefinition;
    },
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- issues.length 已检查为正数，动态数组在此恢复非空元组类型。
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- orderedIds 来自已验证的命令键或根键。
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 层级契约已在进入循环前检查 commandPlaceholder 必填。
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
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 非根命令组的 parent 已在层级定义检查中确认。
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

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 命令组分支已继续下一轮；其余节点按可执行定义编译。
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
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kind 为 command 时，层级定义检查已确认 parent。
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
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kind 为 command 时，层级定义检查已确认 parent。
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- issues.length 已检查为正数，动态数组在此恢复非空元组类型。
      issues as [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
    );

  const controls = compileControls(definition);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 定义检查通过后根命令已在编译循环写入映射。
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 根命令的 wire 已由同一编译循环写入映射。
    wire: isHierarchy ? wire : (wire[definition.root] as CommandWireManifest),
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 契约类型品牌由编译器签发，并登记到 compiledCliContracts。
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- issues.length 已检查为正数。
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
      // oxlint-disable-next-line unicorn/no-array-sort -- commandKeys 来自 Object.keys 且不再复用，原地排序不会影响命令对象。
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- id 来自 Object.keys(definition.commands)，此处读取同一对象。
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- child 来自同一命令对象的键集合。
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
    if (
      !outputModeDefinitions.has(mode) ||
      modeMetadata === undefined ||
      modeMetadata.command !== command ||
      modeMetadata.input !== input
    ) {
      issues.push({
        code: "invalidOutputMode",
        command,
        mode: modeName,
        reason: "invalidSuccess",
      });
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
  const hasPresenter =
    "text" in definition && typeof definition.text === "function";
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
