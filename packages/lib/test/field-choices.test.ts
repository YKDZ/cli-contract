import assert from "node:assert/strict";
import { test } from "node:test";

import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
  type ContractSchema,
  type JsonObject,
} from "@ykdz/cli-contract";
import * as v from "valibot";
import { z } from "zod";

const draft202012 = { target: "draft-2020-12" as const };

type ChoiceRawInput = Readonly<{
  readonly mode: string;
  readonly files?: readonly string[];
  readonly option?: string;
  readonly tag?: readonly string[];
  readonly refined?: string;
}>;

type ValibotChoiceRawInput = Readonly<{
  readonly mode?: string;
  readonly tag?: readonly string[];
}>;

type CombinationRawInput = Readonly<{ readonly mode: string }>;

function fieldChoices(
  fields: readonly {
    readonly key: string;
    readonly choices?: readonly string[];
  }[],
): Readonly<Record<string, readonly string[] | undefined>> {
  return Object.fromEntries(fields.map((field) => [field.key, field.choices]));
}

function createCombinationCli(input: ContractSchema<CombinationRawInput>) {
  return defineCli()({
    root: "combination",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      combination: {
        kind: "rootCommand",
        name: "combination",
        description: "组合模式",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
        },
        input,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
}

void test("Zod 的直接 enum 同源投影到 grammar、manifest、synopsis 与完整帮助", async () => {
  const input = z.object({
    mode: z.enum(["interactive", "allow-all"]),
    files: z.array(z.enum(['a"b', "line\nbreak"])).optional(),
    option: z
      .enum(["interactive", "allow-all"])
      .optional()
      .default("interactive"),
    tag: z.array(z.enum(["red", "green"])).optional(),
    refined: z
      .string()
      .refine(() => true)
      .optional(),
  });
  const exported = input["~standard"].jsonSchema.input(draft202012);
  const before = structuredClone(exported);
  const contractSchema = input as unknown as ContractSchema<ChoiceRawInput>;
  const sourceChoices = (
    exported.properties as Readonly<
      Record<string, Readonly<{ enum: readonly string[] }>>
    >
  ).mode?.enum;
  const cli = defineCli()({
    root: "choose",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      choose: {
        kind: "rootCommand",
        name: "choose",
        description: "选择模式",
        fields: {
          mode: { kind: "positional", description: "位置模式" },
          files: { kind: "variadicPositional", description: "文件" },
          option: {
            kind: "valueOption",
            longOption: "--mode",
            description: "选项模式",
          },
          tag: {
            kind: "repeatableOption",
            longOption: "--tag",
            description: "标签",
          },
          refined: {
            kind: "valueOption",
            longOption: "--refined",
            description: "精炼",
          },
        },
        input: contractSchema,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.deepEqual(fieldChoices(cli.grammar.root.fields), {
    mode: ["interactive", "allow-all"],
    files: ['a"b', "line\nbreak"],
    option: ["interactive", "allow-all"],
    tag: ["red", "green"],
    refined: undefined,
  });
  assert.strictEqual(
    cli.grammar.root.fields,
    cli.manifest.commands.choose.fields,
  );
  assert.notStrictEqual(cli.grammar.root.fields[0]?.choices, sourceChoices);
  assert.ok(Object.isFrozen(cli.grammar.root.fields[0]?.choices));
  assert.deepEqual(exported, before);
  assert.equal(
    cli.grammar.root.usage.synopsis,
    'choose <mode:"interactive"|"allow-all"> [<files:"a\\"b"|"line\\nbreak"...>] [--mode <"interactive"|"allow-all">] [--tag <"red"|"green">]... [--refined <value>]',
  );

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    'choose <mode:"interactive"|"allow-all"> [<files:"a\\"b"|"line\\nbreak"...>] [--mode <"interactive"|"allow-all">] [--tag <"red"|"green">]... [--refined <value>]\n选择模式\n<mode:"interactive"|"allow-all">\t位置模式\n[<files:"a\\"b"|"line\\nbreak"...>]\t文件\n[--mode <"interactive"|"allow-all">] (default: "interactive")\t选项模式\n[--tag <"red"|"green">]...\t标签\n[--refined <value>]\t精炼\n--help\n',
  ]);
  const invalidChoices = parseCliInvocation(cli, [
    "unexpected",
    "--mode",
    "outside",
    "--tag",
    "other",
  ]);
  assert.equal(invalidChoices.kind, "parsed");
  if (invalidChoices.kind !== "parsed") assert.fail("候选值不由 parser 拒绝");
  const termination = await executeCli(cli, {
    invocation: invalidChoices,
    dependencies: undefined,
    write: () => undefined,
  });
  assert.equal(termination.kind, "usageFailure");
  if (termination.kind === "usageFailure") {
    assert.equal(termination.issues[0]?.code, "inputRejected");
  }
});

void test("Valibot 的直接 enum 同样覆盖单值与 repeatable option", () => {
  const input = toStandardJsonSchema(
    v.object({
      mode: v.optional(v.picklist(["interactive", "allow-all"])),
      tag: v.optional(v.array(v.picklist(["red", "green"]))),
    }),
  );
  const contractSchema =
    input as unknown as ContractSchema<ValibotChoiceRawInput>;
  const cli = defineCli()({
    root: "valibotChoices",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      valibotChoices: {
        kind: "rootCommand",
        name: "valibot-choices",
        description: "Valibot 候选值",
        fields: {
          mode: {
            kind: "valueOption",
            longOption: "--mode",
            description: "模式",
          },
          tag: {
            kind: "repeatableOption",
            longOption: "--tag",
            description: "标签",
          },
        },
        input: contractSchema,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.deepEqual(fieldChoices(cli.grammar.root.fields), {
    mode: ["interactive", "allow-all"],
    tag: ["red", "green"],
  });
});

void test("真实 Zod 与 Valibot 的 union 投影不会被求解为字段候选值", () => {
  const inputs = [
    z.object({
      mode: z.union([z.literal("interactive"), z.literal("allow-all")]),
    }),
    toStandardJsonSchema(
      v.object({
        mode: v.union([v.literal("interactive"), v.literal("allow-all")]),
      }),
    ),
  ] as const;

  for (const producer of inputs) {
    const input = producer as unknown as ContractSchema<CombinationRawInput>;
    assert.throws(
      () => createCombinationCli(input),
      (error) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.deepEqual(error.issues, [
          {
            code: "schemaFieldDoesNotAcceptRawValue",
            command: "combination",
            location: "input",
            fields: [{ field: "mode", expected: "string" }],
          },
        ]);
        return true;
      },
    );
  }
});

void test("组合、引用、条件和非字符串 enum 不推断候选值", async () => {
  const validator = z.object({
    anyOf: z.string().optional(),
    oneOf: z.string().optional(),
    reference: z.string().optional(),
    conditional: z.string().optional(),
    mixed: z.string().optional(),
    empty: z.string().optional(),
    tag: z.array(z.string()).optional(),
    values: z.array(z.string()).optional(),
  });
  const input: ContractSchema = {
    "~standard": {
      ...validator["~standard"],
      jsonSchema: {
        input: () => choiceCounterexampleSchema,
        output: () => choiceCounterexampleSchema,
      },
    },
  };
  const cli = defineCli()({
    root: "counterexample",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      counterexample: {
        kind: "rootCommand",
        name: "counterexample",
        description: "反例",
        fields: {
          anyOf: {
            kind: "valueOption",
            longOption: "--any-of",
            description: "anyOf",
          },
          oneOf: {
            kind: "valueOption",
            longOption: "--one-of",
            description: "oneOf",
          },
          reference: {
            kind: "valueOption",
            longOption: "--reference",
            description: "引用",
          },
          conditional: {
            kind: "valueOption",
            longOption: "--conditional",
            description: "条件",
          },
          mixed: {
            kind: "valueOption",
            longOption: "--mixed",
            description: "混合",
          },
          empty: {
            kind: "valueOption",
            longOption: "--empty",
            description: "空",
          },
          tag: {
            kind: "repeatableOption",
            longOption: "--tag",
            description: "标签",
          },
          values: { kind: "variadicPositional", description: "值" },
        },
        input,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });

  assert.deepEqual(fieldChoices(cli.grammar.root.fields), {
    anyOf: undefined,
    oneOf: undefined,
    reference: undefined,
    conditional: undefined,
    mixed: undefined,
    empty: undefined,
    tag: undefined,
    values: undefined,
  });
  assert.strictEqual(
    cli.grammar.root.fields,
    cli.manifest.commands.counterexample.fields,
  );
  assert.equal(
    cli.grammar.root.usage.synopsis,
    "counterexample [--any-of <value>] [--one-of <value>] [--reference <value>] [--conditional <value>] [--mixed <value>] [--empty <value>] [--tag <value>]... [<values...>]",
  );
  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    "counterexample [--any-of <value>] [--one-of <value>] [--reference <value>] [--conditional <value>] [--mixed <value>] [--empty <value>] [--tag <value>]... [<values...>]\n反例\n[--any-of <value>]\tanyOf\n[--one-of <value>]\toneOf\n[--reference <value>]\t引用\n[--conditional <value>]\t条件\n[--mixed <value>]\t混合\n[--empty <value>]\t空\n[--tag <value>]...\t标签\n[<values...>]\t值\n--help\n",
  ]);
});

const choiceCounterexampleSchema: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    anyOf: {
      type: "string",
      enum: ["first", "second"],
      anyOf: [{ const: "first" }, { const: "second" }],
    },
    oneOf: {
      type: "string",
      enum: ["first", "second"],
      oneOf: [{ const: "first" }, { const: "second" }],
    },
    reference: {
      type: "string",
      enum: ["first", "second"],
      $ref: "#/$defs/value",
    },
    conditional: {
      type: "string",
      enum: ["first", "second"],
      if: { const: "first" },
    },
    mixed: { type: "string", enum: ["first", 2] },
    empty: { type: "string", enum: [] },
    tag: {
      type: "array",
      items: {
        type: "string",
        enum: ["first", "second"],
        oneOf: [{ const: "first" }],
      },
    },
    values: {
      type: "array",
      items: {
        type: "string",
        enum: ["first", "second"],
        $ref: "#/$defs/value",
      },
    },
  },
};
