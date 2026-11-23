import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { defineCli, helpCapability } from "@ykdz/cli-contract";
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
  limit: z.codec(z.string(), z.number(), {
    decode: (value) => Number(value),
    encode: (value) => String(value),
  }),
});

const zodCli = defineCli()({
  root: "zodSchemaInput",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    zodSchemaInput: {
      kind: "rootCommand",
      name: "zod-schema-input",
      description: "Zod input",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          description: "Tags",
        },
        readonlyTags: {
          kind: "repeatableOption",
          longOption: "--readonly-tag",
          description: "Readonly tags",
        },
        defaultMode: {
          kind: "valueOption",
          longOption: "--default-mode",
          description: "Default mode",
        },
        limit: {
          kind: "valueOption",
          longOption: "--limit",
          description: "Limit",
        },
      },
      input: zodInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler({ input, outcome }) {
            input.mode satisfies "safe" | "force";
            input.tags satisfies ("red" | "green")[] | undefined;
            input.readonlyTags satisfies
              | readonly ("small" | "large")[]
              | undefined;
            input.defaultMode satisfies "fast" | "slow";
            input.limit satisfies number;
            // @ts-expect-error The enum Output must not widen to an arbitrary string.
            const invalidMode: "other" = input.mode;
            // @ts-expect-error The array enum Output must not widen to arbitrary elements.
            const invalidTag: "other" = input.tags?.[0];
            // @ts-expect-error A readonly array Output must not gain mutable methods.
            input.readonlyTags?.push("small");
            // @ts-expect-error The default Output must not widen to an arbitrary string.
            const invalidDefault: "other" = input.defaultMode;
            // @ts-expect-error The handler uses the schema Output and must not fall back to the raw string.
            input.limit satisfies string;
            void invalidMode;
            void invalidTag;
            void invalidDefault;
            return outcome.completion();
          },
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
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

  usageFailureExitCode: 64,
  commands: {
    valibotSchemaInput: {
      kind: "rootCommand",
      name: "valibot-schema-input",
      description: "Valibot input",
      fields: {
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "Mode",
        },
        tags: {
          kind: "repeatableOption",
          longOption: "--tag",
          description: "Tags",
        },
        defaultMode: {
          kind: "valueOption",
          longOption: "--default-mode",
          description: "Default mode",
        },
      },
      input: valibotInput,

      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler({ input, outcome }) {
            input.mode satisfies "safe" | "force";
            input.tags satisfies ("red" | "green")[] | undefined;
            input.defaultMode satisfies "fast" | "slow";
            // @ts-expect-error The enum Output must not widen to an arbitrary string.
            const invalidMode: "other" = input.mode;
            // @ts-expect-error The array enum Output must not widen to arbitrary elements.
            const invalidTag: "other" = input.tags?.[0];
            // @ts-expect-error The default Output must not widen to an arbitrary string.
            const invalidDefault: "other" = input.defaultMode;
            void invalidMode;
            void invalidTag;
            void invalidDefault;
            return outcome.completion();
          },
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});

void zodCli;
void valibotCli;
