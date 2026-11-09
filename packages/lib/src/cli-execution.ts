import {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  createStreamRecordFact,
  createStreamSuccessFact,
  formatFieldUsage,
  getCompiledCli,
  helpTemplateSpecifications,
  isCompiledExecutable,
  isIssuedOutcomeFact,
  usageFailureHelpArgv,
  type AnyCliContract,
  type CliContractDependencies,
  type CliContractResult,
  type CliContractRoot,
  type HelpFactTemplateParameters,
  type HelpFactWording,
  type OutcomeFact,
} from "#/cli-contract";
import {
  validateCliInput,
  validateContractSchemaSynchronously,
} from "#/cli-input-validation";
import {
  invocationBelongsTo,
  type CliInvocation,
  type NonEmptyCliUsageIssues,
  type InputRejectedIssue,
  type NonEmptyUsageIssues,
} from "#/cli-invocation";
import { CliWriteError } from "#/cli-write-error";
import type { ContractQueryDocument } from "#/contract-discovery";
import {
  canonicalCommandPath,
  queryCliContract,
  type ContractDirectoryQuery,
  type ContractSummaryQuery,
} from "#/contract-discovery";
import {
  ContractExecutionError,
  type ContractExecutionIssue,
  type ExecutionSchemaTarget,
} from "#/contract-execution-error";
import type { ContractSchema } from "#/contract-schema";
import type { JsonValue } from "#/contract-schema";
import { copyJsonValue } from "#/json-value";
import {
  encodeAtomicText,
  encodeRecordText,
  encodeTerminalText,
} from "#/outcome-fact";
import {
  createCompletionEnvelope,
  createDataEnvelope,
  createFailureEnvelope,
  createStreamHeaderEnvelope,
  createStreamRecordEnvelope,
  createStreamSuccessEnvelope,
  createUsageFailureEnvelope,
} from "#/outcome-wire";
import { formatUsageConstraint } from "#/usage-constraint";

type CompiledCommand = ReturnType<typeof getCompiledCli>["commands"][string];
type CompiledExecutable = Extract<
  CompiledCommand,
  { readonly kind: "rootCommand" | "command" }
>;
type CompiledGroup = Extract<
  CompiledCommand,
  { readonly kind: "rootGroup" | "commandGroup" }
>;
type CompiledOutputMode = CompiledExecutable["outputModes"][string];

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
export type CliTermination<Contract extends AnyCliContract = AnyCliContract> =
  | Readonly<{
      readonly kind: "applicationResult";
      readonly command: CliContractRoot<Contract>;
      readonly outputMode: string;
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
      readonly kind: "schema";
      readonly command: CliContractRoot<Contract>;
      readonly document: ContractQueryDocument;
      readonly exitCode: 0;
    }>
  | UsageFailureTermination<Contract>;

type UsageFailureTermination<Contract extends AnyCliContract> = {
  [Command in CliContractRoot<Contract>]: Readonly<{
    readonly kind: "usageFailure";
    readonly command: Command;
    readonly issues: NonEmptyCliUsageIssues<Contract, Command>;
    readonly exitCode: number;
  }>;
}[CliContractRoot<Contract>];

export type ExecuteCliOptions<
  Contract extends AnyCliContract,
  Invocation extends CliInvocation<Contract> = CliInvocation<Contract>,
> = Readonly<{
  readonly invocation: Invocation;
  readonly dependencies?: CliContractDependencies<Contract>;
  readonly write: WriteCliOutput;
}> &
  ([Extract<Invocation, { readonly kind: "parsed" }>] extends [never]
    ? unknown
    : Readonly<{ readonly dependencies: CliContractDependencies<Contract> }>);

type RuntimeStreamGenerator = AsyncGenerator<unknown, unknown, void>;

