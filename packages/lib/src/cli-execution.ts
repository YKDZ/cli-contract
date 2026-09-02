import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  getCompiledCli,
  isIssuedOutcomeFact,
  type CliContract,
  type CliContractDependencies,
  type CliContractResult,
  type CliContractRoot,
  type OutcomeFact,
} from "#/cli-contract";
import {
  invocationBelongsTo,
  type CliInvocation,
  type InputRejectedIssue,
  type NonEmptyUsageIssues,
  type SchemaIssueEvidence,
} from "#/cli-invocation";
import type { ContractSchema } from "#/contract-schema";
import type { JsonValue } from "#/contract-schema";
import { copyJsonValue } from "#/json-value";
import {
  createCompletionEnvelope,
  createDataEnvelope,
  createFailureEnvelope,
} from "#/outcome-wire";

export type CliOutputDestination = "stderr" | "stdout";

export interface CliOutput {
  readonly destination: CliOutputDestination;
  readonly chunk: string;
}

export type WriteCliOutput = (output: CliOutput) => Promise<void> | void;

export type CliTermination<Contract extends CliContract = CliContract> =
  | Readonly<{
      readonly kind: "applicationResult";
      readonly command: CliContractRoot<Contract>;
      readonly result: CliContractResult<Contract>;
      readonly exitCode: number;
    }>
  | Readonly<{
      readonly kind: "help";
      readonly command: CliContractRoot<Contract>;
      readonly exitCode: 0;
    }>
  | Readonly<{
      readonly kind: "usageFailure";
      readonly command: CliContractRoot<Contract>;
      readonly issues: NonEmptyUsageIssues;
      readonly exitCode: number;
    }>;

export interface ExecuteCliOptions<Contract extends CliContract> {
  readonly invocation: CliInvocation<NoInfer<Contract>>;
  readonly dependencies: CliContractDependencies<Contract>;
  readonly write: WriteCliOutput;
}

type RuntimeHandler = (context: {
  readonly input: unknown;
  readonly dependencies: unknown;
  readonly outcome: unknown;
}) => unknown;

export async function executeCli<const Contract extends CliContract>(
  cliContract: Contract,
  options: ExecuteCliOptions<Contract>,
): Promise<CliTermination<Contract>> {
  if (!invocationBelongsTo(options.invocation, cliContract)) {
    throw new TypeError("CLI 调用来自另一个契约");
  }

  const compiled = getCompiledCli(cliContract);
  switch (options.invocation.kind) {
    case "help": {
      const fieldHelp = compiled.fields
        .map((field) => `${field.longOption} <value>\t${field.description}\n`)
        .join("");
      await options.write({
        destination: "stdout",
        chunk: `${compiled.usage.synopsis}\n${compiled.description}\n${fieldHelp}${compiled.contract.grammar.controls.help.longOption}\n`,
      });
      return Object.freeze({
        kind: "help",
        command: compiled.root as CliContractRoot<Contract>,
        exitCode: 0,
      });
    }
    case "usageFailure": {
      await options.write({
        destination: "stderr",
        chunk: `${options.invocation.usage.synopsis}\n`,
      });
      return Object.freeze({
        kind: "usageFailure",
        command: compiled.root as CliContractRoot<Contract>,
        issues: options.invocation.issues,
        exitCode: compiled.usageFailureExitCode,
      });
    }
    case "parsed": {
      const validation = validateSynchronously(
        compiled.input,
        options.invocation.input,
        "契约模式验证必须同步完成",
      );
      if (validation.issues !== undefined) {
        const issues = Object.freeze([
          Object.freeze({
            code: "inputRejected" as const,
            evidence: Object.freeze(
              validation.issues.map(normalizeSchemaIssueEvidence),
            ),
          }),
        ]) as readonly [InputRejectedIssue];
        await options.write({
          destination: "stderr",
          chunk: `${compiled.usage.synopsis}\n`,
        });
        return Object.freeze({
          kind: "usageFailure",
          command: compiled.root as CliContractRoot<Contract>,
          issues,
          exitCode: compiled.usageFailureExitCode,
        });
      }

      return executeApplicationResult(compiled, validation.value, options);
    }
  }
}

