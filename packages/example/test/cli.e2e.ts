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
  "日志 NDJSON 与文本片段都在流结束前保持各自分帧",
  { timeout: 5000 },
  async (t) => {
    async function verifyStream(mode: "structured" | "text") {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../src/main.ts", import.meta.url)),
          "logs",
          ...(mode === "structured" ? ["--json"] : []),
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      t.after(() => {
        child.kill();
      });
      const finished = once(child, "close");
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      const lines = createInterface({ input: child.stdout });
      t.after(() => lines.close());
      const records = lines[Symbol.asyncIterator]();
      async function nextLine() {
        const next = await records.next();
        assert.ok(!next.done);
        return next.value;
      }

      child.stdin.write("started\n");
      if (mode === "structured") {
        assert.deepEqual(JSON.parse(await nextLine()), {
          schemaVersion: "2",
          command: "logs",
          kind: "stream",
        });
        assert.deepEqual(JSON.parse(await nextLine()), {
          kind: "record",
          variant: "entry",
          data: { message: "started" },
        });
        assert.equal(
          stdout,
          '{"schemaVersion":"2","command":"logs","kind":"stream"}\n{"kind":"record","variant":"entry","data":{"message":"started"}}\n',
        );
      } else {
        assert.equal(await nextLine(), "started");
        assert.equal(stdout, "started\n");
      }
      assert.equal(child.exitCode, null);

      child.stdin.write("ready\n");
      if (mode === "structured") {
        assert.deepEqual(JSON.parse(await nextLine()), {
          kind: "record",
          variant: "entry",
          data: { message: "ready" },
        });
      } else {
        assert.equal(await nextLine(), "ready");
      }
      child.stdin.end();
      if (mode === "structured") {
        assert.deepEqual(JSON.parse(await nextLine()), {
          kind: "streamSuccess",
        });
      }
      assert.equal((await records.next()).done, true);
      assert.deepEqual(await finished, [0, null]);
      assert.equal(
        stdout,
        mode === "structured"
          ? '{"schemaVersion":"2","command":"logs","kind":"stream"}\n{"kind":"record","variant":"entry","data":{"message":"started"}}\n{"kind":"record","variant":"entry","data":{"message":"ready"}}\n{"kind":"streamSuccess"}\n'
          : "started\nready\n",
      );
      assert.equal(stderr, "");
    }

    await verifyStream("structured");
    await verifyStream("text");
  },
);

void test("查询成功以文本行组写入 stdout 并退出零", () => {
  const result = invoke("get", "alice");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "用户信息\nAlice\n");
  assert.equal(result.stderr, "");
});

void test("标识校验以完成结果正常退出", () => {
  const result = invoke("validate", "--id", "alice");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

void test("电子邮箱模式通过同一校验命令完成", () => {
  const result = invoke("validate", "--email", "alice@example.com");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

void test("数量约束同时出现在帮助和进程用法问题中", () => {
  const help = invoke("validate", "--help");
  assert.equal(help.status, 0);
  assert.ok(help.stdout.includes("id, email 恰好出现 1 项"));

  const result = invoke(
    "validate",
    "--id",
    "alice",
    "--email",
    "alice@example.com",
  );
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "2",
    command: "validate",
    kind: "usageFailure",
    issues: [
      {
        code: "countConstraintViolation",
        min: 1,
        max: 1,
        presentFields: ["id", "email"],
        absentFields: [],
      },
    ],
    usage: "user validate [--id <id>] [--email <email>]",
    helpArgv: ["user", "validate", "--help"],
  });
});

void test("结构化成功保留具名事实，stderr 为空", () => {
  const result = invoke("get", "alice", "--json");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "2",
    command: "lookup",
    kind: "data",
    variant: "found",
    data: { name: "Alice" },
  });
});

void test("业务失败保留文本空行，写入 stderr 并返回非零退出码", () => {
  const result = invoke("get", "bob");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "用户 bob 不存在\n\n请检查用户标识\n");
});

void test("结构化业务失败保留具名事实，stdout 为空并返回非零退出码", () => {
  const result = invoke("get", "bob", "--json");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "2",
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
  for (const fact of ["命令", "get", "logs", "validate"])
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
    schemaVersion: "2",
    command: "lookup",
    kind: "usageFailure",
    issues: [{ code: "missingRequiredField", field: "id" }],
    usage: "user get <id>",
    helpArgv: ["user", "get", "--help"],
  });
});
