import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { test } from "node:test";

import {
  CliWriteError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@cli-contract/lib";
import { isNodeBrokenPipe, nodeCliOutput } from "@cli-contract/lib/node";
import { z } from "zod";

class ControlledWritable extends EventEmitter {
  readonly chunks: string[] = [];
  writeResult = true;
  throwOnWrite: unknown;
  private callback: ((error?: Error | null) => void) | undefined;

  write(chunk: string, callback: (error?: Error | null) => void): boolean {
    if (this.throwOnWrite !== undefined) throw this.throwOnWrite;
    this.chunks.push(chunk);
    this.callback = callback;
    return this.writeResult;
  }

  complete(error?: Error | null): void {
    this.callback?.(error);
  }
}

function asWritable(writable: ControlledWritable): Writable {
  return writable as unknown as Writable;
}

void test("nodeCliOutput 将 stdout 与 stderr 路由到调用方提供的 Writable", async () => {
  const stdout = new ControlledWritable();
  const stderr = new ControlledWritable();
  const write = nodeCliOutput({
    stdout: asWritable(stdout),
    stderr: asWritable(stderr),
  });

  const stdoutWrite = write({ destination: "stdout", chunk: "out" });
  stdout.complete();
  await stdoutWrite;
  const stderrWrite = write({ destination: "stderr", chunk: "err" });
  stderr.complete();
  await stderrWrite;

  assert.deepEqual(stdout.chunks, ["out"]);
  assert.deepEqual(stderr.chunks, ["err"]);
});

void test("nodeCliOutput 等待 Node Writable 的异步 callback 与背压 drain", async () => {
  let completeWrite: (() => void) | undefined;
  const stdout = new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, callback) {
      completeWrite = callback;
    },
  });
  const stderr = new ControlledWritable();
  const write = nodeCliOutput({
    stdout,
    stderr: asWritable(stderr),
  });
  let settled = false;
  const pending = Promise.resolve(
    write({ destination: "stdout", chunk: "buffered" }),
  ).then(() => {
    settled = true;
  });
  let drained = false;
  stdout.once("drain", () => {
    drained = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  completeWrite?.();
  await pending;

  assert.equal(drained, true);
  assert.equal(settled, true);
});

void test("nodeCliOutput 在 callback 先于 drain 时仍等待 drain，并只结算一次", async () => {
  const stdout = new ControlledWritable();
  stdout.writeResult = false;
  const stderr = new ControlledWritable();
  const write = nodeCliOutput({
    stdout: asWritable(stdout),
    stderr: asWritable(stderr),
  });
  let settled = false;
  const pending = Promise.resolve(
    write({ destination: "stdout", chunk: "buffered" }),
  ).then(() => {
    settled = true;
  });

  stdout.complete();
  await Promise.resolve();
  assert.equal(settled, false);
  stdout.emit("drain");
  await pending;
  stdout.once("error", () => undefined);
  stdout.emit("error", new Error("late error"));

  assert.equal(settled, true);
  assert.equal(stdout.listenerCount("drain"), 0);
  assert.equal(stdout.listenerCount("error"), 0);
});

void test("nodeCliOutput 原样拒绝 Writable 的 error、callback error 与同步异常", async () => {
  const eventError = Object.assign(new Error("event failure"), {
    code: "EPIPE",
  });
  const errorWritable = new ControlledWritable();
  const stderr = new ControlledWritable();
  const errorWrite = nodeCliOutput({
    stdout: asWritable(errorWritable),
    stderr: asWritable(stderr),
  })({ destination: "stdout", chunk: "out" });
  errorWritable.emit("error", eventError);
  errorWritable.complete(eventError);
  await assert.rejects(
    Promise.resolve(errorWrite),
    (error) => error === eventError,
  );
  assert.equal(errorWritable.listenerCount("drain"), 0);
  assert.equal(errorWritable.listenerCount("error"), 0);

  const callbackError = Object.assign(new Error("callback failure"), {
    code: "EPIPE",
  });
  const callbackWritable = new Writable({
    write(_chunk, _encoding, callback) {
      callback(callbackError);
    },
  });
  await assert.rejects(
    Promise.resolve(
      nodeCliOutput({
        stdout: callbackWritable,
        stderr: asWritable(stderr),
      })({ destination: "stdout", chunk: "out" }),
    ),
    (error) => error === callbackError,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(callbackWritable.listenerCount("drain"), 0);
  assert.equal(callbackWritable.listenerCount("error"), 0);

  const thrown = new Error("synchronous failure");
  const throwingWritable = new ControlledWritable();
  throwingWritable.throwOnWrite = thrown;
  await assert.rejects(
    Promise.resolve(
      nodeCliOutput({
        stdout: asWritable(throwingWritable),
        stderr: asWritable(stderr),
      })({ destination: "stdout", chunk: "out" }),
    ),
    (error) => error === thrown,
  );
  assert.equal(throwingWritable.listenerCount("drain"), 0);
  assert.equal(throwingWritable.listenerCount("error"), 0);
});

void test("isNodeBrokenPipe 只识别 Node EPIPE 证据及其 cause 链", () => {
  const pipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

  assert.equal(isNodeBrokenPipe(pipe), true);
  assert.equal(isNodeBrokenPipe(new CliWriteError("stdout", pipe)), true);
  assert.equal(isNodeBrokenPipe({ code: "ECONNRESET" }), false);
  assert.equal(isNodeBrokenPipe(new Error("EPIPE")), false);
});

void test("stream 经 nodeCliOutput 写入失败时保留公共 CliWriteError 并清理 generator", async () => {
  let pulled = 0;
  let cleaned = false;
  const cli = defineCli()({
    root: "list",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      list: {
        kind: "rootCommand",
        name: "list",
        description: "列出项目",
        input: z.object({}),
        success: {
          kind: "stream",
          records: { item: { description: "项目", schema: z.object({}) } },
        },
        failures: {},
        async *handler({ outcome }) {
          try {
            pulled += 1;
            yield outcome.record.item({});
            pulled += 1;
            yield outcome.record.item({});
            return outcome.streamSuccess();
          } finally {
            cleaned = true;
          }
        },
      },
    },
  });
  const pipe = Object.assign(new Error("closed pipe"), { code: "EPIPE" });
  const stdout = new ControlledWritable();
  const originalWrite = stdout.write.bind(stdout);
  let writes = 0;
  stdout.write = (chunk, callback) => {
    writes += 1;
    const result = originalWrite(chunk, callback);
    if (writes === 1) queueMicrotask(() => stdout.complete());
    else queueMicrotask(() => stdout.emit("error", pipe));
    return result;
  };
  const stderr = new ControlledWritable();

  await assert.rejects(
    executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write: nodeCliOutput({
        stdout: asWritable(stdout),
        stderr: asWritable(stderr),
      }),
    }),
    (error) => {
      assert.ok(error instanceof CliWriteError);
      assert.equal(error.destination, "stdout");
      assert.equal(error.cause, pipe);
      assert.equal(isNodeBrokenPipe(error), true);
      return true;
    },
  );
  assert.equal(pulled, 1);
  assert.equal(cleaned, true);
  assert.equal(
    stdout.chunks.some((chunk) => chunk.includes("streamSuccess")),
    false,
  );
});
