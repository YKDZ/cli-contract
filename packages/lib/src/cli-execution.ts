import {
  createCompletionFact,
  getCompiledCli,
  isCompletionFact,
  type CliContract,
  type CliContractDependencies,
  type CompletionFact,
} from "#/cli-contract";
import {
  invocationBelongsTo,
  type CliInvocation,
  type UnexpectedPositionalIssue,
} from "#/cli-invocation";
import { createCompletionEnvelope } from "#/completion-wire";

export type CliOutputDestination = "stderr" | "stdout";

export interface CliOutput {
  readonly destination: CliOutputDestination;
  readonly chunk: string;
}

export type WriteCliOutput = (output: CliOutput) => Promise<void> | void;

export type CliTermination<Command extends string = string> =
  | Readonly<{
      readonly kind: "applicationResult";
      readonly command: Command;
      readonly result: CompletionFact<Command>;
      readonly exitCode: 0;
    }>
  | Readonly<{
      readonly kind: "help";
      readonly command: Command;
      readonly exitCode: 0;
    }>
  | Readonly<{
      readonly kind: "usageFailure";
      readonly command: Command;
      readonly issues: readonly [UnexpectedPositionalIssue];
      readonly exitCode: number;
    }>;

export interface ExecuteCliOptions<Contract extends CliContract> {
  readonly invocation: CliInvocation<NoInfer<Contract>>;
  readonly dependencies: CliContractDependencies<Contract>;
  readonly write: WriteCliOutput;
}

export async function executeCli<const Contract extends CliContract>(
  cliContract: Contract,
  options: ExecuteCliOptions<Contract>,
): Promise<CliTermination<Contract["grammar"]["root"]["id"]>> {
  if (!invocationBelongsTo(options.invocation, cliContract)) {
    throw new TypeError("CLI 调用来自另一个契约");
  }

  const compiled = getCompiledCli(cliContract);
  switch (options.invocation.kind) {
    case "help": {
      await options.write({
        destination: "stdout",
        chunk: `${compiled.usage.synopsis}\n${compiled.description}\n${compiled.contract.grammar.controls.help.longOption}\n`,
      });
      return Object.freeze({
        kind: "help",
        command: compiled.root,
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
        command: compiled.root,
        issues: options.invocation.issues,
        exitCode: compiled.usageFailureExitCode,
      });
    }
    case "parsed": {
      const validation = compiled.input["~standard"].validate(
        options.invocation.input,
      );
      if (isPromise(validation)) {
        throw new TypeError("契约模式验证必须同步完成");
      }
      if (validation.issues !== undefined) {
        throw new TypeError("空输入契约模式拒绝了空输入");
      }

      const issuedCompletionFacts = new WeakSet<object>();
      const result = await compiled.handler({
        input: validation.value,
        dependencies: options.dependencies,
        outcome: Object.freeze({
          completion: () =>
            createCompletionFact(compiled.root, issuedCompletionFacts),
        }),
      });
      if (!isCompletionFact(result, issuedCompletionFacts)) {
        throw new TypeError("handler 返回了无效的 completion fact");
      }

      await options.write({
        destination: "stdout",
        chunk: `${JSON.stringify(createCompletionEnvelope(compiled.root))}\n`,
      });
      return Object.freeze({
        kind: "applicationResult",
        command: compiled.root,
        result,
        exitCode: 0,
      });
    }
  }
}

function isPromise<Value>(value: unknown): value is Promise<Value> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
