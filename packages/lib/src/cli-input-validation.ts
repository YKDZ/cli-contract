import type { StandardSchemaV1 } from "@standard-schema/spec";

import { ContractExecutionError } from "#/contract-execution-error";
import type {
  ContractExecutionIssue,
  ExecutionSchemaTarget,
} from "#/contract-execution-error";
import type { ContractSchema } from "#/contract-schema";

export type CliInputValidation =
  | Readonly<{ readonly kind: "accepted"; readonly value: unknown }>
  | Readonly<{
      readonly kind: "rejected";
      readonly evidence: readonly Readonly<{
        readonly message: string;
        readonly path?: readonly (number | string)[];
      }>[];
    }>;

/**
 * 使用契约模式验证已解析的原始输入，不调用命令处理器。模式抛出的异常，以及格式错误或异步返回的标准模式结果，
 * 继续遵守正常 CLI 执行时相同的执行错误边界。
 */
export function validateCliInput(
  schema: ContractSchema,
  rawInput: unknown,
  command: string,
): CliInputValidation {
  const validation = validateContractSchemaSynchronously(schema, rawInput, {
    command,
    location: "input",
  });
  if (validation.issues !== undefined) {
    return Object.freeze({
      kind: "rejected",
      evidence: Object.freeze(
        validation.issues.map(normalizeSchemaIssueEvidence),
      ),
    });
  }
  return Object.freeze({ kind: "accepted", value: validation.value });
}

/** 同步验证契约模式，并保留核心缺陷对应的错误边界。 */
export function validateContractSchemaSynchronously(
  schema: ContractSchema,
  value: unknown,
  target: ExecutionSchemaTarget,
): StandardSchemaV1.Result<unknown> {
  const result = schema["~standard"].validate(value);
  if (isPromise(result)) {
    throwExecutionIssue({
      code: "asynchronousSchemaValidation",
      ...target,
      expected: "synchronousStandardResult",
      received: "promise",
    });
  }
  if (!isStandardResult(result)) {
    throwExecutionIssue({
      code: "invalidStandardResult",
      ...target,
      expected: "standardResult",
      received: describeValueKind(result),
    });
  }
  return result;
}

function describeValueKind(
  value: unknown,
): Extract<
  ContractExecutionIssue,
  { readonly code: "invalidStandardResult" }
>["received"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function throwExecutionIssue(issue: ContractExecutionIssue): never {
  throw new ContractExecutionError([issue]);
}

function isStandardResult(
  value: unknown,
): value is StandardSchemaV1.Result<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("issues" in value) || value.issues === undefined) {
    return "value" in value;
  }
  return Array.isArray(value.issues) && value.issues.every(isStandardIssue);
}

function isStandardIssue(value: unknown): value is StandardSchemaV1.Issue {
  if (
    typeof value !== "object" ||
    value === null ||
    !("message" in value) ||
    typeof value.message !== "string"
  ) {
    return false;
  }
  if (!("path" in value) || value.path === undefined) {
    return true;
  }
  return (
    Array.isArray(value.path) &&
    value.path.every((segment) => {
      const key =
        typeof segment === "object" && segment !== null && "key" in segment
          ? segment.key
          : segment;
      return (
        typeof key === "string" ||
        typeof key === "number" ||
        typeof key === "symbol"
      );
    })
  );
}

function normalizeSchemaIssueEvidence(issue: StandardSchemaV1.Issue): Readonly<{
  readonly message: string;
  readonly path?: readonly (number | string)[];
}> {
  const path = normalizeSchemaPath(issue.path);
  return Object.freeze(
    path === undefined
      ? { message: issue.message }
      : { message: issue.message, path },
  );
}

function normalizeSchemaPath(
  path: StandardSchemaV1.Issue["path"],
): readonly (number | string)[] | undefined {
  if (path === undefined) {
    return undefined;
  }
  const normalized: Array<number | string> = [];
  for (const segment of path) {
    const key =
      typeof segment === "object" && segment !== null ? segment.key : segment;
    if (
      typeof key !== "string" &&
      !(typeof key === "number" && Number.isFinite(key))
    ) {
      return undefined;
    }
    normalized.push(key);
  }
  return Object.freeze(normalized);
}

function isPromise<Value>(value: unknown): value is Promise<Value> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
