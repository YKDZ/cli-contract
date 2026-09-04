export type SchemaDefinitionTarget =
  | Readonly<{ readonly command: string; readonly location: "input" }>
  | Readonly<{
      readonly command: string;
      readonly location: "data" | "record";
      readonly variant: string;
    }>
  | Readonly<{
      readonly command: string;
      readonly location: "failure";
      readonly variant: string;
    }>;

export type ContractDefinitionIssue =
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "missingSchemaCapability";
        readonly capability: "standard" | "validation" | "jsonSchema";
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaDialectMismatch";
        readonly projection: "input" | "output";
        readonly received: string | null;
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaExportFailed";
        readonly projection: "input" | "output";
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "invalidSchemaProjection";
        readonly projection: "input" | "output";
      }
    >
  | Readonly<{
      readonly code: "schemaFieldSetMismatch";
      readonly command: string;
      readonly location: "input";
      readonly missingFields: readonly string[];
      readonly unexpectedFields: readonly string[];
    }>
  | Readonly<{
      readonly code: "schemaFieldDoesNotAcceptRawValue";
      readonly command: string;
      readonly location: "input";
      readonly fields: readonly Readonly<{
        readonly field: string;
        readonly expected: "boolean" | "string" | "stringArray";
      }>[];
    }>
  | Readonly<{
      readonly code: "invalidInputSchemaShape";
      readonly command: string;
      readonly location: "input";
      readonly aspect: "properties" | "required" | "type";
    }>
  | Readonly<{
      readonly code: "missingInputDefault";
      readonly command: string;
      readonly location: "input";
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "invalidOutputSchemaShape";
      readonly command: string;
      readonly location: "input";
      readonly aspect: "properties" | "required";
    }>
  | Readonly<{
      readonly code: "outputRequiredFieldMissingFromInput";
      readonly command: string;
      readonly location: "input";
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "invalidVariantName";
      readonly command: string;
      readonly location: "data" | "failure" | "record";
      readonly variant: string;
    }>
  | Readonly<{
      readonly code: "missingVariantDescription";
      readonly command: string;
      readonly location: "data" | "failure" | "record";
      readonly variant: string;
    }>
  | Readonly<{
      readonly code: "invalidVariantExitCode";
      readonly command: string;
      readonly location: "data" | "failure";
      readonly variant: string;
      readonly received: number | null;
      readonly minimum: 0 | 1;
      readonly maximum: 255;
    }>
  | Readonly<{
      readonly code: "missingStreamRecord";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCapability";
      readonly capability: "help" | "output" | "version";
    }>
  | Readonly<{
      readonly code: "invalidOutputFormat";
      readonly expected: "structured|text";
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidOutputCompatibilityFlag";
      readonly flag: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidOutputCompatibilityFlags";
      readonly received: string;
    }>
  | Readonly<{
      readonly code: "missingTextPresenter";
      readonly command: string;
      readonly location:
        | "completion"
        | "data"
        | "failure"
        | "record"
        | "streamSuccess";
      readonly variant?: string;
    }>
  | Readonly<{
      readonly code: "unexpectedTextPresenter";
      readonly command: string;
      readonly location:
        | "completion"
        | "data"
        | "failure"
        | "record"
        | "streamSuccess";
      readonly variant?: string;
    }>
  | Readonly<{
      readonly code: "invalidUsageFailureExitCode";
      readonly received: number | null;
      readonly minimum: 1;
      readonly maximum: 255;
    }>
  | Readonly<{
      readonly code: "invalidRootCommandSet";
      readonly root: string;
      readonly receivedCommands: readonly string[];
    }>
  | Readonly<{
      readonly code: "invalidRootCommandKind";
      readonly command: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidCommandIdentity";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCommandNodeKind";
      readonly command: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidCommandHandler";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCommandParent";
      readonly command: string;
      readonly parent: string | null;
    }>
  | Readonly<{
      readonly code: "invalidCommandSpelling";
      readonly command: string;
      readonly spelling: string;
    }>
  | Readonly<{
      readonly code: "rootGroupWithoutChildren";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "commandHierarchyCycle";
      readonly commands: readonly string[];
    }>
  | Readonly<{
      readonly code: "duplicateCommandSpelling";
      readonly parent: string;
      readonly spelling: string;
      readonly commands: readonly string[];
    }>
  | Readonly<{
      readonly code: "missingCommandText";
      readonly command: string;
      readonly field: "name" | "description";
    }>
  | Readonly<{
      readonly code: "invalidFieldLongOption";
      readonly command: string;
      readonly field: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidFieldIdentity";
      readonly command: string;
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "invalidFieldKind";
      readonly command: string;
      readonly field: string;
      readonly expected: readonly [
        "positional",
        "variadicPositional",
        "flag",
        "valueOption",
        "repeatableOption",
      ];
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidFieldShortAlias";
      readonly command: string;
      readonly field: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "duplicateFieldOptionSpelling";
      readonly command: string;
      readonly spelling: string;
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "duplicateInheritedFieldIdentity";
      readonly command: string;
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "duplicateInheritedOptionSpelling";
      readonly command: string;
      readonly spelling: string;
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "fieldOptionConflictsWithControl";
      readonly command: string;
      readonly field: string;
      readonly spelling: string;
      readonly control: "help" | "outputFormat" | "version";
    }>
  | Readonly<{
      readonly code: "invalidSharedOptionKind";
      readonly command: string;
      readonly field: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "requiredPositionalAfterOptional";
      readonly command: string;
      readonly field: string;
      readonly precedingOptionalField: string;
    }>
  | Readonly<{
      readonly code: "positionalAfterVariadic";
      readonly command: string;
      readonly field: string;
      readonly variadicField: string;
    }>
  | Readonly<{
      readonly code: "duplicateFieldLongOption";
      readonly command: string;
      readonly longOption: string;
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "missingFieldDescription";
      readonly command: string;
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "missingDataVariant";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidUsageConstraint";
      readonly command: string;
      readonly index: number | null;
      readonly aspect: "collection" | "entry" | "kind" | "members";
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "unknownUsageConstraintField";
      readonly command: string;
      readonly constraint: "requires" | "exclusive" | "forbiddenCombination";
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "inapplicableUsageConstraintField";
      readonly command: string;
      readonly constraint: "requires" | "exclusive" | "forbiddenCombination";
      readonly field: string;
      readonly kind: FieldKind;
    }>
  | Readonly<{
      readonly code: "invalidUsageConstraintValue";
      readonly command: string;
      readonly field: string;
      readonly expected: "boolean" | "string";
    }>
  | Readonly<{
      readonly code: "contradictoryUsageConstraint";
      readonly command: string;
      readonly constraint: "requires" | "exclusive" | "forbiddenCombination";
      readonly fields: readonly string[];
    }>;

