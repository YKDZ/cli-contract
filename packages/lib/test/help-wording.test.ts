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
} from "@boringparts/cli-contract";
import { z } from "zod";

import { englishHelpWording } from "./english-help.ts";

void test("three-state usage templates control word order and eliminate stray spaces around full-width punctuation", async () => {
  const sharedInput0 = z.object({
    mode: z.enum(["safe", "force"]).default("safe"),
    level: z.enum(["low", "high"]).optional(),
    retries: z.string().default("3"),
  });
  const cli = defineCli()({
    root: "choose",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "输出方式",
        choices: "{usage}（可选：{choices}）",
        default: "{usage}（默认：{value}）",
        choicesAndDefault: "（默认：{value}；可选：{choices}）{usage}",
        list: "{left}、{right}",
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
          level: {
            kind: "valueOption",
            longOption: "--level",
            description: "级别",
          },
          retries: {
            kind: "valueOption",
            longOption: "--retries",
            description: "重试次数",
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
  const help = writes.join("");
  assert.match(help, /choose \[--output <输出方式>\]/);
  assert.match(
    help,
    /（默认："safe"；可选："safe"、"force"）\[--mode <mode>\]/,
  );
  assert.match(help, /\[--level <level>\]（可选："low"、"high"）/);
  assert.match(help, /\[--retries <retries>\]（默认："3"）/);
  assert.match(
    help,
    /（默认："structured"；可选："structured"）--output <输出方式>/,
  );
  assert.doesNotMatch(help, /structured \(atomic, structured\)/);
  assert.match(help, /\n  structured\n    结构化输出\n/);
});

void test("minimal single-command single-output-mode contract only needs outputModePlaceholder and choicesAndDefault", async () => {
  const cli = defineCli()({
    root: "ping",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "方式",
        choicesAndDefault: "{usage}（可选：{choices}；默认：{value}）",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      ping: {
        kind: "rootCommand",
        name: "ping",
        description: "探测",
        input: z.object({}),
        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({ description: "结构化输出" }),
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
  assert.match(help, /ping \[--output <方式>\]/);
  assert.match(
    help,
    /--output <方式>（可选："structured"；默认："structured"）/,
  );
  assert.match(help, /\n  structured\n    结构化输出\n/);
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

void test("helpCapability aggregates invalid shortAlias, headings, wording, and unknown properties immediately", () => {
  assert.throws(
    () =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The negative case intentionally bypasses static types to verify aggregated help capability errors.
      helpCapability({
        shortAlias: "-x",
        extra: true,
        headings: {
          usage: "",
          bad: "x",
        },
        wording: {
          choices: "{usage} 候选 {choises}",
          unknownSlot: "x",
        },
      } as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "unknownDefinitionProperty", path: ["help", "extra"] },
        {
          code: "invalidCapabilityShortAlias",
          capability: "help",
          expected: "-h",
          received: "-x",
        },
        {
          code: "invalidHelpHeading",
          path: ["help", "headings", "usage"],
          heading: "usage",
          received: "",
        },
        {
          code: "unknownDefinitionProperty",
          path: ["help", "headings", "bad"],
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "{usage} 候选 {choises}",
          reason: "placeholder",
        },
        {
          code: "unknownDefinitionProperty",
          path: ["help", "wording", "unknownSlot"],
        },
      ]);
      return true;
    },
  );

  assert.throws(
    () => helpCapability({ wording: "not-an-object" as never }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpWording",
          path: ["help", "wording"],
          received: "not-an-object",
        },
      ]);
      return true;
    },
  );

  const sharedInput1 = z.object({ mode: z.enum(["safe", "force"]).optional() });
  const definition = {
    root: "choose",
    help: helpCapability({
      wording: {
        choices: "{usage} 候选 {choices}",
        default: "{usage} 默认 {value}",
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The dynamic closed negative case verifies missing help templates aggregate with leaf constraint issues.
    () => defineCli()(definition as never),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "unknownUsageConstraintField",
          command: "choose",
          constraint: "forbiddenCombination",
          index: 0,
          member: "all.field",
          field: "missing",
        },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "outputModePlaceholder",
        },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "choicesAndDefault",
        },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "list",
        },
      ]);
      return true;
    },
  );
});

