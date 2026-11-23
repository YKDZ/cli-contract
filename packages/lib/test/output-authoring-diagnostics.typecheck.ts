import {
  defineCli,
  helpCapability,
  text,
  type AtomicExecution,
  type CliContractResult,
  type ContractSchema,
  type ContractSchemaOutput,
  type StreamExecution,
  type StreamRecordFactUnion,
} from "@ykdz/cli-contract";

declare const input: ContractSchema<{ readonly id: string }>;
declare const payload: ContractSchema<
  { readonly raw: number },
  { readonly decoded: string }
>;

type Variants = Readonly<{
  readonly found: {
    readonly schema: typeof payload;
    readonly description: string;
    readonly exitCode: number;
  };
  readonly cached: {
    readonly schema: typeof payload;
    readonly description: string;
    readonly exitCode: number;
  };
}>;
type Failures = Readonly<{
  readonly denied: {
    readonly schema: typeof payload;
    readonly description: string;
    readonly exitCode: number;
  };
}>;
type Records = Readonly<{
  readonly event: {
    readonly schema: typeof payload;
    readonly description: string;
  };
}>;

declare const atomic: AtomicExecution<
  "root",
  typeof input,
  Readonly<{ readonly kind: "data"; readonly variants: Variants }>,
  Failures
>;
declare const completion: AtomicExecution<
  "root",
  typeof input,
  Readonly<{ readonly kind: "completion" }>,
  Failures
>;
declare const stream: StreamExecution<"root", typeof input, Records, Failures>;

const say = (value: ContractSchemaOutput<typeof payload>) =>
  text.line(value.decoded);
const terminal = () => text.silent;

const valid = {
  description: "Human",
  success: { found: say, cached: say },
  failures: { denied: say },
} as const;

// Ordinary authors keep inference; every presenter is checked against schema output.
atomic.text(valid);
atomic.text({
  description: "Human",
  success: {
    found: (value) => text.line(value.decoded),
    cached: say,
  },
  failures: { denied: (value) => text.line(value.decoded) },
});
completion.text({
  description: "Human",
  success: terminal,
  failures: { denied: say },
});
stream.text({
  description: "Human",
  records: { event: say },
  failures: { denied: say },
  terminal,
});

// A stream record presenter returns a line or fragment, never silence or a line group.
stream.text({
  description: "Human",
  // @ts-expect-error [output-authoring-diagnostics] root record event cannot forge silent.
  records: { event: () => text.silent },
  failures: { denied: say },
  terminal,
});
stream.text({
  description: "Human",
  // @ts-expect-error [output-authoring-diagnostics] root record event cannot return a line group.
  records: { event: () => text.lines(["One line", "Two lines"]) },
  failures: { denied: say },
  terminal,
});

// Two text modes share one execution; each table that omits the shared failure
// must report at its own .text call.
const sharedFailureMissing = { ...valid, failures: {} };
// @ts-expect-error [output-authoring-diagnostics] root failure denied missing text presenter.
atomic.text(sharedFailureMissing);
// @ts-expect-error [output-authoring-diagnostics] root failure denied missing text presenter (second table).
atomic.text({ ...valid, failures: {} });

// Extracting the declaration to a variable keeps the closed-set check local.
const extractedMissing = { ...valid, success: { found: say } };
// @ts-expect-error [output-authoring-diagnostics] root data cached missing text presenter.
atomic.text(extractedMissing);

// Omitting a whole presenter member is a missing presenter, not a plain missing property.
// @ts-expect-error [output-authoring-diagnostics] root failure missing text presenter (whole table omitted).
atomic.text({ description: "Human", success: { found: say, cached: say } });
// @ts-expect-error [output-authoring-diagnostics] root data missing text presenter (whole table omitted).
atomic.text({ description: "Human", failures: { denied: say } });
// @ts-expect-error [output-authoring-diagnostics] root completion missing text presenter.
completion.text({ description: "Human", failures: { denied: say } });
// @ts-expect-error [output-authoring-diagnostics] root streamSuccess missing text presenter.
stream.text({
  description: "Human",
  records: { event: say },
  failures: { denied: say },
});

