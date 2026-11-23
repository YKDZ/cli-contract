/// <reference types="node" preserve="true" />

import type { Writable } from "node:stream";

import type { CliOutput, WriteCliOutput } from "#/cli-execution";

export interface NodeCliOutputOptions {
  readonly stdout: Writable;
  readonly stderr: Writable;
}

/**
 * Adapts caller-provided Writable streams to the core output seam, writing each
 * chunk to stdout or stderr as routed by the core.
 *
 * A write is complete once the stream's write callback has fired and, when
 * `write()` returned false, a `drain` event has been observed; the returned
 * promise resolves only then, so the execution kernel keeps write ordering and
 * backpressure. Write failures reject with the original error, including EPIPE.
 *
 * The adapter never reads the global process, closes the streams, sets the exit
 * status, or takes over the CLI lifecycle. The host awaits executeCli before
 * handling process exit and decides how to handle write errors.
 */
export function nodeCliOutput({
  stdout,
  stderr,
}: NodeCliOutputOptions): WriteCliOutput {
  return (output) => writeNodeCliOutput(selectWritable(output, stdout, stderr));
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
  stdout: Writable,
  stderr: Writable,
): Readonly<{ writable: Writable; chunk: string }> {
  return {
    writable: output.destination === "stdout" ? stdout : stderr,
    chunk: output.chunk,
  };
}

function writeNodeCliOutput({
  writable,
  chunk,
}: Readonly<{ writable: Writable; chunk: string }>): Promise<void> {
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
        queueMicrotask(cleanup);
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
