import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function invoke(...argv: string[]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../src/main.ts", import.meta.url)), ...argv],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  return result;
}

void test(
  "日志到达后立即输出 NDJSON，结束前可读取记录",
  { timeout: 5000 },
  async (t) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../src/main.ts", import.meta.url)),
        "logs",
        "--json",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    t.after(() => {
      child.kill();
    });
    const finished = once(child, "close");
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const lines = createInterface({ input: child.stdout });
    t.after(() => lines.close());
    const records = lines[Symbol.asyncIterator]();
    async function nextRecord() {
      const next = await records.next();
      assert.ok(!next.done);
      return JSON.parse(next.value);
    }

    child.stdin.write("started\n");
    assert.deepEqual(await nextRecord(), {
      schemaVersion: "1",
      command: "logs",
      kind: "stream",
    });
    assert.deepEqual(await nextRecord(), {
      kind: "record",
      variant: "entry",
      data: { message: "started" },
    });
    assert.equal(child.exitCode, null);

    child.stdin.write("ready\n");
    assert.deepEqual(await nextRecord(), {
      kind: "record",
      variant: "entry",
      data: { message: "ready" },
    });
    child.stdin.end();
    assert.deepEqual(await nextRecord(), { kind: "streamSuccess" });
    assert.equal((await records.next()).done, true);
    assert.deepEqual(await finished, [0, null]);
    assert.equal(stderr, "");
  },
);

void test("查询成功以文本写入 stdout 并退出零", () => {
  const result = invoke("get", "alice");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "Alice\n");
  assert.equal(result.stderr, "");
});

void test("结构化成功保留具名事实，stderr 为空", () => {
  const result = invoke("get", "alice", "--json");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "1",
    command: "lookup",
    kind: "data",
    variant: "found",
    data: { name: "Alice" },
  });
});

void test("业务失败写入 stderr，stdout 为空并返回非零退出码", () => {
  const result = invoke("get", "bob", "--json");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    command: "lookup",
    kind: "failure",
    variant: "notFound",
    data: { id: "bob" },
  });
});

void test("帮助不要求领域输入，展示机械用法和显式标题", () => {
  for (const flag of ["--help", "-h"]) {
    const result = invoke("get", flag);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    for (const fact of [
      "用法",
      "user get <id>",
      "参数",
      "用户标识",
      "选项",
      "--help",
      "--json",
    ]) {
      assert.ok(result.stdout.includes(fact), fact);
    }
  }
});

void test("根帮助展示命令，日志帮助指向当前命令", () => {
  const root = invoke("--help");
  assert.equal(root.status, 0);
  assert.equal(root.stderr, "");
  for (const fact of ["命令", "get", "logs"])
    assert.ok(root.stdout.includes(fact));
  const logs = invoke("logs", "--help");
  assert.equal(logs.status, 0);
  assert.equal(logs.stderr, "");
  assert.ok(logs.stdout.includes("user logs"));
});

void test("缺少参数返回结构化用法失败和准确的帮助调用", () => {
  const result = invoke("get");
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    command: "lookup",
    kind: "usageFailure",
    issues: [{ code: "missingRequiredField", field: "id" }],
    usage: "user get <id>",
    helpArgv: ["user", "get", "--help"],
  });
});
