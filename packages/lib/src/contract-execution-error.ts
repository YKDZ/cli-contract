export type ExecutionSchemaTarget =
  | Readonly<{ readonly command: string; readonly location: "input" }>
  | Readonly<{
      readonly command: string;
      readonly location: "data" | "failure" | "record";
      readonly variant: string;
    }>;

export type ContractExecutionIssue =
  | Readonly<{
      readonly code: "invocationContractMismatch";
      readonly expectedCommand: string;
      readonly receivedCommand: string;
    }>
  | Readonly<{
      readonly code: "invalidOutcomeFact";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCliContract";
    }>
  | Readonly<{
      readonly code: "outcomeKindMismatch";
      readonly command: string;
      readonly expected: "completion" | "data" | "stream";
      readonly received: string;
    }>
  | Readonly<{
      readonly code: "undeclaredOutcomeVariant";
      readonly command: string;
      readonly location: "data" | "failure" | "record";
      readonly variant: string;
    }>
  | Readonly<
      ExecutionSchemaTarget & {
        readonly code: "asynchronousSchemaValidation";
        readonly expected: "synchronousStandardResult";
        readonly received: "promise";
      }
    >
  | Readonly<
      ExecutionSchemaTarget & {
        readonly code: "invalidStandardResult";
        readonly expected: "standardResult";
        readonly received:
          | "array"
          | "bigint"
          | "boolean"
          | "function"
          | "null"
          | "number"
          | "object"
          | "string"
          | "symbol"
          | "undefined";
      }
    >
  | Readonly<
      Exclude<ExecutionSchemaTarget, { readonly location: "input" }> & {
        readonly code: "outputSchemaRejected";
        readonly expected: "schemaAccepted";
        readonly received: "schemaRejected";
      }
    >
  | Readonly<
      Exclude<ExecutionSchemaTarget, { readonly location: "input" }> & {
        readonly code: "invalidJsonValue";
        readonly expected: "jsonValue";
        readonly received: "nonJsonValue";
      }
    >;

export class ContractExecutionError extends Error {
  readonly issues: readonly [
    ContractExecutionIssue,
    ...ContractExecutionIssue[],
  ];

  constructor(
    issues: readonly [ContractExecutionIssue, ...ContractExecutionIssue[]],
  ) {
    super(issues.map(formatContractExecutionIssue).join("；"));
    this.name = "ContractExecutionError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze(issue)),
    ) as unknown as readonly [
      ContractExecutionIssue,
      ...ContractExecutionIssue[],
    ];
  }
}

function formatContractExecutionIssue(issue: ContractExecutionIssue): string {
  switch (issue.code) {
    case "invocationContractMismatch":
      return `调用不属于命令 ${issue.expectedCommand} 的 CLI 契约`;
    case "invalidCliContract":
      return "CLI 契约不是由 defineCli 创建";
    case "invalidOutcomeFact":
      return `命令 ${issue.command} 的 handler 返回了未签发结果`;
    case "outcomeKindMismatch":
      return `命令 ${issue.command} 需要 ${issue.expected} 结果，却收到 ${issue.received}`;
    case "undeclaredOutcomeVariant":
      return `命令 ${issue.command} 返回了未声明的 ${issue.location} 变体 ${issue.variant}`;
    case "asynchronousSchemaValidation":
      return `${formatSchemaTarget(issue)} 的契约模式必须同步验证`;
    case "invalidStandardResult":
      return `${formatSchemaTarget(issue)} 的契约模式返回了非法 Standard Result`;
    case "outputSchemaRejected":
      return `${formatSchemaTarget(issue)} 的 payload 未通过声明模式`;
    case "invalidJsonValue":
      return `${formatSchemaTarget(issue)} 的 payload 不是 JSON 值`;
  }
}

function formatSchemaTarget(target: ExecutionSchemaTarget): string {
  return target.location === "input"
    ? `命令 ${target.command} 输入`
    : `命令 ${target.command} 的 ${target.location} 变体 ${target.variant}`;
}
