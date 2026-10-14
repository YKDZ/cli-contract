/* oxlint-disable unicorn/no-thenable -- then 是 when 条件的公开分支名。 */
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
const helpCapabilities = new WeakSet<object>();
const invalidHelpFactWordingValues = new WeakMap<
  object,
  ReadonlyMap<string, unknown>
>();
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
    count: ["kind", "fields", "min", "max"],
    when: ["kind", "all", "then", "otherwise"],
    effect: ["require", "forbid"],
    forbiddenCombination: ["kind", "all"],
    fact: {
      present: ["kind", "field"],
      equals: ["kind", "field", "value"],
    },
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
  /** 有效的成立分支，必须包含 `{facts}` 与 `{then}`。 */
  readonly whenThen?: string;
  /** 有效的不成立分支，必须包含 `{facts}` 与 `{otherwise}`。 */
  readonly whenOtherwise?: string;
  /** 两侧均有效的条件分支，必须包含 `{facts}`、`{then}` 与 `{otherwise}`。 */
  readonly whenThenOtherwise?: string;
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
  whenThen: { placeholders: ["facts", "then"] },
  whenOtherwise: { placeholders: ["facts", "otherwise"] },
  whenThenOtherwise: { placeholders: ["facts", "then", "otherwise"] },
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
  readonly then?: UsageConstraintEffect<Extract<keyof Fields, string>>;
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
        (Constraint extends Readonly<{ readonly then?: infer Then }>
          ? Readonly<{ readonly then?: ClosedUsageEffect<Then> }>
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

type ClosedCommandDefinition<
  Definition,
  Command extends string = string,
> = RejectUnknownProperties<
  Definition,
  (typeof definitionPropertyKeys.command)[number]
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
  : InvalidFieldIdentities<Fields> extends never
    ? unknown
    : ContractTypeError<
        "invalidFieldIdentity",
        Readonly<{
          readonly command: Command;
          readonly field: InvalidFieldIdentities<Fields>;
          readonly reason: "lowerCamelCase";
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
  readonly fields?: CheckedFieldDefinitions<Fields, Command> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Command, Fields>;
  readonly input: InputSchema &
    RawFieldInputContract<Command, Fields, InputSchema>;
  readonly success: CompletionSuccessDefinition<Command, TextEnabled>;
  readonly failures: Failures &
    ClosedAtomicVariants<Failures> &
    FailureVariantNameContract<Command, Failures> &
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
  readonly fields: CheckedFieldDefinitions<Fields, Command> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Command, Fields>;
  readonly input: InputSchema &
    RawFieldInputContract<Command, Fields, InputSchema>;
  readonly success: Readonly<{
    readonly kind: "data";
    readonly variants: Variants &
      ClosedAtomicVariants<Variants> &
      DataVariantNameContract<Command, Variants>;
  }>;
  readonly failures: Failures &
    ClosedAtomicVariants<Failures> &
    FailureVariantNameContract<Command, Failures>;
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
  readonly fields?: CheckedFieldDefinitions<Fields, Command> &
    FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
    FieldIdentityContract<Command, Fields>;
  readonly input: InputSchema &
    RawFieldInputContract<Command, Fields, InputSchema>;
  readonly success: Readonly<{
    readonly kind: "stream";
    readonly records: Records &
      StreamRecordDefinitions<TextEnabled> &
      ClosedStreamRecords<Records> &
      StreamRecordNameContract<Command, Records>;
  }> &
    (TextEnabled extends true
      ? Readonly<{ readonly text: CompletionTextPresenter }>
      : TextEnabled extends false
        ? Readonly<{ readonly text?: never }>
        : Readonly<{ readonly text?: CompletionTextPresenter }>);
  readonly failures: Failures &
    ClosedAtomicVariants<Failures> &
    FailureVariantNameContract<Command, Failures>;
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
  | (Constraint extends Readonly<{ readonly then?: infer Then }>
      ? InvalidWhenEffectProperties<Command, "then", Then>
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
  Branch extends "then" | "otherwise",
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
  Branch extends "then" | "otherwise",
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
  Branch extends "then" | "otherwise",
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
      DefinitelyEmptyUsageEffect<WhenEffectForConstraint<Constraint, "then">>,
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
                    "then",
                    Constraint extends Readonly<{ readonly then?: infer Then }>
                      ? Then
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
                    "then",
                    Constraint extends Readonly<{ readonly then?: infer Then }>
                      ? Then
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
  | CountUsageConstraintGrammar
  | WhenUsageConstraint
  | ForbiddenCombinationUsageConstraint;

/** 已校验并补全默认端点的数量约束。 */
export interface CountUsageConstraintGrammar {
  readonly kind: "count";
  readonly fields: readonly [string, ...string[]];
  readonly min: number;
  readonly max: number;
}

type CountHelpFact = Readonly<{
  readonly slot:
    | "countExactly"
    | "countAtLeast"
    | "countAtMost"
    | "countBetween";
  readonly values: Readonly<Record<string, string>>;
}>;

/** 选择 count 事实实际使用的帮助模板及其占位符值。 */
export function countHelpFactForConstraint(
  constraint: CountUsageConstraintGrammar,
): CountHelpFact {
  const fields = constraint.fields.join(", ");
  if (constraint.min === constraint.max) {
    return {
      slot: "countExactly",
      values: { fields, count: String(constraint.min) },
    };
  }
  if (constraint.max === constraint.fields.length) {
    return {
      slot: "countAtLeast",
      values: { fields, min: String(constraint.min) },
    };
  }
  if (constraint.min === 0) {
    return {
      slot: "countAtMost",
      values: { fields, max: String(constraint.max) },
    };
  }
  return {
    slot: "countBetween",
    values: {
      fields,
      min: String(constraint.min),
      max: String(constraint.max),
    },
  };
}

export interface CliManifest<
  Root extends string,
  RootKind extends CliRootKind = CliRootKind,
> {
  readonly schemaVersion: "4";
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
  readonly schemaVersion: "4";
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

export type CliContractUsageFacts<Contract> =
  Contract extends Readonly<{
    readonly [cliContractType]: Readonly<{
      readonly usageFacts: infer UsageFacts;
    }>;
  }>
    ? UsageFacts
    : never;

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
      }> &
        Readonly<{
          readonly input: InputSchema &
            RootFallbackRawFieldInputContract<Command, Fields, InputSchema>;
          readonly failures: Failures &
            FailureVariantDefinitionsForSchemas<FailureSchemas, boolean> &
            FailureVariantNameContract<Command, Failures> &
            FailureVariantTextContract<Command, Failures, TextEnabled>;
        }> &
        (
          | Readonly<{
              readonly fields: CheckedFieldDefinitions<Fields, Command> &
                FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
                FieldIdentityContract<Command, Fields>;
              readonly success: Readonly<{
                readonly kind: "data";
                readonly variants: Variants &
                  DataVariantDefinitionsForSchemas<VariantSchemas, boolean> &
                  DataVariantNameContract<Command, Variants> &
                  DataVariantTextContract<Command, Variants, TextEnabled>;
              }>;
            }>
          | Readonly<{
              readonly fields?: CheckedFieldDefinitions<Fields, Command> &
                FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
                FieldIdentityContract<Command, Fields>;
              readonly success: CompletionSuccessDefinition<Root, TextEnabled>;
            }>
          | Readonly<{
              readonly fields?: CheckedFieldDefinitions<Fields, Command> &
                FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
                FieldIdentityContract<Command, Fields>;
              readonly success:
                | (Readonly<{
                    readonly kind: "stream";
                    readonly records: Records &
                      StreamRecordDefinitionsForSchemas<
                        RecordSchemas,
                        boolean
                      > &
                      StreamRecordNameContract<Command, Records>;
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
                      StreamRecordNameContract<Command, Records>;
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

type ActualFailureDefinitions<Failures> =
  Failures extends FailureVariantDefinitions ? Failures : never;

type RootFallbackFieldsProperty<
  Command extends string,
  Fields extends FieldDefinitions,
  InputSchema extends ContractSchema,
> =
  | Readonly<{
      readonly fields: CheckedFieldDefinitions<Fields, Command> &
        FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
        FieldIdentityContract<Command, Fields>;
      readonly success: Readonly<{ readonly kind: "data" | "stream" }>;
    }>
  | Readonly<{
      readonly fields?: CheckedFieldDefinitions<Fields, Command> &
        FieldDefinitionsForInput<ContractSchemaInput<InputSchema>> &
        FieldIdentityContract<Command, Fields>;
      readonly success: Readonly<{ readonly kind: "completion" }>;
    }>;

/* oxlint-disable typescript/no-unnecessary-type-parameters -- 公共命令签名用泛型连接字段、模式、结果与 handler。 */
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
      ClosedCommandDefinition<Definition, Command> &
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
      RootFallbackFieldsProperty<Command, Fields, InputSchema> &
      RootFallbackHandlerDefinition<
        Command,
        Dependencies,
        InputSchema,
        Variants extends DataVariantDefinitions ? Variants : never,
        Records extends StreamRecordDefinitions ? Records : never,
        ActualFailureDefinitions<Failures>,
        Kind
      >["commands"][Command] &
      HierarchyCommandFactsDefinition<Parent>,
  ): CommandCombination<Command, Definition, Parent>;
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */

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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- outputCapability 由本工厂签发并登记到 WeakSet，类型品牌不在运行时输出。
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
 * 最终根装配会逐个检查整棵命令树的 completion、data/failure variant、stream record 与 stream success
 * 是否满足 text 能力要求的同位 presenter；structured-only 禁止 presenter，`define.command()` 组合也在此检查。
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
    if (typeof executable.handler !== "function") {
      issues.push({ code: "invalidCommandHandler", command: id });
    }
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
    const requiredUsageTemplates = new Set<
      Extract<
        ContractDefinitionIssue,
        { readonly code: "missingHelpFactTemplate" }
      >["slot"]
    >();
    for (const constraint of usageConstraints) {
      if (constraint.kind === "count") {
        requiredUsageTemplates.add(countHelpFactForConstraint(constraint).slot);
      }
      if (constraint.kind === "when") {
        const hasThen =
          (constraint.then?.require?.length ?? 0) > 0 ||
          (constraint.then?.forbid?.length ?? 0) > 0;
        const hasOtherwise =
          (constraint.otherwise?.require?.length ?? 0) > 0 ||
          (constraint.otherwise?.forbid?.length ?? 0) > 0;
        if (hasThen && hasOtherwise) {
          requiredUsageTemplates.add("whenThenOtherwise");
        } else if (hasThen) {
          requiredUsageTemplates.add("whenThen");
        } else {
          requiredUsageTemplates.add("whenOtherwise");
        }
        for (const fact of constraint.all) {
          requiredUsageTemplates.add(fact.kind);
        }
        if (
          (constraint.then?.require?.length ?? 0) > 0 ||
          (constraint.otherwise?.require?.length ?? 0) > 0
        ) {
          requiredUsageTemplates.add("require");
        }
        if (
          (constraint.then?.forbid?.length ?? 0) > 0 ||
          (constraint.otherwise?.forbid?.length ?? 0) > 0
        ) {
          requiredUsageTemplates.add("forbid");
        }
      }
      if (constraint.kind === "forbiddenCombination") {
        requiredUsageTemplates.add("forbiddenCombination");
        for (const fact of constraint.all)
          requiredUsageTemplates.add(fact.kind);
      }
    }
    for (const slot of requiredUsageTemplates) {
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
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kind 为 command 时，层级定义检查已确认 parent。
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
    if (describedInput === undefined) continue;
    const manifestDetails = {
      description: executable.description,
      ...(helpSupplement === undefined ? {} : { helpSupplement }),
      fields,
      ...(usageConstraints.length === 0 ? {} : { usageConstraints }),
      input: projectUsageConstraints(describedInput, usageConstraints),
      success: compiledSuccess.manifest,
      failures: compiledFailures.manifest,
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
    wire[id] = deepFreeze({
      ...compiledSuccess.wire,
      ...(Object.keys(compiledFailures.wire).length === 0
        ? {}
        : { failure: compiledFailures.wire }),
    });
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
    schemaVersion: "4" as const,
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
    if (Array.isArray(node.usageConstraints)) {
      node.usageConstraints.forEach((constraint, index) => {
        const constraintPath = [...path, "usageConstraints", String(index)];
        if (!isPlainRecord(constraint)) return;
        const allowed =
          constraint.kind === "when"
            ? definitionPropertyKeys.usage.when
            : constraint.kind === "count"
              ? definitionPropertyKeys.usage.count
              : constraint.kind === "forbiddenCombination"
                ? definitionPropertyKeys.usage.forbiddenCombination
                : undefined;
        if (allowed === undefined) return;
        collectUnknownProperties(constraint, constraintPath, allowed, issues);
        if (
          (constraint.kind === "forbiddenCombination" ||
            constraint.kind === "when") &&
          Array.isArray(constraint.all)
        ) {
          constraint.all.forEach((fact, factIndex) => {
            if (!isPlainRecord(fact)) return;
            const allowedFact =
              fact.kind === "present"
                ? definitionPropertyKeys.usage.fact.present
                : fact.kind === "equals"
                  ? definitionPropertyKeys.usage.fact.equals
                  : undefined;
            if (allowedFact !== undefined) {
              collectUnknownProperties(
                fact,
                [...constraintPath, "all", String(factIndex)],
                allowedFact,
                issues,
              );
            }
          });
        }
        if (constraint.kind === "when") {
          for (const branch of ["then", "otherwise"] as const) {
            const effect = constraint[branch];
            if (!isPlainRecord(effect)) continue;
            collectUnknownProperties(
              effect,
              [...constraintPath, branch],
              definitionPropertyKeys.usage.effect,
              issues,
            );
          }
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
        (isVersionCapability(definition.version) && flag === "--version") ||
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 定义条目已通过非 null 对象检查，此处读取动态属性。
    const candidate = definition as Readonly<Record<string, unknown>>;
    if (
      candidate.kind !== "count" &&
      candidate.kind !== "when" &&
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
    if (candidate.kind === "count") {
      const compiledCount = compileCountUsageConstraint(
        candidate,
        fields,
        command,
        index,
        issues,
      );
      if (compiledCount !== undefined) compiled.push(compiledCount);
      continue;
    }
    if (candidate.kind === "when") {
      const facts = compileUsageFacts(
        candidate.all,
        "when",
        index,
        command,
        fieldsByKey,
        issues,
      );
      const then = compileUsageEffect(
        candidate.then,
        "then",
        index,
        command,
        fieldsByKey,
        issues,
      );
      const otherwise = compileUsageEffect(
        candidate.otherwise,
        "otherwise",
        index,
        command,
        fieldsByKey,
        issues,
      );
      const hasEffect = then.hasEffect || otherwise.hasEffect;
      if (then.valid && otherwise.valid && !hasEffect) {
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: "when",
          member: "effects",
          path: ["commands", command, "usageConstraints", index],
          expected: "至少一个分支包含非空 require 或 forbid 字段组",
        });
      }
      if (facts.valid && then.valid && otherwise.valid && hasEffect) {
        compiled.push(
          deepFreeze({
            kind: "when" as const,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- compileUsageFacts仅在all非空且所有事实合法时返回valid。
            all: facts.facts as [UsageFact, ...UsageFact[]],
            ...(then.effect === undefined ? {} : { then: then.effect }),
            ...(otherwise.effect === undefined
              ? {}
              : { otherwise: otherwise.effect }),
          }),
        );
      }
      continue;
    }
    if (candidate.kind === "forbiddenCombination") {
      const facts = compileUsageFacts(
        candidate.all,
        "forbiddenCombination",
        index,
        command,
        fieldsByKey,
        issues,
      );
      if (facts.valid)
        compiled.push(
          deepFreeze({
            kind: "forbiddenCombination" as const,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- compileUsageFacts仅在all非空且所有事实合法时返回valid。
            all: facts.facts as [UsageFact, ...UsageFact[]],
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
  return deepFreeze(compiled);
}

interface CompiledUsageFacts {
  readonly facts: readonly UsageFact[];
  readonly valid: boolean;
}

interface CompiledUsageEffect {
  readonly effect?: UsageConstraintEffect;
  readonly valid: boolean;
  readonly hasEffect: boolean;
}

type UsageFactForValidation =
  | UsageFact
  | Readonly<{
      readonly kind: "invalidEqualsValue";
      readonly field: string;
      readonly value: unknown;
    }>;

function compileUsageFacts(
  definitions: unknown,
  constraint: "when" | "forbiddenCombination",
  index: number,
  command: string,
  fieldsByKey: ReadonlyMap<string, FieldGrammar>,
  issues: ContractDefinitionIssue[],
): CompiledUsageFacts {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "members",
      received: constraint,
      member: "all",
      path: ["commands", command, "usageConstraints", index, "all"],
      expected: "非空字段事实数组",
    });
    return { facts: [], valid: false };
  }

  const facts: UsageFact[] = [];
  const factsForValidation: UsageFactForValidation[] = [];
  let valid = true;
  for (const [factIndex, candidateFact] of definitions.entries()) {
    const path = [
      "commands",
      command,
      "usageConstraints",
      index,
      "all",
      factIndex,
    ];
    if (!isPlainRecord(candidateFact)) {
      valid = false;
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "members",
        received: candidateFact,
        member: "all",
        path,
        expected: "present 或 equals 字段事实对象",
      });
      continue;
    }
    if (
      candidateFact.kind === "present" &&
      typeof candidateFact.field === "string"
    ) {
      const fact = { kind: "present", field: candidateFact.field } as const;
      facts.push(fact);
      factsForValidation.push(fact);
      continue;
    }
    if (
      candidateFact.kind === "equals" &&
      typeof candidateFact.field === "string" &&
      Object.hasOwn(candidateFact, "value")
    ) {
      if (
        typeof candidateFact.value === "boolean" ||
        typeof candidateFact.value === "string"
      ) {
        const fact = {
          kind: "equals",
          field: candidateFact.field,
          value: candidateFact.value,
        } as const;
        facts.push(fact);
        factsForValidation.push(fact);
      } else {
        factsForValidation.push({
          kind: "invalidEqualsValue",
          field: candidateFact.field,
          value: candidateFact.value,
        });
      }
      continue;
    }
    valid = false;
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "members",
      received: candidateFact.kind,
      member: "all",
      path,
      expected: "present{field} 或 equals{field,value}",
    });
  }

  let invalidFactCount = 0;
  for (const fact of factsForValidation) {
    if (fact.kind === "invalidEqualsValue") {
      const field = fieldsByKey.get(fact.field);
      if (field === undefined) {
        invalidFactCount += 1;
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint,
          index,
          member: "all.field",
          field: fact.field,
        });
        continue;
      }
      if (
        field.kind !== "flag" &&
        field.kind !== "valueOption" &&
        field.kind !== "positional"
      ) {
        invalidFactCount += 1;
        issues.push({
          code: "inapplicableUsageConstraintField",
          command,
          constraint,
          index,
          member: "all.field",
          field: field.key,
          kind: field.kind,
        });
        continue;
      }
      invalidFactCount += 1;
      const expected =
        field.kind === "flag"
          ? field.negatedLongOption === undefined
            ? true
            : "boolean"
          : field.choices === undefined
            ? "string"
            : Object.freeze([...field.choices]);
      issues.push({
        code: "invalidUsageConstraintValue",
        command,
        constraint,
        index,
        member: "all.value",
        field: field.key,
        actual: fact.value,
        expected,
      });
      continue;
    }

    const field = fieldsByKey.get(fact.field);
    if (field === undefined) {
      invalidFactCount += 1;
      issues.push({
        code: "unknownUsageConstraintField",
        command,
        constraint,
        index,
        member: "all.field",
        field: fact.field,
      });
      continue;
    }
    if (
      fact.kind === "equals" &&
      field.kind !== "flag" &&
      field.kind !== "valueOption" &&
      field.kind !== "positional"
    ) {
      invalidFactCount += 1;
      issues.push({
        code: "inapplicableUsageConstraintField",
        command,
        constraint,
        index,
        member: "all.field",
        field: field.key,
        kind: field.kind,
      });
      continue;
    }
    if (fact.kind !== "equals") continue;

    const expectedKind = field.kind === "flag" ? "boolean" : "string";
    const hasExpectedType =
      expectedKind === "boolean"
        ? typeof fact.value === "boolean"
        : typeof fact.value === "string";
    const onlyTrue =
      field.kind === "flag" &&
      field.negatedLongOption === undefined &&
      fact.value !== true;
    const outsideChoices =
      typeof fact.value === "string" &&
      field.choices !== undefined &&
      !field.choices.includes(fact.value);
    if (!hasExpectedType || onlyTrue || outsideChoices) {
      invalidFactCount += 1;
      issues.push({
        code: "invalidUsageConstraintValue",
        command,
        constraint,
        index,
        member: "all.value",
        field: field.key,
        actual: fact.value,
        expected:
          outsideChoices && field.choices !== undefined
            ? Object.freeze([...field.choices])
            : onlyTrue
              ? true
              : expectedKind === "boolean"
                ? "boolean"
                : "string",
      });
    }
  }

  const conflictingFields = new Set<string>();
  for (const [factIndex, fact] of facts.entries()) {
    if (fact.kind !== "equals") continue;
    if (
      facts.some(
        (other, otherIndex) =>
          otherIndex !== factIndex &&
          other.kind === "equals" &&
          other.field === fact.field &&
          other.value !== fact.value,
      )
    ) {
      conflictingFields.add(fact.field);
    }
  }
  if (conflictingFields.size > 0) {
    issues.push({
      code: "contradictoryUsageConstraint",
      command,
      constraint,
      index,
      member: "all",
      fields: Object.freeze([...conflictingFields]),
    });
  }
  valid &&=
    invalidFactCount === 0 &&
    conflictingFields.size === 0 &&
    facts.length === definitions.length;
  return { facts: deepFreeze(facts), valid };
}

function compileUsageEffect(
  definition: unknown,
  branch: "then" | "otherwise",
  index: number,
  command: string,
  fieldsByKey: ReadonlyMap<string, FieldGrammar>,
  issues: ContractDefinitionIssue[],
): CompiledUsageEffect {
  if (definition === undefined) return { valid: true, hasEffect: false };
  const path = ["commands", command, "usageConstraints", index, branch];
  if (!isPlainRecord(definition)) {
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "members",
      received: definition,
      member: branch,
      path,
      expected: "只包含 require 和 forbid 字段数组的效果对象",
    });
    return { valid: false, hasEffect: false };
  }

  let valid = true;
  let hasEffect = false;
  const compiled: { require?: string[]; forbid?: string[] } = {};
  for (const member of ["require", "forbid"] as const) {
    if (!Object.hasOwn(definition, member)) continue;
    const values = definition[member];
    if (!Array.isArray(values)) {
      valid = false;
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "members",
        received: values,
        member: `${branch}.${member}`,
        path: [...path, member],
        expected: "字段名称数组",
      });
      continue;
    }
    if (values.length > 0) hasEffect = true;
    const compiledFields: string[] = [];
    for (const [fieldIndex, field] of values.entries()) {
      if (typeof field !== "string") {
        valid = false;
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: field,
          member: `${branch}.${member}`,
          path: [...path, member, fieldIndex],
          expected: "字段名称字符串",
        });
        continue;
      }
      if (!fieldsByKey.has(field)) {
        valid = false;
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint: "when",
          index,
          member: `${branch}.${member}`,
          field,
        });
        continue;
      }
      compiledFields.push(field);
    }
    compiled[member] = compiledFields;
  }

  const forbidden = new Set(compiled.forbid ?? []);
  const conflictingFields = [...new Set(compiled.require ?? [])].filter(
    (field) => forbidden.has(field),
  );
  if (conflictingFields.length > 0) {
    valid = false;
    issues.push({
      code: "contradictoryUsageConstraint",
      command,
      constraint: "when",
      index,
      member: branch,
      fields: Object.freeze(conflictingFields),
    });
  }
  return {
    effect: deepFreeze(compiled),
    valid,
    hasEffect,
  };
}

