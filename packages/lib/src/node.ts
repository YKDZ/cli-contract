/// <reference types="node" preserve="true" />

import type { Writable } from "node:stream";

import type { CliOutput, WriteCliOutput } from "#/cli-execution";

export interface NodeCliOutputOptions {
  readonly stdout: Writable;
  readonly stderr: Writable;
}

/**
 * 将调用方提供的 Writable 接到核心输出端口，按核心选择的 stdout/stderr 路由写入。
 * 每次写入等待 callback；write 返回 false 时还等待 drain，以承接执行内核的顺序与背压。
 *
 * 适配器不读取全局 process，也不关闭流、设置退出状态或接管 CLI 框架生命周期。
 * 宿主应等待 executeCli 完成，再处理退出；写入异常交回调用方，不自动忽略 EPIPE。
 */
export function nodeCliOutput({
  stdout,
  stderr,
}: NodeCliOutputOptions): WriteCliOutput {
  return (output) => writeNodeCliOutput(selectWritable(output, stdout, stderr));
}

/**
 * 检查错误对象及其 cause 链是否携带 EPIPE，可用于识别 CliWriteError 保留的断管原因。
 * 这里只检测断管，不吞掉异常、恢复写入或决定进程退出码；其他异常仍由宿主处理。
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
