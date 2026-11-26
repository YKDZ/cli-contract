import {
  text,
  type OutputModeDefinition,
  type TextPresenterContext,
  type AtomicExecutionDefinition,
  type AtomicExecutionFactory,
  type AtomicTextOptions,
  type ContractSchema,
  type ContractSchemaOutput,
  type DeclaredRecords,
  type DeclaredVariants,
  type StreamExecutionDefinition,
  type StreamExecutionFactory,
  type StreamTextOptions,
} from "@boringparts/cli-contract";

declare const input: ContractSchema<
  { readonly rawId: string },
  { id: string; display: { limit: number } }
>;
declare const payload: ContractSchema<
  { readonly encoded: string },
  { readonly decoded: number }
>;

type DataSuccess<Variants extends DeclaredVariants> = Readonly<{
  readonly kind: "data";
  readonly variants: Variants;
}>;

// A business-agnostic wrapper forwards the precise factory parameter and the explicit-key
// text options to the formal factory and `.text` without any assertion.
function wrapAtomic<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  const Variants extends DeclaredVariants,
  const Failures extends DeclaredVariants,
  const SuccessKeys extends PropertyKey,
  const FailureKeys extends PropertyKey,
  const OptionKeys extends PropertyKey,
>(
  atomic: AtomicExecutionFactory<Command, Dependencies, InputSchema>,
  declaration: AtomicExecutionDefinition<
    Command,
    Dependencies,
    InputSchema,
    DataSuccess<Variants>,
    Failures
  >,
  presentation: AtomicTextOptions<
    Command,
    InputSchema,
    DataSuccess<Variants>,
    Failures,
    SuccessKeys,
    FailureKeys,
    OptionKeys
  >,
) {
  const execution = atomic<object, DataSuccess<Variants>, Failures>(
    declaration,
  );
  return {
    modes: {
      json: execution.structured({ description: "JSON" }),
      human: execution.text<SuccessKeys, FailureKeys, OptionKeys>(presentation),
    },
  };
}

function wrapStream<
  Command extends string,
  Dependencies,
  InputSchema extends ContractSchema,
  const Records extends DeclaredRecords,
  const Failures extends DeclaredVariants,
  const RecordKeys extends PropertyKey,
  const FailureKeys extends PropertyKey,
  const OptionKeys extends PropertyKey,
>(
  stream: StreamExecutionFactory<Command, Dependencies, InputSchema>,
  declaration: StreamExecutionDefinition<
    Command,
    Dependencies,
    InputSchema,
    Records,
    Failures
  >,
  presentation: StreamTextOptions<
    Command,
    InputSchema,
    Records,
    Failures,
    RecordKeys,
    FailureKeys,
    OptionKeys
  >,
) {
  const execution = stream<object, Records, Failures>(declaration);
  return {
    modes: {
      json: execution.structured({ description: "JSON" }),
      human: execution.text<RecordKeys, FailureKeys, OptionKeys>(presentation),
    },
  };
}

declare const atomicFactory: AtomicExecutionFactory<
  "lookup",
  { readonly network: boolean },
  typeof input
>;
declare const streamFactory: StreamExecutionFactory<
  "lookup",
  { readonly network: boolean },
  typeof input
>;

const found = { schema: payload, description: "Found", exitCode: 0 };
const denied = { schema: payload, description: "Denied", exitCode: 1 };
const say = (value: { readonly decoded: number }) =>
  text.line(String(value.decoded));

const forwarded = wrapAtomic(
  atomicFactory,
  {
    success: { kind: "data", variants: { found } },
    failures: { denied },
    handler({ input: raw, dependencies, outcome }) {
      if (dependencies.network) return outcome.data.found({ encoded: raw.id });
      return outcome.failure.denied({ encoded: raw.id });
    },
  },
  {
    description: "Human",
    success: {
      found: (value, { input }) => text.line(input.id + value.decoded),
    },
    failures: {
      denied: (value, { input }) => text.line(input.id + value.decoded),
    },
  },
);

// The wrapper preserves the closed mode keys, the schema Input/Output and the result variants.
forwarded.modes.human.success.variants.found.schema satisfies typeof payload;
forwarded.modes.json.success.variants.found.schema satisfies typeof payload;
// @ts-expect-error [output-authoring-forward] Mode keys survive the wrapper.
void forwarded.modes.missing;

