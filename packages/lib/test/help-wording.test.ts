import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  text,
  type HelpCapabilityDefinition,
  type OutputExecutionFactory,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpWording } from "./english-help.ts";

void test("help fact templates express choices and defaults while preserving the schema values", async () => {
  const sharedInput0 = z.object({
    mode: z.enum(["safe", "force"]).default("safe"),
  });
  const cli = defineCli()({
    root: "choose",
    help: helpCapability({
      wording: {
        choices: "（可选：{choices}）",
        default: "（预设：{value}）",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "choose",
        description: "选择模式",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input: sharedInput0,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(
    writes.join(""),
    /\[--mode <mode>\] （可选："safe", "force"） （预设："safe"）/,
  );
});

void test("unknown slots in extracted help facts report a closed definition issue", () => {
  const definition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"choises":"候选 {choices}","defalt":"默认 {value}"}}',
  );

  assert.throws(
    () => helpCapability(definition),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "choises"],
        },
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "defalt"],
        },
      ]);
      return true;
    },
  );
});

void test("unknown slots and known template issues in help wording aggregate in the same pass", () => {
  assert.throws(
    () =>
      helpCapability({
        wording: {
          choises: "候选 {choices}",
          choices: "候选 {choises}",
        } as never,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "choises"],
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "候选 {choises}",
          reason: "placeholder",
        },
      ]);
      return true;
    },
  );
});

void test("known-only template errors still aggregate with leaf constraint issues at root assembly", () => {
  const helpDefinition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"choices":"候选 {choises}","default":"默认 {value}"}}',
  );
  const sharedInput1 = z.object({ mode: z.enum(["safe", "force"]).optional() });
  const definition = {
    root: "choose",
    help: helpCapability(helpDefinition),

    usageFailureExitCode: 64,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "choose",
        description: "选择模式",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input: sharedInput1,
        usageConstraints: [
          {
            kind: "forbiddenCombination",
            all: [{ kind: "present", field: "missing" }],
          },
        ],

        outputs: (
          mode: OutputExecutionFactory<
            "choose",
            undefined,
            typeof sharedInput1
          >,
        ) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler() {
                  return undefined as never;
                },
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic closed negative case verifies root-level issues still aggregate with leaf constraint issues.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "候选 {choises}",
          reason: "placeholder",
        },
        {
          code: "unknownUsageConstraintField",
          command: "choose",
          constraint: "forbiddenCombination",
          index: 0,
          member: "all.field",
          field: "missing",
        },
      ]);
      return true;
    },
  );
});

void test("a declared help fact missing its template reports command and slot at definition time", () => {
  const sharedInput0 = z.object({
    mode: z.enum(["safe", "force"]).default("safe"),
  });
  assert.throws(
    () =>
      defineCli()({
        root: "choose",
        help: helpCapability(),

        usageFailureExitCode: 64,
        commands: {
          choose: {
            kind: "rootCommand",
            name: "choose",
            description: "选择模式",
            fields: {
              mode: {
                kind: "valueOption",
                longOption: "--mode",
                description: "模式",
              },
            },
            input: sharedInput0,
            usageConstraints: [
              {
                kind: "when",
                all: [{ kind: "present", field: "mode" }],
                onMatch: { require: ["mode"] },
              },
              {
                kind: "when",
                all: [{ kind: "present", field: "mode" }],
                otherwise: { forbid: ["mode"] },
              },
              {
                kind: "when",
                all: [{ kind: "equals", field: "mode", value: "force" }],
                onMatch: { require: ["mode"] },
                otherwise: { forbid: ["mode"] },
              },
              {
                kind: "forbiddenCombination",
                all: [
                  { kind: "present", field: "mode" },
                  { kind: "equals", field: "mode", value: "force" },
                ],
              },
            ],

            outputs: (mode) => ({
              default: "structured",
              modes: {
                structured: mode
                  .atomic({
                    success: {
                      kind: "completion",
                    },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  })
                  .structured({
                    description: "结构化输出",
                  }),
              },
            }),
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "missingHelpFactTemplate", command: "choose", slot: "choices" },
        { code: "missingHelpFactTemplate", command: "choose", slot: "default" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "whenOnMatch",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "present" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "require",
        },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "whenOtherwise",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "forbid" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "whenOnMatchOtherwise",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "equals" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "forbiddenCombination",
        },
      ]);
      return true;
    },
  );
});

