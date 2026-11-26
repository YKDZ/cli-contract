import {
  createCompletionFact,
  createDataFact,
  createFailureFact,
  createStreamRecordFact,
  createStreamSuccessFact,
  getCompiledCli,
  isCompiledExecutable,
  isIssuedOutcomeFact,
  usageFailureHelpArgv,
  type AnyCliContract,
  type CliContractDependencies,
  type CliContractResult,
  type CliContractRoot,
  type OutcomeFact,
} from "./cli-contract.ts";
import {
  validateCliInput,
  validateContractSchemaSynchronously,
} from "./cli-input-validation.ts";
import {
  invocationBelongsTo,
  type CliInvocation,
  type NonEmptyCliUsageIssues,
  type InputRejectedIssue,
  type NonEmptyUsageIssues,
} from "./cli-invocation.ts";
import { CliWriteError } from "./cli-write-error.ts";
import type { ContractQueryDocument } from "./contract-discovery.ts";
import {
  canonicalCommandPath,
  queryCliContract,
  type ContractDirectoryQuery,
  type ContractSummaryQuery,
} from "./contract-discovery.ts";
import {
  ContractExecutionError,
  type ContractExecutionIssue,
  type ExecutionSchemaTarget,
} from "./contract-execution-error.ts";
import type { ContractSchema } from "./contract-schema.ts";
import type { JsonValue } from "./contract-schema.ts";
import { renderCommandHelp } from "./help-projection.ts";
import { copyJsonValue } from "./json-value.ts";
import {
  encodeAtomicText,
  encodeRecordText,
  encodeTerminalText,
  type TextPresenterContext,
} from "./outcome-fact.ts";
import {
  createCompletionEnvelope,
  createDataEnvelope,
  createFailureEnvelope,
  createStreamHeaderEnvelope,
  createStreamRecordEnvelope,
  createStreamSuccessEnvelope,
  createUsageFailureEnvelope,
} from "./outcome-wire.ts";
import { streamOutputs } from "./stream-output.ts";

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

/** A text chunk already projected, framed, and routed by the core; the host writes it verbatim without reformatting or rerouting. */
export interface CliOutput {
  readonly destination: CliOutputDestination;
  readonly chunk: string;
}

/**
 * Host-provided output seam. An asynchronous write must return a promise that
 * settles when the chunk is fully written; the core awaits each write before
 * writing further output or pulling the next stream record, preserving
 * cross-channel ordering and backpressure. A throw or rejection rejects
 * execution with a CliWriteError that preserves the original cause and
 * destination channel; nothing is retried automatically.
 */
export type WriteCliOutput = (output: CliOutput) => Promise<void> | void;

