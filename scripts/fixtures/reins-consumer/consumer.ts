import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Writable } from "node:stream";

import { runCliScenario } from "@ykdz/cli-contract-testing";
import { nodeCliOutput } from "@ykdz/cli-contract/node";

import { reinsCli, stopReasons } from "./contract.ts";

// 原 Reins 的单 flag 多值写法映射为本探针的重复单值 option，并非 argv 完全等价。
const mappedAttachArgv = [
  "attach",
  "session@g1",
  "--exit-on",
  "end_turn",
  "--exit-on",
  "failed",
] as const;

async function scenario(argv: readonly string[]) {
  return runCliScenario({
    cliContract: reinsCli,
    argv,
    dependencies: undefined,
  });
}

async function verifyConsumerTestingInterface(): Promise<void> {
  assert.deepEqual(
    reinsCli.grammar.nodes
      .find((node) => node.id === "attach")
      ?.effectiveFields.find((field) => field.key === "exitOn")?.choices,
    stopReasons,
  );

  const success = await scenario(mappedAttachArgv);
  assert.deepEqual(success.writes, [
    {
      destination: "stdout",
      chunk: '{"schemaVersion":"1","command":"attach","kind":"stream"}\n',
    },
    {
      destination: "stdout",
      chunk:
        '{"kind":"record","variant":"notification","data":{"event":"turn.completed","exitOn":["end_turn","failed"],"sessionId":"session@g1","worker":"worker"}}\n',
    },
    { destination: "stdout", chunk: '{"kind":"streamSuccess"}\n' },
  ]);
  assert.equal(success.stderr, "");
  assert.equal(success.termination.kind, "applicationResult");
  assert.equal(success.termination.exitCode, 0);

  const failure = await scenario([
    ...mappedAttachArgv,
    "--daemon-disconnected",
  ]);
  assert.deepEqual(failure.stdoutChunks, [
    '{"schemaVersion":"1","command":"attach","kind":"stream"}\n',
    '{"kind":"record","variant":"notification","data":{"event":"turn.completed","exitOn":["end_turn","failed"],"sessionId":"session@g1","worker":"worker"}}\n',
  ]);
  assert.deepEqual(failure.stderrChunks, [
    '{"schemaVersion":"1","command":"attach","kind":"failure","variant":"daemonDisconnected","data":{"code":"daemon_disconnected"}}\n',
  ]);
  assert.equal(failure.termination.kind, "applicationResult");
  assert.equal(failure.termination.exitCode, 65);
}

async function verifyNodeWritableBackpressure(): Promise<void> {
  const chunks: string[] = [];
  const stdout = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      setImmediate(() => {
        chunks.push(chunk.toString());
        callback();
      });
    },
  });
  const stderr = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  let drained = false;
  let settled = false;
  stdout.once("drain", () => {
    drained = true;
  });
  const pending = Promise.resolve(
    nodeCliOutput({ stdout, stderr })({
      destination: "stdout",
      chunk: "buffered",
    }),
  ).then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  await pending;
  assert.equal(drained, true);
  assert.equal(settled, true);
  assert.deepEqual(chunks, ["buffered"]);
}

function verifyHostProcess(argv: readonly string[], expectedExitCode: number) {
  const result = spawnSync(process.execPath, ["host.ts", ...argv], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  assert.equal(result.status, expectedExitCode);
  return result;
}

function verifyHostBoundary(): void {
  const success = verifyHostProcess(mappedAttachArgv, 0);
  assert.equal(success.stderr, "");
  assert.equal(
    success.stdout,
    '{"schemaVersion":"1","command":"attach","kind":"stream"}\n' +
      '{"kind":"record","variant":"notification","data":{"event":"turn.completed","exitOn":["end_turn","failed"],"sessionId":"session@g1","worker":"worker"}}\n' +
      '{"kind":"streamSuccess"}\n',
  );

  const failure = verifyHostProcess(
    [...mappedAttachArgv, "--daemon-disconnected"],
    65,
  );
  assert.equal(
    failure.stdout,
    '{"schemaVersion":"1","command":"attach","kind":"stream"}\n' +
      '{"kind":"record","variant":"notification","data":{"event":"turn.completed","exitOn":["end_turn","failed"],"sessionId":"session@g1","worker":"worker"}}\n',
  );
  assert.equal(
    failure.stderr,
    '{"schemaVersion":"1","command":"attach","kind":"failure","variant":"daemonDisconnected","data":{"code":"daemon_disconnected"}}\n',
  );
}

await verifyConsumerTestingInterface();
await verifyNodeWritableBackpressure();
verifyHostBoundary();
