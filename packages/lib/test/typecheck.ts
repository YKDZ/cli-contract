import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  text,
  versionCapability,
  type CliContract,
  type CliContractResult,
  type CliInvocation,
  type CanonicalLongOption,
  type CompletionRootCliDefinition,
  type CompletionRootCommandDefinition,
  type CountConstraintViolationIssue,
  type ContractSchema,
  type ContractSchemaInput,
  type ContractSchemaOutput,
  type EmptyCliInput,
  type FieldDefinition,
  type DataVariantDefinition,
  type InvalidFieldChoiceIssue,
  type OutputCapability,
  type StreamRootCommandDefinition,
  type StreamRecordDefinition,
  type ShortOptionAlias,
  type TextLines,
  type UsageIssue,
  type UsageConstraint,
  type UsageFactValue,
} from "@ykdz/cli-contract";
import * as v from "valibot";
import { z } from "zod";

const countConstraintIssue: CountConstraintViolationIssue = {
  code: "countConstraintViolation",
  min: 1,
  max: 2,
  presentFields: ["auth"],
  absentFields: ["quiet"],
};
void countConstraintIssue;

const realZodSchema = z
  .object({ name: z.string() })
  .transform(({ name }) => ({ normalizedName: name.toUpperCase() }))
  .pipe(z.object({ normalizedName: z.string() }));
const zodInput: ContractSchemaInput<typeof realZodSchema> = { name: "Ada" };
const zodOutput: ContractSchemaOutput<typeof realZodSchema> = {
  normalizedName: "ADA",
};

const realValibotSchema = toStandardJsonSchema(v.object({ name: v.string() }));
const valibotInput: ContractSchemaInput<typeof realValibotSchema> = {
  name: "Grace",
};
const valibotOutput: ContractSchemaOutput<typeof realValibotSchema> = {
  name: "Grace",
};

void zodInput;
void zodOutput;
void valibotInput;
void valibotOutput;

type ScalarRawFields = Readonly<{
  readonly value: Readonly<{
    readonly kind: "valueOption";
    readonly longOption: "--value";
    readonly description: "值";
  }>;
}>;

type CollectionRawFields = Readonly<{
  readonly value: Readonly<{
    readonly kind: "repeatableOption";
    readonly longOption: "--value";
    readonly description: "值";
  }>;
}>;

type PositiveFlagRawFields = Readonly<{
  readonly enabled: Readonly<{
    readonly kind: "flag";
    readonly longOption: "--enabled";
    readonly description: "启用";
  }>;
}>;

type NegatedFlagRawFields = Readonly<{
  readonly enabled: Readonly<{
    readonly kind: "flag";
    readonly longOption: "--enabled";
    readonly negatedLongOption: "--no-enabled";
    readonly description: "启用";
  }>;
}>;

type ScalarRawDefinition<InputSchema extends ContractSchema> =
  CompletionRootCommandDefinition<
    "rawScalar",
    undefined,
    Readonly<Record<never, never>>,
    ScalarRawFields,
    InputSchema
  >;

type CollectionRawDefinition<InputSchema extends ContractSchema> =
  CompletionRootCommandDefinition<
    "rawCollection",
    undefined,
    Readonly<Record<never, never>>,
    CollectionRawFields,
    InputSchema
  >;

type PositiveFlagRawDefinition<InputSchema extends ContractSchema> =
  CompletionRootCommandDefinition<
    "rawPositiveFlag",
    undefined,
    Readonly<Record<never, never>>,
    PositiveFlagRawFields,
    InputSchema
  >;

type NegatedFlagRawDefinition<InputSchema extends ContractSchema> =
  CompletionRootCommandDefinition<
    "rawNegatedFlag",
    undefined,
    Readonly<Record<never, never>>,
    NegatedFlagRawFields,
    InputSchema
  >;

function acceptScalarRawDefinition<InputSchema extends ContractSchema>(
  definition: ScalarRawDefinition<InputSchema>,
): void {
  void definition;
}

function acceptCollectionRawDefinition<InputSchema extends ContractSchema>(
  definition: CollectionRawDefinition<InputSchema>,
): void {
  void definition;
}

function acceptPositiveFlagRawDefinition<InputSchema extends ContractSchema>(
  definition: PositiveFlagRawDefinition<InputSchema>,
): void {
  void definition;
}

function acceptNegatedFlagRawDefinition<InputSchema extends ContractSchema>(
  definition: NegatedFlagRawDefinition<InputSchema>,
): void {
  void definition;
}

const scalarRawDefinitionBase = {
  kind: "rootCommand",
  name: "raw-scalar",
  description: "原始单值",
  fields: {
    value: {
      kind: "valueOption",
      longOption: "--value",
      description: "值",
    },
  },
  success: { kind: "completion" },
  failures: {},
  handler: () => {
    throw new Error("类型夹具不会执行");
  },
} as const;

const collectionRawDefinitionBase = {
  kind: "rootCommand",
  name: "raw-collection",
  description: "原始集合",
  fields: {
    value: {
      kind: "repeatableOption",
      longOption: "--value",
      description: "值",
    },
  },
  success: { kind: "completion" },
  failures: {},
  handler: () => {
    throw new Error("类型夹具不会执行");
  },
} as const;

const positiveFlagRawDefinitionBase = {
  kind: "rootCommand",
  name: "raw-positive-flag",
  description: "原始正 flag",
  fields: {
    enabled: {
      kind: "flag",
      longOption: "--enabled",
      description: "启用",
    },
  },
  success: { kind: "completion" },
  failures: {},
  handler: () => {
    throw new Error("类型夹具不会执行");
  },
} as const;

const negatedFlagRawDefinitionBase = {
  kind: "rootCommand",
  name: "raw-negated-flag",
  description: "原始否定 flag",
  fields: {
    enabled: {
      kind: "flag",
      longOption: "--enabled",
      negatedLongOption: "--no-enabled",
      description: "启用",
    },
  },
  success: { kind: "completion" },
  failures: {},
  handler: () => {
    throw new Error("类型夹具不会执行");
  },
} as const;

declare const literalScalarInput: ContractSchema<
  Readonly<{ readonly value: "a" | "b" }>
>;
declare const literalArrayInput: ContractSchema<
  Readonly<{ readonly value: ("a" | "b")[] }>
>;
declare const readonlyLiteralArrayInput: ContractSchema<
  Readonly<{ readonly value: readonly ("a" | "b")[] }>
>;
declare const wideNullableInput: ContractSchema<
  Readonly<{ readonly value: string | null }>
