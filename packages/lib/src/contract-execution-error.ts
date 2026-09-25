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
      readonly code: "streamHandlerMustReturnAsyncGenerator";
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

/**
 * 核心检测到执行契约不变量被破坏时抛出的闭合问题集合，例如非法输出或错配调用。
 * 消费者模式、handler、generator 和呈现器自行抛出的值保持原始身份，不被包装成此类。
 * 它不进入应用失败、正常终止或 CLI 线输出；诊断展示与进程状态由宿主决定。
 */
export class ContractExecutionError extends Error {
  readonly issues: readonly [
    ContractExecutionIssue,
    ...ContractExecutionIssue[],
  ];

  constructor(
    issues: readonly [ContractExecutionIssue, ...ContractExecutionIssue[]],
  ) {
    super("contractExecutionError");
    this.name = "ContractExecutionError";
    const [first, ...rest] = issues;
    this.issues = Object.freeze([
      Object.freeze(first),
      ...rest.map((issue) => Object.freeze(issue)),
    ] as const);
  }
}
