import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  parseCliInvocation,
  queryCliContract,
  schemaCapability,
  text,
  type AtomicTextPresenter,
  type CompletionFact,
} from "@boringparts/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

const userProfileSchema = z.object({ id: z.string(), name: z.string() });
const userInputSchema = z
  .object({ id: z.string().min(1) })
  .transform(({ id }) => ({ id: id.toLowerCase() }))
  .pipe(z.object({ id: z.string() }));

type Profile = Readonly<{ id: string; name: string }>;

const profiles: Readonly<Record<string, Profile>> = {
  ada: { id: "ada", name: "Ada Lovelace" },
};

function lookupUser(id: string): Profile | undefined {
  return profiles[id];
}

const userFailures = {
  notFound: {
    description: "No user matches the requested id",
    schema: z.object({ id: z.string() }),
    exitCode: 3,
  },
} as const;

const failureText = {
  notFound: ({ id }: Readonly<{ id: string }>) => text.line(`missing ${id}`),
} as const;

function createRootCli() {
  return defineCli()({
    root: "user",
    help: englishHelpCapability(),
    schema: schemaCapability({
      description: text.line("Read the CLI contract"),
    }),
    usageFailureExitCode: 64,
    commands: {
      user: {
        kind: "rootCommand",
        name: "user",
        description: "Read a user profile",
        fields: {
          id: {
            kind: "valueOption",
            longOption: "--id",
            description: "User id",
          },
        },
        input: userInputSchema,
        outputs: ({ atomic }) => {
          const lookup = atomic({
            success: {
              kind: "data",
              variants: {
                found: {
                  description: "The matching user profile",
                  schema: userProfileSchema,
                  exitCode: 0,
                },
              },
            },
            failures: userFailures,
            handler: ({ input, outcome }) => {
              const profile = lookupUser(input.id);
              return profile === undefined
                ? outcome.failure.notFound({ id: input.id })
                : outcome.data.found(profile);
            },
          });
          return {
            default: "short",
            modes: {
              short: lookup.text({
                description: "Show the user's name",
                success: { found: (user) => text.line(user.name) },
                failures: failureText,
              }),
              detail: lookup.text({
                description: "Show the user's ID and name",
                success: {
                  found: (user, { input }) => text.lines([input.id, user.name]),
                },
                failures: failureText,
              }),
              json: lookup.structured({
                description: "Return the user profile as JSON",
              }),
            },
          };
        },
      },
    },
  });
}

void test("executable root command shares one execution across two text modes and one structured mode", async () => {
  const cli = createRootCli();

  assert.deepEqual(cli.grammar.root.outputs, {
    selector: "--output",
    default: "short",
    modes: {
      short: {
        description: "Show the user's name",
        delivery: "atomic",
        format: "text",
      },
      detail: {
        description: "Show the user's ID and name",
        delivery: "atomic",
        format: "text",
      },
      json: {
        description: "Return the user profile as JSON",
        delivery: "atomic",
        format: "structured",
      },
    },
  });

  const shortWrites: string[] = [];
  const shortTermination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--id", "ADA"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      shortWrites.push(chunk);
    },
  });
  assert.deepEqual(shortWrites, ["Ada Lovelace\n"]);
  assert.equal(shortTermination.kind, "applicationResult");
  assert.equal(shortTermination.exitCode, 0);

  const detailWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--id", "ADA", "--output", "detail"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      detailWrites.push(chunk);
    },
  });
  assert.deepEqual(detailWrites, ["ada\nAda Lovelace\n"]);

  const jsonWrites: string[] = [];
  const jsonTermination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--id", "ada", "--output", "json"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      jsonWrites.push(chunk);
    },
  });
  assert.deepEqual(jsonWrites, [
    '{"schemaVersion":"3","command":"user","outputMode":"json","kind":"data","variant":"found","data":{"id":"ada","name":"Ada Lovelace"}}\n',
  ]);
  assert.deepEqual(jsonTermination, {
    kind: "applicationResult",
    command: "user",
    outputMode: "json",
    result: {
      kind: "data",
      command: "user",
      variant: "found",
      data: { id: "ada", name: "Ada Lovelace" },
    },
    exitCode: 0,
  });

  const summary = queryCliContract(cli, { path: [] });
  assert.equal(summary.kind, "summary");
  if (summary.kind !== "summary") return;
  assert.deepEqual(summary.outputs, {
    default: "short",
    modes: {
      short: {
        description: "Show the user's name",
        delivery: "atomic",
        format: "text",
      },
      detail: {
        description: "Show the user's ID and name",
        delivery: "atomic",
        format: "text",
      },
      json: {
        description: "Return the user profile as JSON",
        delivery: "atomic",
        format: "structured",
      },
    },
  });
});

