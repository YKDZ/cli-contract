import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  helpCapability,
  text,
  type AtomicExecutionDefinition,
  type OutputExecutionFactory,
} from "@boringparts/cli-contract";
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
            "extra",
          ],
        },
      ]);
      return true;
    },
  );
});

void test("reads a dynamic presentation table once for the checks and the expansion", () => {
  let reads = 0;
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
                  found: {
                    description: "Result",
                    schema: z.object({}),
                    exitCode: 0,
                  },
                },
              },
              failures: {},
              handler: ({ outcome }) => outcome.data.found({}),
            }).text({
              description: "Result",
              get success() {
                reads++;
                const presenters = { found: () => text.line("Found") };
                if (reads > 1) {
                  Reflect.set(presenters, "extra", () => text.line("Extra"));
                }
                return presenters;
              },
              failures: {},
            }),
          },
        }),
      },
    },
  });
  assert.equal(reads, 1);
  assert.equal(contract.manifest.root, "probe");
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

void test("rejects a malformed own __proto__ variant name in a text data mode", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const variants = {
                found: {
                  description: "Result",
                  schema: z.object({}),
                  exitCode: 0,
                },
              };
              const presenters = { found: () => text.line("Found") };
              Object.defineProperty(variants, "__proto__", {
                value: {
                  description: "Result",
                  schema: z.object({}),
                  exitCode: 0,
                },
                enumerable: true,
              });
              Object.defineProperty(presenters, "__proto__", {
                value: () => text.line("Found"),
                enumerable: true,
              });
              return {
                modes: {
                  only: atomic({
                    success: { kind: "data", variants },
                    failures: {},
                    handler: ({ outcome }) => outcome.data.found({}),
                  }).text({
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
          code: "invalidVariantName",
          command: "probe",
          location: "data",
          variant: "__proto__",
        },
      ]);
      return true;
    },
  );
});

void test("rejects a malformed own __proto__ failure name in a text completion mode", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const failures = {};
              const presenters = {};
              Object.defineProperty(failures, "__proto__", {
                value: {
                  description: "Denied",
                  schema: z.object({}),
                  exitCode: 1,
                },
                enumerable: true,
              });
              Object.defineProperty(presenters, "__proto__", {
                value: () => text.line("Denied"),
                enumerable: true,
              });
              return {
                modes: {
                  only: atomic({
                    success: { kind: "completion" },
                    failures,
                    handler: ({ outcome }) => outcome.completion(),
                  }).text({
                    description: "Result",
                    success: () => text.silent,
                    failures: presenters,
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
          code: "invalidVariantName",
          command: "probe",
          location: "failure",
          variant: "__proto__",
        },
      ]);
      return true;
    },
  );
});

void test("rejects an extra text key set to undefined on a structured execution variant", () => {
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
              Reflect.set(found, "text", undefined);
              return {
                modes: {
                  only: atomic({
                    success: { kind: "data", variants: { found } },
                    failures: {},
                    handler: ({ outcome }) => outcome.data.found({}),
                  }).structured({ description: "Result" }),
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
          code: "unexpectedTextPresenter",
          command: "probe",
          location: "data",
          variant: "found",
        },
      ]);
      return true;
    },
  );
});

void test("rejects a data success without a variants table", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const success = {
                kind: "data" as const,
                variants: {
                  found: { description: "Result", schema: input, exitCode: 0 },
                },
              };
              Reflect.deleteProperty(success, "variants");
              return {
                modes: {
                  only: atomic({
                    success,
                    failures: {},
                    handler: ({ outcome }) => outcome.data.found({}),
                  }).structured({ description: "Result" }),
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
          code: "invalidResultDefinition",
          command: "probe",
          mode: "only",
          location: "data",
          reason: "missingTable",
        },
      ]);
      return true;
    },
  );
});

void test("rejects a stream without a records table", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ stream }) => {
              const declaration = {
                records: {
                  entry: { description: "Record", schema: input },
                },
                failures: {},
              };
              Reflect.deleteProperty(declaration, "records");
              return {
                modes: {
                  only: stream({
                    ...declaration,
                    handler: async function* ({ outcome }) {
                      yield outcome.record.entry({});
                      return outcome.streamSuccess();
                    },
                  }).structured({
                    description: "Result",
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
          code: "invalidResultDefinition",
          command: "probe",
          mode: "only",
          location: "record",
          reason: "missingTable",
        },
      ]);
      return true;
    },
  );
});

void test("rejects a null data variant entry", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const variants = {
                ok: { description: "Result", schema: input, exitCode: 0 },
              };
              Reflect.set(variants, "ok", null);
              return {
                modes: {
                  only: atomic({
                    success: { kind: "data", variants },
                    failures: {},
                    handler: ({ outcome }) => outcome.data.ok({}),
                  }).structured({ description: "Result" }),
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
          code: "invalidResultDefinition",
          command: "probe",
          mode: "only",
          location: "data",
          variant: "ok",
          reason: "invalidEntry",
        },
      ]);
      return true;
    },
  );
});

