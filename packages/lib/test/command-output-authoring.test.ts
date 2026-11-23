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
} from "@ykdz/cli-contract";
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
                  found: (user) => text.lines([user.id, user.name]),
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
    invocation: parseCliInvocation(cli, ["--id", "ada", "--output", "detail"]),
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

  const summary = queryCliContract(cli, []);
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
  const summary = queryCliContract(first, ["inspect"]);
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
