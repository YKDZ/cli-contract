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
import { CliWriteError } from "#/cli-write-error";
import {
  ContractExecutionError,
  type ContractExecutionIssue,
  type ExecutionSchemaTarget,
} from "#/contract-execution-error";
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
  const compiled = getCompiledCli(cliContract);
  if (!invocationBelongsTo(options.invocation, cliContract)) {
    throw new ContractExecutionError([
      {
        code: "invocationContractMismatch",
        expectedCommand: compiled.root,
        receivedCommand: options.invocation.command,
      },
    ]);
  }
  const command = compiled.commands[options.invocation.command];
  if (command === undefined) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }

  switch (options.invocation.kind) {
    case "help": {
      const fieldHelp = command.fields
        .map((field) => `${formatHelpField(field)}\t${field.description}\n`)
        .join("");
      const commandHelp = Object.values(compiled.commands)
        .filter((candidate) => candidate.parent === command.id)
        .map(
          (candidate) =>
            `${[candidate.name, ...candidate.aliases].join(", ")}\t${candidate.description}\n`,
        )
        .join("");
      const constraintHelp = command.usageConstraints
        .map((constraint) => `${formatUsageConstraint(constraint)}\n`)
        .join("");
      const supplement =
        command.helpSupplement === undefined
          ? ""
          : `${command.helpSupplement}\n`;
      const output = compiled.contract.grammar.controls.output;
      const outputHelp = [
        ...(output.selector === undefined
          ? []
          : [`${output.selector} <structured|text>`]),
        ...Object.keys(output.compatibilityFlags ?? {}),
      ]
        .map((control) => `${control}\n`)
        .join("");
      await writeCliOutput(options.write, {
        destination: "stdout",
        chunk: `${command.usage.synopsis}\n${command.description}\n${commandHelp}${fieldHelp}${constraintHelp}${compiled.contract.grammar.controls.help.longOption}\n${outputHelp}${supplement}`,
      });
      return Object.freeze({
        kind: "help",
        command: command.id as CliContractRoot<Contract>,
        exitCode: 0,
      });
    }
    case "usageFailure": {
      await writeCliOutput(options.write, {
        destination: "stderr",
        chunk: `${options.invocation.usage.synopsis}\n`,
      });
      return Object.freeze({
        kind: "usageFailure",
        command: command.id as CliContractRoot<Contract>,
        issues: options.invocation.issues,
        exitCode: compiled.usageFailureExitCode,
      });
    }
    case "parsed": {
      if (
        command.input === undefined ||
        command.success === undefined ||
        command.failures === undefined ||
        command.handler === undefined
      ) {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      const validation = validateSynchronously(
        command.input,
        options.invocation.input,
        { command: command.id, location: "input" },
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
        await writeCliOutput(options.write, {
          destination: "stderr",
          chunk: `${command.usage.synopsis}\n`,
        });
        return Object.freeze({
          kind: "usageFailure",
          command: command.id as CliContractRoot<Contract>,
          issues,
          exitCode: compiled.usageFailureExitCode,
        });
      }

      return executeApplicationResult(
        {
          ...compiled,
          root: command.id,
          description: command.description,
          fields: command.fields,
          usage: command.usage,
          input: command.input,
          success: command.success,
          failures: command.failures,
          handler: command.handler,
        },
        validation.value,
        options,
        options.invocation.outputFormat,
      );
    }
  }
}

function formatUsageConstraint(
  constraint: ReturnType<
    typeof getCompiledCli
  >["commands"][string]["usageConstraints"][number],
): string {
  if (constraint.kind === "requires")
    return `${constraint.field} requires ${constraint.requires}`;
  if (constraint.kind === "exclusive")
    return `exclusive ${constraint.fields.join(", ")}`;
  return `forbidden ${constraint.values
    .map(({ field, value }) => `${field}=${String(value)}`)
    .join(", ")}`;
}

function formatHelpField(
  field: ReturnType<typeof getCompiledCli>["fields"][number],
): string {
  const value =
    field.kind === "positional"
      ? `<${field.key}>`
      : field.kind === "variadicPositional"
        ? `<${field.key}...>`
        : field.kind === "flag"
          ? [field.longOption, field.shortAlias, field.negatedLongOption]
              .filter((spelling) => spelling !== undefined)
              .join(", ")
          : `${[field.longOption, field.shortAlias]
              .filter((spelling) => spelling !== undefined)
              .join(", ")} <value>`;
  const cardinality =
    field.kind === "repeatableOption"
      ? field.required
        ? `(${value})...`
        : `[${value}]...`
      : field.required
        ? value
        : `[${value}]`;
  return field.default === undefined
    ? cardinality
    : `${cardinality} (default: ${JSON.stringify(field.default)})`;
}