>;
declare const wideNumberUnionInput: ContractSchema<
  Readonly<{ readonly value: string | number }>
>;
declare const unknownInput: ContractSchema<
  Readonly<{ readonly value: unknown }>
>;
declare const anyInput: ContractSchema<Readonly<{ readonly value: any }>>;
declare const neverInput: ContractSchema<Readonly<{ readonly value: never }>>;
declare const numberInput: ContractSchema<Readonly<{ readonly value: number }>>;
declare const numberArrayInput: ContractSchema<
  Readonly<{ readonly value: number[] }>
>;
declare const fixedTupleInput: ContractSchema<
  Readonly<{ readonly value: ["a", "b"] }>
>;
declare const readonlyFixedTupleInput: ContractSchema<
  Readonly<{ readonly value: readonly ["a", "b"] }>
>;
declare const mixedTupleInput: ContractSchema<
  Readonly<{ readonly value: ["a", number] }>
>;
declare const emptyTupleInput: ContractSchema<Readonly<{ readonly value: [] }>>;
declare const narrowNullableInput: ContractSchema<
  Readonly<{ readonly value: "a" | null }>
>;
declare const narrowNumberUnionInput: ContractSchema<
  Readonly<{ readonly value: "a" | number }>
>;
declare const trueFlagInput: ContractSchema<
  Readonly<{ readonly enabled: true }>
>;
declare const falseFlagInput: ContractSchema<
  Readonly<{ readonly enabled: false }>
>;
declare const booleanFlagInput: ContractSchema<
  Readonly<{ readonly enabled: boolean }>
>;

acceptScalarRawDefinition<typeof literalScalarInput>({
  ...scalarRawDefinitionBase,
  input: literalScalarInput,
});
acceptCollectionRawDefinition<typeof literalArrayInput>({
  ...collectionRawDefinitionBase,
  input: literalArrayInput,
});
acceptCollectionRawDefinition<typeof readonlyLiteralArrayInput>({
  ...collectionRawDefinitionBase,
  input: readonlyLiteralArrayInput,
});
acceptScalarRawDefinition<typeof wideNullableInput>({
  ...scalarRawDefinitionBase,
  input: wideNullableInput,
});
acceptScalarRawDefinition<typeof wideNumberUnionInput>({
  ...scalarRawDefinitionBase,
  input: wideNumberUnionInput,
});
acceptScalarRawDefinition<typeof unknownInput>({
  ...scalarRawDefinitionBase,
  input: unknownInput,
});
acceptScalarRawDefinition<typeof anyInput>({
  ...scalarRawDefinitionBase,
  input: anyInput,
});
acceptScalarRawDefinition<typeof numberInput>({
  ...scalarRawDefinitionBase,
  // @ts-expect-error number 不能接受 parser 的 raw string。
  input: numberInput,
});
acceptScalarRawDefinition<typeof neverInput>({
  ...scalarRawDefinitionBase,
  // @ts-expect-error never 不能因条件类型而扩宽为 string。
  input: neverInput,
});
acceptCollectionRawDefinition<typeof numberArrayInput>({
  ...collectionRawDefinitionBase,
  // @ts-expect-error number[] 不能接受 parser 的 raw string collection。
  input: numberArrayInput,
});
acceptCollectionRawDefinition<typeof fixedTupleInput>({
  ...collectionRawDefinitionBase,
  // @ts-expect-error 固定 tuple 不能接受非空可变 raw tuple。
  input: fixedTupleInput,
});
acceptCollectionRawDefinition<typeof readonlyFixedTupleInput>({
  ...collectionRawDefinitionBase,
  // @ts-expect-error readonly 固定 tuple 不能接受非空可变 raw tuple。
  input: readonlyFixedTupleInput,
});
acceptCollectionRawDefinition<typeof mixedTupleInput>({
  ...collectionRawDefinitionBase,
  // @ts-expect-error 非字符串 tuple 槽不能被归一化。
  input: mixedTupleInput,
});
acceptCollectionRawDefinition<typeof emptyTupleInput>({
  ...collectionRawDefinitionBase,
  // @ts-expect-error 空 tuple 不能接受非空 raw tuple。
  input: emptyTupleInput,
});
acceptScalarRawDefinition<typeof literalArrayInput>({
  ...scalarRawDefinitionBase,
  // @ts-expect-error scalar 字段不能接受 array Input。
  input: literalArrayInput,
});
acceptCollectionRawDefinition<typeof literalScalarInput>({
  ...collectionRawDefinitionBase,
  // @ts-expect-error collection 字段不能接受 scalar Input。
  input: literalScalarInput,
});
acceptScalarRawDefinition<typeof narrowNullableInput>({
  ...scalarRawDefinitionBase,
  // @ts-expect-error 窄字符串与 null 的混合联合不得放宽。
  input: narrowNullableInput,
});
acceptScalarRawDefinition<typeof narrowNumberUnionInput>({
  ...scalarRawDefinitionBase,
  // @ts-expect-error 窄字符串与 number 的混合联合不得放宽。
  input: narrowNumberUnionInput,
});
acceptPositiveFlagRawDefinition<typeof trueFlagInput>({
  ...positiveFlagRawDefinitionBase,
  input: trueFlagInput,
});
acceptPositiveFlagRawDefinition<typeof falseFlagInput>({
  ...positiveFlagRawDefinitionBase,
  // @ts-expect-error 无否定 spelling 的 flag 只产生 true。
  input: falseFlagInput,
});
acceptNegatedFlagRawDefinition<typeof booleanFlagInput>({
  ...negatedFlagRawDefinitionBase,
  input: booleanFlagInput,
});

// oxlint-disable-next-line typescript/consistent-return -- 闭合问题联合的所有分支均返回，新增分支交给类型检查发现。
function exhaustivelyRecognizeUsageIssue(issue: UsageIssue): string {
  switch (issue.code) {
    case "conflictingFlag":
    case "conflictingOutputFormat":
    case "countConstraintViolation":
    case "conditionalConstraintViolation":
    case "forbiddenCombinationViolation":
    case "inputRejected":
    case "invalidOutputFormat":
    case "missingOptionValue":
    case "missingRequiredField":
    case "repeatedOption":
    case "unexpectedOptionValue":
    case "unexpectedPositional":
    case "unknownCommand":
    case "unknownOption":
      return issue.code;
    case "invalidFieldChoice":
      issue satisfies InvalidFieldChoiceIssue;
      return issue.choices.join(",");
  }
}
void exhaustivelyRecognizeUsageIssue;

