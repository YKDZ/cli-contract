import type { CliOutputDestination } from "#/cli-execution";

/**
 * 宿主输出端口未能完成写入，保留目的通道和原始 cause；它不是应用失败或正常终止结果。
 * chunk 可能已部分写出，核心不自动重试，也不借失败端口补写诊断；后续处置由宿主决定。
 */
export class CliWriteError extends Error {
  readonly destination: CliOutputDestination;
  override readonly cause: unknown;

  constructor(destination: CliOutputDestination, cause: unknown) {
    super(`CLI ${destination} 写入失败`, { cause });
    this.name = "CliWriteError";
    this.destination = destination;
    this.cause = cause;
  }
}
