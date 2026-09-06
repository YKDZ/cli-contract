import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  createStreamRecordFact,
  createStreamSuccessFact,
  formatFieldUsage,
  getCompiledCli,
  isIssuedOutcomeFact,
  usageFailureHelpArgv,
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
import { isIssuedTextProjection } from "#/outcome-fact";
import {
  createCompletionEnvelope,
  createDataEnvelope,
  createFailureEnvelope,
  createStreamHeaderEnvelope,
  createStreamRecordEnvelope,
  createStreamSuccessEnvelope,
  createUsageFailureEnvelope,
} from "#/outcome-wire";

export type CliOutputDestination = "stderr" | "stdout";

/** 核心已完成投影和通道路由的非空文本 chunk；宿主写入时不再改写格式或目的通道。 */
export interface CliOutput {
  readonly destination: CliOutputDestination;
  readonly chunk: string;
}

/**
 * 宿主提供的异步输出接缝；异步写入必须返回代表完成的 Promise。
 * 核心等待每次写入后才继续写出或拉取下一条流记录，保留跨通道顺序与背压。
 * 抛出或拒绝会以保留原始 cause 和目的通道的 CliWriteError 拒绝执行，不自动重试。
 */
export type WriteCliOutput = (output: CliOutput) => Promise<void> | void;

/**
 * 正常控制流完成全部可控写入后的程序化结果；宿主仍须落实真实进程退出状态。
 * 流结果只保留终态，不累计已写记录。程序缺陷与写入错误使执行拒绝，不进入此联合。
 */
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
      readonly kind: "version";
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

type RuntimeStreamGenerator = AsyncGenerator<unknown, unknown, void>;

/**
 * 执行同一契约签发的调用：验证 raw input，将模式的验证结果和宿主依赖交给 handler，
 * 再验证、投影结果并顺序等待宿主写入。帮助、版本和用法失败不执行业务 handler。
 *
 * 宿主负责参数来源、依赖构造、输出端口和真实进程退出；应 await 本函数，
 * 等可控写入完成后再使用终止结果的 exitCode，不能提前结束进程。
 *
 * 消费者模式、handler、generator 或呈现器抛出的值保留原始身份；核心检测的契约违反
 * 使用 ContractExecutionError，输出端口失败使用 CliWriteError。执行拒绝时不自动写诊断，
 * 活动流会执行必要清理，已经写出的合法前缀不会撤回，也不会追加伪造的成功终态。
 */