function compileCountUsageConstraint(
  candidate: Readonly<Record<string, unknown>>,
  fields: readonly FieldGrammar[],
  command: string,
  index: number,
  issues: ContractDefinitionIssue[],
): CountUsageConstraintGrammar | undefined {
  const fieldsCandidate = candidate.fields;
  const hasFieldArray = Array.isArray(fieldsCandidate);
  const rawFieldNames: readonly unknown[] = hasFieldArray
    ? fieldsCandidate
    : [];
  let valid = true;
  if (!hasFieldArray || rawFieldNames.length === 0) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "fields",
      reason: "nonEmpty",
    });
    valid = false;
  }

  const stringFieldNames: string[] = [];
  let hasInvalidFieldName = false;
  for (const field of rawFieldNames) {
    if (typeof field === "string") {
      stringFieldNames.push(field);
    } else {
      hasInvalidFieldName = true;
    }
  }
  if (hasInvalidFieldName) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "fields",
      reason: "fieldName",
    });
    valid = false;
  }

  const fieldsByKey = new Set(fields.map(({ key }) => key));
  for (const field of stringFieldNames) {
    if (!fieldsByKey.has(field)) {
      issues.push({
        code: "unknownUsageConstraintField",
        command,
        constraint: "count",
        index,
        member: "fields",
        field,
      });
      valid = false;
    }
  }

  const duplicateFields = stringFieldNames.filter(
    (field, fieldIndex) => stringFieldNames.indexOf(field) !== fieldIndex,
  );
  if (duplicateFields.length > 0) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "fields",
      reason: "duplicateFields",
      fields: Object.freeze([...new Set(duplicateFields)]),
    });
    valid = false;
  }

  const hasMin = Object.hasOwn(candidate, "min");
  const hasMax = Object.hasOwn(candidate, "max");
  if (!hasMin && !hasMax) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "min",
      reason: "endpointRequired",
    });
    valid = false;
  }

  const min = hasMin ? candidate.min : 0;
  const fieldCount = hasFieldArray ? rawFieldNames.length : undefined;
  const normalizedMin = normalizeCountEndpoint(
    min,
    "min",
    fieldCount,
    command,
    index,
    issues,
  );
  const normalizedMax = hasMax
    ? normalizeCountEndpoint(
        candidate.max,
        "max",
        fieldCount,
        command,
        index,
        issues,
      )
    : fieldCount === undefined
      ? undefined
      : { value: fieldCount, valid: true };
  if (!normalizedMin.valid || normalizedMax?.valid === false) valid = false;
  if (
    normalizedMin.value !== undefined &&
    normalizedMax?.value !== undefined &&
    normalizedMin.value > normalizedMax.value
  ) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "min",
      reason: "ordered",
      actual: normalizedMin.value,
      maximum: normalizedMax.value,
    });
    valid = false;
  }
  if (
    !valid ||
    normalizedMin.value === undefined ||
    normalizedMax?.value === undefined
  ) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fields 已检查非空且每项都是字符串。
  const nonEmptyFields = Object.freeze([...stringFieldNames]) as [
    string,
    ...string[],
  ];
  return deepFreeze({
    kind: "count" as const,
    fields: nonEmptyFields,
    min: normalizedMin.value,
    max: normalizedMax.value,
  });
}

