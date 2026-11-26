import {
  text,
  type AtomicExecutionDefinition,
  type AtomicExecutionFactory,
  type AtomicTextOptions,
  type AtomicTextPresenter,
  type CompletionTextPresenter,
  type ContractSchema,
  type ContractSchemaOutput,
  type DeclaredRecords,
  type DeclaredVariants,
  type OutputModeDefinition,
  type OutputModeTableDeclaration,
  type StreamExecutionDefinition,
  type StreamExecutionFactory,
  type StreamTextOptions,
  type StreamTextPresenter,
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

// A business-agnostic wrapper forwards the precise factory parameter and the
// explicit-key text options to the formal factory and `.text` without assertions.
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

// The wrapper preserves the closed mode keys and the schema Input/Output transform.
forwarded.modes.human.success.variants.found.schema satisfies typeof payload;
forwarded.modes.json.success.variants.found.schema satisfies typeof payload;
forwarded.modes.human.success.variants.found.text satisfies AtomicTextPresenter<
  ContractSchemaOutput<typeof payload>,
  ContractSchemaOutput<typeof input>
>;
// @ts-expect-error Mode keys survive the wrapper.
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
const modeTable: OutputModeTableDeclaration = {
  modes: { human: forwardedStream.modes.human },
};
const erased = modeTable.modes.human;
if (erased?.delivery === "stream" && erased.format === "text") {
  // @ts-expect-error An erased table can store the mode but cannot supply the command's input.
  erased.success.text({ input: null });
}
// @ts-expect-error A command-specific terminal cannot accept arbitrary validated input.
const widened: OutputModeDefinition<"lookup", ContractSchema> =
  forwardedStream.modes.human;
void widened;
forwardedStream.modes.human.success.records.update
  .schema satisfies typeof payload;
forwardedStream.modes.human.success.records.update
  .text satisfies StreamTextPresenter<
  ContractSchemaOutput<typeof payload>,
  ContractSchemaOutput<typeof input>
>;
forwardedStream.modes.human.success.text satisfies CompletionTextPresenter<
  ContractSchemaOutput<typeof input>
>;
// @ts-expect-error Stream mode keys survive the wrapper.
void forwardedStream.modes.missing;

// Extracted presenter tables still report missing keys early at the call site.
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
  // @ts-expect-error The failure table omits the denied presenter.
  missingFailure,
);

// Extra keys beyond the closed failure set are rejected at the call site.
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
    // @ts-expect-error The failure table adds a key outside the closed set.
    failures: { denied: say, stale: say },
  },
);

// A wide string index cannot prove coverage of the closed failure set.
const wideFailure: Record<string, typeof say> = {};
wrapAtomic(
  atomicFactory,
  {
    success: { kind: "data", variants: { found } },
    failures: { denied },
    handler: ({ outcome }) => outcome.data.found({ encoded: "x" }),
  },
  // @ts-expect-error A wide failure table loses the closed key set.
  { description: "Human", success: { found: say }, failures: wideFailure },
);

// A presenter with the wrong payload shape is rejected at the call site.
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
    // @ts-expect-error The denied presenter receives the schema output, not a number.
    failures: { denied: (value: number) => text.line(String(value)) },
  },
);

// Stream records keep the same closed-set and payload constraints.
wrapStream(
  streamFactory,
  {
    records: { update: { schema: payload, description: "Update" } },
    failures: { denied },
    async *handler({ outcome }) {
      yield outcome.record.update({ encoded: "x" });
      return outcome.streamSuccess();
    },
  },
  // @ts-expect-error The record table omits the update presenter.
  {
    description: "Human",
    records: {},
    failures: { denied: say },
    terminal: () => text.silent,
  },
);

wrapStream(
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
    // @ts-expect-error The update presenter receives the schema output, not a number.
    records: { update: (value: number) => text.fragment(String(value)) },
    failures: { denied: say },
    terminal: () => text.silent,
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
  success: { found: (value) => text.line(String(value.decoded)) },
  failures: { denied: (value) => text.line(String(value.decoded)) },
});

void forwarded;
void forwardedStream;
void ordinary;
