import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

void test("查询成功以文本写入 stdout 并退出零", () => {
  const result = invoke("alice");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "Alice\n");
  assert.equal(result.stderr, "");
});

void test("结构化成功保留具名事实，stderr 为空", () => {
  const result = invoke("alice", "--json");
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
  const result = invoke("bob", "--json");
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
    const result = invoke(flag);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    for (const fact of [
      "用法",
      "user <id>",
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

void test("缺少参数返回结构化用法失败和准确的帮助调用", () => {
  const result = invoke();
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    command: "lookup",
    kind: "usageFailure",
    issues: [{ code: "missingRequiredField", field: "id" }],
    usage: "user <id>",
    helpArgv: ["user", "--help"],
  });
});