type FieldKind =
  | "positional"
  | "variadicPositional"
  | "flag"
  | "valueOption"
  | "repeatableOption";

export class ContractDefinitionError extends Error {
  readonly issues: readonly [
    ContractDefinitionIssue,
    ...ContractDefinitionIssue[],
  ];

  constructor(
    issues: readonly [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
  ) {
    super(issues.map(formatContractDefinitionIssue).join("；"));
    this.name = "ContractDefinitionError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze(issue)),
    ) as unknown as readonly [
      ContractDefinitionIssue,
      ...ContractDefinitionIssue[],
    ];
  }
}

function formatContractDefinitionIssue(issue: ContractDefinitionIssue): string {
  switch (issue.code) {
    case "missingSchemaCapability":
      return `${formatSchemaTarget(issue)} 缺少 ${issue.capability} 能力`;
    case "schemaDialectMismatch":
      return `${formatSchemaTarget(issue)} 的 ${issue.projection} 投影不是 Draft 2020-12`;
    case "schemaExportFailed":
      return `${formatSchemaTarget(issue)} 无法导出 ${issue.projection} 投影`;
    case "invalidSchemaProjection":
      return `${formatSchemaTarget(issue)} 的 ${issue.projection} 投影不是 JSON object`;
    case "schemaFieldSetMismatch":
      return `命令 ${issue.command} 的字段与输入模式属性不一致`;
    case "schemaFieldDoesNotAcceptRawValue":
      return `命令 ${issue.command} 的输入字段 ${issue.fields.map(({ field, expected }) => `${field} 不接受 raw ${expected}`).join(", ")}`;
    case "invalidInputSchemaShape":
      return `命令 ${issue.command} 的输入模式 ${issue.aspect} 无效`;
    case "missingInputDefault":
      return `命令 ${issue.command} 的输入字段 ${issue.field} 缺少 default 注解`;
    case "invalidOutputSchemaShape":
      return `命令 ${issue.command} 的输出模式 ${issue.aspect} 无效`;
    case "outputRequiredFieldMissingFromInput":
      return `命令 ${issue.command} 的输出必填字段 ${issue.field} 不在输入模式属性中`;
    case "invalidVariantName":
      return `命令 ${issue.command} 的 ${issue.location} 变体名 ${issue.variant} 无效`;
    case "missingVariantDescription":
      return `命令 ${issue.command} 的 ${issue.location} 变体 ${issue.variant} 缺少描述`;
    case "invalidVariantExitCode":
      return `命令 ${issue.command} 的 ${issue.location} 变体 ${issue.variant} 退出码无效`;
    case "missingStreamRecord":
      return `命令 ${issue.command} 的 stream 必须声明至少一个 record`;
    case "invalidCapability":
      return `CLI 的 ${issue.capability} 能力无效`;
    case "invalidOutputFormat":
      return `CLI 输出格式应为 ${issue.expected}，实际为 ${issue.received ?? "非字符串"}`;
    case "invalidOutputCompatibilityFlag":
      return `CLI 输出兼容 flag ${issue.flag} 无效`;
    case "invalidOutputCompatibilityFlags":
      return `CLI 输出兼容 flags 必须是普通 record，实际为 ${issue.received}`;
    case "missingTextPresenter":
      return `命令 ${issue.command} 的 ${issue.location}${issue.variant === undefined ? "" : ` 变体 ${issue.variant}`} 缺少 text presenter`;
    case "unexpectedTextPresenter":
      return `命令 ${issue.command} 的 ${issue.location}${issue.variant === undefined ? "" : ` 变体 ${issue.variant}`} 不应声明 text presenter`;
    case "invalidUsageFailureExitCode":
      return "CLI 的用法失败退出码无效";
    case "invalidRootCommandSet":
      return `CLI 根 ${issue.root} 必须对应唯一根命令`;
    case "invalidRootCommandKind":
      return `命令 ${issue.command} 的 kind 无效`;
    case "invalidCommandIdentity":
      return `命令身份 ${issue.command} 无效`;
    case "invalidCommandNodeKind":
      return `命令 ${issue.command} 的节点 kind 无效`;
    case "invalidCommandHandler":
      return `不可执行命令组 ${issue.command} 不能声明 handler`;
    case "invalidCommandParent":
      return `命令 ${issue.command} 的 parent ${issue.parent ?? "缺失"} 无效`;
    case "invalidCommandSpelling":
      return `命令 ${issue.command} 的 spelling ${issue.spelling} 无效`;
    case "rootGroupWithoutChildren":
      return `根命令组 ${issue.command} 没有子命令`;
    case "commandHierarchyCycle":
      return `命令层级存在环：${issue.commands.join(", ")}`;
    case "duplicateCommandSpelling":
      return `命令 ${issue.commands.join(", ")} 在 ${issue.parent} 下重复使用 spelling ${issue.spelling}`;
    case "missingCommandText":
      return `命令 ${issue.command} 缺少 ${issue.field}`;
    case "invalidFieldLongOption":
      return `命令 ${issue.command} 的字段 ${issue.field} long option 无效`;
    case "invalidFieldIdentity":
      return `命令 ${issue.command} 的字段身份 ${issue.field} 无效`;
    case "invalidFieldKind":
      return `命令 ${issue.command} 的字段 ${issue.field} kind 无效`;
    case "invalidFieldShortAlias":
      return `命令 ${issue.command} 的字段 ${issue.field} short alias 无效`;
    case "duplicateFieldOptionSpelling":
      return `命令 ${issue.command} 的字段 ${issue.fields.join(", ")} 重复使用 option spelling ${issue.spelling}`;
    case "duplicateInheritedFieldIdentity":
      return `命令 ${issue.command} 的继承字段身份 ${issue.field} 冲突`;
    case "duplicateInheritedOptionSpelling":
      return `命令 ${issue.command} 的字段 ${issue.fields.join(", ")} 重复使用继承 option spelling ${issue.spelling}`;
    case "fieldOptionConflictsWithControl":
      return `命令 ${issue.command} 的字段 ${issue.field} 与 ${issue.control} control spelling ${issue.spelling} 冲突`;
    case "invalidSharedOptionKind":
      return `命令组 ${issue.command} 的共享字段 ${issue.field} 不是 option`;
    case "requiredPositionalAfterOptional":
      return `命令 ${issue.command} 的必填 positional ${issue.field} 位于可选 positional ${issue.precedingOptionalField} 之后`;
    case "positionalAfterVariadic":
      return `命令 ${issue.command} 的 positional ${issue.field} 位于 variadic positional ${issue.variadicField} 之后`;
    case "duplicateFieldLongOption":
      return `命令 ${issue.command} 的字段 ${issue.fields.join(", ")} 重复使用 long option ${issue.longOption}`;
    case "missingFieldDescription":
      return `命令 ${issue.command} 的字段 ${issue.field} 缺少描述`;
    case "missingDataVariant":
      return `命令 ${issue.command} 必须声明至少一个 data 变体`;
    case "invalidUsageConstraint":
      return `命令 ${issue.command} 的 usage constraint ${issue.received ?? "非字符串"} 无效`;
    case "unknownUsageConstraintField":
      return `命令 ${issue.command} 的 ${issue.constraint} usage constraint 引用了不存在字段 ${issue.field}`;
    case "inapplicableUsageConstraintField":
      return `命令 ${issue.command} 的 ${issue.constraint} usage constraint 不适用于字段 ${issue.field}（${issue.kind}）`;
    case "invalidUsageConstraintValue":
      return `命令 ${issue.command} 的 usage constraint 字段 ${issue.field} 必须使用 ${issue.expected} 离散值`;
    case "contradictoryUsageConstraint":
      return `命令 ${issue.command} 的 ${issue.constraint} usage constraint 内部矛盾：${issue.fields.join(", ")}`;
  }
}

function formatSchemaTarget(target: SchemaDefinitionTarget): string {
  return target.location === "input"
    ? `命令 ${target.command} 输入`
    : `命令 ${target.command} 的 ${target.location} 变体 ${target.variant}`;
}
