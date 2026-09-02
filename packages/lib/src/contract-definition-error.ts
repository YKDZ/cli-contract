export type SchemaDefinitionTarget =
  | Readonly<{ readonly command: string; readonly location: "input" }>
  | Readonly<{
      readonly command: string;
      readonly location: "data";
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
      readonly code: "schemaFieldDoesNotAcceptRawString";
      readonly command: string;
      readonly location: "input";
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "invalidInputSchemaShape";
      readonly command: string;
      readonly location: "input";
      readonly aspect: "properties" | "required" | "type";
    }>
  | Readonly<{
      readonly code: "invalidVariantName";
      readonly command: string;
      readonly location: "data" | "failure";
      readonly variant: string;
    }>
  | Readonly<{
      readonly code: "missingVariantDescription";
      readonly command: string;
      readonly location: "data" | "failure";
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
      readonly code: "invalidCapability";
      readonly capability: "help" | "output";
    }>
  | Readonly<{
      readonly code: "invalidOutputFormat";
      readonly expected: "structured";
      readonly received: string | null;
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
      readonly code: "missingCommandText";
      readonly command: string;
      readonly field: "name" | "description";
    }>
  | Readonly<{
      readonly code: "invalidFieldLongOption";
      readonly command: string;
      readonly field: string;
      readonly received: string;
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
    }>;

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
    case "schemaFieldDoesNotAcceptRawString":
      return `命令 ${issue.command} 的输入字段 ${issue.fields.join(", ")} 不接受 raw string`;
    case "invalidInputSchemaShape":
      return `命令 ${issue.command} 的输入模式 ${issue.aspect} 无效`;
    case "invalidVariantName":
      return `命令 ${issue.command} 的 ${issue.location} 变体名 ${issue.variant} 无效`;
    case "missingVariantDescription":
      return `命令 ${issue.command} 的 ${issue.location} 变体 ${issue.variant} 缺少描述`;
    case "invalidVariantExitCode":
      return `命令 ${issue.command} 的 ${issue.location} 变体 ${issue.variant} 退出码无效`;
    case "invalidCapability":
      return `CLI 的 ${issue.capability} 能力无效`;
    case "invalidOutputFormat":
      return `CLI 输出格式应为 ${issue.expected}，实际为 ${issue.received ?? "非字符串"}`;
    case "invalidUsageFailureExitCode":
      return "CLI 的用法失败退出码无效";
    case "invalidRootCommandSet":
      return `CLI 根 ${issue.root} 必须对应唯一根命令`;
    case "invalidRootCommandKind":
      return `命令 ${issue.command} 的 kind 无效`;
    case "missingCommandText":
      return `命令 ${issue.command} 缺少 ${issue.field}`;
    case "invalidFieldLongOption":
      return `命令 ${issue.command} 的字段 ${issue.field} long option 无效`;
    case "duplicateFieldLongOption":
      return `命令 ${issue.command} 的字段 ${issue.fields.join(", ")} 重复使用 long option ${issue.longOption}`;
    case "missingFieldDescription":
      return `命令 ${issue.command} 的字段 ${issue.field} 缺少描述`;
    case "missingDataVariant":
      return `命令 ${issue.command} 必须声明至少一个 data 变体`;
  }
}

function formatSchemaTarget(target: SchemaDefinitionTarget): string {
  return target.location === "input"
    ? `命令 ${target.command} 输入`
    : `命令 ${target.command} 的 ${target.location} 变体 ${target.variant}`;
}