void test("rejects a null failure entry", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const failures = {
                denied: { description: "Denied", schema: input, exitCode: 2 },
              };
              Reflect.set(failures, "denied", null);
              return {
                modes: {
                  only: atomic({
                    success: { kind: "completion" },
                    failures,
                    handler: ({ outcome }) => outcome.completion(),
                  }).structured({ description: "Result" }),
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
          code: "invalidResultDefinition",
          command: "probe",
          mode: "only",
          location: "failure",
          variant: "denied",
          reason: "invalidEntry",
        },
      ]);
      return true;
    },
  );
});

void test("rejects a null stream record entry", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ stream }) => {
              const records = {
                entry: { description: "Record", schema: input },
              };
              Reflect.set(records, "entry", null);
              return {
                modes: {
                  only: stream({
                    records,
                    failures: {},
                    handler: async function* ({ outcome }) {
                      yield outcome.record.entry({});
                      return outcome.streamSuccess();
                    },
                  }).structured({ description: "Result" }),
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
          code: "invalidResultDefinition",
          command: "probe",
          mode: "only",
          location: "record",
          variant: "entry",
          reason: "invalidEntry",
        },
      ]);
      return true;
    },
  );
});

void test("rejects an explicit non-object failures presenter table", () => {
  assert.throws(
    () =>
      defineCli()({
        ...cli,
        commands: {
          probe: {
            ...probe,
            outputs: ({ atomic }) => {
              const options = {
                description: "Result",
                success: () => text.silent,
                failures: {},
              };
              Reflect.set(options, "failures", 42);
              return {
                modes: {
                  only: atomic({
                    success: { kind: "completion" },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  }).text(options),
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
          code: "invalidPresenterTable",
          path: ["commands", "probe", "outputs", "modes", "only", "failures"],
        },
      ]);
      return true;
    },
  );
});

void test("accepts an omitted failures presenter table for an empty failure set", () => {
  const contract = defineCli()({
    ...cli,
    commands: {
      probe: {
        ...probe,
        outputs: ({ atomic }) => {
          const options = {
            description: "Result",
            success: () => text.silent,
            failures: {},
          };
          Reflect.deleteProperty(options, "failures");
          return {
            modes: {
              only: atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              }).text(options),
            },
          };
        },
      },
    },
  });
  assert.equal(contract.manifest.root, "probe");
});

void test("rejects extra own presenter keys without reading unknown getters", () => {
  const extra = Symbol("extra");
  const cases: ReadonlyArray<
    Readonly<{ key: string; define: (presenters: object) => void }>
  > = [
    {
      key: "extra",
      define: (presenters) =>
        Object.defineProperty(presenters, "extra", {
          value: () => text.line("Extra"),
          enumerable: false,
        }),
    },
    {
      key: String(extra),
      define: (presenters) =>
        Object.defineProperty(presenters, extra, {
          value: () => text.line("Extra"),
          enumerable: true,
        }),
    },
    {
      key: "extra",
      define: (presenters) =>
        Object.defineProperty(presenters, "extra", {
          get: () => assert.fail("The unknown presenter must not be read"),
          enumerable: true,
        }),
    },
  ];
  for (const { key, define } of cases) {
    assert.throws(
      () =>
        defineCli()({
          ...cli,
          commands: {
            probe: {
              ...probe,
              outputs: ({ atomic }) => {
                const presenters = { denied: () => text.line("Denied") };
                define(presenters);
                return {
                  modes: {
                    only: atomic({
                      success: { kind: "completion" },
                      failures: {
                        denied: {
                          description: "Denied",
                          schema: input,
                          exitCode: 3,
                        },
                      },
                      handler: ({ outcome }) => outcome.completion(),
                    }).text({
                      description: "Only",
                      success: () => text.silent,
                      failures: presenters,
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
              "failures",
              key,
            ],
          },
        ]);
        return true;
      },
    );
  }
});

void test("rejects extra own keys on the outer authoring records without reading unknown getters", () => {
  const extra = Symbol("unexpected");
  const cases: ReadonlyArray<
    Readonly<{ key: string; define: (record: object) => void }>
  > = [
    {
      key: "unexpected",
      define: (record) =>
        Object.defineProperty(record, "unexpected", {
          value: true,
          enumerable: false,
        }),
    },
    {
      key: String(extra),
      define: (record) =>
        Object.defineProperty(record, extra, { value: true, enumerable: true }),
    },
    {
      key: "unexpected",
      define: (record) =>
        Object.defineProperty(record, "unexpected", {
          get: () =>
            assert.fail("The unknown authoring property must not be read"),
          enumerable: false,
        }),
    },
  ];
  const expectUnknown =
    (path: readonly string[]) =>
    (error: unknown): boolean => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "unknownDefinitionProperty", path },
      ]);
      return true;
    };
  const modePath = ["commands", "probe", "outputs", "modes", "only"];
  for (const { key, define } of cases) {
    assert.throws(
      () =>
        defineCli()({
          ...cli,
          commands: {
            probe: {
              ...probe,
              outputs: ({ atomic }) => {
                const declaration: AtomicExecutionDefinition<
                  "probe",
                  undefined,
                  typeof input,
                  { kind: "completion" },
                  {}
                > = {
                  success: { kind: "completion" },
                  failures: {},
                  handler: ({ outcome }) => outcome.completion(),
                };
                define(declaration);
                return {
                  modes: {
                    only: atomic(declaration).text({
                      description: "Only",
                      success: () => text.silent,
                      failures: {},
                    }),
                  },
                };
              },
            },
          },
        }),
      expectUnknown([...modePath, key]),
    );
    assert.throws(
      () =>
        defineCli()({
          ...cli,
          commands: {
            probe: {
              ...probe,
              outputs: ({ atomic }) => {
                const options = {
                  description: "Only",
                  success: () => text.silent,
                  failures: {},
                };
                define(options);
                return {
                  modes: {
                    only: atomic({
                      success: { kind: "completion" },
                      failures: {},
                      handler: ({ outcome }) => outcome.completion(),
                    }).text(options),
                  },
                };
              },
            },
          },
        }),
      expectUnknown([...modePath, key]),
    );
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
                    }).structured({ description: "Only" }),
                  },
                };
                define(table);
                return table;
              },
            },
          },
        }),
      expectUnknown(["commands", "probe", "outputs", key]),
    );
  }
});