void test("a declared help fact missing its template reports command and slot at definition time", () => {
  const sharedInput0 = z.object({
    mode: z.enum(["safe", "force"]).default("safe"),
    extra: z.string().optional(),
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
              extra: {
                kind: "valueOption",
                longOption: "--extra",
                description: "附加",
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
                onMatch: { require: ["mode"], forbid: ["extra"] },
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
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "outputModePlaceholder",
        },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "choicesAndDefault",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "list" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "whenOnMatch",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "present" },
        { code: "missingHelpFactTemplate", command: "choose", slot: "require" },
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
        { code: "missingHelpFactTemplate", command: "choose", slot: "effects" },
        {
          code: "missingHelpFactTemplate",
          command: "choose",
          slot: "forbiddenCombination",
        },
        { code: "missingHelpFactTemplate", command: "choose", slot: "facts" },
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
        {
          code: "missingHelpFactTemplate",
          command: "show",
          slot: "outputModePlaceholder",
        },
        {
          code: "missingHelpFactTemplate",
          command: "show",
          slot: "choicesAndDefault",
        },
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
  assert.match(
    writes.join(""),
    /当并非全部满足 存在 --mode 时，不能提供 --mode/,
  );
});

void test("dynamic help fact templates aggregate invalid slots immediately on helpCapability", () => {
  const wording: {
    readonly outputModePlaceholder: string;
    readonly choicesAndDefault: string;
    readonly choices: string;
    readonly default: string;
  } = {
    outputModePlaceholder: "mode",
    choicesAndDefault: "{usage} ({choices}; {value})",
    choices: "{usage}（可选值：{unknown}）",
    default: "{usage} 默认值\n{value}",
  };
  assert.throws(
    () => helpCapability({ wording }),
    (error: unknown) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "choices"],
          slot: "choices",
          received: "{usage}（可选值：{unknown}）",
          reason: "placeholder",
        },
        {
          code: "invalidHelpFactTemplate",
          path: ["help", "wording", "default"],
          slot: "default",
          received: "{usage} 默认值\n{value}",
          reason: "singleLine",
        },
      ]);
      return true;
    },
  );
});

void test("help template errors keep the invalid original value on helpCapability", () => {
  const helpDefinition: HelpCapabilityDefinition = JSON.parse(
    '{"wording":{"outputModePlaceholder":"mode","choicesAndDefault":"{usage} ({choices}; {value})","choices":42,"default":null,"countExactly":{},"whenOnMatch":"满足 {unknown}"}}',
  );

  assert.throws(
    () => helpCapability(helpDefinition),
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
      ]);
      return true;
    },
  );
});

