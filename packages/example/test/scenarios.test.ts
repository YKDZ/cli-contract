import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCommandScenarios,
  defineFailureScenarios,
  runCliScenario,
} from "@ykdz/cli-contract-testing";

import { cli } from "../src/index.ts";

// The scenario tables flag any command or failure that lacks a trigger.
const dependencies = {
  async *readLogs() {
    yield { message: "started" };
    yield { message: "ready" };
  },
};

function isJsonRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const commands = defineCommandScenarios(cli, {
  lookup: { argv: ["get", "alice", "--output", "structured"], dependencies },
  logs: { argv: ["logs", "--output", "structured"], dependencies },
  validate: { argv: ["validate", "--id", "alice"], dependencies },
});
const failures = defineFailureScenarios(cli, {
  lookup: {
    notFound: {
      argv: ["get", "bob", "--output", "structured"],
      dependencies,
    },
  },
  validate: {
    emailDomainMismatch: {
      argv: [
        "validate",
        "--email",
        "alice@elsewhere.com",
        "--domain",
        "example.com",
      ],
      dependencies,
    },
  },
});

void test("parse grammar and contract manifest share the count and conditional rules", () => {
  const validateNode = cli.grammar.nodes.find((node) => node.id === "validate");
  if (validateNode === undefined || validateNode.kind !== "command") {
    assert.fail("expected validate to be an executable command");
  }
  assert.strictEqual(
    validateNode.usageConstraints,
    cli.manifest.commands.validate.usageConstraints,
  );
  assert.deepEqual(
    validateNode.usageConstraints?.map(({ kind }) => kind),
    ["count", "when"],
  );

  const properties =
    cli.manifest.commands.validate.input.inputSchema.properties;
  assert.ok(
    isJsonRecord(properties),
    "expected the manifest projection to declare input field schemas",
  );
  const idSchema = properties.id;
  assert.ok(
    isJsonRecord(idSchema),
    "expected id to project as an object schema",
  );
  assert.equal(idSchema.minLength, 1);

  const emailSchema = properties.email;
  assert.ok(
    isJsonRecord(emailSchema),
    "expected email to project as an object schema",
  );
  assert.equal(emailSchema.format, "email");
  assert.equal(typeof emailSchema.pattern, "string");
  assert.notEqual(emailSchema.pattern, "");
});

// The assertions below verify that each scenario actually triggers its expected result.
for (const [command, scenario] of Object.entries(commands)) {
  void test(`${command} success scenario`, async () => {
    const capture = await runCliScenario({ cliContract: cli, ...scenario });
    assert.equal(capture.termination.exitCode, 0);
    assert.equal(capture.stderr, "");
    if (command === "validate") {
      assert.equal(capture.stdout, "");
      return;
    }
    if (command === "logs") {
      assert.deepEqual(
        capture.stdout
          .trimEnd()
          .split("\n")
          .map((line) => JSON.parse(line)),
        [
          {
            schemaVersion: "3",
            command: "logs",
            outputMode: "structured",
            kind: "stream",
          },
          { kind: "record", variant: "entry", data: { message: "started" } },
          { kind: "record", variant: "entry", data: { message: "ready" } },
          { kind: "streamSuccess" },
        ],
      );
      return;
    }
    assert.deepEqual(JSON.parse(capture.stdout), {
      schemaVersion: "3",
      command: "lookup",
      outputMode: "structured",
      kind: "data",
      variant: "found",
      data: { name: "Alice" },
    });
  });
}

void test("base input schema rejection produces inputRejected at the execution stage", async () => {
  const capture = await runCliScenario({
    cliContract: cli,
    argv: ["validate", "--email", "not-an-email", "--domain", "example.com"],
    dependencies,
  });
  if (capture.termination.kind !== "usageFailure") {
    assert.fail(
      "expected the execution kernel to return an input usage failure",
    );
  }
  assert.equal(capture.termination.exitCode, 64);
  assert.deepEqual(
    capture.termination.issues.map(({ code }) => code),
    ["inputRejected"],
  );
  assert.equal(capture.stdout, "");
  assert.notEqual(capture.stderr, "");
});

void test("identifier validation requires exactly one input field", async () => {
  for (const [argv, presentFields, absentFields] of [
    [["validate"], [], ["id", "email"]],
    [
      ["validate", "--id", "alice", "--email", "alice@example.com"],
      ["id", "email"],
      [],
    ],
  ] as const) {
    const capture = await runCliScenario({
      cliContract: cli,
      argv,
      dependencies,
    });
    if (capture.termination.kind !== "usageFailure") {
      assert.fail(
        "expected the usage constraint to reject the invocation before the handler",
      );
    }
    assert.equal(capture.termination.exitCode, 64);
    assert.deepEqual(capture.termination.issues, [
      {
        code: "countConstraintViolation",
        min: 1,
        max: 1,
        presentFields,
        absentFields,
      },
    ]);
    assert.equal(capture.stdout, "");
  }
});

void test("specifying an email domain also requires the email", async () => {
  const capture = await runCliScenario({
    cliContract: cli,
    argv: ["validate", "--id", "alice", "--domain", "example.com"],
    dependencies,
  });
  if (capture.termination.kind !== "usageFailure") {
    assert.fail(
      "expected the conditional constraint to reject the invocation before the handler",
    );
  }
  assert.equal(capture.termination.exitCode, 64);
  assert.deepEqual(capture.termination.issues, [
    {
      code: "conditionalConstraintViolation",
      branch: "onMatch",
      conditions: [{ kind: "present", field: "domain", present: true }],
      missingRequiredFields: ["email"],
      presentForbiddenFields: [],
    },
  ]);
  assert.equal(capture.stdout, "");
});

void test("a valid email and matching domain complete after satisfying the conditional branch", async () => {
  const capture = await runCliScenario({
    cliContract: cli,
    argv: [
      "validate",
      "--email",
      "alice@example.com",
      "--domain",
      "EXAMPLE.COM",
    ],
    dependencies,
  });
  assert.equal(capture.termination.exitCode, 0);
  assert.equal(capture.stdout, "");
  assert.equal(capture.stderr, "");
});

for (const [command, scenarios] of Object.entries(failures)) {
  for (const [failure, scenario] of Object.entries(scenarios)) {
    void test(`${command} ${failure} failure scenario`, async () => {
      const capture = await runCliScenario({ cliContract: cli, ...scenario });
      assert.equal(capture.termination.exitCode, 1);
      assert.equal(capture.stdout, "");
      if (command === "lookup") {
        assert.deepEqual(JSON.parse(capture.stderr), {
          schemaVersion: "3",
          command: "lookup",
          outputMode: "structured",
          kind: "failure",
          variant: "notFound",
          data: { id: "bob" },
        });
        return;
      }
      assert.equal(
        capture.stderr,
        "Email alice@elsewhere.com does not belong to domain example.com\n",
      );
    });
  }
}