void test("output-mode choice and default facts missing author templates report at definition time", () => {
  const define = defineCli();
  const input = z.object({});

  assert.throws(
    () =>
      define({
        root: "show",
        help: helpCapability(),
        usageFailureExitCode: 64,
        commands: {
          show: {
            kind: "rootCommand",
            name: "show",
            description: "显示",
            input,
            outputs: (mode) => ({
              default: "json",
              modes: {
                json: mode
                  .atomic({
                    success: {
                      kind: "completion",
                    },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  })
                  .structured({
                    description: "结构化输出",
                  }),
              },
            }),
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "missingHelpFactTemplate", command: "show", slot: "choices" },
        { code: "missingHelpFactTemplate", command: "show", slot: "default" },
      ]);
      return true;
    },
  );
});

void test("empty effect branches do not require their help slots", async () => {
  const sharedInput2 = z.object({ mode: z.string().optional() });
  const cli = defineCli()({
    root: "choose",
    help: helpCapability({
      wording: {
        ...englishHelpWording,
        whenOtherwise: "当并非全部满足 {facts} 时，{otherwise}",
        forbid: "不能提供 {fields}",
        present: "存在 {field}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "choose",
        description: "选择模式",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input: sharedInput2,
        usageConstraints: [
          {
            kind: "when",
            all: [{ kind: "present", field: "mode" }],
            onMatch: {},
            otherwise: { forbid: ["mode"] },
          },
        ],

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(writes.join(""), /当并非全部满足 存在 mode 时，不能提供 mode/);
});

void test("dynamic help fact templates aggregate invalid slots at root assembly", () => {
  const wording: { readonly choices: string; readonly default: string } = {
    choices: "（可选值：{unknown}）",
    default: "默认值\n{value}",
  };
  const sharedInput3 = z.object({ mode: z.enum(["safe", "force"]).optional() });
  assert.throws(
    () =>
      defineCli()({
        root: "choose",
        help: helpCapability({ wording }),

        usageFailureExitCode: 64,
        commands: {
          choose: {
            kind: "rootCommand",
            name: "choose",
            description: "选择模式",
            fields: {
              mode: {
                kind: "valueOption",
                longOption: "--mode",
                description: "模式",
              },
            },
            input: sharedInput3,

            outputs: (mode) => ({
              default: "structured",
              modes: {
                structured: mode
                  .atomic({
                    success: {
                      kind: "completion",
                    },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  })
                  .structured({
                    description: "结构化输出",
                  }),
              },
            }),
          },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "（可选值：{unknown}）",
          reason: "placeholder",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "default"],
          slot: "default",
          received: "默认值\n{value}",
          reason: "singleLine",
        },
      ]);
      return true;
    },
  );
});

void test("help template errors keep the invalid original value and keep aggregating definition issues", () => {
  const helpDefinition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"choices":42,"default":null,"countExactly":{},"whenOnMatch":"满足 {unknown}"}}',
  );
  const sharedInput4 = z.object({});
  const definition = {
    root: "choose",
    help: helpCapability(helpDefinition),

    usageFailureExitCode: 0,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "选择模式",
        description: "选择模式",
        input: sharedInput4,

        outputs: (
          mode: OutputExecutionFactory<
            "choose",
            undefined,
            typeof sharedInput4
          >,
        ) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  };

  assert.throws(
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: 42,
          reason: "singleLine",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "default"],
          slot: "default",
          received: null,
          reason: "singleLine",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "countExactly"],
          slot: "countExactly",
          received: {},
          reason: "singleLine",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "whenOnMatch"],
          slot: "whenOnMatch",
          received: "满足 {unknown}",
          reason: "placeholder",
        },
        {
          code: "invalidUsageFailureExitCode",
          received: 0,
          minimum: 1,
          maximum: 255,
        },
      ]);
      return true;
    },
  );
});