async function executeApplicationResult<Contract extends CliContract>(
  compiled: ReturnType<typeof getCompiledCli>,
  input: unknown,
  options: ExecuteCliOptions<Contract>,
): Promise<CliTermination<Contract>> {
  const issuedOutcomeFacts = new WeakSet<object>();
  const successOutcome =
    compiled.success.kind === "completion"
      ? {
          completion: () =>
            createCompletionFact(compiled.root, issuedOutcomeFacts),
        }
      : {
          data: Object.freeze(
            Object.fromEntries(
              Object.keys(compiled.success.variants).map((variant) => [
                variant,
                (payload: unknown) =>
                  createDataFact(
                    compiled.root,
                    variant,
                    payload,
                    issuedOutcomeFacts,
                  ),
              ]),
            ),
          ),
        };
  const outcome = Object.freeze({
    ...successOutcome,
    failure: Object.freeze(
      Object.fromEntries(
        Object.keys(compiled.failures).map((variant) => [
          variant,
          (payload: unknown) =>
            createFailureFact(
              compiled.root,
              variant,
              payload,
              issuedOutcomeFacts,
            ),
        ]),
      ),
    ),
  });
  const result = await (compiled.handler as RuntimeHandler)({
    input,
    dependencies: options.dependencies,
    outcome,
  });
  if (!isIssuedOutcomeFact(result, issuedOutcomeFacts)) {
    throw new TypeError("handler 返回了无效的结果事实");
  }

  const projected = await projectOutcome(compiled, result);
  await options.write({
    destination: projected.destination,
    chunk: projected.chunk,
  });
  return Object.freeze({
    kind: "applicationResult",
    command: compiled.root as CliContractRoot<Contract>,
    result: projected.result as CliContractResult<Contract>,
    exitCode: projected.exitCode,
  });
}

async function projectOutcome(
  compiled: ReturnType<typeof getCompiledCli>,
  result: OutcomeFact,
): Promise<
  Readonly<{
    result: OutcomeFact;
    chunk: string;
    exitCode: number;
    destination: CliOutputDestination;
  }>
> {
  if (result.kind === "failure") {
    const failure = compiled.failures[result.variant];
    if (failure === undefined) {
      throw new TypeError("handler 返回了未声明的 failure 变体");
    }
    const data = projectAtomicData(
      failure.schema,
      result.data,
      "failure payload 模式验证必须同步完成",
      "failure payload 没有通过声明模式",
    );
    const normalized = Object.freeze({
      kind: "failure" as const,
      command: compiled.root,
      variant: result.variant,
      data,
    }) as OutcomeFact;
    return {
      result: normalized,
      chunk: `${JSON.stringify(
        createFailureEnvelope(compiled.root, result.variant, data),
      )}\n`,
      exitCode: failure.exitCode,
      destination: "stderr",
    };
  }
  if (compiled.success.kind === "completion") {
    if (result.kind !== "completion") {
      throw new TypeError("completion 命令只能返回 completion fact");
    }
    return {
      result,
      chunk: `${JSON.stringify(createCompletionEnvelope(compiled.root))}\n`,
      exitCode: 0,
      destination: "stdout",
    };
  }
  if (result.kind !== "data") {
    throw new TypeError("data 命令只能返回 data fact");
  }

  const variant = compiled.success.variants[result.variant];
  if (variant === undefined) {
    throw new TypeError("handler 返回了未声明的 data 变体");
  }
  const data = projectAtomicData(
    variant.schema,
    result.data,
    "data payload 模式验证必须同步完成",
    "data payload 没有通过声明模式",
  );
  const normalized = Object.freeze({
    kind: "data" as const,
    command: compiled.root,
    variant: result.variant,
    data,
  }) as OutcomeFact;
  return {
    result: normalized,
    chunk: `${JSON.stringify(
      createDataEnvelope(compiled.root, result.variant, data),
    )}\n`,
    exitCode: variant.exitCode,
    destination: "stdout",
  };
}

function projectAtomicData(
  schema: ContractSchema,
  value: unknown,
  asyncErrorMessage: string,
  rejectedErrorMessage: string,
): JsonValue {
  const validation = validateSynchronously(schema, value, asyncErrorMessage);
  if (validation.issues !== undefined) {
    throw new TypeError(rejectedErrorMessage);
  }
  return copyJsonValue(validation.value);
}

function validateSynchronously(
  schema: ContractSchema,
  value: unknown,
  asyncErrorMessage: string,
): StandardSchemaV1.Result<unknown> {
  const result = schema["~standard"].validate(value);
  if (isPromise(result)) {
    throw new TypeError(asyncErrorMessage);
  }
  if (!isStandardResult(result)) {
    throw new TypeError("契约模式返回了非法 Standard Result");
  }
  return result;
}

function isStandardResult(
  value: unknown,
): value is StandardSchemaV1.Result<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as Readonly<Record<string, unknown>>;
  if (result.issues === undefined) {
    return "value" in result;
  }
  return (
    !("value" in result) &&
    Array.isArray(result.issues) &&
    result.issues.length > 0 &&
    result.issues.every(isStandardIssue)
  );
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

function normalizeSchemaIssueEvidence(
  issue: StandardSchemaV1.Issue,
): SchemaIssueEvidence {
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