// Wide string-index tables cannot prove coverage of a closed variant set.
const wide: Record<string, typeof say> = {};
const wideNever: Record<string, never> = {};
// @ts-expect-error [output-authoring-diagnostics] root failure wide table.
atomic.text({ ...valid, failures: wide });
// @ts-expect-error [output-authoring-diagnostics] root failure wide never table.
atomic.text({ ...valid, failures: wideNever });

// Extra keys and wrong payloads are rejected at the presenter table.
// @ts-expect-error [output-authoring-diagnostics] root failure extra key.
atomic.text({ ...valid, failures: { denied: say, stale: say } });
atomic.text({
  ...valid,
  // @ts-expect-error [output-authoring-diagnostics] root failure wrong payload.
  failures: { denied: (value: number) => text.line(String(value)) },
});
// @ts-expect-error [output-authoring-diagnostics] root extra option key.
atomic.text({ ...valid, junk: true });

// Stream record coverage and terminal are checked the same way.
// @ts-expect-error [output-authoring-diagnostics] root record event missing text presenter.
stream.text({
  description: "Human",
  records: {},
  failures: { denied: say },
  terminal,
});

// Root and leaf contracts project closed mode keys and literal defaults.
declare const emptyInput: ContractSchema<Record<string, never>>;
const define = defineCli<undefined>();
const root = define({
  root: "root",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    root: {
      kind: "rootCommand",
      name: "root",
      description: "Root",
      input: emptyInput,
      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          modes: { json: operation.structured({ description: "JSON" }) },
        };
      },
    },
  },
});
const leaf = define.command("leaf")({
  kind: "command",
  parent: "tool",
  name: "leaf",
  description: "Leaf",
  input: emptyInput,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return { modes: { json: operation.structured({ description: "JSON" }) } };
  },
});
const tool = define({
  root: "tool",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    tool: { kind: "rootGroup", name: "tool", description: "Tool" },
    ...leaf,
  },
});

type RootGrammarMode = keyof typeof root.grammar.root.outputs.modes;
type RootManifestMode = keyof typeof root.manifest.commands.root.outputs.modes;
type LeafGrammarMode =
  keyof (typeof tool.grammar.nodes)[number]["outputs"]["modes"];
type LeafManifestMode = keyof typeof tool.manifest.commands.leaf.outputs.modes;
type LeafCombinationMode = keyof typeof leaf.leaf.outputs.modes;

// @ts-expect-error [output-authoring-diagnostics] Root grammar modes are a closed set.
const rootUnknownGrammar: RootGrammarMode = "unknown";
// @ts-expect-error [output-authoring-diagnostics] Root manifest modes are a closed set.
const rootUnknownManifest: RootManifestMode = "unknown";
// @ts-expect-error [output-authoring-diagnostics] Leaf grammar modes are a closed set.
const leafUnknownGrammar: LeafGrammarMode = "unknown";
// @ts-expect-error [output-authoring-diagnostics] Leaf manifest modes are a closed set.
const leafUnknownManifest: LeafManifestMode = "unknown";
// @ts-expect-error [output-authoring-diagnostics] Leaf combination modes are a closed set.
const leafUnknownCombination: LeafCombinationMode = "unknown";
void rootUnknownGrammar;
void rootUnknownManifest;
void leafUnknownGrammar;
void leafUnknownManifest;
void leafUnknownCombination;

root.grammar.root.outputs.default satisfies "json";
root.manifest.commands.root.outputs.default satisfies "json";
tool.manifest.commands.leaf.outputs.default satisfies "json";
leaf.leaf.outputs.default satisfies "json";
declare const leafGrammar: (typeof tool.grammar.nodes)[number];
leafGrammar.outputs.default satisfies "json";