void test("command group and output mode placeholders share the same boundary for static and dynamic checks", () => {
  const invalidTemplates = [
    { received: "", reason: "empty" },
    { received: "   ", reason: "empty" },
    { received: "<命令组>", reason: "placeholder" },
    { received: "mode\nline", reason: "singleLine" },
  ] as const;

  for (const { received, reason } of invalidTemplates) {
    const wording: {
      readonly commandPlaceholder: string;
      readonly outputModePlaceholder: string;
      readonly choicesAndDefault: string;
    } = {
      commandPlaceholder: received,
      outputModePlaceholder: received,
      choicesAndDefault: englishHelpWording.choicesAndDefault,
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
          {
            code: "invalidHelpFactTemplate",
            path: ["help", "wording", "outputModePlaceholder"],
            slot: "outputModePlaceholder",
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
            outputModePlaceholder: englishHelpWording.outputModePlaceholder,
            choicesAndDefault: englishHelpWording.choicesAndDefault,
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
        outputModePlaceholder: englishHelpWording.outputModePlaceholder,
        choicesAndDefault: englishHelpWording.choicesAndDefault,
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
  assert.equal(cli.manifest.schemaVersion, "6");
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
  assert.match(help, /--token, --quiet 的数量不超过 1/);
  assert.match(help, /当全部满足 存在 --auth 时，必须提供 --token/);
  assert.match(help, /当并非全部满足 存在 --quiet 时，不能提供 --force/);
  assert.match(
    help,
    /当全部满足 --quiet 等于 true 时，必须提供 --auth；否则，不能提供 --token/,
  );
  assert.match(help, /禁止同时出现 --quiet 等于 true, --force 等于 true/);
});

void test("the output format control reuses choicesAndDefault and list templates", async () => {
  const sharedInput8 = z.object({});
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "输出方式",
        choicesAndDefault: "{usage}（候选：{choices}；默认：{value}）",
        list: "{left}、{right}",
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
  const help = writes.join("");
  assert.match(
    help,
    /--output <输出方式>（候选："structured"、"text"；默认："text"）/,
  );
  assert.doesNotMatch(help, /\(atomic, structured\)|\(atomic, text\)/);
  assert.match(help, /\n  structured\n    结构化输出\n/);
  assert.match(help, /\n  text\n    文本输出\n/);
});

void test("output-mode help lists the choicesAndDefault wording provided by the root author", async () => {
  const sharedInput9 = z.object({});
  const cli = defineCli()({
    root: "show",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "format",
        choicesAndDefault: "{usage} candidates {choices} primary {value}",
        list: "{left} | {right}",
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
    /--output <format> candidates "structured" \| "text" primary "text"/,
  );
  assert.doesNotMatch(writes.join(""), /输出方式/);
});

void test("binary joiner templates fold left-associatively and are only required when count >= 2", async () => {
  const singleBranchCli = defineCli()({
    root: "check",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "mode",
        choicesAndDefault: "{usage} ({choices}; {value})",
        whenOnMatch: "when {facts}: {onMatch}",
        present: "{field} is set",
        require: "need {fields}",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      check: {
        kind: "rootCommand",
        name: "check",
        description: "Single-item rule needs no binary joiners",
        fields: {
          auth: { kind: "flag", longOption: "--auth", description: "Auth" },
          token: {
            kind: "valueOption",
            longOption: "--token",
            description: "Token",
          },
        },
        input: z.object({
          auth: z.boolean().optional(),
          token: z.string().optional(),
        }),
        usageConstraints: [
          {
            kind: "when",
            all: [{ kind: "present", field: "auth" }],
            onMatch: { require: ["token"] },
          },
        ],
        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({ description: "Structured" }),
          },
        }),
      },
    },
  });
  assert.equal(singleBranchCli.manifest.root, "check");

  const foldingCli = defineCli()({
    root: "fold",
    help: helpCapability({
      wording: {
        outputModePlaceholder: "mode",
        choicesAndDefault: "{usage} ({choices}; {value})",
        choices: "{usage} ({choices})",
        list: "L({left}, {right})",
        facts: "F({left}, {right})",
        effects: "E({left}, {right})",
        whenOnMatch: "when {facts}: {onMatch}",
        present: "{field}?",
        require: "req[{fields}]",
        forbid: "forbid[{fields}]",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      fold: {
        kind: "rootCommand",
        name: "fold",
        description: "Verify left-associative folding",
        fields: {
          alpha: { kind: "flag", longOption: "--alpha", description: "Alpha" },
          beta: { kind: "flag", longOption: "--beta", description: "Beta" },
          gamma: { kind: "flag", longOption: "--gamma", description: "Gamma" },
          pick: {
            kind: "valueOption",
            longOption: "--pick",
            description: "Pick",
          },
        },
        input: z.object({
          alpha: z.boolean().optional(),
          beta: z.boolean().optional(),
          gamma: z.boolean().optional(),
          pick: z.enum(["a", "b", "c"]).optional(),
        }),
        usageConstraints: [
          {
            kind: "when",
            all: [
              { kind: "present", field: "alpha" },
              { kind: "present", field: "beta" },
              { kind: "present", field: "gamma" },
            ],
            onMatch: {
              require: ["alpha", "beta", "gamma"],
              forbid: ["pick"],
            },
          },
        ],
        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({ description: "Structured" }),
          },
        }),
      },
    },
  });
  const writes: string[] = [];
  await executeCli(foldingCli, {
    invocation: parseCliInvocation(foldingCli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  const help = writes.join("");
  assert.match(help, /\[--pick <pick>\] \(L\(L\("a", "b"\), "c"\)\)/);
  assert.match(
    help,
    /when F\(F\(--alpha\?, --beta\?\), --gamma\?\): E\(req\[L\(L\(--alpha, --beta\), --gamma\)\], forbid\[--pick\]\)/,
  );
});

void test("field placeholder projects to grammar, manifest, help, and constraint symbols while wire keeps field keys", async () => {
  const cli = defineCli()({
    root: "deploy",
    help: helpCapability({
      wording: englishHelpWording,
    }),
    usageFailureExitCode: 64,
    commands: {
      deploy: {
        kind: "rootCommand",
        name: "deploy",
        description: "Deploy artifact",
        fields: {
          targetEnv: {
            kind: "positional",
            placeholder: "environment",
            description: "Target environment",
          },
          extraFiles: {
            kind: "variadicPositional",
            placeholder: "file path",
            description: "Extra files",
          },
          authToken: {
            kind: "valueOption",
            longOption: "--auth-token",
            shortAlias: "-t",
            placeholder: "secret",
            description: "Auth token",
          },
          tagList: {
            kind: "repeatableOption",
            longOption: "--tag",
            placeholder: undefined as never,
            description: "Tags",
          },
          colorMode: {
            kind: "flag",
            longOption: "--color",
            negatedLongOption: "--no-color",
            description: "Color output",
          },
        },
        input: z.object({
          targetEnv: z.string(),
          extraFiles: z.array(z.string()).min(1).optional(),
          authToken: z.string().optional(),
          tagList: z.array(z.string()).min(1).optional(),
          colorMode: z.boolean().optional(),
        }),
        usageConstraints: [
          {
            kind: "when",
            all: [{ kind: "equals", field: "colorMode", value: false }],
            onMatch: { require: ["authToken", "targetEnv"] },
            otherwise: { forbid: ["extraFiles"] },
          },
          {
            kind: "count",
            fields: ["authToken", "tagList"],
            min: 1,
          },
        ],
        outputs: (mode) => ({
          default: "structured",
          modes: {
            structured: mode
              .atomic({
                success: { kind: "completion" },
                failures: {},
                handler: ({ outcome }) => outcome.completion(),
              })
              .structured({ description: "Structured output" }),
          },
        }),
      },
    },
  });

  assert.equal(
    cli.grammar.root.usage.synopsis,
    "deploy [--output <mode>] <environment> [<file path...>] [--auth-token <secret>] [--tag <tagList>]... [--color|--no-color]",
  );
  const targetField = cli.grammar.root.fields.find(
    (field) => field.key === "targetEnv",
  );
  const tagField = cli.grammar.root.fields.find(
    (field) => field.key === "tagList",
  );
  assert.ok(targetField !== undefined && targetField.kind === "positional");
  assert.equal(targetField.placeholder, "environment");
  assert.ok(tagField !== undefined);
  assert.equal(Object.hasOwn(tagField, "placeholder"), false);
  const manifestDeploy = cli.manifest.commands.deploy;
  assert.equal(
    manifestDeploy.fields.find((field) => field.key === "extraFiles") &&
      (
        manifestDeploy.fields.find((field) => field.key === "extraFiles") as {
          placeholder?: string;
        }
      ).placeholder,
    "file path",
  );
  assert.equal(
    Object.hasOwn(
      manifestDeploy.fields.find((field) => field.key === "tagList") ?? {},
      "placeholder",
    ),
    false,
  );
  assert.deepEqual(manifestDeploy.usageConstraints, [
    {
      kind: "when",
      all: [{ kind: "equals", field: "colorMode", value: false }],
      onMatch: { require: ["authToken", "targetEnv"] },
      otherwise: { forbid: ["extraFiles"] },
    },
    {
      kind: "count",
      fields: ["authToken", "tagList"],
      min: 1,
      max: 2,
    },
  ]);

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  const help = writes.join("");
  assert.match(help, /  <environment>\n    Target environment/);
  assert.match(help, /  \[<file path\.\.\.>\]\n    Extra files/);
  assert.match(help, /  \[--auth-token, -t <secret>\]\n    Auth token/);
  assert.match(help, /  \[--tag <tagList>\]\.\.\.\n    Tags/);
  assert.match(
    help,
    /when all of --color=false, require --auth-token, <environment>; otherwise, forbid <file path\.\.\.>/,
  );
  assert.match(help, /--auth-token, --tag at least 1/);

  const failureWrites: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["prod", "--no-color"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      failureWrites.push(chunk);
    },
  });
  const envelope = JSON.parse(failureWrites.join(""));
  assert.equal(envelope.schemaVersion, "3");
  assert.equal(envelope.kind, "usageFailure");
  assert.deepEqual(envelope.issues, [
    {
      code: "conditionalConstraintViolation",
      branch: "onMatch",
      conditions: [
        {
          kind: "equals",
          field: "colorMode",
          present: true,
          actual: false,
          expected: false,
        },
      ],
      missingRequiredFields: ["authToken"],
      presentForbiddenFields: [],
    },
    {
      code: "countConstraintViolation",
      min: 1,
      max: 2,
      presentFields: [],
      absentFields: ["authToken", "tagList"],
    },
  ]);
});