declare const emptyInput: ContractSchema<EmptyCliInput>;
declare const namedInput: ContractSchema<
  Readonly<{ readonly name: string }>,
  Readonly<{ readonly normalizedName: string }>
>;
declare const greetingData: ContractSchema<
  Readonly<{ readonly message: string }>
>;

type UsageFixtureFields = Readonly<{
  readonly format: {
    readonly kind: "valueOption";
    readonly longOption: "--format";
    readonly description: "格式";
  };
  readonly quiet: {
    readonly kind: "flag";
    readonly longOption: "--quiet";
    readonly description: "静默";
  };
  readonly tags: {
    readonly kind: "repeatableOption";
    readonly longOption: "--tag";
    readonly description: "标签";
  };
}>;

type UsageFixtureInput = Readonly<{
  readonly format?: "json" | "yaml";
  readonly quiet?: boolean;
  readonly tags?: readonly string[];
}>;

const validUsageConstraint: UsageConstraint<
  UsageFixtureFields,
  UsageFixtureInput
> = {
  kind: "forbiddenCombination",
  all: [
    { kind: "equals", field: "format", value: "json" },
    { kind: "equals", field: "format", value: "json" },
    { kind: "present", field: "tags" },
    { kind: "equals", field: "quiet", value: true },
  ],
};
void validUsageConstraint;