async function executeApplicationResult<Contract extends CliContract>(
  compiled: ReturnType<typeof getCompiledCli>,
  input: unknown,
  options: ExecuteCliOptions<Contract>,
  outputFormat: "structured" | "text",
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
    throwExecutionIssue({
      code: "invalidOutcomeFact",
      command: compiled.root,
    });
  }

  const projected = await projectOutcome(compiled, result, outputFormat);
  if (projected.prefix !== undefined) {
    await writeCliOutput(options.write, {
      destination: projected.destination,
      chunk: projected.prefix,
    });
  }
  const chunk =
    projected.present === undefined
      ? (projected.chunk ?? "")
      : projected.present();
  if (chunk !== "") {
    await writeCliOutput(options.write, {
      destination: projected.destination,
      chunk,
    });
  }
  return Object.freeze({
    kind: "applicationResult",
    command: compiled.root as CliContractRoot<Contract>,
    result: projected.result as CliContractResult<Contract>,
    exitCode: projected.exitCode,
  });
}

async function writeCliOutput(
  write: WriteCliOutput,
  output: CliOutput,
): Promise<void> {
  try {
    await write(output);
  } catch (cause) {
    throw new CliWriteError(output.destination, cause);
  }
}

async function projectOutcome(
  compiled: ReturnType<typeof getCompiledCli>,
  result: OutcomeFact,
  outputFormat: "structured" | "text",
): Promise<
  Readonly<{
    result: OutcomeFact;
    chunk?: string;
    prefix?: string;
    present?: () => string;
    exitCode: number;
    destination: CliOutputDestination;
  }>
> {
  if (result.kind === "failure") {
    const failure = compiled.failures[result.variant];
    if (failure === undefined) {
      throwExecutionIssue({
        code: "undeclaredOutcomeVariant",
        command: compiled.root,
        location: "failure",
        variant: result.variant,
      });
    }
    const data = projectAtomicData(failure.schema, result.data, {
      command: compiled.root,
      location: "failure",
      variant: result.variant,
    });
    const normalized = Object.freeze({
      kind: "failure" as const,
      command: compiled.root,
      variant: result.variant,
      data,
    }) as OutcomeFact;
    if (outputFormat === "text") {
      const presenter = failure.text;
      if (typeof presenter !== "function") {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      return {
        result: normalized,
        prefix: `${compiled.root} ${result.variant}\n`,
        present: () => formatTextLine(presenter(data)),
        exitCode: failure.exitCode,
        destination: "stderr",
      };
    }
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
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command: compiled.root,
        expected: "completion",
        received: result.kind,
      });
    }
    if (outputFormat === "text") {
      const presenter = compiled.success.text;
      if (typeof presenter !== "function") {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      return {
        result,
        present: () => formatCompletionText(presenter()),
        exitCode: 0,
        destination: "stdout",
      };
    }
    return {
      result,
      chunk: `${JSON.stringify(createCompletionEnvelope(compiled.root))}\n`,
      exitCode: 0,
      destination: "stdout",
    };
  }
  if (result.kind !== "data") {
    throwExecutionIssue({
      code: "outcomeKindMismatch",
      command: compiled.root,
      expected: "data",
      received: result.kind,
    });
  }

  const variant = compiled.success.variants[result.variant];
  if (variant === undefined) {
    throwExecutionIssue({
      code: "undeclaredOutcomeVariant",
      command: compiled.root,
      location: "data",
      variant: result.variant,
    });
  }
  const data = projectAtomicData(variant.schema, result.data, {
    command: compiled.root,
    location: "data",
    variant: result.variant,
  });
  const normalized = Object.freeze({
    kind: "data" as const,
    command: compiled.root,
    variant: result.variant,
    data,
  }) as OutcomeFact;
  if (outputFormat === "text") {
    const presenter = variant.text;
    if (typeof presenter !== "function") {
      throw new ContractExecutionError([{ code: "invalidCliContract" }]);
    }
    return {
      result: normalized,
      present: () => formatTextLine(presenter(data)),
      exitCode: variant.exitCode,
      destination: "stdout",
    };
  }
  return {
    result: normalized,
    chunk: `${JSON.stringify(
      createDataEnvelope(compiled.root, result.variant, data),
    )}\n`,
    exitCode: variant.exitCode,
    destination: "stdout",
  };
}

function formatCompletionText(value: unknown): string {
  if (isSilentText(value)) return "";
  return formatTextLine(value);
}

function formatTextLine(value: unknown): string {
  const text = value as Readonly<Record<string, unknown>> | null;
  if (
    text === null ||
    typeof value !== "object" ||
    text.kind !== "line" ||
    typeof text.value !== "string" ||
    text.value.length === 0 ||
    text.value.includes("\r") ||
    text.value.includes("\n") ||
    text.value.includes("\0")
  ) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return `${text.value}\n`;
}

function isSilentText(
  value: unknown,
): value is Readonly<{ readonly kind: "silent" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).kind === "silent"
  );
}

function projectAtomicData(
  schema: ContractSchema,
  value: unknown,
  target: Exclude<ExecutionSchemaTarget, { readonly location: "input" }>,
): JsonValue {
  const validation = validateSynchronously(schema, value, target);
  if (validation.issues !== undefined) {
    throwExecutionIssue({
      code: "outputSchemaRejected",
      ...target,
      expected: "schemaAccepted",
      received: "schemaRejected",
    });
  }
  try {
    return copyJsonValue(validation.value);
  } catch {
    throwExecutionIssue({
      code: "invalidJsonValue",
      ...target,
      expected: "jsonValue",
      received: "nonJsonValue",
    });
  }
}

function validateSynchronously(
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
