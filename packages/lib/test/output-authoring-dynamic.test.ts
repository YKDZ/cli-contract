import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  helpCapability,
  text,
  type OutputExecutionFactory,
} from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({});
const cli = {
  root: "probe",
  help: helpCapability({
    wording: { choices: "(choices: {choices})", default: "(default: {value})" },
  }),
  usageFailureExitCode: 64,
} as const;
const probe = {
  kind: "rootCommand",
  name: "probe",
  description: "Probe definition-time checks",
  input,
} as const;

void test("accepts a single structured completion mode from the outputs callback", () => {
  const contract = defineCli()({
    ...cli,
    commands: {
      probe: {
        ...probe,
        outputs: ({ atomic }) => ({
          modes: {
            only: atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            }).structured({ description: "Result" }),
          },
        }),
      },
    },
  });
  assert.equal(contract.manifest.root, "probe");
});

void test("accepts an own presenter for a variant named constructor", () => {
  const contract = defineCli()({
    ...cli,
    commands: {
      probe: {
        ...probe,
        outputs: ({ atomic }) => ({
          modes: {
            only: atomic({
              success: {
                kind: "data",
                variants: {
                  constructor: {
                    description: "Result",
                    schema: z.object({}),
                    exitCode: 0,
                  },
                },
              },
              failures: {},
              handler: ({ outcome }) => outcome.data.constructor({}),
            }).text({
              description: "Result",
              success: { constructor: () => text.line("Found") },
              failures: {},
            }),
          },
        }),
      },
    },
  });
  assert.equal(contract.manifest.root, "probe");
});

void test("rejects an extra key on the callback return table", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const table = {
                modes: {
                  only: atomic({
                    success: { kind: "completion" },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  }).structured({ description: "Result" }),
                },
              };
              Reflect.set(table, "unexpected", true);
              return table;
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: ["commands", "probe", "outputs", "unexpected"],
        },
      ]);
      return true;
    },
  );
});

void test("rejects an inherited constructor presenter", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const execution = atomic({
                success: {
                  kind: "data",
                  variants: {
                    constructor: {
                      description: "Result",
                      schema: z.object({}),
                      exitCode: 0,
                    },
                  },
                },
                failures: {},
                handler: ({ outcome }) => outcome.data.constructor({}),
              });
              const presenters = { constructor: () => text.line("Found") };
              Reflect.deleteProperty(presenters, "constructor");
              return {
                modes: {
                  only: execution.text({
                    description: "Result",
                    success: presenters,
                    failures: {},
                  }),
                },
              };
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingTextPresenter",
          command: "probe",
          location: "data",
          variant: "constructor",
        },
      ]);
      return true;
    },
  );
});

void test("rejects an extra presenter deleted after the text call", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const execution = atomic({
                success: {
                  kind: "data",
                  variants: {
                    found: {
                      description: "Result",
                      schema: z.object({}),
                      exitCode: 0,
                    },
                  },
                },
                failures: {},
                handler: ({ outcome }) => outcome.data.found({}),
              });
              const presenters = { found: () => text.line("Found") };
              Reflect.set(presenters, "extra", () => text.line("Extra"));
              const mode = execution.text({
                description: "Result",
                success: presenters,
                failures: {},
              });
              Reflect.deleteProperty(presenters, "extra");
              return { modes: { only: mode } };
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: [
            "commands",
            "probe",
            "outputs",
            "modes",
            "only",
            "success",
            "variants",
            "extra",
          ],
        },
      ]);
      return true;
    },
  );
});

void test("rejects an extra presenter on stream records deleted after the text call", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ stream }) => {
              const execution = stream({
                records: {
                  found: { description: "Record", schema: z.object({}) },
                },
                failures: {},
                handler: async function* ({ outcome }) {
                  yield outcome.record.found({});
                  return outcome.streamSuccess();
                },
              });
              const presenters = { found: () => text.line("Found") };
              Reflect.set(presenters, "extra", () => text.line("Extra"));
              const mode = execution.text({
                description: "Result",
                records: presenters,
                failures: {},
                terminal: () => text.silent,
              });
              Reflect.deleteProperty(presenters, "extra");
              return { modes: { only: mode } };
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: [
            "commands",
            "probe",
            "outputs",
            "modes",
            "only",
            "success",
            "records",
            "extra",
          ],
        },
      ]);
      return true;
    },
  );
});

void test("rejects an extra presentation key on a structured mode", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const options = {
                get description(): string {
                  return assert.fail(
                    "The invalid presentation must not be expanded",
                  );
                },
              };
              Reflect.set(options, "unexpected", true);
              return {
                modes: {
                  only: atomic({
                    success: { kind: "completion" },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  }).structured(options),
                },
              };
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: ["commands", "probe", "outputs", "modes", "only", "unexpected"],
        },
      ]);
      return true;
    },
  );
});

void test("rejects a presenter embedded in the original execution variant", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const found = {
                description: "Result",
                schema: z.object({}),
                exitCode: 0,
              };
              Reflect.set(found, "text", () => text.line("Embedded"));
              return {
                modes: {
                  only: atomic({
                    success: { kind: "data", variants: { found } },
                    failures: {},
                    handler: ({ outcome }) => outcome.data.found({}),
                  }).text({
                    description: "Result",
                    success: { found: () => text.line("Found") },
                    failures: {},
                  }),
                },
              };
            },
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: [
            "commands",
            "probe",
            "outputs",
            "modes",
            "only",
            "success",
            "variants",
            "found",
            "text",
          ],
        },
      ]);
      return true;
    },
  );
});

void test("reusing a mode or deriving one from a previous execution preserves its original binding", () => {
  const firstOutputs = ({
    atomic,
  }: OutputExecutionFactory<"probe", undefined, typeof input>) => {
    const completion = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    derive = () =>
      completion.structured({
        description: "Derived from the previous execution",
      });
    const mode = completion.structured({ description: "Initial mode" });
    stale = mode;
    return { modes: { only: mode } };
  };
  let stale: ReturnType<typeof firstOutputs>["modes"]["only"];
  let derive: () => typeof stale;
  defineCli()({
    ...cli,
    commands: { probe: { ...probe, outputs: firstOutputs } },
  });
  for (const reuse of [() => stale, () => derive()]) {
    assert.throws(
      () =>
        defineCli()({
          ...cli,
          commands: {
            probe: { ...probe, outputs: () => ({ modes: { only: reuse() } }) },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.ok(
          error.issues.some(
            (issue) =>
              issue.code === "invalidOutputMode" &&
              issue.reason === "mismatchedBinding",
          ),
        );
        return true;
      },
    );
  }
});