const validStaticUsageCli = defineCli()({
  root: "validStaticFacts",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    validStaticFacts: {
      kind: "rootCommand",
      name: "valid-static-facts",
      description: "可重复的静态事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "present", field: "mode" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void validStaticUsageCli;

const validWhenCli = defineCli()({
  root: "validWhen",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    validWhen: {
      kind: "rootCommand",
      name: "valid-when",
      description: "条件事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
        cursor: {
          kind: "valueOption",
          longOption: "--cursor",
          description: "游标",
        },
      },
      input: z.object({
        mode: z.enum(["safe", "force"]).optional(),
        token: z.string().optional(),
        cursor: z.string().optional(),
      }),
      usageConstraints: [
        {
          kind: "when",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "present", field: "mode" },
          ],
          onMatch: { require: ["token", "token"], forbid: ["cursor"] },
          otherwise: { forbid: ["token", "token"] },
        },
        {
          kind: "when",
          all: [{ kind: "present", field: "token" }],
          onMatch: { require: ["token"] },
        },
        {
          kind: "when",
          all: [{ kind: "present", field: "cursor" }],
          onMatch: {},
          otherwise: { forbid: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void validWhenCli;

const dynamicRequiredEffectFields: readonly ("mode" | "token")[] = ["token"];
const dynamicForbiddenEffectFields: readonly ("mode" | "token")[] = ["mode"];
const dynamicEffectsWhenCli = defineCli()({
  root: "dynamicEffectsWhen",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    dynamicEffectsWhen: {
      kind: "rootCommand",
      name: "dynamic-effects-when",
      description: "运行期判定动态效果字段",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({
        mode: z.string().optional(),
        token: z.string().optional(),
      }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: {
            require: dynamicRequiredEffectFields,
            forbid: dynamicForbiddenEffectFields,
          },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void dynamicEffectsWhenCli;

// @ts-expect-error when.equals 使用字段对应的 raw Input 域。
const invalidWhenValueCli = defineCli()({
  root: "invalidWhenValue",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    invalidWhenValue: {
      kind: "rootCommand",
      name: "invalid-when-value",
      description: "域外条件值",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.enum(["safe", "force"]).optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "equals", field: "mode", value: "toml" }],
          onMatch: { require: ["mode"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void invalidWhenValueCli;

// @ts-expect-error 同一 when 分支不能同时 require 与 forbid 同一字段。
const invalidWhenEffectsCli = defineCli()({
  root: "invalidWhenEffects",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    invalidWhenEffects: {
      kind: "rootCommand",
      name: "invalid-when-effects",
      description: "分支效果矛盾",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: ["mode"], forbid: ["mode"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void invalidWhenEffectsCli;

// @ts-expect-error 空效果分支不构成一条有效规则。
const noEffectWhenCli = defineCli()({
  root: "noEffectWhen",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    noEffectWhen: {
      kind: "rootCommand",
      name: "no-effect-when",
      description: "空分支",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
          onMatch: { require: [] },
          otherwise: { forbid: [] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void noEffectWhenCli;

// @ts-expect-error onMatch 和 otherwise 都未声明时仍是无效果规则。
defineCli()({
  root: "missingWhenEffects",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    missingWhenEffects: {
      kind: "rootCommand",
      name: "missing-when-effects",
      description: "缺少分支效果",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "present", field: "mode" }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

const extractedWhenUnion =
  Math.random() < 0.5
    ? ({
        kind: "when",
        all: [{ kind: "present", field: "mode" }],
        onMatch: { require: ["token"], typo: true },
      } as const)
    : ({
        kind: "when",
        all: [{ kind: "present", field: "mode", typo: true }],
        otherwise: { forbid: ["token"], typo: true },
      } as const);
const invalidExtractedWhenCli = defineCli()({
  root: "invalidExtractedWhen",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    invalidExtractedWhen: {
      kind: "rootCommand",
      name: "invalid-extracted-when",
      description: "提取的条件联合",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({
        mode: z.string().optional(),
        token: z.string().optional(),
      }),
      // @ts-expect-error 提取联合中的每个 fact/effect 分支仍闭合检查未知属性。
      usageConstraints: [extractedWhenUnion],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void invalidExtractedWhenCli;

type FormatFactDomain = UsageFactValue<
  UsageFixtureFields,
  UsageFixtureInput,
  "format"
>;
const validFormatFact: FormatFactDomain = "yaml";
// @ts-expect-error 等值事实只能使用对应模式 Input 接受的值。
const invalidFormatFact: FormatFactDomain = "toml";
type PositiveFlagFactDomain = UsageFactValue<
  UsageFixtureFields,
  UsageFixtureInput,
  "quiet"
>;
const validPositiveFlagFact: PositiveFlagFactDomain = true;
// @ts-expect-error 无否定 spelling 的 flag 等值事实只能表示 true。
const invalidPositiveFlagFact: PositiveFlagFactDomain = false;
void validFormatFact;
void invalidFormatFact;
void validPositiveFlagFact;
void invalidPositiveFlagFact;

const transformedModeSchema = z.object({
  mode: z
    .string()
    .transform((value) => value.length)
    .pipe(z.number()),
});
type TransformedModeInputFact = UsageFactValue<
  Readonly<{
    readonly mode: Readonly<{
      readonly kind: "valueOption";
      readonly longOption: "--mode";
      readonly description: "模式";
    }>;
  }>,
  ContractSchemaInput<typeof transformedModeSchema>,
  "mode"
>;
const validRawModeFact: TransformedModeInputFact = "json";
// @ts-expect-error equals 使用 raw 与 schema Input 的交集，不使用 Output number。
const invalidTransformedOutputFact: TransformedModeInputFact = 3;
const transformedModeOutput: ContractSchemaOutput<
  typeof transformedModeSchema
> = {
  mode: 3,
};
void validRawModeFact;
void invalidTransformedOutputFact;
void transformedModeOutput;

const defineObservationCli = defineCli();
const replayCommand = defineObservationCli.command("replay")({
  kind: "command",
  parent: "tool",
  name: "replay",
  description: "回放",
  fields: {
    mode: {
      kind: "valueOption",
      longOption: "--mode",
      description: "模式",
    },
    token: {
      kind: "valueOption",
      longOption: "--token",
      description: "令牌",
    },
  },
  input: z.object({
    mode: z
      .enum(["live", "after"])
      .transform((value) => value.length)
      .pipe(z.number()),
    token: z.string().optional(),
  }),
  usageConstraints: [
    {
      kind: "when",
      all: [
        { kind: "equals", field: "mode", value: "after" },
        { kind: "present", field: "token" },
      ],
      onMatch: { require: ["token"] },
      otherwise: { forbid: ["token"] },
    },
  ],
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});
const inspectCommand = defineObservationCli.command("inspect")({
  kind: "command",
  parent: "tool",
  name: "inspect",
  description: "检查",
  fields: {
    mode: {
      kind: "valueOption",
      longOption: "--mode",
      description: "模式",
    },
    token: {
      kind: "valueOption",
      longOption: "--token",
      description: "令牌",
    },
  },
  input: z.object({
    mode: z.enum(["json", "yaml"]).optional(),
    token: z.string().optional(),
  }),
  usageConstraints: [
    {
      kind: "when",
      all: [{ kind: "equals", field: "mode", value: "json" }],
      onMatch: { forbid: ["token"] },
    },
  ],
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
});
const observationCli = defineObservationCli({
  root: "tool",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "工具" },
    ...replayCommand,
    ...inspectCommand,
  },
});
const replayInvocation = parseCliInvocation(observationCli, [
  "replay",
  "--mode",
  "after",
]);
if (
  replayInvocation.kind === "usageFailure" &&
  replayInvocation.command === "replay"
) {
  for (const issue of replayInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind !== "equals") continue;
    const replayExpected: "after" = condition.expected;
    // @ts-expect-error equals expected 保留原始 Input 值域，不是经 transform 的 Output number。
    const replayOutput: number = condition.expected;
    if (condition.present) {
      const rawActual: string | boolean = condition.actual;
      void rawActual;
    } else {
      // @ts-expect-error 缺席的 equals 观察不含 actual 哨兵属性。
      void condition.actual;
    }
    void replayExpected;
    void replayOutput;
  }
}
const inspectInvocation = parseCliInvocation(observationCli, [
  "inspect",
  "--mode",
  "json",
]);
if (
  inspectInvocation.kind === "usageFailure" &&
  inspectInvocation.command === "inspect"
) {
  for (const issue of inspectInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind !== "equals") continue;
    const inspectExpected: "json" = condition.expected;
    // @ts-expect-error 同名字段在另一个命令中仍保留各自 Input 域。
    const replayExpected: "after" = condition.expected;
    void inspectExpected;
    void replayExpected;
  }
}
const replayTermination = executeCli(observationCli, {
  invocation: replayInvocation,
  dependencies: undefined,
  write: () => undefined,
});
void replayTermination.then((termination) => {
  if (termination.kind !== "usageFailure" || termination.command !== "replay") {
    return;
  }
  for (const issue of termination.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const condition = issue.conditions[0];
    if (condition.kind === "equals") {
      const expectedReplay: "after" = condition.expected;
      void expectedReplay;
    }
  }
});

const rootObservationCli = defineCli()({
  root: "rootObservation",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    rootObservation: {
      kind: "rootCommand",
      name: "root-observation",
      description: "根命令观察",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        token: {
          kind: "valueOption",
          longOption: "--token",
          description: "令牌",
        },
      },
      input: z.object({
        mode: z
          .enum(["safe", "force"])
          .transform((value) => value.length)
          .pipe(z.number()),
        token: z.string().optional(),
      }),
      usageConstraints: [
        {
          kind: "when",
          all: [{ kind: "equals", field: "mode", value: "safe" }],
          onMatch: { require: ["token"] },
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
const rootObservationInvocation = parseCliInvocation(rootObservationCli, [
  "--mode",
  "safe",
]);
if (rootObservationInvocation.kind === "usageFailure") {
  const issue = rootObservationInvocation.issues[0];
  if (issue.code === "conditionalConstraintViolation") {
    const missingRootField: "token" = issue.missingRequiredFields[0]!;
    const condition = issue.conditions[0];
    if (condition.kind === "equals") {
      const expectedRootInput: "safe" = condition.expected;
      if (condition.present) {
        const rootRawActual: string | boolean = condition.actual;
        const outOfDomainActual: string | boolean = "outside";
        // @ts-expect-error expected 来自 Input，而非转换后的 Output 或域外值。
        const invalidRootExpected: "outside" = condition.expected;
        void rootRawActual;
        void outOfDomainActual;
        void invalidRootExpected;
      } else {
        // @ts-expect-error 缺席时不携带 actual 哨兵。
        void condition.actual;
      }
      void expectedRootInput;
    }
    void missingRootField;
  }
}
void executeCli(rootObservationCli, {
  invocation: rootObservationInvocation,
  dependencies: undefined,
  write: () => undefined,
}).then((termination) => {
  if (termination.kind !== "usageFailure") return;
  const issue = termination.issues[0];
  if (issue.code !== "conditionalConstraintViolation") return;
  const condition = issue.conditions[0];
  if (condition.kind === "equals") {
    const expectedRootInput: "safe" = condition.expected;
    void expectedRootInput;
  }
});

const widenedObservationCli: CliContract = observationCli;
const widenedObservationInvocation = parseCliInvocation(widenedObservationCli, [
  "replay",
]);
if (widenedObservationInvocation.kind === "usageFailure") {
  for (const issue of widenedObservationInvocation.issues) {
    if (issue.code !== "conditionalConstraintViolation") continue;
    const broadConditionalCode: "conditionalConstraintViolation" = issue.code;
    void broadConditionalCode;
  }
}
void executeCli(widenedObservationCli, {
  invocation: widenedObservationInvocation,
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

const invalidClosedFactCli = defineCli()({
  root: "closedFacts",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    closedFacts: {
      kind: "rootCommand",
      name: "closed-facts",
      description: "封闭事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.string().optional() }),
      // @ts-expect-error 未知事实成员产生稳定的局部作者诊断。
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "present", field: "mode", typo: true },
            { kind: "equals", field: "mode", value: "safe" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
void invalidClosedFactCli;

// @ts-expect-error 同字段两个互不相交的等值事实不能在静态作者期通过。
defineCli()({
  root: "staticContradiction",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    staticContradiction: {
      kind: "rootCommand",
      name: "static-contradiction",
      description: "静态矛盾事实",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
      },
      input: z.object({ mode: z.string().optional() }),
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "mode", value: "safe" },
            { kind: "equals", field: "mode", value: "force" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});

const explicitTextLines: TextLines = text.lines(["第一行", "", "最后一行"]);
void explicitTextLines;

const knownNonEmptyTextLines: readonly [string, ...string[]] = ["第一行"];
void text.lines(knownNonEmptyTextLines);

const dynamicTextLines: string[] = ["第一行"];
// @ts-expect-error 普通数组没有保留至少一行的静态事实。
text.lines(dynamicTextLines);

const shortHelp = helpCapability({ shortAlias: "-h" });
void shortHelp;

// @ts-expect-error 帮助短别名只能显式选择 -h。
helpCapability({ shortAlias: "-x" });

// @ts-expect-error 帮助事实文案只能使用闭合槽位。
helpCapability({ wording: { choices: "候选 {choices}", typo: "额外" } });
// @ts-expect-error 帮助事实文案仍必须是非函数对象。
helpCapability({ wording: () => "候选 {choices}" });

// @ts-expect-error 静态模板必须出现全部必需占位符。
helpCapability({ wording: { choices: "候选值" } });
// @ts-expect-error 静态模板不能引用未知占位符。
helpCapability({ wording: { choices: "候选 {choices} 或 {other}" } });
// @ts-expect-error 静态模板必须是单行。
helpCapability({ wording: { default: "默认值\n{value}" } });
// @ts-expect-error 等值事实模板必须同时出现字段和值。
helpCapability({ wording: { equals: "字段 {field}" } });
// @ts-expect-error 静态帮助模板不能只由空白组成。
helpCapability({ wording: { commandPlaceholder: "   " } });
// @ts-expect-error 命令组占位词本身不能再包含尖括号。
helpCapability({ wording: { commandPlaceholder: "<命令组>" } });

const validHelpFactTemplates = helpCapability({
  wording: {
    commandPlaceholder: "命令 组",
    choices: "候选 {choices}，也可写作 {choices}",
    default: "默认值 {value}，再次确认 {value}",
  },
});
void validHelpFactTemplates;

// @ts-expect-error TextLines 只能由受控构造器签发。
const forgedTextLines: TextLines = { kind: "lines", lines: ["伪造"] };
void forgedTextLines;

const cli = defineCli()({
  root: "fixture",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    fixture: {
      kind: "rootCommand",
      name: "fixture",
      description: "演示最小 CLI",
      helpSupplement: explicitTextLines,
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler({ input, dependencies, outcome }) {
        input satisfies EmptyCliInput;
        dependencies satisfies undefined;
        return outcome.completion();
      },
    },
  },
});

const invalidHelpSupplement: CompletionRootCommandDefinition<
  "invalidSupplement",
  undefined
> = {
  kind: "rootCommand",
  name: "invalid-supplement",
  description: "无效帮助补充",
  // @ts-expect-error 帮助补充只能使用受控 TextLines。
  helpSupplement: "任意文本",
  input: emptyInput,
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
};
void invalidHelpSupplement;

const dataCli = defineCli()({
  root: "greet",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    greet: {
      kind: "rootCommand",
      name: "greet",
      description: "生成问候",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "问候对象",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          greeting: {
            description: "生成的问候",
            schema: greetingData,
            exitCode: 0,
          },
        },
      },
      failures: {
        unavailable: {
          description: "服务不可用",
          schema: greetingData,
          exitCode: 9,
        },
      },
      handler({ input, outcome }) {
        input satisfies Readonly<{ readonly normalizedName: string }>;
        // @ts-expect-error data handler 不拥有 completion 构造器。
        outcome.completion();
        // @ts-expect-error 未声明的 data 变体不可构造。
        outcome.data.other({ message: "nope" });
        // @ts-expect-error data payload 必须符合对应变体模式。
        outcome.data.greeting({ message: 1 });
        // @ts-expect-error 未声明的失败变体不可构造。
        outcome.failure.other({ message: "nope" });
        // @ts-expect-error 失败 payload 必须符合对应变体模式。
        outcome.failure.unavailable({ message: 1 });
        // @ts-expect-error 不存在万能 default 失败分支。
        outcome.failure.default({ message: "nope" });
        if (input.normalizedName === "unavailable") {
          return outcome.failure.unavailable({ message: "稍后重试" });
        }
        return outcome.data.greeting({ message: input.normalizedName });
      },
    },
  },
});

const streamCli = defineCli()({
  root: "stream",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    stream: {
      kind: "rootCommand",
      name: "stream",
      description: "流 fixture",
      input: emptyInput,
      success: {
        kind: "stream",
        records: { greeting: { description: "问候", schema: greetingData } },
      },
      failures: {
        unavailable: {
          description: "服务不可用",
          schema: greetingData,
          exitCode: 9,
        },
      },
      async *handler({ outcome }) {
        yield outcome.record.greeting({ message: "hello" });
        return outcome.streamSuccess();
      },
    },
  },
});
void streamCli;

const textStreamCli = defineCli()({
  root: "textStream",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    textStream: {
      kind: "rootCommand",
      name: "text-stream",
      description: "文本流 fixture",
      input: emptyInput,
      success: {
        kind: "stream",
        text: () => text.lines(["流结束", "", "没有更多记录"]),
        records: {
          greeting: {
            description: "问候",
            schema: greetingData,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.line(data.message),
          },
        },
      },
      failures: {},
      async *handler({ outcome }) {
        yield outcome.record.greeting({ message: "hello" });
        return outcome.streamSuccess();
      },
    },
  },
});
void textStreamCli;

const hierarchyStreamDefine = defineCli();
const hierarchyStreamLeaf = hierarchyStreamDefine.command("streamLeaf")({
  kind: "command",
  parent: "workspace",
  name: "stream",
  description: "流 fixture",
  fields: {},
  input: emptyInput,
  success: {
    kind: "stream",
    text: () => text.silent,
    records: {
      greeting: {
        description: "问候",
        schema: greetingData,
        text: (data: Readonly<{ readonly message: string }>) =>
          text.line(data.message),
      },
    },
  },
  failures: {},
  async *handler({ outcome }) {
    yield* [] as Iterable<never>;
    return outcome.streamSuccess();
  },
});
const textStreamHierarchy = hierarchyStreamDefine({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured", text: true }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...hierarchyStreamLeaf,
  },
});
void textStreamHierarchy;

const defineMissingTextStreamHierarchy = defineCli();
// @ts-expect-error text 层级 stream 的终态与每个 record 都必须声明 presenter。
defineMissingTextStreamHierarchy({
  root: "missingTextStreamTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingTextStreamTree: {
      kind: "rootGroup",
      name: "missing-text-stream-tree",
      description: "缺少文本流 presenter",
    },
    ...defineMissingTextStreamHierarchy.command("list")({
      kind: "command",
      parent: "missingTextStreamTree",
      name: "list",
      description: "列出项目",
      fields: {},
      input: emptyInput,
      success: {
        kind: "stream",
        records: { greeting: { description: "问候", schema: greetingData } },
      },
      failures: {},
      async *handler({ outcome }) {
        yield* [] as Iterable<never>;
        return outcome.streamSuccess();
      },
    }),
  },
});

function verifyTypeErrors() {
  // @ts-expect-error 版本能力必须显式提供受控单行值。
  versionCapability({ value: "1.2.3" });

  const missingCompletionText: CompletionRootCommandDefinition<
    "fixture",
    undefined,
    Readonly<Record<never, never>>,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    true
  > = {
    kind: "rootCommand",
    name: "fixture",
    description: "fixture",
    input: emptyInput,
    // @ts-expect-error 启用 text 的 completion 必须同位声明 presenter。
    success: { kind: "completion" },
    failures: {},
    handler: ({ outcome }) => outcome.completion(),
  };
  void missingCompletionText;

  const incompleteStream: StreamRootCommandDefinition<
    "stream",
    undefined,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    Readonly<{
      readonly greeting: {
        readonly description: "问候";
        readonly schema: typeof greetingData;
      };
    }>,
    Readonly<Record<never, never>>
  > = {
    kind: "rootCommand",
    name: "stream",
    description: "流 fixture",
    input: emptyInput,
    success: {
      kind: "stream",
      records: { greeting: { description: "问候", schema: greetingData } },
    },
    failures: {},
    // @ts-expect-error 普通 EOF 不是 stream 成功终态。
    async *handler({ outcome }) {
      yield outcome.record.greeting({ message: "hello" });
    },
  };
  void incompleteStream;

  const missingTextStream: StreamRootCommandDefinition<
    "textStream",
    undefined,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    Readonly<{
      readonly greeting: {
        readonly description: "问候";
        readonly schema: typeof greetingData;
      };
    }>,
    Readonly<Record<never, never>>,
    true
  > = {
    kind: "rootCommand",
    name: "text-stream",
    description: "文本流 fixture",
    input: emptyInput,
    success: {
      kind: "stream",
      // @ts-expect-error 启用 text 的 stream 成功终态与每个 record 都必须同位声明 presenter。
      records: { greeting: { description: "问候", schema: greetingData } },
    },
    failures: {},
    async *handler({ outcome }) {
      yield* [] as Iterable<never>;
      return outcome.streamSuccess();
    },
  };
  void missingTextStream;

  const silentStreamRecord: StreamRecordDefinition<
    Readonly<{ readonly message: string }>,
    true
  > = {
    description: "问候",
    schema: greetingData,
    // @ts-expect-error stream record presenter 不能伪造 silent。
    text: () => text.silent,
  };
  void silentStreamRecord;

  const textLinesStreamRecord: StreamRecordDefinition<
    Readonly<{ readonly message: string }>,
    true
  > = {
    description: "问候",
    schema: greetingData,
    // @ts-expect-error stream record presenter 不能返回文本行组。
    text: () => text.lines(["一行", "二行"]),
  };
  void textLinesStreamRecord;

  // @ts-expect-error 文本行组在类型层至少包含一项。
  text.lines([]);

  const invalidStreamFacts: StreamRootCommandDefinition<
    "stream",
    undefined,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    Readonly<{
      readonly greeting: {
        readonly description: "问候";
        readonly schema: typeof greetingData;
      };
    }>,
    Readonly<{
      readonly unavailable: {
        readonly description: "不可用";
        readonly schema: typeof greetingData;
        readonly exitCode: 9;
      };
    }>
  > = {
    kind: "rootCommand",
    name: "stream",
    description: "流 fixture",
    input: emptyInput,
    success: {
      kind: "stream",
      records: { greeting: { description: "问候", schema: greetingData } },
    },
    failures: {
      unavailable: { description: "不可用", schema: greetingData, exitCode: 9 },
    },
    // @ts-expect-error stream 的 yield/return 位置分别只接受 record 与终态或 failure。
    async *handler({ outcome }) {
      yield outcome.failure.unavailable({ message: "nope" });
      return outcome.record.greeting({ message: "nope" });
    },
  };
  void invalidStreamFacts;

  // @ts-expect-error text data 变体必须同位声明 presenter。
  const missingDataText: DataVariantDefinition<
    Readonly<{ readonly message: string }>,
    true
  > = { description: "问候", schema: greetingData, exitCode: 0 };
  void missingDataText;

  const structuredData: DataVariantDefinition<
    Readonly<{ readonly message: string }>,
    false
  > = {
    description: "问候",
    schema: greetingData,
    exitCode: 0,
    // @ts-expect-error structured-only 变体不能声明 presenter。
    text: () => text.line("问候"),
  };
  void structuredData;
  const invalidUsageConstraint: UsageConstraint<
    UsageFixtureFields,
    UsageFixtureInput
  > = {
    kind: "forbiddenCombination",
    all: [
      // @ts-expect-error repeatable option 不能成为离散组合值。
      { kind: "equals", field: "tags", value: "nightly" },
      { kind: "equals", field: "quiet", value: true },
    ],
  };
  void invalidUsageConstraint;

  const countAuthoringDefinition = {
    root: "countAuthoring",
    help: helpCapability({
      wording: {
        countExactly: "{fields} 恰好出现 {count} 项",
        countAtLeast: "{fields} 至少出现 {min} 项",
        countAtMost: "{fields} 至多出现 {max} 项",
        countBetween: "{fields} 出现 {min} 到 {max} 项",
      },
    }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      countAuthoring: {
        kind: "rootCommand",
        name: "count-authoring",
        description: "数量约束",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "认证方式",
          },
          quiet: {
            kind: "flag",
            longOption: "--quiet",
            description: "静默输出",
          },
        },
        input: z.object({
          auth: z.string().optional(),
          quiet: z.boolean().optional(),
        }),
        usageConstraints: [
          { kind: "count", fields: ["auth", "quiet"], min: 0, max: 2 },
        ],
        success: { kind: "completion" },
        failures: {},
        handler: () => {
          throw new Error("类型夹具不会执行");
        },
      },
    },
  } as const;
  const countAuthoringCli = defineCli()(countAuthoringDefinition);
  void countAuthoringCli;

  const countDefinitionWith = <const Constraint extends object>(
    constraint: Constraint,
  ) => ({
    ...countAuthoringDefinition,
    commands: {
      ...countAuthoringDefinition.commands,
      countAuthoring: {
        ...countAuthoringDefinition.commands.countAuthoring,
        usageConstraints: [constraint],
      },
    },
  });
  const negativeCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    min: -1,
  });
  const fractionalCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    min: 0.5,
  });
  const reversedCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    min: 2,
    max: 1,
  });
  const excessiveCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    max: 3,
  });
  const endpointlessCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
  });
  const duplicateCountFieldsDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "auth"],
    min: 1,
  });
  const unknownCountFieldDefinition = countDefinitionWith({
    kind: "count",
    fields: ["missing"],
    min: 1,
  });
  const emptyCountFieldsDefinition = countDefinitionWith({
    kind: "count",
    fields: [],
    min: 0,
  });
  const unknownCountPropertyDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth"],
    min: 1,
    maximum: 1,
  });
  const dynamicCountFieldNames: string[] = ["auth", "quiet"];
  const dynamicCountFieldsDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFieldNames,
    min: 1,
  });
  const dynamicCountFieldPair: readonly [string, string] = ["auth", "quiet"];
  const dynamicCountFieldPairDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFieldPair,
    min: 1,
  });
  const dynamicCountFields: readonly [string, ...string[]] = ["auth", "quiet"];
  const reversedDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: 2,
    max: 1,
  });
  const negativeDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: -1,
    max: 1,
  });
  const orderedLargeDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: 1e100,
    max: 1e101,
  });
  const reversedLargeDynamicCountDefinition = countDefinitionWith({
    kind: "count",
    fields: dynamicCountFields,
    min: 1e100,
    max: 1e99,
  });
  const excessiveLargeCountDefinition = countDefinitionWith({
    kind: "count",
    fields: ["auth", "quiet"],
    max: 1e100,
  });
  // @ts-expect-error 已知负数端点在作者期拒绝。
  defineCli()(negativeCountDefinition);
  // @ts-expect-error 已知小数端点在作者期拒绝。
  defineCli()(fractionalCountDefinition);
  // @ts-expect-error 已知颠倒端点在作者期拒绝。
  defineCli()(reversedCountDefinition);
  // @ts-expect-error 最大值不能超过字段组长度。
  defineCli()(excessiveCountDefinition);
  // @ts-expect-error 数量约束至少显式提供一端。
  defineCli()(endpointlessCountDefinition);
  // @ts-expect-error 字段组不能重复同一字段。
  defineCli()(duplicateCountFieldsDefinition);
  // @ts-expect-error 数量约束只能引用本命令字段。
  defineCli()(unknownCountFieldDefinition);
  // @ts-expect-error 数量约束字段组不能为空。
  defineCli()(emptyCountFieldsDefinition);
  // @ts-expect-error 数量约束不接受未声明属性。
  defineCli()(unknownCountPropertyDefinition);
  defineCli()(dynamicCountFieldsDefinition);
  defineCli()(dynamicCountFieldPairDefinition);
  // @ts-expect-error 字段组长度动态时仍在作者期拒绝已知颠倒端点。
  defineCli()(reversedDynamicCountDefinition);
  // @ts-expect-error 字段组长度动态时仍在作者期拒绝已知负数端点。
  defineCli()(negativeDynamicCountDefinition);
  defineCli()(orderedLargeDynamicCountDefinition);
  // @ts-expect-error 大整数端点比较不能依赖按端点大小展开的递归元组。
  defineCli()(reversedLargeDynamicCountDefinition);
  // @ts-expect-error 固定字段组应将大整数报告为超出字段数量上限。
  defineCli()(excessiveLargeCountDefinition);

  const variadicValueOption: FieldDefinition = {
    // @ts-expect-error 核心不提供单次 occurrence 消费多个值的 variadic option。
    kind: "variadicOption",
    longOption: "--values",
    description: "多个值",
  };
  void variadicValueOption;

  // @ts-expect-error 应用结果只能由作用域 outcome 构造器签发。
  const rawFailure: CliContractResult<typeof dataCli> = {
    kind: "failure",
    command: "greet",
    variant: "unavailable",
    data: { message: "nope" },
  };
  void rawFailure;

  const invalidZodOutput: ContractSchemaOutput<typeof realZodSchema> = {
    // @ts-expect-error Zod 变换后的 Output 不再是 raw Input 形状。
    name: "Ada",
  };
  void invalidZodOutput;

  // @ts-expect-error canonical long option 必须是小写 kebab-case。
  const invalidLongOption: CanonicalLongOption<"--foo_bar"> = "--foo_bar";
  void invalidLongOption;

  // @ts-expect-error short alias 必须是单个 ASCII 字母或数字。
  const invalidShortAlias: ShortOptionAlias<"--f"> = "--f";
  void invalidShortAlias;

  // @ts-expect-error 命令身份必须是 lower camel case。
  const invalidCommandIdentity: CompletionRootCliDefinition<
    "bad-root",
    undefined
  > = {
    root: "bad-root",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      "bad-root": {
        kind: "rootCommand",
        name: "bad-root",
        description: "非法命令身份",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  };
  void invalidCommandIdentity;

  // @ts-expect-error 根契约必须显式装配帮助能力。
  const missingHelpDefinition: CompletionRootCliDefinition<
    "fixture",
    undefined
  > = {
    root: "fixture",
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "演示最小 CLI",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  };
  void missingHelpDefinition;

  // @ts-expect-error CLI 契约不能由普通对象字面量伪造。
  const forgedContract: CliContract = { grammar: {}, manifest: {} };
  void forgedContract;

  // @ts-expect-error CLI 调用不能由普通对象字面量伪造。
  const forgedInvocation: CliInvocation<typeof cli> = {
    kind: "parsed",
    command: "fixture",
    input: {},
    outputFormat: "structured",
  };
  void forgedInvocation;

  defineCli()({
    root: "invalidVariant",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidVariant: {
        kind: "rootCommand",
        name: "invalid-variant",
        description: "错误变体",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "问候对象",
          },
        },
        input: namedInput,
        success: {
          kind: "data",
          // @ts-expect-error data 变体身份必须是 lower camel case。
          variants: {
            "1greeting": {
              description: "错误变体",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        // @ts-expect-error failure 变体身份必须是 lower camel case。
        failures: {
          "1failure": {
            description: "错误失败",
            schema: greetingData,
            exitCode: 9,
          },
        },
        handler: ({ outcome }) =>
          outcome.data["1greeting"]({ message: "nope" }),
      },
    },
  });

  defineCli()({
    root: "mismatch",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      mismatch: {
        kind: "rootCommand",
        name: "mismatch",
        description: "错误字段",
        // @ts-expect-error 字段 key 必须与契约模式 Input 属性完全一致。
        fields: {
          other: {
            kind: "valueOption",
            longOption: "--other",
            description: "错误字段",
          },
        },
        input: namedInput,
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ outcome }) => outcome.data.greeting({ message: "nope" }),
      },
    },
  });

  defineCli()({
    root: "invalidFields",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidFields: {
        kind: "rootCommand",
        name: "invalid-fields",
        description: "非法字段声明",
        fields: {
          "bad-field": {
            // @ts-expect-error short alias 必须是单个 ASCII 字母或数字。
            kind: "valueOption",
            longOption: "--bad-field",
            shortAlias: "-bad",
            description: "非法字段",
          },
        },
        input: namedInput,
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ outcome }) => outcome.data.greeting({ message: "nope" }),
      },
    },
  });

  defineCli()({
    root: "invalidIdentity",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidIdentity: {
        kind: "rootCommand",
        name: "invalid-identity",
        description: "非法字段身份",
        // @ts-expect-error 字段身份必须是 lower camel case。
        fields: {
          "bad-field": {
            kind: "positional",
            description: "非法字段",
          },
        },
        input: z.object({ "bad-field": z.string() }),
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ outcome }) => outcome.data.greeting({ message: "nope" }),
      },
    },
  });
}

