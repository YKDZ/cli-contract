import {
  executeCli,
  parseCliInvocation,
  type AnyCliContract,
  type CliContractDependencies,
  type CliContractResult,
  type CliOutput,
  type CliTermination,
} from "@ykdz/cli-contract";

type ContractManifestCommands<Contract> =
  Contract extends Readonly<{
    readonly manifest: Readonly<{ readonly commands: infer Commands }>;
  }>
    ? Commands
    : never;

/** Executable command identities projected from the closed command set of the contract. */
export type CliScenarioCommand<Contract extends AnyCliContract> = {
  [
    Command in keyof ContractManifestCommands<Contract>
  ]: ContractManifestCommands<Contract>[Command] extends Readonly<{
    readonly kind: "command" | "rootCommand";
  }>
    ? Command
    : never;
}[keyof ContractManifestCommands<Contract>] &
  string;

/** Declared failure identities of one executable command. */
export type CliFailureScenarioKey<
  Contract extends AnyCliContract,
  Command extends CliScenarioCommand<Contract>,
> = Extract<
  CliContractResult<Contract>,
  Readonly<{ readonly kind: "failure"; readonly command: Command }>
>["variant"];

/** A scenario only describes how to trigger one invocation; it is not part of the production contract. */
export interface CliScenario<Contract extends AnyCliContract> {
  readonly argv: readonly string[];
  readonly dependencies: CliContractDependencies<NoInfer<Contract>>;
}

/** A closed set with exactly one triggering scenario per executable command. */
export type CliCommandScenarioMap<Contract extends AnyCliContract> = Readonly<{
  [Command in CliScenarioCommand<Contract>]: CliScenario<Contract>;
}>;

type CliFailureScenarioCommand<Contract extends AnyCliContract> = {
  [Command in CliScenarioCommand<Contract>]: [
    CliFailureScenarioKey<Contract, Command>,
  ] extends [never]
    ? never
    : Command;
}[CliScenarioCommand<Contract>];

/** Only commands that declare failure variants appear; commands without failures need no placeholder key. */
export type CliFailureScenarioMap<Contract extends AnyCliContract> = Readonly<{
  [Command in CliFailureScenarioCommand<Contract>]: Readonly<{
    [
      Failure in CliFailureScenarioKey<Contract, Command>
    ]: CliScenario<Contract>;
  }>;
}>;

type NoScenarioIndexSignature<Actual> = string extends keyof Actual
  ? Readonly<{ readonly scenarioKeysMustBeExplicit: never }>
  : unknown;

type NoUnexpectedScenarioKeys<Expected, Actual> =
  Exclude<keyof Actual, keyof Expected> extends never
    ? unknown
    : Readonly<{
        readonly [Key in Exclude<keyof Actual, keyof Expected>]: never;
      }>;

type ScenarioMapContract<Expected, Actual> = NoScenarioIndexSignature<Actual> &
  NoUnexpectedScenarioKeys<Expected, Actual>;

type FailureScenarioMapContract<Expected, Actual> = ScenarioMapContract<
  Expected,
  Actual
> &
  (Actual extends Record<PropertyKey, unknown>
    ? {
        readonly [Command in keyof Expected]: Command extends keyof Actual
          ? ScenarioMapContract<Expected[Command], Actual[Command]>
          : unknown;
      }
    : unknown);

/**
 * Checks that the consumer provides one triggering scenario for every
 * executable command in the contract. This helper neither runs nor retains
 * the contract; it returns the caller-provided scenario table unchanged.
 */
export function defineCommandScenarios<
  const Contract extends AnyCliContract,
  const Scenarios extends CliCommandScenarioMap<NoInfer<Contract>>,
>(
  cliContract: Contract,
  scenarios: Scenarios &
    ScenarioMapContract<CliCommandScenarioMap<NoInfer<Contract>>, Scenarios>,
): Scenarios {
  void cliContract;
  return scenarios;
}

/**
 * Checks that the consumer provides one triggering scenario for every
 * declared failure. Commands without failure variants do not appear in the map.
 */
export function defineFailureScenarios<
  const Contract extends AnyCliContract,
  const Scenarios extends CliFailureScenarioMap<NoInfer<Contract>>,
>(
  cliContract: Contract,
  scenarios: Scenarios &
    FailureScenarioMapContract<
      CliFailureScenarioMap<NoInfer<Contract>>,
      Scenarios
    >,
): Scenarios {
  void cliContract;
  return scenarios;
}

/** Normalized observation of one controlled CLI invocation. */
export interface CliScenarioCapture<Contract extends AnyCliContract> {
  /** All output captured in production write order. */
  readonly writes: readonly CliOutput[];
  /** Standard-output chunks. */
  readonly stdoutChunks: readonly string[];
  /** Standard-error chunks. */
  readonly stderrChunks: readonly string[];
  /** Joined standard output. */
  readonly stdout: string;
  /** Joined standard error. */
  readonly stderr: string;
  /** Termination result returned by the production execution core. */
  readonly termination: CliTermination<Contract>;
}

export interface RunCliScenarioOptions<
  Contract extends AnyCliContract,
> extends CliScenario<Contract> {
  /** Test-only hook for injecting write failures; called before the output is captured. */
  readonly beforeWrite?: (output: CliOutput) => void | Promise<void>;
}

/**
 * Runs one invocation through the production parser and execution core,
 * capturing its observable results in memory. The capture is returned only
 * after execution settles; a thrown error rejects instead of exposing
 * partial writes.
 */
export async function runCliScenario<const Contract extends AnyCliContract>(
  cliContract: Contract,
  options: RunCliScenarioOptions<Contract>,
): Promise<CliScenarioCapture<Contract>> {
  const writes: CliOutput[] = [];
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const invocation = parseCliInvocation(cliContract, options.argv);
  const termination = await executeCli(cliContract, {
    invocation,
    dependencies: options.dependencies,
    write: async (output) => {
      const captured = Object.freeze({
        destination: output.destination,
        chunk: output.chunk,
      });
      await options.beforeWrite?.(captured);
      writes.push(captured);
      if (captured.destination === "stdout") {
        stdoutChunks.push(captured.chunk);
      } else {
        stderrChunks.push(captured.chunk);
      }
    },
  });

  return Object.freeze({
    writes: Object.freeze(writes),
    stdoutChunks: Object.freeze(stdoutChunks),
    stderrChunks: Object.freeze(stderrChunks),
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    termination,
  });
}