// The public result projection keeps closed variant sets and the validated schema output.
const resultDefine = defineCli<undefined>();
const dataContract = resultDefine({
  root: "data",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    data: {
      kind: "rootCommand",
      name: "data",
      description: "Data",
      input: emptyInput,
      outputs({ atomic }) {
        const operation = atomic({
          success: {
            kind: "data",
            variants: {
              found: { schema: payload, description: "Found", exitCode: 0 },
            },
          },
          failures: {
            denied: { schema: payload, description: "Denied", exitCode: 1 },
          },
          handler: ({ outcome }) => outcome.data.found({ raw: 1 }),
        });
        return {
          default: "json",
          modes: {
            json: operation.structured({ description: "JSON" }),
            human: operation.text({
              description: "Human",
              success: { found: say },
              failures: { denied: say },
            }),
          },
        };
      },
    },
  },
});

type DataResult = CliContractResult<typeof dataContract>;
type DataVariantKey = Extract<DataResult, { readonly kind: "data" }>["variant"];
type FailureVariantKey = Extract<
  DataResult,
  { readonly kind: "failure" }
>["variant"];
type DataPayload = Extract<DataResult, { readonly kind: "data" }>["data"];

const dataKey: DataVariantKey = "found";
const failureKey: FailureVariantKey = "denied";
const decodedPayload: DataPayload = { decoded: "value" };
void dataKey;
void failureKey;
void decodedPayload;
// @ts-expect-error [output-authoring-diagnostics] Data result variants are a closed set.
const staleDataKey: DataVariantKey = "stale";
// @ts-expect-error [output-authoring-diagnostics] Failure result variants are a closed set.
const staleFailureKey: FailureVariantKey = "stale";
// @ts-expect-error [output-authoring-diagnostics] Result payload is schema output, not input.
const rawPayload: DataPayload = { raw: 1 };
void staleDataKey;
void staleFailureKey;
void rawPayload;

const streamContract = resultDefine({
  root: "stream",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    stream: {
      kind: "rootCommand",
      name: "stream",
      description: "Stream",
      input: emptyInput,
      outputs({ stream }) {
        const operation = stream({
          records: {
            event: { schema: payload, description: "Event" },
          },
          failures: {
            denied: { schema: payload, description: "Denied", exitCode: 1 },
          },
          async *handler({ outcome }) {
            yield outcome.record.event({ raw: 1 });
            return outcome.streamSuccess();
          },
        });
        return {
          default: "json",
          modes: {
            json: operation.structured({ description: "JSON" }),
            human: operation.text({
              description: "Human",
              records: { event: (value) => text.fragment(value.decoded) },
              failures: { denied: say },
              terminal,
            }),
          },
        };
      },
    },
  },
});

type StreamResult = CliContractResult<typeof streamContract>;
type StreamSuccessKind = Extract<
  StreamResult,
  { readonly kind: "streamSuccess" }
>["kind"];
type StreamFailureKey = Extract<
  StreamResult,
  { readonly kind: "failure" }
>["variant"];
type StreamRecordKey = StreamRecordFactUnion<
  "stream",
  Records,
  "output"
>["variant"];
const streamSuccess: StreamSuccessKind = "streamSuccess";
const streamFailureKey: StreamFailureKey = "denied";
const recordKey: StreamRecordKey = "event";
void streamSuccess;
void streamFailureKey;
void recordKey;
// @ts-expect-error [output-authoring-diagnostics] Stream success terminal is a closed kind.
const staleStreamSuccess: StreamSuccessKind = "data";
// @ts-expect-error [output-authoring-diagnostics] Stream failure variants are a closed set.
const staleStreamFailure: StreamFailureKey = "stale";
// @ts-expect-error [output-authoring-diagnostics] Stream record variants are a closed set.
const staleRecordKey: StreamRecordKey = "stale";
void staleStreamSuccess;
void staleStreamFailure;
void staleRecordKey;