void cli;
void dataCli;

const defineTextHierarchy = defineCli();
const textHierarchy = defineTextHierarchy({
  root: "textTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    textTree: {
      kind: "rootGroup",
      name: "text-tree",
      description: "文本层级命令",
    },
    ...defineTextHierarchy.command("completeText")({
      kind: "command",
      parent: "textTree",
      name: "complete",
      description: "文本完成",
      input: emptyInput,
      success: {
        kind: "completion",
        text: () => text.lines(["完成", "", "下一步"]),
      },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
          text: () => text.lines(["不可用", "稍后重试"]),
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
    ...defineTextHierarchy.command("dataText")({
      kind: "command",
      parent: "textTree",
      name: "data",
      description: "文本数据",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "问候对象",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          greeting: {
            description: "问候",
            schema: greetingData,
            exitCode: 0,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.lines([data.message, "", "完成"]),
          },
        },
      },
      failures: {},
      handler: ({ outcome }) => outcome.data.greeting({ message: "你好" }),
    }),
  },
});
void textHierarchy;

const widenedTextOutput: OutputCapability = outputCapability({
  defaultFormat: "text",
});
const defineWidenedTextHierarchy = defineCli();
const widenedTextHierarchy = defineWidenedTextHierarchy({
  root: "widenedTextTree",
  help: helpCapability(),
  output: widenedTextOutput,
  usageFailureExitCode: 64,
  commands: {
    widenedTextTree: {
      kind: "rootGroup",
      name: "widened-text-tree",
      description: "宽化输出能力的文本层级命令",
    },
    ...defineWidenedTextHierarchy.command("widenedCompletion")({
      kind: "command",
      parent: "widenedTextTree",
      name: "complete",
      description: "文本完成",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
          text: () => text.line("不可用"),
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
    ...defineWidenedTextHierarchy.command("widenedData")({
      kind: "command",
      parent: "widenedTextTree",
      name: "data",
      description: "文本数据",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "问候对象",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          greeting: {
            description: "问候",
            schema: greetingData,
            exitCode: 0,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.line(data.message),
          },
        },
      },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
          text: () => text.line("不可用"),
        },
      },
      handler: ({ outcome }) => outcome.data.greeting({ message: "你好" }),
    }),
  },
});
void widenedTextHierarchy;

