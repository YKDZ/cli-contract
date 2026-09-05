import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import * as v from "valibot";
import { z } from "zod";

const zodInput = z.object({
  mode: z.enum(["safe", "force"]),
  tags: z.array(z.enum(["red", "green"])).optional(),
  readonlyTags: z
    .array(z.enum(["small", "large"]))
    .readonly()
    .optional(),
  defaultMode: z.enum(["fast", "slow"]).default("fast"),
});

const zodCli = defineCli()({
  root: "zodSchemaInput",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    zodSchemaInput: {
      kind: "rootCommand",
      name: "zod-schema-input",
      description: "Zod 输入",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          description: "标签",
        },
        readonlyTags: {
          kind: "repeatableOption",
          longOption: "--readonly-tag",
          description: "只读标签",
        },
        defaultMode: {
          kind: "valueOption",
          longOption: "--default-mode",
          description: "默认模式",
        },
      },
      input: zodInput,
      success: { kind: "completion" },
      failures: {},
      handler({ input, outcome }) {
        input.mode satisfies "safe" | "force";
        input.tags satisfies ("red" | "green")[] | undefined;
        input.readonlyTags satisfies readonly ("small" | "large")[] | undefined;
        input.defaultMode satisfies "fast" | "slow";
        // @ts-expect-error enum Output 不得扩宽为任意字符串。
        const invalidMode: "other" = input.mode;
        // @ts-expect-error array enum Output 不得扩宽为任意元素。
        const invalidTag: "other" = input.tags?.[0];
        // @ts-expect-error readonly array Output 不得获得 mutable 方法。
        input.readonlyTags?.push("small");
        // @ts-expect-error default 的 Output 不得扩宽为任意字符串。
        const invalidDefault: "other" = input.defaultMode;
        void invalidMode;
        void invalidTag;
        void invalidDefault;
        return outcome.completion();
      },
    },
  },
});

const valibotInput = toStandardJsonSchema(
  v.object({
    mode: v.picklist(["safe", "force"]),
    tags: v.optional(v.array(v.picklist(["red", "green"]))),
    defaultMode: v.optional(v.picklist(["fast", "slow"]), "fast"),
  }),
);

const valibotCli = defineCli()({
  root: "valibotSchemaInput",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    valibotSchemaInput: {
      kind: "rootCommand",
      name: "valibot-schema-input",
      description: "Valibot 输入",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          description: "标签",
        },
        defaultMode: {
          kind: "valueOption",
          longOption: "--default-mode",
          description: "默认模式",
        },
      },
      input: valibotInput,
      success: { kind: "completion" },
      failures: {},
      handler({ input, outcome }) {
        input.mode satisfies "safe" | "force";
        input.tags satisfies ("red" | "green")[] | undefined;
        input.defaultMode satisfies "fast" | "slow";
        // @ts-expect-error enum Output 不得扩宽为任意字符串。
        const invalidMode: "other" = input.mode;
        // @ts-expect-error array enum Output 不得扩宽为任意元素。
        const invalidTag: "other" = input.tags?.[0];
        // @ts-expect-error default 的 Output 不得扩宽为任意字符串。
        const invalidDefault: "other" = input.defaultMode;
        void invalidMode;
        void invalidTag;
        void invalidDefault;
        return outcome.completion();
      },
    },
  },
});

void zodCli;
void valibotCli;
