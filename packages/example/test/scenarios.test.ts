import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCommandScenarios,
  defineFailureScenarios,
  runCliScenario,
} from "@ykdz/cli-contract-testing";

import { cli } from "../src/index.ts";

// 新增命令或失败时，场景表会提示遗漏。
const dependencies = {
  async *readLogs() {
    yield { message: "started" };
    yield { message: "ready" };
  },
};
const commands = defineCommandScenarios(cli, {
  lookup: { argv: ["get", "alice", "--json"], dependencies },
  logs: { argv: ["logs", "--json"], dependencies },
});
const failures = defineFailureScenarios(cli, {
  lookup: {
    notFound: { argv: ["get", "bob", "--json"], dependencies },
  },
});

// 场景是否真的触发了预期结果，交给下面的断言验证。
for (const [command, scenario] of Object.entries(commands)) {
  void test(`${command} 的成功场景`, async () => {
    const capture = await runCliScenario({ cliContract: cli, ...scenario });
    assert.equal(capture.termination.exitCode, 0);
    assert.equal(capture.stderr, "");
    if (command === "logs") {
      assert.deepEqual(
        capture.stdout
          .trimEnd()
          .split("\n")
          .map((line) => JSON.parse(line)),
        [
          { schemaVersion: "1", command: "logs", kind: "stream" },
          { kind: "record", variant: "entry", data: { message: "started" } },
          { kind: "record", variant: "entry", data: { message: "ready" } },
          { kind: "streamSuccess" },
        ],
      );
      return;
    }
    assert.deepEqual(JSON.parse(capture.stdout), {
      schemaVersion: "1",
      command: "lookup",
      kind: "data",
      variant: "found",
      data: { name: "Alice" },
    });
  });
}

for (const [command, scenarios] of Object.entries(failures)) {
  for (const [failure, scenario] of Object.entries(scenarios)) {
    void test(`${command} 的 ${failure} 失败场景`, async () => {
      const capture = await runCliScenario({ cliContract: cli, ...scenario });
      assert.equal(capture.termination.exitCode, 1);
      assert.equal(capture.stdout, "");
      assert.deepEqual(JSON.parse(capture.stderr), {
        schemaVersion: "1",
        command: "lookup",
        kind: "failure",
        variant: "notFound",
        data: { id: "bob" },
      });
    });
  }
}
