import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  defineCli,
  helpCapability,
  text,
  type CompletionTextPresenter,
  type TextPresenterContext,
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

function presentValidated<Input>(
  present: CompletionTextPresenter<Input>,
  input: Input,
) {
  return present({ input });
}

function presentField<Input extends { id: string }, Key extends keyof Input>(
  context: TextPresenterContext<Input>,
  key: Key,
  replacement: Input[Key],
) {
  const value: Input[Key] = context.input[key];
  // @ts-expect-error Generic indexing must preserve shallow readonly.
  context.input[key] = replacement;
  // @ts-expect-error An existing field value cannot be written back either.
  context.input[key] = value;
  return value;
}
void presentField;

declare const unknownInput: unknown;
declare const presentUnknown: CompletionTextPresenter<unknown>;
presentUnknown({ input: unknownInput });
presentUnknown({ input: null });
presentUnknown({ input: undefined });

interface Formatter {
  label: string;
  (value: number): string;
  (value: string): number;
}
const presentFormatter: CompletionTextPresenter<Formatter> = ({ input }) => {
  input(1) satisfies string;
  input("one") satisfies number;
  // @ts-expect-error The overloads accept only numbers and strings.
  input(false);
  // @ts-expect-error A callable input's own fields are readonly.
  input.label = "changed";
  return text.line(input.label);
};
declare const formatter: Formatter;
presentValidated(presentFormatter, formatter);
// @ts-expect-error The validated formatter must also be callable.
presentFormatter({ input: { label: "plain" } });

interface Factory {
  label: string;
  new <Value>(value: Value): { value: Value };
}
const presentFactory: CompletionTextPresenter<Factory> = ({ input }) => {
  new input("one" as const).value satisfies "one";
  // @ts-expect-error The constructor requires exactly one argument.
  new input("one", "two");
  // @ts-expect-error Constructor fields are readonly.
  input.label = "changed";
  return text.line(input.label);
};
// @ts-expect-error A properties-only value is missing the construct signature.
presentFactory({ input: { label: "plain" } });

declare const identity: <Value>(value: Value) => Value;
declare const plainFunction: TextPresenterContext<typeof identity>;
plainFunction.input("one") satisfies "one";
declare const namedFunction: TextPresenterContext<
  typeof identity & { label: string }
>;
namedFunction.input("one") satisfies "one";
// @ts-expect-error The generic function requires exactly one argument.
namedFunction.input("one", "two");