function normalizeCountEndpoint(
  value: unknown,
  member: "min" | "max",
  fieldCount: number | undefined,
  command: string,
  index: number,
  issues: ContractDefinitionIssue[],
): { readonly value: number | undefined; readonly valid: boolean } {
  if (typeof value !== "number") {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "integer",
    });
    return { value: undefined, valid: false };
  }
  if (value < 0) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "nonNegative",
      actual: value,
    });
    return {
      value: Number.isFinite(value) ? value : undefined,
      valid: false,
    };
  }
  if (!Number.isFinite(value)) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "finite",
      actual: value,
    });
    return { value: undefined, valid: false };
  }
  if (!Number.isInteger(value)) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "integer",
      actual: value,
    });
    return { value, valid: false };
  }
  if (fieldCount !== undefined && value > fieldCount) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "fieldCount",
      actual: value,
      maximum: fieldCount,
    });
    return { value, valid: false };
  }
  return { value, valid: true };
}

function projectUsageConstraints(
  schema: SchemaManifest,
  constraints: readonly UsageConstraintGrammar[],
): SchemaManifest {
  const projectedConstraints = constraints.filter(
    (constraint) =>
      constraint.kind !== "count" ||
      constraint.min !== 0 ||
      constraint.max !== constraint.fields.length,
  );
  if (projectedConstraints.length === 0) return schema;
  const constraintSchemas: JsonObject[] = [];
  const countDefinitions: Record<string, JsonValue> = isPlainRecord(
    schema.inputSchema.$defs,
  )
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- inputSchema 的 $defs 是已验证 JSON Schema 对象。
      { ...(schema.inputSchema.$defs as JsonObject) }
    : {};
  let countConstraintIndex = 0;
  for (const constraint of projectedConstraints) {
    if (constraint.kind === "count") {
      constraintSchemas.push(
        projectCountConstraint(
          constraint,
          countDefinitions,
          countConstraintIndex,
        ),
      );
      countConstraintIndex += 1;
      continue;
    }
    if (constraint.kind === "when") {
      const condition = {
        allOf: constraint.all.map((fact) =>
          fact.kind === "present"
            ? { required: [fact.field] }
            : {
                properties: { [fact.field]: { const: fact.value } },
                required: [fact.field],
              },
        ),
      };
      const effects: Record<string, JsonValue> = {};
      const then = constraint.then;
      if (
        then !== undefined &&
        ((then.require?.length ?? 0) > 0 || (then.forbid?.length ?? 0) > 0)
      ) {
        effects.then = usageEffectSchema(then);
      }
      const otherwise = constraint.otherwise;
      if (
        otherwise !== undefined &&
        ((otherwise.require?.length ?? 0) > 0 ||
          (otherwise.forbid?.length ?? 0) > 0)
      ) {
        effects.else = usageEffectSchema(otherwise);
      }
      constraintSchemas.push({ if: condition, ...effects });
      continue;
    }
    constraintSchemas.push({
      not: {
        allOf: constraint.all.map((fact) =>
          fact.kind === "present"
            ? { required: [fact.field] }
            : {
                properties: { [fact.field]: { const: fact.value } },
                required: [fact.field],
              },
        ),
      },
    });
  }
  return deepFreeze({
    inputSchema: {
      ...schema.inputSchema,
      ...(countConstraintIndex === 0 ? {} : { $defs: countDefinitions }),
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

function projectCountConstraint(
  constraint: CountUsageConstraintGrammar,
  definitions: Record<string, JsonValue>,
  index: number,
): JsonObject {
  const prefix = uniqueCountDefinitionPrefix(
    definitions,
    index,
    constraint.fields.length,
  );
  const fieldCount = constraint.fields.length;
  for (let position = 0; position <= fieldCount; position += 1) {
    for (let present = 0; present <= position; present += 1) {
      const definitionName = countStateDefinitionName(
        prefix,
        position,
        present,
      );
      const remaining = fieldCount - position;
      if (present > constraint.max || present + remaining < constraint.min) {
        definitions[definitionName] = { not: {} };
        continue;
      }
      if (position === fieldCount) {
        definitions[definitionName] = {};
        continue;
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- position < fieldCount，索引来自已校验的非空元组。
      const field = constraint.fields[position] as string;
      definitions[definitionName] = {
        if: { required: [field] },
        // oxlint-disable-next-line unicorn/no-thenable -- Draft 2020-12 固定关键字。
        then: {
          $ref: `#/$defs/${countStateDefinitionName(prefix, position + 1, present + 1)}`,
        },
        else: {
          $ref: `#/$defs/${countStateDefinitionName(prefix, position + 1, present)}`,
        },
      };
    }
  }
  return {
    $ref: `#/$defs/${countStateDefinitionName(prefix, 0, 0)}`,
  };
}

function uniqueCountDefinitionPrefix(
  definitions: Readonly<Record<string, JsonValue>>,
  index: number,
  fieldCount: number,
): string {
  let prefix = `__cliContract_count_${index}`;
  while (
    Array.from({ length: fieldCount + 1 }, (_, position) =>
      Array.from({ length: position + 1 }, (_unused, present) =>
        countStateDefinitionName(prefix, position, present),
      ),
    )
      .flat()
      .some((name) => Object.hasOwn(definitions, name))
  ) {
    prefix += "_";
  }
  return prefix;
}

function countStateDefinitionName(
  prefix: string,
  position: number,
  present: number,
): string {
  return `${prefix}_state_${position}_${present}`;
}

function usageEffectSchema(effect: UsageConstraintEffect): JsonObject {
  const required = effect.require ?? [];
  const forbidden = effect.forbid ?? [];
  const hasRepeatedRequiredField = new Set(required).size < required.length;
  return {
    ...(required.length === 0
      ? {}
      : hasRepeatedRequiredField
        ? { allOf: required.map((field) => ({ required: [field] })) }
        : { required: [...required] }),
    ...(forbidden.length === 0
      ? {}
      : {
          not: {
            anyOf: forbidden.map((field) => ({ required: [field] })),
          },
        }),
  };
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
  return isOutputCapability(output) && output.formats.includes("text");
}

function isOutputCapability(value: unknown): value is OutputCapability {
  return (
    typeof value === "object" && value !== null && outputCapabilities.has(value)
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
  if (isVersionCapability(definition.version)) {
    const version = definition.version;
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
