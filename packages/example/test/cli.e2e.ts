import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { queryCliContract } from "@ykdz/cli-contract";
import coreMetadata from "@ykdz/cli-contract/package.json" with { type: "json" };

import { cli } from "../src/index.ts";

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

void test("help 与 version 在没有应用输入时经真实进程正常退出", () => {
  const help = invoke("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /用法/);
  assert.equal(help.stderr, "");

  const version = invoke("--version");
  assert.equal(version.status, 0);
  assert.equal(version.stdout, `${coreMetadata.version}\n`);
  assert.equal(version.stderr, "");
});

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
          ...(mode === "structured" ? ["--output", "structured"] : []),
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
          schemaVersion: "3",
          command: "logs",
          outputMode: "structured",
          kind: "stream",
        });
        assert.deepEqual(JSON.parse(await nextLine()), {
          kind: "record",
          variant: "entry",
          data: { message: "started" },
        });
        assert.equal(
          stdout,
          '{"schemaVersion":"3","command":"logs","outputMode":"structured","kind":"stream"}\n{"kind":"record","variant":"entry","data":{"message":"started"}}\n',
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
          ? '{"schemaVersion":"3","command":"logs","outputMode":"structured","kind":"stream"}\n{"kind":"record","variant":"entry","data":{"message":"started"}}\n{"kind":"record","variant":"entry","data":{"message":"ready"}}\n{"kind":"streamSuccess"}\n'
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

void test("声明示例驱动真实查询进程并在帮助中原样展示", () => {
  const lookup = cli.manifest.commands.lookup;
  if (lookup === undefined || lookup.kind !== "command") {
    throw new Error("缺少 lookup 可执行命令清单");
  }
  const examples = lookup.examples;
  assert.equal(examples?.length, 2);
  const defaultExample = examples?.[0];
  const structuredExample = examples?.[1];
  assert.deepEqual(defaultExample?.argv, ["get", "--", "alice"]);
  assert.equal(defaultExample?.outputMode, undefined);
  assert.deepEqual(structuredExample?.argv, [
    "get",
    "--output=structured",
    "--",
    "alice",
  ]);
  assert.equal(structuredExample?.outputMode, "structured");

  const defaultResult = invoke(...(defaultExample?.argv ?? []));
  assert.equal(defaultResult.status, 0);
  assert.equal(defaultResult.stdout, "用户信息\nAlice\n");
  assert.equal(defaultResult.stderr, "");

  const structuredResult = invoke(...(structuredExample?.argv ?? []));
  assert.equal(structuredResult.status, 0);
  assert.equal(structuredResult.stderr, "");
  const envelope = JSON.parse(structuredResult.stdout);
  assert.equal(envelope.command, "lookup");
  assert.equal(envelope.outputMode, "structured");
  assert.equal(envelope.kind, "data");
  assert.equal(envelope.variant, "found");
  assert.deepEqual(envelope.data, { name: "Alice" });

  const help = invoke("get", "--help");
  assert.equal(help.status, 0);
  assert.equal(help.stderr, "");
  assert.ok(help.stdout.includes("调用示例"));
  assert.ok(help.stdout.includes(`  ${defaultExample?.shell}`));
  assert.ok(help.stdout.includes(`  ${structuredExample?.shell}`));
});

void test("摘要 next 经正式 example 进程完成契约查询且无需业务输入", () => {
  const rootDirectory = queryCliContract(cli, []);
  assert.equal(rootDirectory.kind, "directory");
  if (rootDirectory.kind !== "directory") return;
  const rootResult = invoke("--schema");
  assert.equal(rootResult.status, 0);
  assert.equal(rootResult.stderr, "");
  assert.deepEqual(JSON.parse(rootResult.stdout), rootDirectory);
  for (const child of rootDirectory.children) {
    const childResult = invoke(...child.nextArgv);
    assert.equal(childResult.status, 0, JSON.stringify(child.nextArgv));
    assert.equal(childResult.stderr, "");
    assert.deepEqual(
      JSON.parse(childResult.stdout),
      queryCliContract(cli, child.path),
    );
  }

  const summary = queryCliContract(cli, ["get"]);
  assert.equal(summary.kind, "summary");
  if (summary.kind !== "summary") return;

  const inputNext = summary.next.find((next) => next.target === "input");
  assert.ok(inputNext);
  assert.deepEqual(inputNext.argv, ["get", "--schema=input"]);
  const inputResult = invoke(...inputNext.argv);
  assert.equal(inputResult.status, 0);
  assert.equal(inputResult.stderr, "");
  assert.deepEqual(
    JSON.parse(inputResult.stdout),
    queryCliContract(cli, ["get"], "input"),
  );

  const successNext = summary.next.find(
    (next) => next.target === "success:structured",
  );
  assert.ok(successNext);
  const successResult = invoke(...successNext.argv);
  assert.equal(successResult.status, 0);
  assert.equal(successResult.stderr, "");
  assert.deepEqual(
    JSON.parse(successResult.stdout),
    queryCliContract(cli, ["get"], "success:structured"),
  );

  const help = invoke("get", "--help");
  assert.equal(help.status, 0);
  assert.equal(help.stderr, "");
  assert.ok(help.stdout.includes("契约查询"));
  assert.ok(help.stdout.includes("--schema=input"));
  assert.ok(help.stdout.includes("--schema=success:structured"));
  assert.ok(help.stdout.includes(JSON.stringify(successNext.argv)));
  assert.equal(
    help.stdout.split("查询命令输入、结果契约与线格式。").length - 1,
    1,
  );
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
  assert.ok(
    help.stdout.includes("当全部满足 domain 已提供 时，必须提供 email"),
  );

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
    schemaVersion: "3",
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
    usage:
      "user validate [--output <mode>] [--id <id>] [--email <email>] [--domain <domain>]",
    helpArgv: ["user", "validate", "--help"],
  });
});

void test("邮箱域条件在子进程中返回准确的条件失败", () => {
  const result = invoke("validate", "--id", "alice", "--domain", "example.com");
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "3",
    command: "validate",
    kind: "usageFailure",
    issues: [
      {
        code: "conditionalConstraintViolation",
        branch: "onMatch",
        conditions: [{ kind: "present", field: "domain", present: true }],
        missingRequiredFields: ["email"],
        presentForbiddenFields: [],
      },
    ],
    usage:
      "user validate [--output <mode>] [--id <id>] [--email <email>] [--domain <domain>]",
    helpArgv: ["user", "validate", "--help"],
  });
});

void test("指定域不匹配保留具名应用失败与退出状态", () => {
  const result = invoke(
    "validate",
    "--email",
    "alice@elsewhere.com",
    "--domain",
    "example.com",
    "--output",
    "structured",
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "3",
    command: "validate",
    outputMode: "structured",
    kind: "failure",
    variant: "emailDomainMismatch",
    data: { email: "alice@elsewhere.com", domain: "example.com" },
  });
});

void test("结构化成功保留具名事实，stderr 为空", () => {
  const result = invoke("get", "alice", "--output", "structured");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "3",
    command: "lookup",
    outputMode: "structured",
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
  const result = invoke("get", "bob", "--output", "structured");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "3",
    command: "lookup",
    outputMode: "structured",
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
      "user get [--output <mode>] <id>",
      "参数",
      "用户标识",
      "选项",
      "--help",
      "--output",
      "structured",
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
    schemaVersion: "3",
    command: "lookup",
    kind: "usageFailure",
    issues: [{ code: "missingRequiredField", field: "id" }],
    usage: "user get [--output <mode>] <id>",
    helpArgv: ["user", "get", "--help"],
  });
});