void test("QA text filters use each invocation's input while the complete report determines its exit code", async () => {
  const reportSchema = z.object({
    checks: z.record(z.string(), z.array(z.string())),
  });
  const inputSchema = z.object({
    severity: z.enum(["warning", "error"]).optional(),
    maxPerCheck: z
      .string()
      .default("10")
      .transform(Number)
      .pipe(z.number().int().positive()),
  });
  const present: AtomicTextPresenter<
    z.output<typeof reportSchema>,
    z.output<typeof inputSchema>
  > = ({ checks }, { input }) => {
    const rows = Object.entries(checks).flatMap(([check, diagnostics]) =>
      diagnostics
        .filter((severity) => !input.severity || severity === input.severity)
        .slice(0, input.maxPerCheck)
        .map((severity) => `${check}: ${severity}`),
    );
    return text.line(rows.join(", ") || "No matching diagnostics");
  };
  const cli = defineCli<{ runQa: () => z.output<typeof reportSchema> }>()({
    root: "qa",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      qa: {
        kind: "rootCommand",
        name: "qa",
        description: "Check a project",
        fields: {
          severity: {
            kind: "valueOption",
            longOption: "--severity",
            description: "Severity to show",
          },
          maxPerCheck: {
            kind: "valueOption",
            longOption: "--max-per-check",
            description: "Visible diagnostics per check",
          },
        },
        input: inputSchema,
        outputs: ({ atomic }) => {
          const qa = atomic({
            success: {
              kind: "data",
              variants: {
                passed: {
                  description: "All checks passed",
                  schema: reportSchema,
                  exitCode: 0,
                },
              },
            },
            failures: {
              rejected: {
                description: "A check reported errors",
                schema: reportSchema,
                exitCode: 1,
              },
            },
            handler({ dependencies, outcome }) {
              const result = dependencies.runQa();
              return Object.values(result.checks).some((rows) =>
                rows.includes("error"),
              )
                ? outcome.failure.rejected(result)
                : outcome.data.passed(result);
            },
          });
          return {
            default: "text",
            modes: {
              structured: qa.structured({ description: "Complete QA report" }),
              text: qa.text({
                description: "Show selected diagnostics",
                success: { passed: present },
                failures: { rejected: present },
              }),
            },
          };
        },
      },
    },
  });
  const filter = ["--severity", "warning", "--max-per-check", "1"];
  const failed = {
    checks: { imports: ["error", "warning", "warning"], types: ["warning"] },
  };
  const passed = { checks: { imports: ["warning", "warning"] } };
  await Promise.all(
    [
      {
        argv: [],
        report: failed,
        code: 1,
        visible:
          "imports: error, imports: warning, imports: warning, types: warning",
      },
      {
        argv: filter,
        report: failed,
        code: 1,
        visible: "imports: warning, types: warning",
      },
      { argv: [...filter, "--output", "structured"], report: failed, code: 1 },
      { argv: filter, report: passed, code: 0, visible: "imports: warning" },
      { argv: [...filter, "--output", "structured"], report: passed, code: 0 },
    ].map(async (scenario) => {
      let runs = 0;
      const chunks: string[] = [];
      const termination = await executeCli(cli, {
        invocation: parseCliInvocation(cli, scenario.argv),
        dependencies: {
          runQa() {
            runs++;
            return scenario.report;
          },
        },
        write: ({ chunk }) => {
          chunks.push(chunk);
        },
      });
      assert.equal(runs, 1);
      assert.equal(termination.exitCode, scenario.code);
      assert.equal(termination.kind, "applicationResult");
      const kind = scenario.code === 0 ? "data" : "failure";
      const variant = scenario.code === 0 ? "passed" : "rejected";
      assert.deepEqual(termination.result, {
        kind,
        command: "qa",
        variant,
        data: scenario.report,
      });
      const expected =
        scenario.visible ??
        JSON.stringify({
          schemaVersion: "3",
          command: "qa",
          outputMode: "structured",
          kind,
          variant,
          data: scenario.report,
        });
      assert.deepEqual(chunks, [`${expected}\n`]);
    }),
  );
});

