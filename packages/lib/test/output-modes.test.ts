import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

void test("每个命令按具名方式选择独立结果契约并保留方式身份", async () => {
  const define = defineCli();
  const input = z.object({ name: z.string() });
  const selectedHandlers: string[] = [];
  const output = define.outputModes("greet", input, (mode) => ({
    default: "json",
    modes: {
      json: mode.atomic({
        description: "机器读取的完整结果",
        format: "structured",
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候内容",
              schema: z
                .object({ message: z.string() })
                .transform(({ message }) => ({ message: Number(message) }))
                .pipe(z.object({ message: z.number() })),
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ input, outcome }) => {
          selectedHandlers.push("json");
          return outcome.data.greeting({ message: input.name });
        },
      }),
      text: mode.atomic({
        description: "供人阅读的问候",
        format: "text",
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候内容",
              schema: z
                .object({ message: z.string() })
                .transform(({ message }) => ({ message: Number(message) }))
                .pipe(z.object({ message: z.number() })),
              exitCode: 0,
              text: ({ message }) => text.line(`你好，${message}`),
            },
          },
        },
        failures: {},
        handler: ({ input, outcome }) => {
          selectedHandlers.push("text");
          return outcome.data.greeting({ message: input.name });
        },
      }),
      follow: mode.stream({
        description: "逐条输出问候记录",
        format: "structured",
        success: {
          kind: "stream",
          records: {
            greeting: {
              description: "问候记录",
              schema: z.object({ message: z.string() }),
            },
          },
        },
        failures: {},
        async *handler({ input, outcome }) {
          selectedHandlers.push("follow");
          yield outcome.record.greeting({ message: input.name });
          return outcome.streamSuccess();
        },
      }),
    },
  }));
  const cli = define({
    root: "greet",
    help: helpCapability({
      wording: {
        choices: "(choices {choices})",
        default: "(default {value})",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      greet: {
        kind: "rootCommand",
        name: "greet",
        description: "生成问候",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "问候对象",
          },
        },
        input,
        outputs: output,
      },
    },
  });

  const defaultInvocation = parseCliInvocation(cli, ["--name", "21"]);
  assert.equal(defaultInvocation.kind, "parsed");
  if (defaultInvocation.kind !== "parsed") return;
  const defaultWrites: string[] = [];
  const defaultResult = await executeCli(cli, {
    invocation: defaultInvocation,
    dependencies: undefined,
    write: ({ chunk }) => {
      defaultWrites.push(chunk);
    },
  });
  assert.equal(defaultResult.kind, "applicationResult");
  if (defaultResult.kind !== "applicationResult") return;
  assert.equal(defaultResult.outputMode, "json");
  assert.equal(defaultResult.result.kind, "data");
  if (defaultResult.result.kind !== "data") return;
  assert.deepEqual(defaultResult.result.data, { message: 21 });
  assert.deepEqual(defaultWrites, [
    '{"schemaVersion":"3","command":"greet","outputMode":"json","kind":"data","variant":"greeting","data":{"message":21}}\n',
  ]);

  const textInvocation = parseCliInvocation(cli, [
    "--name",
    "22",
    "--output=text",
  ]);
  assert.equal(textInvocation.kind, "parsed");
  if (textInvocation.kind !== "parsed") return;
  assert.equal(textInvocation.outputMode, "text");
  const textWrites: string[] = [];
  const textResult = await executeCli(cli, {
    invocation: textInvocation,
    dependencies: undefined,
    write: ({ chunk }) => {
      textWrites.push(chunk);
    },
  });
  assert.equal(textResult.kind, "applicationResult");
  if (textResult.kind !== "applicationResult") return;
  assert.equal(textResult.outputMode, "text");
  assert.deepEqual(textWrites, ["你好，22\n"]);

  const followInvocation = parseCliInvocation(cli, [
    "--name",
    "Ada",
    "--output",
    "follow",
  ]);
  assert.equal(followInvocation.kind, "parsed");
  if (followInvocation.kind !== "parsed") return;
  const followWrites: string[] = [];
  const followResult = await executeCli(cli, {
    invocation: followInvocation,
    dependencies: undefined,
    write: ({ chunk }) => {
      followWrites.push(chunk);
    },
  });
  assert.equal(followResult.kind, "applicationResult");
  if (followResult.kind !== "applicationResult") return;
  assert.equal(followResult.outputMode, "follow");
  assert.deepEqual(followWrites, [
    '{"schemaVersion":"3","command":"greet","outputMode":"follow","kind":"stream"}\n',
    '{"kind":"record","variant":"greeting","data":{"message":"Ada"}}\n',
    '{"kind":"streamSuccess"}\n',
  ]);
  assert.deepEqual(selectedHandlers, ["json", "text", "follow"]);
});