void test("command group placeholders share the same boundary for static and dynamic checks", () => {
  const invalidTemplates = [
    { received: "   ", reason: "empty" },
    { received: "<命令组>", reason: "placeholder" },
  ] as const;

  for (const { received, reason } of invalidTemplates) {
    const wording: {
      readonly commandPlaceholder: string;
      readonly choices: string;
      readonly default: string;
    } = {
      commandPlaceholder: received,
      choices: englishHelpWording.choices,
      default: englishHelpWording.default,
    };
    const sharedInput5 = z.object({});
    assert.throws(
      () =>
        defineCli()({
          root: "choose",
          help: helpCapability({ wording }),

          usageFailureExitCode: 64,
          commands: {
            choose: {
              kind: "rootCommand",
              name: "choose",
              description: "选择模式",
              input: sharedInput5,

              outputs: (mode) => ({
                default: "structured",
                modes: {
                  structured: mode
                    .atomic({
                      success: {
                        kind: "completion",
                      },
                      failures: {},
                      handler: ({ outcome }) => outcome.completion(),
                    })
                    .structured({
                      description: "结构化输出",
                    }),
                },
              }),
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "invalidHelpFactTemplate",
            path: ["help", "wording", "commandPlaceholder"],
            slot: "commandPlaceholder",
            received,
            reason,
          },
        ]);
        return true;
      },
    );
  }
});

void test("a command group missing its placeholder reports the root identity at definition time", () => {
  const define = defineCli();
  const sharedInput6 = z.object({});
  assert.throws(
    () =>
      define({
        root: "tool",
        help: helpCapability({
          wording: {
            choices: englishHelpWording.choices,
            default: englishHelpWording.default,
          },
        }),

        usageFailureExitCode: 64,
        commands: {
          tool: { kind: "rootGroup", name: "tool", description: "工具" },
          ...define.command("run")({
            kind: "command",
            parent: "tool",
            name: "run",
            description: "运行",
            input: sharedInput6,

            outputs: (mode) => ({
              default: "structured",
              modes: {
                structured: mode
                  .atomic({
                    success: {
                      kind: "completion",
                    },
                    failures: {},
                    handler: ({ outcome }) => outcome.completion(),
                  })
                  .structured({
                    description: "结构化输出",
                  }),
              },
            }),
          }),
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "missingHelpFactTemplate",
          command: "tool",
          slot: "commandPlaceholder",
        },
      ]);
      return true;
    },
  );
});