void test("shared execution reports its declared failure through every text mode", async () => {
  const cli = createRootCli();

  for (const [mode, expected] of [
    ["short", "missing grace\n"],
    ["detail", "missing grace\n"],
  ] as const) {
    const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
    const termination = await executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--id", "grace", "--output", mode]),
      dependencies: undefined,
      write: (output) => {
        writes.push(output);
      },
    });
    assert.deepEqual(writes, [{ destination: "stderr", chunk: expected }]);
    assert.equal(termination.kind, "applicationResult");
    assert.equal(termination.exitCode, 3);
  }
});

void test("a leaf binds shared and independent executions when its command is constructed", async () => {
  const define = defineCli<Readonly<{ source: string }>>();
  let constructions = 0;
  const selected: string[] = [];
  const leaf = define.command("inspect")({
    kind: "command",
    parent: "users",
    name: "inspect",
    description: "Inspect a user",
    input: userInputSchema,
    fields: { id: { kind: "positional", description: "User ID" } },
    outputs: ({ atomic, stream }) => {
      constructions++;
      const lookup = atomic({
        success: {
          kind: "data",
          variants: {
            found: {
              description: "User profile",
              schema: userProfileSchema,
              exitCode: 0,
            },
          },
        },
        failures: userFailures,
        handler: ({ input, dependencies, outcome }) => {
          selected.push(dependencies.source);
          const profile = lookupUser(input.id);
          return profile === undefined
            ? outcome.failure.notFound({ id: input.id })
            : outcome.data.found(profile);
        },
      });
      const events = stream({
        records: { seen: { description: "Observed user", schema: z.string() } },
        failures: {},
        async *handler({ input, dependencies, outcome }) {
          selected.push(dependencies.source);
          yield outcome.record.seen(input.id);
          return outcome.streamSuccess();
        },
      });
      return {
        default: "name",
        modes: {
          name: lookup.text({
            description: "Show the name",
            success: { found: (user) => text.line(user.name) },
            failures: failureText,
          }),
          json: lookup.structured({ description: "Return the profile" }),
          events: events.structured({ description: "Stream observed users" }),
        },
      };
    },
  });
  assert.equal(constructions, 1);
  const directory = {
    root: "users",
    help: englishHelpCapability(),
    schema: schemaCapability({ description: text.line("Read the contract") }),
    usageFailureExitCode: 64,
    commands: {
      users: { kind: "rootGroup", name: "users", description: "Manage users" },
      ...leaf,
    },
  } as const;
  const first = define(directory);
  const second = define(directory);
  const summary = queryCliContract(first, { path: ["inspect"] });
  assert.equal(summary.kind, "summary");
  if (summary.kind !== "summary") return;
  assert.equal(summary.outputs.default, "name");
  assert.deepEqual(Object.keys(summary.outputs.modes), [
    "name",
    "json",
    "events",
  ]);
  const names: string[] = [];
  await executeCli(first, {
    invocation: parseCliInvocation(first, ["inspect", "ADA"]),
    dependencies: { source: "query" },
    write: ({ chunk }) => {
      names.push(chunk);
    },
  });
  assert.deepEqual(names, ["Ada Lovelace\n"]);
  const frames: string[] = [];
  const terminal = await executeCli(second, {
    invocation: parseCliInvocation(second, [
      "inspect",
      "ADA",
      "--output",
      "events",
    ]),
    dependencies: { source: "stream" },
    write: ({ chunk }) => {
      frames.push(chunk);
    },
  });
  assert.deepEqual(frames, [
    '{"schemaVersion":"3","command":"inspect","outputMode":"events","kind":"stream"}\n',
    '{"kind":"record","variant":"seen","data":"ada"}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
  assert.equal(terminal.kind, "applicationResult");
  assert.equal(terminal.exitCode, 0);
  assert.deepEqual(selected, ["query", "stream"]);
  assert.equal(constructions, 1);
});

void test("another command construction rejects a bound leaf output table with the same name and schema", () => {
  const define = defineCli();
  const command = define.command("inspect");
  const node = {
    kind: "command",
    name: "inspect",
    parent: "users",
    description: "Inspect",
    input: z.object({}),
  } as const;
  const first = command({
    ...node,
    outputs: ({ atomic }) => ({
      modes: {
        json: atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        }).structured({ description: "Return JSON" }),
      },
    }),
  });
  const stale = first.inspect.outputs;
  for (const compile of [
    () => Reflect.apply(command, undefined, [first.inspect]),
    () => Reflect.apply(command, undefined, [{ ...node, outputs: stale }]),
    () =>
      Reflect.apply(define, undefined, [
        {
          root: "inspect",
          help: englishHelpCapability(),
          usageFailureExitCode: 64,
          commands: {
            inspect: {
              kind: "rootCommand",
              name: "inspect",
              description: "Inspect",
              input: node.input,
              outputs: stale,
            },
          },
        },
      ]),
  ]) {
    assert.throws(compile, (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.code === "invalidOutputModes" && issue.command === "inspect",
        ),
      );
      return true;
    });
  }
});