// oxlint-disable-next-line typescript/consistent-return
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
      await writeCliOutput(options.write, {
        destination: "stdout",
        chunk: createHelpText(compiled, command),
      });
      return Object.freeze({
        kind: "help",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        command: command.id as CliContractRoot<Contract>,
        exitCode: 0,
      });
    }
    case "version": {
      const version = compiled.contract.grammar.controls.version;
      if (version === undefined) {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      await writeCliOutput(options.write, {
        destination: "stdout",
        chunk: `${version.value}\n`,
      });
      return Object.freeze({
        kind: "version",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        command: command.id as CliContractRoot<Contract>,
        exitCode: 0,
      });
    }
    case "usageFailure": {
      await writeUsageFailure(compiled, options.write, {
        command: command.id,
        issues: options.invocation.issues,
        usage: options.invocation.usage.synopsis,
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const issues = Object.freeze([
          Object.freeze({
            code: "inputRejected" as const,
            evidence: Object.freeze(
              validation.issues.map(normalizeSchemaIssueEvidence),
            ),
          }),
        ]) as readonly [InputRejectedIssue];
        await writeUsageFailure(compiled, options.write, {
          command: command.id,
          issues,
          usage: command.usage.synopsis,
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

function createHelpText(
  compiled: ReturnType<typeof getCompiledCli>,
  command: ReturnType<typeof getCompiledCli>["commands"][string],
): string {
  const headings = compiled.contract.grammar.controls.help.headings;
  const segments = [command.description];
  const commands = Object.values(compiled.commands).filter(
    (candidate) => candidate.parent === command.id,
  );
  const positionalFields = command.fields.filter(
    (field) =>
      field.kind === "positional" || field.kind === "variadicPositional",
  );
  const optionFields = command.fields.filter(
    (field) =>
      field.kind !== "positional" && field.kind !== "variadicPositional",
  );
  const options = [
    ...optionFields.map(formatHelpField),
    ...formatCoreControls(compiled),
  ];

  appendHelpSegment(segments, headings?.usage, [
    helpLine(command.usage.synopsis),
  ]);
  appendHelpSegment(
    segments,
    headings?.commands,
    commands.map((candidate) =>
      helpDetail(
        `${[candidate.name, ...candidate.aliases].join(", ")}${isCommandGroup(candidate) ? " <command>" : ""}`,
        candidate.description,
      ),
    ),
  );
  appendHelpSegment(
    segments,
    headings?.arguments,
    positionalFields.map(formatHelpField),
  );
  appendHelpSegment(segments, headings?.options, options);
  appendHelpSegment(
    segments,
    headings?.constraints,
    command.usageConstraints.map((constraint) =>
      helpLine(formatUsageConstraint(constraint)),
    ),
  );
  appendHelpSegment(
    segments,
    headings?.supplement,
    command.helpSupplement === undefined
      ? []
      : [{ kind: "lines" as const, lines: command.helpSupplement }],
  );
  return `${segments.join("\n\n")}\n`;
}

function isCommandGroup(
  command: ReturnType<typeof getCompiledCli>["commands"][string],
): boolean {
  return command.kind === "rootGroup" || command.kind === "commandGroup";
}

type HelpEntry =
  | Readonly<{
      readonly kind: "detail";
      readonly summary: string;
      readonly detail: string;
    }>
  | Readonly<{ readonly kind: "line"; readonly value: string }>
  | Readonly<{ readonly kind: "lines"; readonly lines: readonly string[] }>;

function helpLine(value: string): HelpEntry {
  return { kind: "line", value };
}

function helpDetail(summary: string, detail: string): HelpEntry {
  return { kind: "detail", summary, detail };
}

function appendHelpSegment(
  segments: string[],
  heading: string | undefined,
  entries: readonly HelpEntry[],
): void {
  if (entries.length === 0) return;
  const lines = heading === undefined ? [] : [heading];
  for (const entry of entries) {
    if (entry.kind === "line") lines.push(`  ${entry.value}`);
    else if (entry.kind === "detail")
      lines.push(`  ${entry.summary}`, `    ${entry.detail}`);
    else
      lines.push(
        ...entry.lines.map((line) => (line === "" ? "" : `  ${line}`)),
      );
  }
  segments.push(lines.join("\n"));
}

function formatCoreControls(
  compiled: ReturnType<typeof getCompiledCli>,
): readonly HelpEntry[] {
  const help = compiled.contract.grammar.controls.help;
  const version = compiled.contract.grammar.controls.version;
  const output = compiled.contract.grammar.controls.output;
  const versionEntry: HelpEntry | undefined =
    version === undefined
      ? undefined
      : version.description === undefined
        ? helpLine(
            [version.longOption, version.shortAlias]
              .filter((spelling) => spelling !== undefined)
              .join(", "),
          )
        : helpDetail(
            [version.longOption, version.shortAlias]
              .filter((spelling) => spelling !== undefined)
              .join(", "),
            version.description,
          );
  return [
    helpLine(
      [help.longOption, help.shortAlias]
        .filter((spelling) => spelling !== undefined)
        .join(", "),
    ),
    ...(versionEntry === undefined ? [] : [versionEntry]),
    ...(output.selector === undefined
      ? []
      : [
          helpLine(
            `${output.selector} <${output.formats.join("|")}> (choices: ${output.formats.map((format) => JSON.stringify(format)).join(", ")}) (default: ${JSON.stringify(output.defaultFormat)})`,
          ),
        ]),
    ...Object.entries(output.compatibilityFlags ?? {}).map(([flag, format]) =>
      helpLine(
        output.selector === undefined
          ? `${flag} = ${format}`
          : `${flag} = ${output.selector} ${format}`,
      ),
    ),
  ];
}

async function writeUsageFailure(
  compiled: ReturnType<typeof getCompiledCli>,
  write: WriteCliOutput,
  failure: Readonly<{
    readonly command: string;
    readonly issues: NonEmptyUsageIssues;
    readonly usage: string;
  }>,
): Promise<void> {
  await writeCliOutput(write, {
    destination: "stderr",
    chunk: `${JSON.stringify(
      createUsageFailureEnvelope(
        failure.command,
        failure.issues,
        failure.usage,
        usageFailureHelpArgv(compiled.commands, failure.command),
      ),
    )}\n`,
  });
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
): HelpEntry {
  const cardinality = formatFieldUsage(field, true);
  const choices =
    field.choices === undefined
      ? ""
      : ` (choices: ${field.choices.map((choice) => JSON.stringify(choice)).join(", ")})`;
  const defaultValue =
    field.default === undefined
      ? ""
      : ` (default: ${JSON.stringify(field.default)})`;
  return helpDetail(
    `${cardinality}${choices}${defaultValue}`,
    field.description,
  );
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
      : compiled.success.kind === "data"
        ? {
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
          }
        : {
            record: Object.freeze(
              Object.fromEntries(
                Object.keys(compiled.success.records).map((variant) => [
                  variant,
                  (payload: unknown) =>
                    createStreamRecordFact(
                      compiled.root,
                      variant,
                      payload,
                      issuedOutcomeFacts,
                    ),
                ]),
              ),
            ),
            streamSuccess: () =>
              createStreamSuccessFact(compiled.root, issuedOutcomeFacts),
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
  const handlerResult = (compiled.handler as RuntimeHandler)({
    input,
    dependencies: options.dependencies,
    outcome,
  });
  if (compiled.success.kind === "stream") {
    const generator = requireAsyncGenerator(handlerResult, compiled.root);
    return executeStreamResult(
      compiled,
      generator,
      issuedOutcomeFacts,
      options,
      outputFormat,
    );
  }
  const result = await handlerResult;
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

function requireAsyncGenerator(
  value: unknown,
  command: string,
): RuntimeStreamGenerator {
  const candidate = value as Readonly<{
    readonly [Symbol.asyncIterator]?: unknown;
    readonly next?: unknown;
    readonly return?: unknown;
  }>;
  let valid = false;
  try {
    valid =
      typeof value === "object" &&
      value !== null &&
      typeof candidate[Symbol.asyncIterator] === "function" &&
      typeof candidate.next === "function" &&
      typeof candidate.return === "function";
  } catch {
    valid = false;
  }
  if (!valid) {
    throwExecutionIssue({
      code: "streamHandlerMustReturnAsyncGenerator",
      command,
    });
  }
  return value as RuntimeStreamGenerator;
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

async function executeStreamResult<Contract extends CliContract>(
  compiled: ReturnType<typeof getCompiledCli>,
  generator: RuntimeStreamGenerator,
  issuedOutcomeFacts: WeakSet<object>,
  options: ExecuteCliOptions<Contract>,
  outputFormat: "structured" | "text",
): Promise<CliTermination<Contract>> {
  if (compiled.success.kind !== "stream") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  let active = true;
  try {
    if (outputFormat === "structured") {
      await writeCliOutput(options.write, {
        destination: "stdout",
        chunk: `${JSON.stringify(createStreamHeaderEnvelope(compiled.root))}\n`,
      });
    }
    for (;;) {
      const step = await generator.next();
      if (!step.done) {
        if (!isIssuedOutcomeFact(step.value, issuedOutcomeFacts)) {
          throwExecutionIssue({
            code: "invalidOutcomeFact",
            command: compiled.root,
          });
        }
        if (step.value.kind !== "record") {
          throwExecutionIssue({
            code: "outcomeKindMismatch",
            command: compiled.root,
            expected: "stream",
            received: step.value.kind,
          });
        }
        const record = compiled.success.records[step.value.variant];
        if (record === undefined) {
          throwExecutionIssue({
            code: "undeclaredOutcomeVariant",
            command: compiled.root,
            location: "record",
            variant: step.value.variant,
          });
        }
        const data = projectAtomicData(record.schema, step.value.data, {
          command: compiled.root,
          location: "record",
          variant: step.value.variant,
        });
        const chunk =
          outputFormat === "structured"
            ? `${JSON.stringify(
                createStreamRecordEnvelope(step.value.variant, data),
              )}\n`
            : formatStreamRecordText(record.text, data);
        await writeCliOutput(options.write, { destination: "stdout", chunk });
        continue;
      }
      active = false;
      if (!isIssuedOutcomeFact(step.value, issuedOutcomeFacts)) {
        throwExecutionIssue({
          code: "invalidOutcomeFact",
          command: compiled.root,
        });
      }
      if (step.value.kind === "failure") {
        const projected = await projectOutcome(
          compiled,
          step.value,
          outputFormat,
        );
        await writeProjectedOutcome(options.write, projected);
        return Object.freeze({
          kind: "applicationResult",
          command: compiled.root as CliContractRoot<Contract>,
          result: projected.result as CliContractResult<Contract>,
          exitCode: projected.exitCode,
        });
      }
      if (step.value.kind !== "streamSuccess") {
        throwExecutionIssue({
          code: "outcomeKindMismatch",
          command: compiled.root,
          expected: "stream",
          received: step.value.kind,
        });
      }
      if (outputFormat === "structured") {
        await writeCliOutput(options.write, {
          destination: "stdout",
          chunk: `${JSON.stringify(createStreamSuccessEnvelope())}\n`,
        });
      } else {
        await writeTextStreamSuccess(options.write, compiled.success.text);
      }
      return Object.freeze({
        kind: "applicationResult",
        command: compiled.root as CliContractRoot<Contract>,
        result: step.value as CliContractResult<Contract>,
        exitCode: 0,
      });
    }
  } catch (cause) {
    if (active && typeof generator.return === "function") {
      try {
        await generator.return(undefined);
      } catch {
        // 清理异常不能掩盖触发中断的写入或程序缺陷。
      }
    }
    throw cause;
  }
}

async function writeProjectedOutcome(
  write: WriteCliOutput,
  projected: Awaited<ReturnType<typeof projectOutcome>>,
): Promise<void> {
  if (projected.prefix !== undefined) {
    await writeCliOutput(write, {
      destination: projected.destination,
      chunk: projected.prefix,
    });
  }
  const chunk =
    projected.present === undefined
      ? (projected.chunk ?? "")
      : projected.present();
  if (chunk !== "") {
    await writeCliOutput(write, { destination: projected.destination, chunk });
  }
}

async function writeTextStreamSuccess(
  write: WriteCliOutput,
  presenter: unknown,
): Promise<void> {
  if (typeof presenter !== "function") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  const chunk = formatCompletionText(presenter());
  if (chunk !== "") {
    await writeCliOutput(write, { destination: "stdout", chunk });
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
        present: () => formatAtomicText(presenter(data)),
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
  if (compiled.success.kind !== "data" || result.kind !== "data") {
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
      present: () => formatAtomicText(presenter(data)),
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
  return formatAtomicText(value);
}

function formatTextLine(value: unknown): string {
  const text = value as Readonly<Record<string, unknown>> | null;
  if (
    !isIssuedTextProjection(value) ||
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

function formatAtomicText(value: unknown): string {
  const text = value as Readonly<Record<string, unknown>> | null;
  if (
    isIssuedTextProjection(value) &&
    text !== null &&
    typeof value === "object" &&
    text.kind === "lines"
  ) {
    return formatTextLines(text.lines);
  }
  return formatTextLine(value);
}

function formatTextLines(value: unknown): string {
  if (
    !Array.isArray(value) ||
    value.every((line) => typeof line === "string" && line.length === 0) ||
    value.some(
      (line) =>
        typeof line !== "string" ||
        line.includes("\r") ||
        line.includes("\n") ||
        line.includes("\0"),
    )
  ) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return `${value.join("\n")}\n`;
}

function formatStreamRecordText(presenter: unknown, data: unknown): string {
  if (typeof presenter !== "function") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  const value = presenter(data) as Readonly<Record<string, unknown>> | null;
  if (
    isIssuedTextProjection(value) &&
    value !== null &&
    typeof value === "object" &&
    value.kind === "fragment"
  ) {
    if (
      typeof value.value !== "string" ||
      value.value.length === 0 ||
      value.value.includes("\0")
    ) {
      throw new ContractExecutionError([{ code: "invalidCliContract" }]);
    }
    return value.value;
  }
  return formatTextLine(value);
}

function isSilentText(
  value: unknown,
): value is Readonly<{ readonly kind: "silent" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    isIssuedTextProjection(value) &&
    (value as unknown as Readonly<Record<string, unknown>>).kind === "silent"
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