function createSingleModeCli(defaultSelection: "implicit" | "explicit") {
  const define = defineCli();
  const input = z.object({});
  const outputs = define.outputModes("run", input, (mode) => {
    const json = mode.atomic({
      description: "结构化结果",
      format: "structured",
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return defaultSelection === "implicit"
      ? { modes: { json } }
      : { default: "json", modes: { json } };
  });
  return define({
    root: "run",
    help: helpCapability({
      wording: {
        choices: "(choices {choices})",
        default: "(default {value})",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      run: {
        kind: "rootCommand",
        name: "run",
        description: "运行任务",
        fields: {},
        input,
        outputs,
      },
    },
  });
}

function invalidSingleModeDefinition(defaultValue: unknown) {
  const define = defineCli();
  const input = z.object({});
  const outputs = Reflect.apply(define.outputModes, define, [
    "run",
    input,
    (mode: { readonly atomic: (definition: object) => object }) => ({
      default: defaultValue,
      modes: {
        json: mode.atomic({
          description: "结构化结果",
          format: "structured",
          success: { kind: "completion" },
          failures: {},
          handler: () => undefined,
        }),
      },
    }),
  ]);
  const definition = {
    root: "run",
    help: helpCapability({
      wording: {
        choices: "(choices {choices})",
        default: "(default {value})",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      run: {
        kind: "rootCommand",
        name: "run",
        description: "运行任务",
        fields: {},
        input,
        outputs,
      },
    },
  };
  return () => {
    Reflect.apply(define, undefined, [definition]);
  };
}

function invalidMultiModeDefinition() {
  const define = defineCli();
  const input = z.object({});
  const outputs = Reflect.apply(define.outputModes, define, [
    "run",
    input,
    (mode: { readonly atomic: (definition: object) => object }) => ({
      default: "typo",
      modes: {
        json: mode.atomic({
          description: "结构化结果",
          format: "structured",
          success: { kind: "completion" },
          failures: {},
          handler: () => undefined,
        }),
        text: mode.atomic({
          description: "文本结果",
          format: "text",
          success: { kind: "completion", text: () => text.silent },
          failures: {},
          handler: () => undefined,
        }),
      },
    }),
  ]);
  const definition = {
    root: "run",
    help: helpCapability({
      wording: {
        choices: "(choices {choices})",
        default: "(default {value})",
      },
    }),
    usageFailureExitCode: 64,
    commands: {
      run: {
        kind: "rootCommand",
        name: "run",
        description: "运行任务",
        fields: {},
        input,
        outputs,
      },
    },
  };
  return () => {
    Reflect.apply(define, undefined, [definition]);
  };
}

void test("默认方式只在缺省时选择唯一方式并拒绝显式无效值", async () => {
  for (const selection of ["implicit", "explicit"] as const) {
    const cli = createSingleModeCli(selection);
    const invocation = parseCliInvocation(cli, []);
    assert.equal(invocation.kind, "parsed");
    if (invocation.kind !== "parsed") continue;
    assert.equal(invocation.outputMode, "json");
    const result = await executeCli(cli, {
      invocation,
      dependencies: undefined,
      write: () => {},
    });
    assert.equal(result.kind, "applicationResult");
    if (result.kind === "applicationResult")
      assert.equal(result.outputMode, "json");
  }

  for (const defaultValue of ["typo", null]) {
    assert.throws(
      invalidSingleModeDefinition(defaultValue),
      (error: unknown) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.ok(
          error.issues.some(
            (issue) => issue.code === "invalidDefaultOutputMode",
          ),
        );
        return true;
      },
    );
  }

  assert.throws(invalidMultiModeDefinition(), (error: unknown) => {
    assert.ok(error instanceof ContractDefinitionError);
    assert.ok(
      error.issues.some((issue) => issue.code === "invalidDefaultOutputMode"),
    );
    return true;
  });
});