void test("a shared execution keeps the handler declared before its first derivation", async () => {
  const calls: string[] = [];
  type ProbeCompletion = Readonly<{
    outcome: Readonly<{ completion: () => CompletionFact<"probe"> }>;
  }>;
  const cli = defineCli()({
    root: "probe",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      probe: {
        kind: "rootCommand",
        name: "probe",
        description: "Complete a shared execution",
        input: z.object({}),
        outputs: ({ atomic }) => {
          const declaration: {
            success: { kind: "completion" };
            failures: {};
            handler: (context: ProbeCompletion) => CompletionFact<"probe">;
          } = {
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => {
              calls.push("declared");
              return outcome.completion();
            },
          };
          const execution = atomic(declaration);
          const plain = execution.text({
            description: "Complete silently",
            success: ({ input }) => {
              assert.deepEqual(input, {});
              return text.silent;
            },
            failures: {},
          });
          declaration.handler = ({ outcome }) => {
            calls.push("replaced");
            return outcome.completion();
          };
          const json = execution.structured({
            description: "Complete as JSON",
          });
          return { default: "plain", modes: { plain, json } };
        },
      },
    },
  });
  for (const mode of ["plain", "json"] as const) {
    const termination = await executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--output", mode]),
      dependencies: undefined,
      write: () => undefined,
    });
    assert.equal(termination.kind, "applicationResult");
    assert.equal(termination.exitCode, 0);
  }
  assert.deepEqual(calls, ["declared", "declared"]);
});

void test("a shared execution keeps the result contract declared before its first derivation", async () => {
  const cli = defineCli()({
    root: "probe",
    help: englishHelpCapability(),
    schema: schemaCapability({ description: text.line("Read the contract") }),
    usageFailureExitCode: 64,
    commands: {
      probe: {
        kind: "rootCommand",
        name: "probe",
        description: "Read a user profile",
        input: z.object({}),
        outputs: ({ atomic }) => {
          const found = {
            description: "The matching user profile",
            schema: userProfileSchema,
            exitCode: 0,
          };
          const execution = atomic({
            success: { kind: "data", variants: { found } },
            failures: {},
            handler: ({ outcome }) =>
              outcome.data.found({ id: "ada", name: "Ada Lovelace" }),
          });
          const short = execution.text({
            description: "Show the user's name",
            success: { found: (user) => text.line(user.name) },
            failures: {},
          });
          found.exitCode = 9;
          const json = execution.structured({
            description: "Return the user profile as JSON",
          });
          return { default: "short", modes: { short, json } };
        },
      },
    },
  });
  assert.equal(Object.isFrozen(userProfileSchema), false);
  for (const mode of ["short", "json"] as const) {
    const query = queryCliContract(cli, {
      path: [],
      target: `success:${mode}`,
    });
    assert.equal(query.kind, "success");
    if (query.kind !== "success") continue;
    assert.equal(query.success.kind, "data");
    if (query.success.kind !== "data") continue;
    assert.equal(query.success.variants.found?.exitCode, 0);
    const termination = await executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--output", mode]),
      dependencies: undefined,
      write: () => undefined,
    });
    assert.equal(termination.kind, "applicationResult");
    assert.equal(termination.exitCode, 0);
  }
});

