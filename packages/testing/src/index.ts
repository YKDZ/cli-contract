import {
  executeCli,
  parseCliInvocation,
  type CliContract,
  type CliContractDependencies,
  type CliOutput,
  type CliTermination,
} from "@cli-contract/lib";

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
