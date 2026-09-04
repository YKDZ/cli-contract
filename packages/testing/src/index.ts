import {
  executeCli,
  parseCliInvocation,
  type CliContract,
  type CliContractDependencies,
  type CliContractResult,
  type CliOutput,
  type CliTermination,
  type OutcomeFact,
} from "@cli-contract/lib";

/** 从契约命令闭集投影出的可执行命令身份。 */
export type CliScenarioCommand<Contract extends CliContract> =
  Contract extends CliContract<
    infer Root,
    unknown,
    unknown,
    OutcomeFact,
    "rootCommand" | "rootGroup",
    infer Commands
  >
    ? [Commands] extends [never]
      ? Root
      : {
          [Command in keyof Commands]: Commands[Command] extends Readonly<{
            readonly kind: "command";
          }>
            ? Command
            : never;
        }[keyof Commands] &
          string
    : never;

/** 某个可执行命令已声明的失败身份。 */
export type CliFailureScenarioKey<
  Contract extends CliContract,
  Command extends CliScenarioCommand<Contract>,
> = Extract<
  CliContractResult<Contract>,
  Readonly<{ readonly kind: "failure"; readonly command: Command }>
>["variant"];

/** 场景仅描述如何触发一次调用，不参与生产契约。 */
export interface CliScenario<Contract extends CliContract> {
  readonly argv: readonly string[];
  readonly dependencies: CliContractDependencies<NoInfer<Contract>>;
}

/** 每个可执行命令各有一个触发场景的闭合集合。 */
export type CliCommandScenarioMap<Contract extends CliContract> = Readonly<{
  [Command in CliScenarioCommand<Contract>]: CliScenario<Contract>;
}>;

type CliFailureScenarioCommand<Contract extends CliContract> = {
  [Command in CliScenarioCommand<Contract>]: [
    CliFailureScenarioKey<Contract, Command>,
  ] extends [never]
    ? never
    : Command;
}[CliScenarioCommand<Contract>];

/** 仅包含声明了失败变体的命令；没有失败的命令不需要伪键。 */
export type CliFailureScenarioMap<Contract extends CliContract> = Readonly<{
  [Command in CliFailureScenarioCommand<Contract>]: Readonly<{
    [Failure in CliFailureScenarioKey<
      Contract,
      Command
    >]: CliScenario<Contract>;
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
 * 校验消费者为契约中的每个可执行命令提供一个触发场景。
 * 该 helper 不执行或保存契约；返回值就是调用方提供的场景表。
 */
export function defineCommandScenarios<
  const Contract extends CliContract,
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
 * 校验消费者为每个已声明失败提供一个触发场景。
 * 没有失败变体的命令不会出现在该映射中。
 */
export function defineFailureScenarios<
  const Contract extends CliContract,
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

/** 一次受控 CLI 调用的规范化观测。 */
export interface CliScenarioCapture<Contract extends CliContract> {
  /** 按生产写入发生顺序捕获的全部输出。 */
  readonly writes: readonly CliOutput[];
  /** 标准输出的 chunk。 */
  readonly stdoutChunks: readonly string[];
  /** 标准错误的 chunk。 */
  readonly stderrChunks: readonly string[];
  /** 合并后的标准输出。 */
  readonly stdout: string;
  /** 合并后的标准错误。 */
  readonly stderr: string;
  /** 生产执行内核返回的终止结果。 */
  readonly termination: CliTermination<Contract>;
}

export interface RunCliScenarioOptions<Contract extends CliContract> {
  readonly cliContract: Contract;
  readonly argv: readonly string[];
  readonly dependencies: CliContractDependencies<NoInfer<Contract>>;
  /** 仅供测试注入写入失败；在成功捕获前调用。 */
  readonly beforeWrite?: (output: CliOutput) => void | Promise<void>;
}

/**
 * 通过生产 parser 与执行内核运行一次调用，并在内存中原子捕获其可观察结果。
 */
export async function runCliScenario<const Contract extends CliContract>(
  options: RunCliScenarioOptions<Contract>,
): Promise<CliScenarioCapture<Contract>> {
  const writes: CliOutput[] = [];
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const invocation = parseCliInvocation(options.cliContract, options.argv);
  const termination = await executeCli(options.cliContract, {
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
