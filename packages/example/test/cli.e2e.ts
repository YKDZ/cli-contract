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

void test("help and version exit cleanly through a real process without app input", () => {
  const help = invoke("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage/);
  assert.equal(help.stderr, "");

  const version = invoke("--version");
  assert.equal(version.status, 0);
  assert.equal(version.stdout, `${coreMetadata.version}\n`);
  assert.equal(version.stderr, "");
});

void test(
  "log NDJSON and text fragments each keep their framing before the stream ends",
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

void test("a successful lookup writes a text line group to stdout and exits zero", () => {
  const result = invoke("get", "alice");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "User profile\nAlice\n");
  assert.equal(result.stderr, "");
});

void test("declared examples drive the real lookup process and appear verbatim in help", () => {
  const lookup = cli.manifest.commands.lookup;
  if (lookup === undefined || lookup.kind !== "command") {
    throw new Error("missing lookup executable command manifest");
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
  assert.equal(defaultResult.stdout, "User profile\nAlice\n");
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
  assert.ok(help.stdout.includes("Examples"));
  assert.ok(help.stdout.includes(`  ${defaultExample?.shell}`));
  assert.ok(help.stdout.includes(`  ${structuredExample?.shell}`));
});

void test("summary next links complete contract discovery through the real example process without business input", () => {
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
  assert.ok(help.stdout.includes("Contract discovery"));
  assert.ok(help.stdout.includes("--schema=input"));
  assert.ok(help.stdout.includes("--schema=success:structured"));
  assert.ok(help.stdout.includes(JSON.stringify(successNext.argv)));
  assert.equal(
    help.stdout.split(
      "Query command inputs, result contracts, and wire formats.",
    ).length - 1,
    1,
  );
});

void test("identifier validation exits normally with a completion result", () => {
  const result = invoke("validate", "--id", "alice");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

void test("the email pattern completes through the same validation command", () => {
  const result = invoke("validate", "--email", "alice@example.com");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

void test("the count constraint appears in both help and the process usage failure", () => {
  const help = invoke("validate", "--help");
  assert.equal(help.status, 0);
  assert.ok(help.stdout.includes("id, email exactly 1"));
  assert.ok(
    help.stdout.includes("when all of domain is present, require email"),
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

void test("the email domain condition returns an accurate conditional failure in a subprocess", () => {
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

void test("a domain mismatch keeps the named application failure and exit status", () => {
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

void test("structured success keeps the named facts with empty stderr", () => {
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

void test("a business failure keeps the blank text line, writes to stderr, and exits non-zero", () => {
  const result = invoke("get", "bob");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "User bob not found\n\nCheck the user identifier\n",
  );
});

void test("structured business failure keeps the named facts with empty stdout and a non-zero exit code", () => {
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

void test("help requires no domain input and shows mechanical usage with explicit headings", () => {
  for (const flag of ["--help", "-h"]) {
    const result = invoke("get", flag);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    for (const fact of [
      "Usage",
      "user get [--output <mode>] <id>",
      "Arguments",
      "User identifier",
      "Options",
      "--help",
      "--output",
      "structured",
    ]) {
      assert.ok(result.stdout.includes(fact), fact);
    }
  }
});

void test("root help lists commands and logs help points at the current command", () => {
  const root = invoke("--help");
  assert.equal(root.status, 0);
  assert.equal(root.stderr, "");
  for (const fact of ["Commands", "get", "logs", "validate"])
    assert.ok(root.stdout.includes(fact));
  const logs = invoke("logs", "--help");
  assert.equal(logs.status, 0);
  assert.equal(logs.stderr, "");
  assert.ok(logs.stdout.includes("user logs"));
});

void test("a missing argument returns a structured usage failure and the accurate help invocation", () => {
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