const defineInvalidTextHierarchy = defineCli();
// @ts-expect-error text hierarchy 的 completion 必须声明 presenter。
defineInvalidTextHierarchy({
  root: "missingCompletionTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingCompletionTree: {
      kind: "rootGroup",
      name: "missing-completion-tree",
      description: "缺少完成 presenter",
    },
    ...defineInvalidTextHierarchy.command("missingCompletion")({
      kind: "command",
      parent: "missingCompletionTree",
      name: "run",
      description: "运行",
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineInvalidFailureHierarchy = defineCli();
// @ts-expect-error text hierarchy 的 failure 必须声明 presenter。
defineInvalidFailureHierarchy({
  root: "missingFailureTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingFailureTree: {
      kind: "rootGroup",
      name: "missing-failure-tree",
      description: "缺少失败 presenter",
    },
    ...defineInvalidFailureHierarchy.command("missingFailure")({
      kind: "command",
      parent: "missingFailureTree",
      name: "run",
      description: "运行",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineStructuredHierarchy = defineCli();
// @ts-expect-error structured-only hierarchy 禁止声明 presenter。
defineStructuredHierarchy({
  root: "structuredTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    structuredTree: {
      kind: "rootGroup",
      name: "structured-tree",
      description: "结构化层级命令",
    },
    ...defineStructuredHierarchy.command("unexpectedText")({
      kind: "command",
      parent: "structuredTree",
      name: "run",
      description: "运行",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});
void verifyTypeErrors;