void test("invalid field placeholders and flag placeholders report closed definition issues", () => {
  for (const [received, reason] of [
    ["", "empty"],
    ["   ", "empty"],
    ["bad\nname", "singleLine"],
    ["bad\rname", "singleLine"],
    ["bad\0name", "singleLine"],
    ["<name>", "placeholder"],
    ["name>", "placeholder"],
    ["<name", "placeholder"],
    [42, "singleLine"],
  ] as const) {
    assert.throws(
      () =>
        defineCli()({
          root: "deploy",
          help: helpCapability({ wording: englishHelpWording }),
          usageFailureExitCode: 64,
          commands: {
            deploy: {
              kind: "rootCommand",
              name: "deploy",
              description: "Deploy",
              fields: {
                target: {
                  kind: "positional",
                  placeholder: received as never,
                  description: "Target",
                },
                opt: {
                  kind: "valueOption",
                  longOption: "--opt",
                  placeholder: received as never,
                  description: "Option",
                },
                verbose: {
                  kind: "flag",
                  longOption: "--verbose",
                  placeholder: "nope",
                  description: "Verbose",
                } as never,
              },
              input: z.object({
                target: z.string(),
                opt: z.string().optional(),
                verbose: z.boolean().optional(),
              }),
              outputs: (mode) => ({
                default: "structured",
                modes: {
                  structured: mode
                    .atomic({
                      success: { kind: "completion" },
                      failures: {},
                      handler: ({ outcome }) => outcome.completion(),
                    })
                    .structured({ description: "Structured" }),
                },
              }),
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "unknownDefinitionProperty",
            path: ["commands", "deploy", "fields", "verbose", "placeholder"],
          },
          {
            code: "invalidFieldPlaceholder",
            command: "deploy",
            field: "target",
            received,
            reason,
          },
          {
            code: "invalidFieldPlaceholder",
            command: "deploy",
            field: "opt",
            received,
            reason,
          },
        ]);
        return true;
      },
    );
  }
});
