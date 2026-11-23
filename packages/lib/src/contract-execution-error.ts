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
 * A closed set of issues thrown when the core detects a broken execution
 * invariant, such as invalid output or a mismatched invocation. Values thrown
 * by consumer schemas, handlers, generators, or presenters keep their original
 * identity and are never wrapped in this class. It never becomes an application
 * failure, a normal termination, or CLI wire output; the host owns diagnostic
 * display and process state.
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
