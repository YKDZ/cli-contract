import type { CliOutput, WriteCliOutput } from "./cli-execution.ts";
import { CliWriteError } from "./cli-write-error.ts";
import { streamOutputs, type StreamOutput } from "./stream-output.ts";

// Kept local so the build configuration can clear default global types without leaking ambient declarations.
declare function setImmediate(callback: () => void): unknown;

interface NodeOutputWritable {
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
  once(event: "drain", listener: () => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "drain", listener: () => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
}

export interface NodeCliOutputOptions {
  readonly stdout: NodeOutputWritable;
  readonly stderr: NodeOutputWritable;
}

/**
 * Adapts caller-provided Writable streams to the core output seam, writing each
 * chunk to stdout or stderr as routed by the core.
 *
 * A direct call awaits the write callback and, when `write()` returns false,
 * also awaits `drain`. During streamed execution, executeCli can submit ordered
 * writes within the same channel before their callbacks complete. It waits
 * before crossing channels and before reporting termination.
 *
 * The adapter never reads the global process, closes the streams, sets the exit
 * status, or takes over the CLI lifecycle. The host awaits executeCli before
 * handling process exit and decides how to handle write errors.
 */
export function nodeCliOutput({
  stdout,
  stderr,
}: NodeCliOutputOptions): WriteCliOutput {
  const write: WriteCliOutput = (output) =>
    writeNodeCliOutput(selectWritable(output, stdout, stderr));
  streamOutputs.set(write, () => createStreamOutput(stdout, stderr));
  return write;
}

/**
 * Reports whether the error or any error in its cause chain carries the code
 * "EPIPE", such as the broken-pipe cause preserved by CliWriteError. Detection
 * only: it never swallows the error, resumes writing, or picks an exit code.
 */
export function isNodeBrokenPipe(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    if (readProperty(current, "code") === "EPIPE") return true;
    current = readProperty(current, "cause");
  }
  return false;
}

function selectWritable(
  output: CliOutput,
  stdout: NodeOutputWritable,
  stderr: NodeOutputWritable,
): Readonly<{ writable: NodeOutputWritable; chunk: string }> {
  return {
    writable: output.destination === "stdout" ? stdout : stderr,
    chunk: output.chunk,
  };
}

function writeNodeCliOutput({
  writable,
  chunk,
}: Readonly<{ writable: NodeOutputWritable; chunk: string }>): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let writeReturned = false;
    let waitingForDrain = false;
    let drainObserved = false;
    let callbackObserved = false;

    const cleanup = () => {
      writable.removeListener("drain", onDrain);
      writable.removeListener("error", onError);
    };
    const settle = (error?: unknown, deferErrorCleanup = false) => {
      if (settled) return;
      settled = true;
      if (deferErrorCleanup) {
        writable.removeListener("drain", onDrain);
        setImmediate(cleanup);
      } else {
        cleanup();
      }
      if (error === undefined || error === null) resolve();
      else reject(error);
    };
    const completeWhenReady = () => {
      if (
        writeReturned &&
        callbackObserved &&
        (!waitingForDrain || drainObserved)
      ) {
        settle();
      }
    };
    const onDrain = () => {
      drainObserved = true;
      completeWhenReady();
    };
    const onError = (error: Error) => {
      if (settled) {
        cleanup();
        return;
      }
      settle(error);
    };
    const onCallback = (error?: Error | null) => {
      if (error !== undefined && error !== null) {
        settle(error, true);
        return;
      }
      callbackObserved = true;
      completeWhenReady();
    };

    writable.once("drain", onDrain);
    writable.once("error", onError);
    try {
      waitingForDrain = !writable.write(chunk, onCallback);
      writeReturned = true;
      completeWhenReady();
    } catch (error) {
      settle(error);
    }
  });
}

function createStreamOutput(
  stdout: NodeOutputWritable,
  stderr: NodeOutputWritable,
): StreamOutput {
  let current: BufferedNodeChannel | undefined;
  const failure = () => current?.failure();
  const write: WriteCliOutput = (output) => {
    failure();
    if (current?.destination === output.destination)
      return current.write(output.chunk);
    const switchChannel = () => {
      current = new BufferedNodeChannel(
        output.destination,
        output.destination === "stdout" ? stdout : stderr,
      );
      return current.write(output.chunk);
    };
    return current === undefined
      ? switchChannel()
      : current.finish().then(switchChannel);
  };
  return {
    write,
    pull: (next) => (current === undefined ? next() : current.pull(next)),
    async finish() {
      const channel = current;
      current = undefined;
      await channel?.finish();
    },
  };
}

class BufferedNodeChannel {
  readonly destination: CliOutput["destination"];
  readonly #writable: NodeOutputWritable;
  #pending = 0;
  #error: CliWriteError | undefined;
  #draining = false;
  #listeningForDrain = false;
  #resume: (() => void) | undefined;
  #complete: (() => void) | undefined;
  #rejectPull: ((error: CliWriteError) => void) | undefined;

  constructor(
    destination: CliOutput["destination"],
    writable: NodeOutputWritable,
  ) {
    this.destination = destination;
    this.#writable = writable;
    writable.once("error", this.#onError);
  }

  #onError = (cause: unknown) => {
    this.#error ??= new CliWriteError({ destination: this.destination, cause });
    this.#rejectPull?.(this.#error);
    this.#resume?.();
  };

  #onDrain = () => {
    this.#listeningForDrain = false;
    this.#draining = false;
    this.#resume?.();
  };

  #onWrite = (error?: Error | null) => {
    if (error != null) this.#onError(error);
    this.#pending--;
    if (this.#pending === 0) this.#complete?.();
    if (!this.#draining) this.#resume?.();
  };

  failure(): void {
    if (this.#error !== undefined) throw this.#error;
  }

  async pull<Step>(next: () => Promise<Step>): Promise<Step> {
    this.failure();
    try {
      return await new Promise<Step>((resolve, reject) => {
        this.#rejectPull = reject;
        void next().then(resolve, reject);
      });
    } finally {
      this.#rejectPull = undefined;
    }
  }

  write(chunk: string): void | Promise<void> {
    this.failure();
    if (!this.#listeningForDrain) {
      this.#listeningForDrain = true;
      this.#writable.once("drain", this.#onDrain);
    }
    this.#pending++;
    try {
      const accepted = this.#writable.write(chunk, this.#onWrite);
      this.#draining = !accepted && this.#listeningForDrain;
    } catch (cause) {
      this.#onWrite();
      this.#onError(cause);
    }
    this.failure();
    // Synchronous sinks can defer callbacks without ever signaling backpressure.
    if (!this.#draining && this.#pending < 64) return;
    return new Promise<void>((resolve) => {
      this.#resume = resolve;
    }).then(() => {
      this.#resume = undefined;
      this.failure();
    });
  }

  async finish(): Promise<void> {
    if (this.#pending > 0) {
      await new Promise<void>((resolve) => {
        this.#complete = resolve;
      });
    }
    this.#writable.removeListener("drain", this.#onDrain);
    // Node can emit the callback's error on a later nextTick.
    if (this.#error !== undefined) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    this.#writable.removeListener("error", this.#onError);
    this.failure();
  }
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function readProperty(value: object, key: "cause" | "code"): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}
