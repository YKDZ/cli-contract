import type { CliOutputDestination } from "#/cli-execution";

/**
 * The host output seam failed to complete a write. Preserves the destination
 * channel and the original cause; it is neither an application failure nor a
 * normal termination result. The chunk may be partially written. The core does
 * not retry or write diagnostics through the failed seam; the host decides what
 * happens next.
 */
export class CliWriteError extends Error {
  readonly destination: CliOutputDestination;
  override readonly cause: unknown;

  constructor(destination: CliOutputDestination, cause: unknown) {
    super("cliWriteError", { cause });
    this.name = "CliWriteError";
    this.destination = destination;
    this.cause = cause;
  }
}