/**
 * 执行同一契约签发的调用：验证 raw input，将模式的验证结果和宿主依赖交给 handler，
 * 再验证、投影结果并顺序等待宿主写入。帮助、版本、发现和用法失败不执行业务 handler。
 *
 * 宿主负责参数来源、依赖构造、输出端口和真实进程退出；应 await 本函数，
 * 等可控写入完成后再使用终止结果的 exitCode，不能提前结束进程。
 *
 * 消费者模式、handler、generator 或呈现器抛出的值保留原始身份；核心检测的契约违反
 * 使用 ContractExecutionError，输出端口失败使用 CliWriteError。执行拒绝时不自动写诊断，
 * 活动流会执行必要清理，已经写出的合法前缀不会撤回，也不会追加伪造的成功终态。
 */
// oxlint-disable-next-line typescript/consistent-return
export async function executeCli<
  const Contract extends AnyCliContract,
  const Invocation extends CliInvocation<NoInfer<Contract>>,
>(
  cliContract: Contract,
  options: ExecuteCliOptions<Contract, Invocation>,
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
    case "schema": {
      await writeCliOutput(options.write, {
        destination: "stdout",
        chunk: `${JSON.stringify(options.invocation.document)}\n`,
      });
      return Object.freeze({
        kind: "schema",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 命令来自当前 Contract 的编译树。
        command: command.id as CliContractRoot<Contract>,
        document: options.invocation.document,
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 命令来自当前 Contract 的编译树，泛型身份在此恢复。
        command: command.id as CliContractRoot<Contract>,
        issues: options.invocation.issues,
        exitCode: compiled.usageFailureExitCode,
      });
    }
    case "parsed": {
      if (!isCompiledExecutable(command)) {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      const validation = validateCliInput(
        command.input,
        options.invocation.input,
        command.id,
      );
      if (validation.kind === "rejected") {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const issues = Object.freeze([
          Object.freeze({
            code: "inputRejected" as const,
            evidence: validation.evidence,
          }),
        ]) as readonly [InputRejectedIssue];
        await writeUsageFailure(compiled, options.write, {
          command: command.id,
          issues,
          usage: command.usage.synopsis,
        });
        return Object.freeze({
          kind: "usageFailure",
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 命令来自当前 Contract 的编译树，泛型身份在此恢复。
          command: command.id as CliContractRoot<Contract>,
          issues,
          exitCode: compiled.usageFailureExitCode,
        });
      }

      const outputMode = command.outputModes[options.invocation.outputMode];
      if (outputMode === undefined) {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      return executeApplicationResult(
        command,
        outputMode,
        validation.value,
        options,
      );
    }
  }
}

function createHelpText(
  compiled: ReturnType<typeof getCompiledCli>,
  command: ReturnType<typeof getCompiledCli>["commands"][string],
): string {
  const headings = compiled.contract.grammar.controls.help.headings;
  const wording = compiled.contract.grammar.controls.help.wording;
  const segments = [command.description];
  const commands = Object.values(compiled.commands).filter(
    (candidate) => candidate.parent === command.id,
  );
  const fields = isCommandGroup(command) ? [] : command.fields;
  const usageConstraints = isCommandGroup(command)
    ? []
    : command.usageConstraints;
  const positionalFields = fields.filter(
    (field) =>
      field.kind === "positional" || field.kind === "variadicPositional",
  );
  const optionFields = fields.filter(
    (field) =>
      field.kind !== "positional" && field.kind !== "variadicPositional",
  );
  const options = [
    ...optionFields.map((field) => formatHelpField(field, wording)),
    ...formatCoreControls(
      compiled,
      isCommandGroup(command) ? undefined : command,
    ),
  ];

  appendHelpSegment(segments, headings?.usage, [
    helpLine(command.usage.synopsis),
  ]);
  appendHelpSegment(
    segments,
    headings?.commands,
    commands.map((candidate) =>
      helpDetail(
        `${[candidate.name, ...candidate.aliases].join(", ")}${isCommandGroup(candidate) ? ` <${requireHelpFactWording(wording?.commandPlaceholder)}>` : ""}`,
        candidate.description,
      ),
    ),
  );
  appendHelpSegment(
    segments,
    headings?.arguments,
    positionalFields.map((field) => formatHelpField(field, wording)),
  );
  appendHelpSegment(segments, headings?.options, options);
  appendHelpSegment(
    segments,
    headings?.constraints,
    usageConstraints.map((constraint) =>
      helpLine(
        formatUsageConstraint(constraint, (slot, values) =>
          renderHelpFactTemplate(slot, wording?.[slot], values),
        ),
      ),
    ),
  );
  const schemaHeading =
    compiled.contract.grammar.controls.help.headings?.schema;
  appendHelpSegment(
    segments,
    schemaHeading,
    createSchemaHelpEntries(compiled, command),
  );
  appendHelpSegment(
    segments,
    headings?.examples,
    isCommandGroup(command)
      ? []
      : (command.examples ?? []).map((example) => helpLine(example.shell)),
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

function isCommandGroup(command: CompiledCommand): command is CompiledGroup {
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
  executable?: CompiledExecutable,
): readonly HelpEntry[] {
  const help = compiled.contract.grammar.controls.help;
  const version = compiled.contract.grammar.controls.version;
  const schema = compiled.contract.grammar.controls.schema;
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
    ...(schema === undefined
      ? []
      : [helpDetail(schema.longOption, schema.description)]),
    ...(executable === undefined
      ? []
      : [
          helpLine(
            [
              "--output <mode>",
              renderHelpFactTemplate("choices", help.wording?.choices, {
                choices: Object.keys(executable.outputModes)
                  .map((mode) => JSON.stringify(mode))
                  .join(", "),
              }),
              renderHelpFactTemplate("default", help.wording?.default, {
                value: JSON.stringify(executable.defaultOutputMode),
              }),
            ].join(" "),
          ),
          ...Object.values(executable.outputModes).map((mode) =>
            helpDetail(
              `${mode.id} (${mode.delivery}, ${mode.format})`,
              mode.description,
            ),
          ),
        ]),
  ];
}

function createSchemaHelpEntries(
  compiled: ReturnType<typeof getCompiledCli>,
  command: CompiledCommand,
): readonly HelpEntry[] {
  if (compiled.contract.grammar.controls.schema === undefined) return [];
  const path = canonicalCommandPath(compiled.commands, command.id);
  const query = queryCliContract(compiled.contract, path);
  if (query.kind === "queryFailure") return [];
  if (query.kind === "directory") {
    return directoryHelpEntries(query);
  }
  if (query.kind === "summary") {
    return summaryHelpEntries(query);
  }
  return [];
}

function directoryHelpEntries(
  query: ContractDirectoryQuery,
): readonly HelpEntry[] {
  return query.children.map((child) =>
    helpDetail(JSON.stringify(child.nextArgv), child.description),
  );
}

function summaryHelpEntries(query: ContractSummaryQuery): readonly HelpEntry[] {
  return query.next.map((next) =>
    helpDetail(`--schema=${next.target}`, JSON.stringify(next.argv)),
  );
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

function renderHelpFactTemplate<
  Slot extends Exclude<keyof HelpFactTemplateParameters, "commandPlaceholder">,
>(
  slot: Slot,
  template: string | undefined,
  values: HelpFactTemplateParameters[Slot],
): string {
  const factTemplate = requireHelpFactWording(template);
  const replacements = new Map<string, string>();
  for (const key of Object.keys(values)) {
    const value: unknown = Reflect.get(values, key);
    if (typeof value === "string") replacements.set(key, value);
  }
  if (
    helpTemplateSpecifications[slot].placeholders.some(
      (placeholder) => !replacements.has(placeholder),
    )
  ) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return factTemplate.replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/g,
    (_match, key: string) => {
      const value = replacements.get(key);
      if (value === undefined) {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      return value;
    },
  );
}

function requireHelpFactWording(value: string | undefined): string {
  if (value === undefined) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return value;
}

function formatHelpField(
  field: CompiledExecutable["fields"][number],
  wording: HelpFactWording | undefined,
): HelpEntry {
  const cardinality = formatFieldUsage(field, true);
  const choices =
    field.choices === undefined
      ? ""
      : ` ${renderHelpFactTemplate("choices", wording?.choices, { choices: field.choices.map((choice) => JSON.stringify(choice)).join(", ") })}`;
  const defaultValue =
    field.default === undefined
      ? ""
      : ` ${renderHelpFactTemplate("default", wording?.default, { value: JSON.stringify(field.default) })}`;
  return helpDetail(
    `${cardinality}${choices}${defaultValue}`,
    field.description,
  );
}

async function executeApplicationResult<
  Contract extends AnyCliContract,
  Invocation extends CliInvocation<NoInfer<Contract>>,
>(
  compiled: CompiledExecutable,
  outputMode: CompiledOutputMode,
  input: unknown,
  options: ExecuteCliOptions<Contract, Invocation>,
): Promise<CliTermination<Contract>> {
  const issuedOutcomeFacts = new WeakSet<object>();
  const resultContract = outputMode.resultContract;
  const success = resultContract.success;
  const successOutcome =
    success.kind === "completion"
      ? {
          completion: () =>
            createCompletionFact(compiled.id, issuedOutcomeFacts),
        }
      : success.kind === "data"
        ? {
            data: Object.freeze(
              Object.fromEntries(
                Object.keys(success.variants).map((variant) => [
                  variant,
                  (payload: unknown) =>
                    createDataFact(
                      compiled.id,
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
                Object.keys(success.records).map((variant) => [
                  variant,
                  (payload: unknown) =>
                    createStreamRecordFact(
                      compiled.id,
                      variant,
                      payload,
                      issuedOutcomeFacts,
                    ),
                ]),
              ),
            ),
            streamSuccess: () =>
              createStreamSuccessFact(compiled.id, issuedOutcomeFacts),
          };
  const outcome = Object.freeze({
    ...successOutcome,
    failure: Object.freeze(
      Object.fromEntries(
        Object.keys(resultContract.failures).map((variant) => [
          variant,
          (payload: unknown) =>
            createFailureFact(
              compiled.id,
              variant,
              payload,
              issuedOutcomeFacts,
            ),
        ]),
      ),
    ),
  });
  if (typeof resultContract.handler !== "function") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  const handlerResult: unknown = resultContract.handler({
    input,
    dependencies: options.dependencies,
    outcome,
  });
  if (success.kind === "stream") {
    const generator = requireAsyncGenerator(handlerResult, compiled.id);
    return executeStreamResult(
      compiled,
      outputMode,
      generator,
      issuedOutcomeFacts,
      options,
    );
  }
  const result = await handlerResult;
  const projected = projectApplicationFact(
    compiled,
    outputMode,
    result,
    issuedOutcomeFacts,
    "atomic",
  );
  await writeProjectedOutput(options.write, projected.output);
  return Object.freeze({
    kind: "applicationResult",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 命令来自当前 Contract 的编译树，泛型身份在此恢复。
    command: compiled.id as CliContractRoot<Contract>,
    outputMode: outputMode.id,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 结果经该命令的结果模式验证并由本次执行签发。
    result: projected.result as CliContractResult<Contract>,
    exitCode: projected.exitCode,
  });
}

function requireAsyncGenerator(
  value: unknown,
  command: string,
): RuntimeStreamGenerator {
  if (!hasAsyncGeneratorProtocol(value)) {
    throwExecutionIssue({
      code: "streamHandlerMustReturnAsyncGenerator",
      command,
    });
  }
  return value;
}

function hasAsyncGeneratorProtocol(
  value: unknown,
): value is RuntimeStreamGenerator {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      Symbol.asyncIterator in value &&
      typeof value[Symbol.asyncIterator] === "function" &&
      "next" in value &&
      typeof value.next === "function" &&
      "return" in value &&
      typeof value.return === "function"
    );
  } catch {
    return false;
  }
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

async function executeStreamResult<
  Contract extends AnyCliContract,
  Invocation extends CliInvocation<NoInfer<Contract>>,
>(
  compiled: CompiledExecutable,
  outputMode: CompiledOutputMode,
  generator: RuntimeStreamGenerator,
  issuedOutcomeFacts: WeakSet<object>,
  options: ExecuteCliOptions<Contract, Invocation>,
): Promise<CliTermination<Contract>> {
  if (outputMode.resultContract.success.kind !== "stream") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  let active = true;
  try {
    if (outputMode.format === "structured") {
      await writeCliOutput(options.write, {
        destination: "stdout",
        chunk: `${JSON.stringify(createStreamHeaderEnvelope(compiled.id, outputMode.id))}\n`,
      });
    }
    for (;;) {
      const step = await generator.next();
      if (!step.done) {
        const projected = projectApplicationFact(
          compiled,
          outputMode,
          step.value,
          issuedOutcomeFacts,
          "record",
        );
        await writeProjectedOutput(options.write, projected.output);
        continue;
      }
      active = false;
      const projected = projectApplicationFact(
        compiled,
        outputMode,
        step.value,
        issuedOutcomeFacts,
        "terminal",
      );
      await writeProjectedOutput(options.write, projected.output);
      return Object.freeze({
        kind: "applicationResult",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 命令来自当前 Contract 的编译树，泛型身份在此恢复。
        command: compiled.id as CliContractRoot<Contract>,
        outputMode: outputMode.id,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 结果经该命令的结果模式验证并由本次执行签发。
        result: projected.result as CliContractResult<Contract>,
        exitCode: projected.exitCode,
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

async function writeProjectedOutput(
  write: WriteCliOutput,
  output: CliOutput | undefined,
): Promise<void> {
  if (output !== undefined) await writeCliOutput(write, output);
}

type ProjectedApplicationFact = Readonly<{
  result: OutcomeFact;
  output: CliOutput | undefined;
  exitCode: number;
}>;

function projectApplicationFact(
  compiled: CompiledExecutable,
  outputMode: CompiledOutputMode,
  value: unknown,
  issuedOutcomeFacts: WeakSet<object>,
  phase: "atomic" | "record" | "terminal",
): ProjectedApplicationFact {
  if (!isIssuedOutcomeFact(value, issuedOutcomeFacts)) {
    throwExecutionIssue({ code: "invalidOutcomeFact", command: compiled.id });
  }
  const result = value;
  if (phase === "record") {
    if (
      result.kind !== "record" ||
      outputMode.resultContract.success.kind !== "stream"
    ) {
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command: compiled.id,
        expected: "stream",
        received: result.kind,
      });
    }
    const record = outputMode.resultContract.success.records[result.variant];
    if (record === undefined) {
      throwExecutionIssue({
        code: "undeclaredOutcomeVariant",
        command: compiled.id,
        location: "record",
        variant: result.variant,
      });
    }
    const data = projectAtomicData(record.schema, result.data, {
      command: compiled.id,
      location: "record",
      variant: result.variant,
    });
    const chunk =
      outputMode.format === "structured"
        ? `${JSON.stringify(createStreamRecordEnvelope(result.variant, data))}\n`
        : encodeRecordText(presentStreamRecordText(record.text, data));
    return { result, output: { destination: "stdout", chunk }, exitCode: 0 };
  }
  if (phase === "terminal" && result.kind === "streamSuccess") {
    if (outputMode.resultContract.success.kind !== "stream") {
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command: compiled.id,
        expected: "stream",
        received: result.kind,
      });
    }
    let chunk: string | undefined;
    if (outputMode.format === "structured")
      chunk = `${JSON.stringify(createStreamSuccessEnvelope())}\n`;
    else {
      const presenter = outputMode.resultContract.success.text;
      if (typeof presenter !== "function")
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      chunk = encodeTerminalText(presenter());
    }
    return {
      result,
      output:
        chunk === undefined ? undefined : { destination: "stdout", chunk },
      exitCode: 0,
    };
  }
  if (phase === "terminal" && result.kind !== "failure") {
    throwExecutionIssue({
      code: "outcomeKindMismatch",
      command: compiled.id,
      expected: "stream",
      received: result.kind,
    });
  }
  if (result.kind === "failure") {
    const failure = outputMode.resultContract.failures[result.variant];
    if (failure === undefined) {
      throwExecutionIssue({
        code: "undeclaredOutcomeVariant",
        command: compiled.id,
        location: "failure",
        variant: result.variant,
      });
    }
    const data = projectAtomicData(failure.schema, result.data, {
      command: compiled.id,
      location: "failure",
      variant: result.variant,
    });
    const normalized = createFailureFact(
      compiled.id,
      result.variant,
      data,
      issuedOutcomeFacts,
    );
    if (outputMode.format === "text") {
      const presenter = failure.text;
      if (typeof presenter !== "function") {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      return {
        result: normalized,
        output: {
          destination: "stderr",
          chunk: encodeAtomicText(presenter(data)),
        },
        exitCode: failure.exitCode,
      };
    }
    return {
      result: normalized,
      output: {
        destination: "stderr",
        chunk: `${JSON.stringify(createFailureEnvelope(compiled.id, outputMode.id, result.variant, data))}\n`,
      },
      exitCode: failure.exitCode,
    };
  }
  if (outputMode.resultContract.success.kind === "completion") {
    if (result.kind !== "completion") {
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command: compiled.id,
        expected: "completion",
        received: result.kind,
      });
    }
    if (outputMode.format === "text") {
      const presenter = outputMode.resultContract.success.text;
      if (typeof presenter !== "function") {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      const chunk = encodeTerminalText(presenter());
      return {
        result,
        output:
          chunk === undefined ? undefined : { destination: "stdout", chunk },
        exitCode: 0,
      };
    }
    return {
      result,
      output: {
        destination: "stdout",
        chunk: `${JSON.stringify(createCompletionEnvelope(compiled.id, outputMode.id))}\n`,
      },
      exitCode: 0,
    };
  }
  if (
    outputMode.resultContract.success.kind !== "data" ||
    result.kind !== "data"
  ) {
    throwExecutionIssue({
      code: "outcomeKindMismatch",
      command: compiled.id,
      expected: "data",
      received: result.kind,
    });
  }

  const variant = outputMode.resultContract.success.variants[result.variant];
  if (variant === undefined) {
    throwExecutionIssue({
      code: "undeclaredOutcomeVariant",
      command: compiled.id,
      location: "data",
      variant: result.variant,
    });
  }
  const data = projectAtomicData(variant.schema, result.data, {
    command: compiled.id,
    location: "data",
    variant: result.variant,
  });
  const normalized = createDataFact(
    compiled.id,
    result.variant,
    data,
    issuedOutcomeFacts,
  );
  if (outputMode.format === "text") {
    const presenter = variant.text;
    if (typeof presenter !== "function") {
      throw new ContractExecutionError([{ code: "invalidCliContract" }]);
    }
    return {
      result: normalized,
      output: {
        destination: "stdout",
        chunk: encodeAtomicText(presenter(data)),
      },
      exitCode: variant.exitCode,
    };
  }
  return {
    result: normalized,
    output: {
      destination: "stdout",
      chunk: `${JSON.stringify(createDataEnvelope(compiled.id, outputMode.id, result.variant, data))}\n`,
    },
    exitCode: variant.exitCode,
  };
}

function presentStreamRecordText(presenter: unknown, data: unknown): unknown {
  if (typeof presenter !== "function") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return presenter(data);
}

// oxlint-disable-next-line typescript/consistent-return -- 验证失败分支通过 throwExecutionIssue 以 never 终止。
function projectAtomicData(
  schema: ContractSchema,
  value: unknown,
  target: Exclude<ExecutionSchemaTarget, { readonly location: "input" }>,
): JsonValue {
  const validation = validateContractSchemaSynchronously(schema, value, target);
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

function throwExecutionIssue(issue: ContractExecutionIssue): never {
  throw new ContractExecutionError([issue]);
}