const forwardedStream = wrapStream(
  streamFactory,
  {
    records: { update: { schema: payload, description: "Update" } },
    failures: { denied },
    async *handler({ outcome }) {
      yield outcome.record.update({ encoded: "x" });
      return outcome.streamSuccess();
    },
  },
  {
    description: "Human",
    records: {
      update: (value, { input }) => text.fragment(input.id + value.decoded),
    },
    failures: { denied: say },
    terminal: ({ input }) => text.line(input.id),
  },
);
forwardedStream.modes.human.success.records.update
  .schema satisfies typeof payload;
// @ts-expect-error [output-authoring-forward] Stream mode keys survive the wrapper.
void forwardedStream.modes.missing;

// Extracted presenter tables still report missing keys, wide tables and wrong payloads early.
const missingFailure = {
  description: "Human",
  success: { found: say },
  failures: {},
};
wrapAtomic(
  atomicFactory,
  {
    success: { kind: "data", variants: { found } },
    failures: { denied },
    handler: ({ outcome }) => outcome.data.found({ encoded: "x" }),
  },
  // @ts-expect-error [output-authoring-forward] root failure denied missing text presenter.
  missingFailure,
);

const wideFailure: Record<string, typeof say> = {};
wrapAtomic(
  atomicFactory,
  {
    success: { kind: "data", variants: { found } },
    failures: { denied },
    handler: ({ outcome }) => outcome.data.found({ encoded: "x" }),
  },
  // @ts-expect-error [output-authoring-forward] root failure wide table.
  { description: "Human", success: { found: say }, failures: wideFailure },
);

wrapAtomic(
  atomicFactory,
  {
    success: { kind: "data", variants: { found } },
    failures: { denied },
    handler: ({ outcome }) => outcome.data.found({ encoded: "x" }),
  },
  {
    description: "Human",
    success: { found: say },
    // @ts-expect-error [output-authoring-forward] root failure wrong payload.
    failures: { denied: (value: number) => text.line(String(value)) },
  },
);

// Ordinary authors keep auto-inference without naming any key generic.
const ordinary = atomicFactory({
  success: { kind: "data", variants: { found } },
  failures: { denied },
  handler: ({ outcome }) => outcome.data.found({ encoded: "x" }),
});
ordinary.text({
  description: "Human",
  success: {
    found: (value, context) => {
      // @ts-expect-error The presenter cannot replace the context input.
      context.input = { id: "next", display: { limit: 2 } };
      // @ts-expect-error The validated input is shallowly readonly.
      context.input.id = "next";
      context.input.display.limit = 2;
      // @ts-expect-error The raw input has been transformed by the schema.
      void context.input.rawId;
      return text.line(context.input.id + value.decoded);
    },
  },
  failures: { denied: say },
});

const validated = { id: "alice", display: { limit: 2 } };
forwarded.modes.human.success.variants.found.text(
  { decoded: 1 },
  { input: validated },
);
forwardedStream.modes.human.success.text({ input: validated });
// @ts-expect-error Direct calls require the validated input context.
forwarded.modes.human.success.variants.found.text({ decoded: 1 });
// @ts-expect-error A raw command input cannot replace the schema output.
forwardedStream.modes.human.success.text({ input: { rawId: "alice" } });

declare const mode: OutputModeDefinition<"lookup", typeof input>;
if (mode.delivery === "stream" && mode.format === "text") {
  mode.success.text({ input: validated });
  // @ts-expect-error An inspected mode still requires its transformed input.
  mode.success.text({ input: { rawId: "alice" } });
}

declare const erasedMode: OutputModeDefinition;
if (erasedMode.delivery === "stream" && erasedMode.format === "text") {
  // @ts-expect-error The input type must be known to call an erased presenter.
  erasedMode.success.text({ input: validated });
}

declare const unionContext: TextPresenterContext<
  { id: string } | { limit: number }
>;
if ("limit" in unionContext.input) {
  // @ts-expect-error Each union member is shallowly readonly.
  unionContext.input.limit = 2;
}

declare const functionContext: TextPresenterContext<<T>(value: T) => T>;
functionContext.input("alice") satisfies "alice";

function presentStreamSuccess<Schema extends ContractSchema>(
  mode: OutputModeDefinition<"lookup", Schema>,
  input: ContractSchemaOutput<Schema>,
) {
  if (mode.delivery === "stream" && mode.format === "text") {
    return mode.success.text({ input });
  }
  return text.silent;
}
presentStreamSuccess<typeof input>(forwardedStream.modes.human, validated);