/**
 * Programmatic result of normal control flow after all controllable writes have
 * completed; the host still owns the real process exit status. Stream results
 * keep only the terminal fact, not the records already written. Program defects
 * and write errors reject execution instead of joining this union.
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
 * Executes an invocation issued by the same contract: validates the raw input,
 * hands the schema-validated input and host dependencies to the handler, then
 * validates and projects the result and awaits host writes in order. Help,
 * version, discovery, and usage failures never run the business handler.
 *
 * The host owns argument sourcing, dependency construction, the output seam,
 * and the real process exit. Await this function and let the controllable
 * writes finish before using the termination's exitCode; do not exit early.
 *
 * Values thrown by consumer schemas, handlers, generators, or presenters keep
 * their original identity; contract violations detected by the core use
 * ContractExecutionError and output-seam failures use CliWriteError. A rejected
 * execution writes no diagnostics automatically, an active stream performs the
 * necessary cleanup, and a legitimately written prefix is neither withdrawn nor
 * followed by a fabricated success terminal.
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command comes from the compiled tree of the current Contract.
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command comes from the compiled tree of the current Contract; the generic identity is restored here.
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
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command comes from the compiled tree of the current Contract; the generic identity is restored here.
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
  const children = Object.values(compiled.commands)
    .filter((candidate) => candidate.parent === command.id)
    .map((candidate) => ({
      name: candidate.name,
      aliases: candidate.aliases,
      isGroup: isCommandGroup(candidate),
      description: candidate.description,
    }));
  const schemaQuery = queryHelpSchema(compiled, command);
  const executable = isCommandGroup(command) ? undefined : command;
  return renderCommandHelp({
    command: {
      description: command.description,
      synopsis: command.usage.synopsis,
      ...(command.helpSupplement === undefined
        ? {}
        : { helpSupplement: command.helpSupplement }),
      fields: executable === undefined ? [] : executable.fields,
      usageConstraints:
        executable === undefined ? [] : executable.usageConstraints,
      ...(executable === undefined
        ? {}
        : {
            outputModes: {
              defaultMode: executable.defaultOutputMode,
              modes: Object.values(executable.outputModes).map((mode) => ({
                id: mode.id,
                description: mode.description,
              })),
            },
          }),
      examples: executable?.examples ?? [],
    },
    children,
    controls: compiled.contract.grammar.controls,
    ...(schemaQuery === undefined ? {} : { schemaQuery }),
  });
}

function isCommandGroup(command: CompiledCommand): command is CompiledGroup {
  return command.kind === "rootGroup" || command.kind === "commandGroup";
}

function queryHelpSchema(
  compiled: ReturnType<typeof getCompiledCli>,
  command: CompiledCommand,
): ContractDirectoryQuery | ContractSummaryQuery | undefined {
  if (compiled.contract.grammar.controls.schema === undefined) {
    return undefined;
  }
  const path = canonicalCommandPath(compiled.commands, command.id);
  const query = queryCliContract(compiled.contract, { path });
  if (query.kind === "directory" || query.kind === "summary") {
    return query;
  }
  return undefined;
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
  const projection: ResultProjectionContext = {
    command: compiled.id,
    outputMode,
    issuedOutcomeFacts,
    presenterContext: Object.freeze({ input }),
  };
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
    return executeStreamResult(generator, projection, options);
  }
  const result = await handlerResult;
  const projected = projectApplicationFact(result, "atomic", projection);
  await writeProjectedOutput(options.write, projected.output);
  return Object.freeze({
    kind: "applicationResult",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command comes from the compiled tree of the current Contract; the generic identity is restored here.
    command: compiled.id as CliContractRoot<Contract>,
    outputMode: outputMode.id,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The result was validated against this command's result schema and issued by this execution.
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
    throw new CliWriteError({ destination: output.destination, cause });
  }
}

async function executeStreamResult<
  Contract extends AnyCliContract,
  Invocation extends CliInvocation<NoInfer<Contract>>,
>(
  generator: RuntimeStreamGenerator,
  projection: ResultProjectionContext,
  options: ExecuteCliOptions<Contract, Invocation>,
): Promise<CliTermination<Contract>> {
  const { command, outputMode } = projection;
  if (outputMode.resultContract.success.kind !== "stream") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  const streamOutput = streamOutputs.get(options.write)?.();
  const write =
    streamOutput?.write ?? ((output) => writeCliOutput(options.write, output));
  let active = true;
  try {
    if (outputMode.format === "structured") {
      await write({
        destination: "stdout",
        chunk: `${JSON.stringify(createStreamHeaderEnvelope(command, outputMode.id))}\n`,
      });
    }
    for (;;) {
      const step = await (streamOutput === undefined
        ? generator.next()
        : streamOutput.pull(() => generator.next()));
      if (!step.done) {
        const projected = projectApplicationFact(
          step.value,
          "record",
          projection,
        );
        if (projected.output !== undefined) await write(projected.output);
        continue;
      }
      active = false;
      const projected = projectApplicationFact(
        step.value,
        "terminal",
        projection,
      );
      // Do not submit a terminal frame while earlier writes can still fail.
      await streamOutput?.finish();
      if (projected.output !== undefined) await write(projected.output);
      await streamOutput?.finish();
      return Object.freeze({
        kind: "applicationResult",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command comes from the compiled tree of the current Contract; the generic identity is restored here.
        command: command as CliContractRoot<Contract>,
        outputMode: outputMode.id,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The result was validated against this command's result schema and issued by this execution.
        result: projected.result as CliContractResult<Contract>,
        exitCode: projected.exitCode,
      });
    }
  } catch (cause) {
    if (active && typeof generator.return === "function") {
      try {
        await generator.return(undefined);
      } catch {
        // Cleanup failures must not mask the write error or program defect that triggered the abort.
      }
    }
    try {
      await streamOutput?.finish();
    } catch {
      // Preserve the error that stopped execution while pending writes settle.
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

type ResultProjectionContext = Readonly<{
  command: string;
  outputMode: CompiledOutputMode;
  issuedOutcomeFacts: WeakSet<object>;
  presenterContext: TextPresenterContext<unknown>;
}>;

function projectApplicationFact(
  value: unknown,
  phase: "atomic" | "record" | "terminal",
  {
    command,
    outputMode,
    issuedOutcomeFacts,
    presenterContext,
  }: ResultProjectionContext,
): ProjectedApplicationFact {
  if (!isIssuedOutcomeFact(value, issuedOutcomeFacts)) {
    throwExecutionIssue({ code: "invalidOutcomeFact", command });
  }
  const result = value;
  if (phase === "record") {
    if (
      result.kind !== "record" ||
      outputMode.resultContract.success.kind !== "stream"
    ) {
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command,
        expected: "stream",
        received: result.kind,
      });
    }
    const record = outputMode.resultContract.success.records[result.variant];
    if (record === undefined) {
      throwExecutionIssue({
        code: "undeclaredOutcomeVariant",
        command,
        location: "record",
        variant: result.variant,
      });
    }
    const data = projectAtomicData(record.schema, result.data, {
      command,
      location: "record",
      variant: result.variant,
    });
    const chunk =
      outputMode.format === "structured"
        ? `${JSON.stringify(createStreamRecordEnvelope(result.variant, data))}\n`
        : encodeRecordText(
            presentPayloadText(record.text, data, presenterContext),
          );
    return { result, output: { destination: "stdout", chunk }, exitCode: 0 };
  }
  if (phase === "terminal" && result.kind === "streamSuccess") {
    if (outputMode.resultContract.success.kind !== "stream") {
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command,
        expected: "stream",
        received: result.kind,
      });
    }
    const chunk =
      outputMode.format === "structured"
        ? `${JSON.stringify(createStreamSuccessEnvelope())}\n`
        : presentTerminalText(
            outputMode.resultContract.success.text,
            presenterContext,
          );
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
      command,
      expected: "stream",
      received: result.kind,
    });
  }
  if (result.kind === "failure") {
    const failure = outputMode.resultContract.failures[result.variant];
    if (failure === undefined) {
      throwExecutionIssue({
        code: "undeclaredOutcomeVariant",
        command,
        location: "failure",
        variant: result.variant,
      });
    }
    const data = projectAtomicData(failure.schema, result.data, {
      command,
      location: "failure",
      variant: result.variant,
    });
    const normalized = createFailureFact(
      command,
      result.variant,
      data,
      issuedOutcomeFacts,
    );
    if (outputMode.format === "text") {
      return {
        result: normalized,
        output: {
          destination: "stderr",
          chunk: encodeAtomicText(
            presentPayloadText(failure.text, data, presenterContext),
          ),
        },
        exitCode: failure.exitCode,
      };
    }
    return {
      result: normalized,
      output: {
        destination: "stderr",
        chunk: `${JSON.stringify(createFailureEnvelope(command, outputMode.id, result.variant, data))}\n`,
      },
      exitCode: failure.exitCode,
    };
  }
  if (outputMode.resultContract.success.kind === "completion") {
    if (result.kind !== "completion") {
      throwExecutionIssue({
        code: "outcomeKindMismatch",
        command,
        expected: "completion",
        received: result.kind,
      });
    }
    if (outputMode.format === "text") {
      const chunk = presentTerminalText(
        outputMode.resultContract.success.text,
        presenterContext,
      );
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
        chunk: `${JSON.stringify(createCompletionEnvelope(command, outputMode.id))}\n`,
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
      command,
      expected: "data",
      received: result.kind,
    });
  }

  const variant = outputMode.resultContract.success.variants[result.variant];
  if (variant === undefined) {
    throwExecutionIssue({
      code: "undeclaredOutcomeVariant",
      command,
      location: "data",
      variant: result.variant,
    });
  }
  const data = projectAtomicData(variant.schema, result.data, {
    command,
    location: "data",
    variant: result.variant,
  });
  const normalized = createDataFact(
    command,
    result.variant,
    data,
    issuedOutcomeFacts,
  );
  if (outputMode.format === "text") {
    return {
      result: normalized,
      output: {
        destination: "stdout",
        chunk: encodeAtomicText(
          presentPayloadText(variant.text, data, presenterContext),
        ),
      },
      exitCode: variant.exitCode,
    };
  }
  return {
    result: normalized,
    output: {
      destination: "stdout",
      chunk: `${JSON.stringify(createDataEnvelope(command, outputMode.id, result.variant, data))}\n`,
    },
    exitCode: variant.exitCode,
  };
}

function presentPayloadText(
  presenter: unknown,
  data: unknown,
  presenterContext: TextPresenterContext<unknown>,
): unknown {
  if (typeof presenter !== "function") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return presenter(data, presenterContext);
}

function presentTerminalText(
  presenter: unknown,
  presenterContext: TextPresenterContext<unknown>,
): string | undefined {
  if (typeof presenter !== "function") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return encodeTerminalText(presenter(presenterContext));
}

// oxlint-disable-next-line typescript/consistent-return -- The validation-failure branch terminates as never via throwExecutionIssue.
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