void test("a shared stream keeps the result contract declared before its first derivation", async () => {
  const cli = defineCli()({
    root: "probe",
    help: englishHelpCapability(),
    schema: schemaCapability({ description: text.line("Read the contract") }),
    usageFailureExitCode: 64,
    commands: {
      probe: {
        kind: "rootCommand",
        name: "probe",
        description: "Read user changes",
        input: z.object({}),
        outputs: ({ stream }) => {
          const closed = {
            description: "The change feed closed early",
            schema: z.string(),
            exitCode: 3,
          };
          const execution = stream({
            records: {
              entry: { description: "One change", schema: z.string() },
            },
            failures: { closed },
            async *handler({ outcome }) {
              yield outcome.record.entry("first");
              return outcome.failure.closed("end");
            },
          });
          const events = execution.text({
            description: "Show changes",
            records: { entry: (value) => text.line(value) },
            failures: { closed: (reason) => text.line(reason) },
            terminal: () => text.silent,
          });
          closed.exitCode = 9;
          const ndjson = execution.structured({
            description: "Stream changes as NDJSON",
          });
          return { default: "events", modes: { events, ndjson } };
        },
      },
    },
  });
  for (const mode of ["events", "ndjson"] as const) {
    const query = queryCliContract(cli, {
      path: [],
      target: `failures:${mode}`,
    });
    assert.equal(query.kind, "failures");
    if (query.kind !== "failures") continue;
    assert.equal(query.failures.closed?.exitCode, 3);
    const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
    const termination = await executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--output", mode]),
      dependencies: undefined,
      write: (output) => {
        writes.push(output);
      },
    });
    assert.equal(termination.kind, "applicationResult");
    assert.equal(termination.exitCode, 3);
    assert.equal(writes[0]?.destination, "stdout");
    assert.equal(writes.at(-1)?.destination, "stderr");
  }
});

void test("a shared execution solidifies the result snapshot exposed by structured", async () => {
  const cli = defineCli()({
    root: "probe",
    help: englishHelpCapability(),
    usageFailureExitCode: 64,
    commands: {
      probe: {
        kind: "rootCommand",
        name: "probe",
        description: "Read a user profile",
        input: z.object({}),
        outputs: ({ atomic }) => {
          const execution = atomic({
            success: {
              kind: "data",
              variants: {
                found: {
                  description: "The matching user profile",
                  schema: userProfileSchema,
                  exitCode: 0,
                },
              },
            },
            failures: {},
            handler: ({ outcome }) =>
              outcome.data.found({ id: "ada", name: "Ada Lovelace" }),
          });
          const brief = execution.text({
            description: "Show the user's name",
            success: { found: (user) => text.line(user.name) },
            failures: {},
          });
          const json = execution.structured({
            description: "Return the user profile as JSON",
          });
          Reflect.set(json.success.variants.found, "exitCode", 9);
          return { default: "brief", modes: { brief, json } };
        },
      },
    },
  });
  for (const mode of ["brief", "json"] as const) {
    const termination = await executeCli(cli, {
      invocation: parseCliInvocation(cli, ["--output", mode]),
      dependencies: undefined,
      write: () => undefined,
    });
    assert.equal(termination.kind, "applicationResult");
    assert.equal(termination.exitCode, 0);
  }
});