void test("validates execution declaration keys once at capture time", () => {
  type CompletionDeclaration = AtomicExecutionDefinition<
    "probe",
    undefined,
    typeof input,
    { kind: "completion" },
    {}
  >;
  for (const enumerable of [false, true]) {
    assert.throws(
      () =>
        defineCli()({
          ...cli,
          commands: {
            probe: {
              ...probe,
              outputs: ({ atomic }) => {
                const declaration: CompletionDeclaration = {
                  success: { kind: "completion" },
                  failures: {},
                  handler: ({ outcome }) => outcome.completion(),
                };
                Object.defineProperty(declaration, "unexpected", {
                  configurable: true,
                  enumerable,
                  get: () =>
                    assert.fail(
                      "The unknown declaration property must not be read",
                    ),
                });
                const execution = atomic(declaration);
                Reflect.deleteProperty(declaration, "unexpected");
                return {
                  modes: {
                    only: execution.structured({ description: "Only" }),
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
              "unexpected",
            ],
          },
        ]);
        return true;
      },
    );
  }
  assert.doesNotThrow(() =>
    defineCli()({
      ...cli,
      commands: {
        probe: {
          ...probe,
          outputs: ({ atomic }) => {
            const declaration: CompletionDeclaration = {
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => outcome.completion(),
            };
            const execution = atomic(declaration);
            const first = execution.structured({ description: "First" });
            Object.defineProperty(declaration, "unexpected", {
              get: () =>
                assert.fail("A property added after capture must not be read"),
            });
            const second = execution.structured({ description: "Second" });
            return { default: "first", modes: { first, second } };
          },
        },
      },
    }),
  );
});

void test("a mode issued for another command or input reports mismatchedBinding", () => {
  const define = defineCli();
  let issued: unknown;
  define({
    ...cli,
    commands: {
      probe: {
        ...probe,
        outputs: ({ atomic }) => {
          const mode = atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }).structured({ description: "Result" });
          issued = mode;
          return { modes: { only: mode } };
        },
      },
    },
  });
  for (const target of [
    { ...probe, name: "other" },
    { ...probe, input: z.object({}) },
  ]) {
    assert.throws(
      () =>
        Reflect.apply(define, undefined, [
          {
            ...cli,
            root: target.name,
            commands: {
              [target.name]: {
                ...target,
                outputs: () => ({ modes: { only: issued } }),
              },
            },
          },
        ]),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "invalidOutputMode",
            command: target.name,
            mode: "only",
            reason: "mismatchedBinding",
          },
        ]);
        return true;
      },
    );
  }
});

void test("a mode object that no execution issued reports invalidSuccess", () => {
  assert.throws(
    () =>
      Reflect.apply(defineCli(), undefined, [
        {
          ...cli,
          commands: {
            probe: {
              ...probe,
              outputs: () => ({
                modes: {
                  only: {
                    delivery: "atomic",
                    description: "Result",
                    format: "structured",
                    success: { kind: "completion" },
                    failures: {},
                    handler: () => undefined,
                  },
                },
              }),
            },
          },
        },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidOutputMode",
          command: "probe",
          mode: "only",
          reason: "invalidSuccess",
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