void test("the command group placeholder flows through help, usage failures, and the contract manifest", async () => {
  const define = defineCli();
  const sharedInput7 = z.object({});
  const cli = define({
    root: "tool",
    help: helpCapability({
      wording: {
        commandPlaceholder: "命令",
        choices: englishHelpWording.choices,
        default: englishHelpWording.default,
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      tool: { kind: "rootGroup", name: "tool", description: "工具" },
      jobs: {
        kind: "commandGroup",
        parent: "tool",
        name: "jobs",
        description: "任务",
      },
      ...define.command("run")({
        kind: "command",
        parent: "jobs",
        name: "run",
        description: "运行任务",
        input: sharedInput7,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      }),
    },
  });

  assert.equal(cli.grammar.root.usage.synopsis, "tool <命令>");
  assert.equal(cli.manifest.schemaVersion, "5");
  assert.ok(
    JSON.stringify(cli.manifest.usageFailure.wire).includes("tool <命令>"),
  );
  const failed = parseCliInvocation(cli, ["missing"]);
  assert.equal(failed.kind, "usageFailure");
  if (failed.kind === "usageFailure") {
    assert.equal(failed.usage.synopsis, "tool <命令>");
  }

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(writes.join(""), /tool <命令>/);
  assert.match(writes.join(""), /jobs <命令>/);
});

void test("conditional branch templates express universal conditions and let each slot reorder words", async () => {
  const sharedInput1 = z.object({
    auth: z.string().optional(),
    token: z.string().optional(),
    quiet: z.boolean().optional(),
    force: z.boolean().optional(),
  });
  const cli = defineCli()({
    root: "publish",
    help: helpCapability({
      wording: {
        ...englishHelpWording,
        whenOnMatch: "当全部满足 {facts} 时，{onMatch}",
        whenOtherwise: "当并非全部满足 {facts} 时，{otherwise}",
        whenOnMatchOtherwise:
          "当全部满足 {facts} 时，{onMatch}；否则，{otherwise}",
        require: "必须提供 {fields}",
        forbid: "不能提供 {fields}",
        present: "存在 {field}",
        equals: "{field} 等于 {value}",
        forbiddenCombination: "禁止同时出现 {facts}",
        countAtMost: "{fields} 的数量不超过 {max}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      publish: {
        kind: "rootCommand",
        name: "publish",
        description: "发布",
        fields: {
          auth: {
            kind: "valueOption",
            longOption: "--auth",
            description: "认证",
          },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "令牌",
          },
          quiet: { kind: "flag", longOption: "--quiet", description: "静默" },
          force: { kind: "flag", longOption: "--force", description: "强制" },
        },
        usageConstraints: [
          { kind: "count", fields: ["token", "quiet"], max: 1 },
          {
            kind: "when",
            all: [{ kind: "present", field: "auth" }],
            onMatch: { require: ["token"] },
          },
          {
            kind: "when",
            all: [{ kind: "present", field: "quiet" }],
            otherwise: { forbid: ["force"] },
          },
          {
            kind: "when",
            all: [{ kind: "equals", field: "quiet", value: true }],
            onMatch: { require: ["auth"] },
            otherwise: { forbid: ["token"] },
          },
          {
            kind: "forbiddenCombination",
            all: [
              { kind: "equals", field: "quiet", value: true },
              { kind: "equals", field: "force", value: true },
            ],
          },
        ],
        input: sharedInput1,

        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  const help = writes.join("");
  assert.match(help, /token, quiet 的数量不超过 1/);
  assert.match(help, /当全部满足 存在 auth 时，必须提供 token/);
  assert.match(help, /当并非全部满足 存在 quiet 时，不能提供 force/);
  assert.match(
    help,
    /当全部满足 quiet 等于 true 时，必须提供 auth；否则，不能提供 token/,
  );
  assert.match(help, /禁止同时出现 quiet 等于 true, force 等于 true/);
});

void test("the output format control reuses the choices and default templates", async () => {
  const sharedInput8 = z.object({});
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        choices: "（候选：{choices}）",
        default: "（默认：{value}）",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      show: {
        kind: "rootCommand",
        name: "show",
        description: "显示",
        input: sharedInput8,

        outputs: (mode) => ({
          default: "text",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .text({
                description: "文本输出",
                success: () => text.silent,
                failures: {},
              }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(
    writes.join(""),
    /--output <mode> （候选："structured", "text"） （默认："text"）/,
  );
});

void test("output-mode help lists the choices and default wording provided by the root author", async () => {
  const sharedInput9 = z.object({});
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        choices: "candidates {choices}",
        default: "primary {value}",
      },
    }),

    usageFailureExitCode: 64,
    commands: {
      show: {
        kind: "rootCommand",
        name: "show",
        description: "显示",
        input: sharedInput9,

        outputs: (mode) => ({
          default: "text",
          modes: {
            structured: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({
                description: "结构化输出",
              }),
            text: mode
              .atomic({
                success: {
                  kind: "completion",
                },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .text({
                description: "文本输出",
                success: () => text.silent,
                failures: {},
              }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.match(
    writes.join(""),
    /--output <mode> candidates "structured", "text" primary "text"/,
  );
  assert.doesNotMatch(writes.join(""), /输出方式/);
});
