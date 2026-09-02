import type { CliOutputDestination } from "#/cli-execution";

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
