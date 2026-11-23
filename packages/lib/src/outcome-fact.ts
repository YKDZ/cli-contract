import { ContractExecutionError } from "#/contract-execution-error";
import type { ContractSchema } from "#/contract-schema";

const outcomeFactType = Symbol("OutcomeFact.type");
const textProjectionType = Symbol("TextProjection.type");
const issuedTextProjections = new WeakSet<object>();

export interface TextLine {
  readonly kind: "line";
  readonly value: string;
  readonly [textProjectionType]: true;
}

export interface TextLines {
  readonly kind: "lines";
  readonly lines: readonly string[];
  readonly [textProjectionType]: true;
}

export interface SilentText {
  readonly kind: "silent";
  readonly [textProjectionType]: true;
}

export interface TextFragment {
  readonly kind: "fragment";
  readonly value: string;
  readonly [textProjectionType]: true;
}

/** Presents a completion or stream-success terminal state; may return text.silent. */
export type CompletionTextPresenter = () => TextLine | TextLines | SilentText;
/** Presents one atomic data or failure payload as a line or line group. */
export type AtomicTextPresenter<Payload> = {
  bivarianceHack(payload: Payload): TextLine | TextLines;
}["bivarianceHack"];
/** Presents one stream record as a line or fragment. */
export type StreamTextPresenter<Payload> = {
  bivarianceHack(payload: Payload): TextLine | TextFragment;
}["bivarianceHack"];

export type TextValueErrorIssue =
  | Readonly<{
      readonly code: "invalidTextLine";
      readonly reason: "notString";
    }>
  | Readonly<{
      readonly code: "invalidTextLine";
      readonly reason:
        | "empty"
        | "carriageReturn"
        | "lineFeed"
        | "nullCharacter";
    }>
  | Readonly<{
      readonly code: "invalidTextLines";
      readonly reason: "notArray" | "noLines" | "noNonEmptyLine";
    }>
  | Readonly<{
      readonly code: "invalidTextLines";
      readonly reason:
        | "notString"
        | "carriageReturn"
        | "lineFeed"
        | "nullCharacter";
      /** Zero-based position of the invalid member within `text.lines`. */
      readonly line: number;
    }>
  | Readonly<{
      readonly code: "invalidTextFragment";
      readonly reason: "notString" | "empty";
    }>
  | Readonly<{
      readonly code: "invalidTextFragment";
      readonly reason: "nullCharacter";
      /** Zero-based LF-counted line number of the NUL within the fragment. */
      readonly line: number;
    }>;

/**
 * TypeError thrown when a text constructor finds a dynamic value that violates the
 * framing rules. `message` keeps the stable code; `issue` gives the closed reason and
 * the applicable zero-based line position, without the text content.
 */
export class TextValueError extends TypeError {
  readonly issue: TextValueErrorIssue;

  constructor(issue: TextValueErrorIssue) {
    super(issue.code);
    this.name = "TextValueError";
    this.issue = Object.freeze(issue);
  }
}

/* oxlint-disable typescript/no-unsafe-type-assertion -- Text projections are issued only by these factories; runtime identity is checked via the WeakSet. */
function createTextLine(value: string): TextLine {
  if (typeof value !== "string") {
    throw new TextValueError({ code: "invalidTextLine", reason: "notString" });
  }
  if (value.length === 0) {
    throw new TextValueError({ code: "invalidTextLine", reason: "empty" });
  }
  if (value.includes("\r")) {
    throw new TextValueError({
      code: "invalidTextLine",
      reason: "carriageReturn",
    });
  }
  if (value.includes("\n")) {
    throw new TextValueError({ code: "invalidTextLine", reason: "lineFeed" });
  }
  if (value.includes("\0")) {
    throw new TextValueError({
      code: "invalidTextLine",
      reason: "nullCharacter",
    });
  }
  const projection = Object.freeze({ kind: "line" as const, value });
  issuedTextProjections.add(projection);
  return projection as TextLine;
}

function createTextLines(values: readonly [string, ...string[]]): TextLines {
  if (!Array.isArray(values)) {
    throw new TextValueError({ code: "invalidTextLines", reason: "notArray" });
  }
  if (values.length === 0) {
    throw new TextValueError({ code: "invalidTextLines", reason: "noLines" });
  }
  const snapshot = [...values];
  for (const [line, value] of snapshot.entries()) {
    if (typeof value !== "string") {
      throw new TextValueError({
        code: "invalidTextLines",
        reason: "notString",
        line,
      });
    }
    if (value.includes("\r")) {
      throw new TextValueError({
        code: "invalidTextLines",
        reason: "carriageReturn",
        line,
      });
    }
    if (value.includes("\n")) {
      throw new TextValueError({
        code: "invalidTextLines",
        reason: "lineFeed",
        line,
      });
    }
    if (value.includes("\0")) {
      throw new TextValueError({
        code: "invalidTextLines",
        reason: "nullCharacter",
        line,
      });
    }
  }
  if (snapshot.every((value) => value.length === 0)) {
    throw new TextValueError({
      code: "invalidTextLines",
      reason: "noNonEmptyLine",
    });
  }
  const projection = Object.freeze({
    kind: "lines" as const,
    lines: Object.freeze(snapshot),
  });
  issuedTextProjections.add(projection);
  return projection as TextLines;
}

const silentProjection = Object.freeze({ kind: "silent" as const });
issuedTextProjections.add(silentProjection);
const silentText = silentProjection as SilentText;

function createTextFragment(value: string): TextFragment {
  if (typeof value !== "string") {
    throw new TextValueError({
      code: "invalidTextFragment",
      reason: "notString",
    });
  }
  if (value.length === 0) {
    throw new TextValueError({
      code: "invalidTextFragment",
      reason: "empty",
    });
  }
  const nullCharacter = value.indexOf("\0");
  if (nullCharacter >= 0) {
    const line = value.slice(0, nullCharacter).split("\n").length - 1;
    throw new TextValueError({
      code: "invalidTextFragment",
      reason: "nullCharacter",
      line,
    });
  }
  const projection = Object.freeze({ kind: "fragment" as const, value });
  issuedTextProjections.add(projection);
  return projection as TextFragment;
}
/* oxlint-enable typescript/no-unsafe-type-assertion */

/**
 * Construct text projections explicitly inside presenters; only text values are
 * validated here, while channel routing and framing belong to the execution kernel.
 * Dynamic values that violate the construction rules throw {@link TextValueError},
 * whose message is the stable code and whose issue carries no original text.
 */
export const text = Object.freeze({
  /**
   * Construct one non-empty raw string line, rejecting CR, LF and NUL; the core
   * appends exactly one LF when writing. Valid for completion, data, failure and
   * stream-success terminal states and for ordinary stream records. Presenters
   * supply the full text; the core writes no copy of its own. Dynamic non-strings
   * are rejected as notString without text or line position; callers may convert
   * with String explicitly, and the converted string is still checked by content.
   */
  line: createTextLine,
  /**
   * Construct a non-empty tuple of lines (readonly [string, ...string[]]) with at
   * least one non-empty member; each line rejects CR, LF and NUL. Empty members may
   * deliberately keep blank lines. The core joins with LF and appends one trailing
   * LF; dynamic invalid members report their zero-based position. Valid for
   * completion, data, failure and stream-success terminal states and for help
   * supplements, but not for stream records. For example
   * `text.lines(["Done", "", "Details"])`.
   */
  lines: createTextLines,
  /**
   * Only for incremental text that stream records concatenate verbatim; must be a
   * non-empty raw string without NUL, and may contain LF. Dynamic non-strings are
   * rejected as notString without text or line position; callers may convert with
   * String explicitly, and the converted string is still checked by content. The
   * core writes it verbatim without appending or converting characters, so one line
   * per record is not promised; NUL errors report a zero-based line number.
   */
  fragment: createTextFragment,
  /**
   * Only for completion success or the stream-success terminal state to explicitly
   * write no text bytes; the presenter must still return this value. Omitting a
   * presenter is not silence; data, failure and stream records must all produce text.
   */
  silent: silentText,
});

export function isIssuedTextProjection(
  value: unknown,
): value is TextLine | TextLines | TextFragment | SilentText {
  return (
    typeof value === "object" &&
    value !== null &&
    issuedTextProjections.has(value)
  );
}

export function encodeAtomicText(value: unknown): string {
  return encodeApplicationText(value, "atomic");
}

export function encodeRecordText(value: unknown): string {
  return encodeApplicationText(value, "record");
}

export function encodeTerminalText(value: unknown): string | undefined {
  return encodeApplicationText(value, "terminal");
}

function encodeApplicationText(
  value: unknown,
  purpose: "atomic" | "record",
): string;
function encodeApplicationText(
  value: unknown,
  purpose: "terminal",
): string | undefined;
function encodeApplicationText(
  value: unknown,
  purpose: "atomic" | "record" | "terminal",
): string | undefined {
  if (!isIssuedTextProjection(value)) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }

  switch (value.kind) {
    case "line":
      return `${value.value}\n`;
    case "lines":
      if (purpose !== "record") return `${value.lines.join("\n")}\n`;
      break;
    case "fragment":
      if (purpose === "record") return value.value;
      break;
    case "silent":
      if (purpose === "terminal") return undefined;
      break;
  }

  throw new ContractExecutionError([{ code: "invalidCliContract" }]);
}

/**
 * One named data-success variant. Outcome constructors accept the schema Input;
 * the text presenter receives the validated and transformed schema Output.
 */
export type DataVariantDefinition<
  Input = unknown,
  TextEnabled extends boolean = boolean,
  Output = Input,
> = {
  readonly description: string;
  readonly schema: ContractSchema<Input, Output>;
  readonly exitCode: number;
} & (TextEnabled extends true
  ? Readonly<{ readonly text: AtomicTextPresenter<Output> }>
  : TextEnabled extends false
    ? Readonly<{ readonly text?: never }>
    : Readonly<{ readonly text?: AtomicTextPresenter<Output> }>);

export type DataVariantDefinitions<_TextEnabled extends boolean = boolean> =
  Readonly<
    Record<
      string,
      Readonly<{
        readonly description: string;
        readonly schema: ContractSchema;
        readonly exitCode: number;
        readonly text?: unknown;
      }>
    >
  >;

/**
 * One named stream record. Outcome constructors accept the schema Input; the text
 * presenter receives the validated and transformed schema Output.
 */
export type StreamRecordDefinition<
  Input = unknown,
  TextEnabled extends boolean = boolean,
  Output = Input,
> = Readonly<{
  readonly description: string;
  readonly schema: ContractSchema<Input, Output>;
}> &
  (TextEnabled extends true
    ? Readonly<{ readonly text: StreamTextPresenter<Output> }>
    : TextEnabled extends false
      ? Readonly<{ readonly text?: never }>
      : Readonly<{ readonly text?: StreamTextPresenter<Output> }>);

export type StreamRecordDefinitions<_TextEnabled extends boolean = boolean> =
  Readonly<
    Record<
      string,
      Readonly<{
        readonly description: string;
        readonly schema: ContractSchema;
        readonly text?: unknown;
      }>
    >
  >;

/**
 * One named failure variant. Outcome constructors accept the schema Input; the text
 * presenter receives the validated and transformed schema Output.
 */
export type FailureVariantDefinition<
  Input = unknown,
  TextEnabled extends boolean = boolean,
  Output = Input,
> = {
  readonly description: string;
  readonly schema: ContractSchema<Input, Output>;
  readonly exitCode: number;
} & (TextEnabled extends true
  ? Readonly<{ readonly text: AtomicTextPresenter<Output> }>
  : TextEnabled extends false
    ? Readonly<{ readonly text?: never }>
    : Readonly<{ readonly text?: AtomicTextPresenter<Output> }>);

export type FailureVariantDefinitions<_TextEnabled extends boolean = boolean> =
  Readonly<
    Record<
      string,
      Readonly<{
        readonly description: string;
        readonly schema: ContractSchema;
        readonly exitCode: number;
        readonly text?: unknown;
      }>
    >
  >;

export interface CompletionFact<Command extends string = string> {
  readonly kind: "completion";
  readonly command: Command;
  readonly [outcomeFactType]: true;
}

export interface DataFact<
  Command extends string = string,
  Variant extends string = string,
  Data = unknown,
> {
  readonly kind: "data";
  readonly command: Command;
  readonly variant: Variant;
  readonly data: Data;
  readonly [outcomeFactType]: true;
}

export interface FailureFact<
  Command extends string = string,
  Variant extends string = string,
  Data = unknown,
> {
  readonly kind: "failure";
  readonly command: Command;
  readonly variant: Variant;
  readonly data: Data;
  readonly [outcomeFactType]: true;
}

export interface StreamRecordFact<
  Command extends string = string,
  Variant extends string = string,
  Data = unknown,
> {
  readonly kind: "record";
  readonly command: Command;
  readonly variant: Variant;
  readonly data: Data;
  readonly [outcomeFactType]: true;
}

export interface StreamSuccessFact<Command extends string = string> {
  readonly kind: "streamSuccess";
  readonly command: Command;
  readonly [outcomeFactType]: true;
}

export type OutcomeFact =
  | CompletionFact
  | DataFact
  | FailureFact
  | StreamRecordFact
  | StreamSuccessFact;

/** Constructs the completion fact of an atomic execution that succeeds without data. */
export interface CompletionOutcome<Command extends string> {
  completion(): CompletionFact<Command>;
}

type DataVariantPayload<Variant, Phase extends "input" | "output" = "input"> =
  Variant extends DataVariantDefinition<infer Input, boolean, infer Output>
    ? Phase extends "input"
      ? Input
      : Output
    : never;

export type DataFactUnion<
  Command extends string,
  Variants extends DataVariantDefinitions,
  Phase extends "input" | "output" = "input",
> = {
  readonly [Variant in keyof Variants & string]: DataFact<
    Command,
    Variant,
    DataVariantPayload<Variants[Variant], Phase>
  >;
}[keyof Variants & string];

/** Named data-success constructors scoped to one execution; each accepts its variant schema's Input. */
export type DataOutcome<
  Command extends string,
  Variants extends DataVariantDefinitions,
> = Readonly<{
  readonly data: Readonly<{
    [Variant in keyof Variants]: (
      payload: DataVariantPayload<Variants[Variant]>,
    ) => DataFact<
      Command,
      Variant & string,
      DataVariantPayload<Variants[Variant]>
    >;
  }>;
}>;

type FailureVariantPayload<
  Variant,
  Phase extends "input" | "output" = "input",
> =
  Variant extends FailureVariantDefinition<infer Input, boolean, infer Output>
    ? Phase extends "input"
      ? Input
      : Output
    : never;

export type FailureFactUnion<
  Command extends string,
  Failures extends object,
  Phase extends "input" | "output" = "input",
> = {
  readonly [Variant in keyof Failures & string]: FailureFact<
    Command,
    Variant,
    FailureVariantPayload<Failures[Variant], Phase>
  >;
}[keyof Failures & string];

/** Named failure constructors scoped to one execution; each accepts its variant schema's Input. */
export type FailureOutcome<
  Command extends string,
  Failures extends object,
> = Readonly<{
  readonly failure: Readonly<{
    [Variant in keyof Failures]: (
      payload: FailureVariantPayload<Failures[Variant]>,
    ) => FailureFact<
      Command,
      Variant & string,
      FailureVariantPayload<Failures[Variant]>
    >;
  }>;
}>;

type StreamRecordPayload<Variant, Phase extends "input" | "output" = "input"> =
  Variant extends StreamRecordDefinition<infer Input, boolean, infer Output>
    ? Phase extends "input"
      ? Input
      : Output
    : never;

export type StreamRecordFactUnion<
  Command extends string,
  Records extends StreamRecordDefinitions,
  Phase extends "input" | "output" = "input",
> = {
  readonly [Variant in keyof Records & string]: StreamRecordFact<
    Command,
    Variant,
    StreamRecordPayload<Records[Variant], Phase>
  >;
}[keyof Records & string];

/**
 * Record constructors and the successful terminal constructor scoped to one stream
 * execution. Yield record facts one by one; return streamSuccess() as the terminal fact.
 */
export type StreamOutcome<
  Command extends string,
  Records extends StreamRecordDefinitions,
> = Readonly<{
  readonly record: Readonly<{
    [Variant in keyof Records]: (
      payload: StreamRecordPayload<Records[Variant]>,
    ) => StreamRecordFact<
      Command,
      Variant & string,
      StreamRecordPayload<Records[Variant]>
    >;
  }>;
  streamSuccess(): StreamSuccessFact<Command>;
}>;

/* oxlint-disable typescript/no-unsafe-type-assertion -- The private type brand of outcome facts is guaranteed jointly by the issuing factories and the WeakSet. */
export function createCompletionFact<Command extends string>(
  command: Command,
  issuedOutcomeFacts: WeakSet<object>,
): CompletionFact<Command> {
  const fact = Object.freeze({ kind: "completion" as const, command });
  issuedOutcomeFacts.add(fact);
  return fact as CompletionFact<Command>;
}

export function createDataFact<
  Command extends string,
  Variant extends string,
  Data,
>(
  command: Command,
  variant: Variant,
  data: Data,
  issuedOutcomeFacts: WeakSet<object>,
): DataFact<Command, Variant, Data> {
  const fact = Object.freeze({ kind: "data" as const, command, variant, data });
  issuedOutcomeFacts.add(fact);
  return fact as DataFact<Command, Variant, Data>;
}

export function createFailureFact<
  Command extends string,
  Variant extends string,
  Data,
>(
  command: Command,
  variant: Variant,
  data: Data,
  issuedOutcomeFacts: WeakSet<object>,
): FailureFact<Command, Variant, Data> {
  const fact = Object.freeze({
    kind: "failure" as const,
    command,
    variant,
    data,
  });
  issuedOutcomeFacts.add(fact);
  return fact as FailureFact<Command, Variant, Data>;
}

export function createStreamRecordFact<
  Command extends string,
  Variant extends string,
  Data,
>(
  command: Command,
  variant: Variant,
  data: Data,
  issuedOutcomeFacts: WeakSet<object>,
): StreamRecordFact<Command, Variant, Data> {
  const fact = Object.freeze({
    kind: "record" as const,
    command,
    variant,
    data,
  });
  issuedOutcomeFacts.add(fact);
  return fact as StreamRecordFact<Command, Variant, Data>;
}

export function createStreamSuccessFact<Command extends string>(
  command: Command,
  issuedOutcomeFacts: WeakSet<object>,
): StreamSuccessFact<Command> {
  const fact = Object.freeze({ kind: "streamSuccess" as const, command });
  issuedOutcomeFacts.add(fact);
  return fact as StreamSuccessFact<Command>;
}
/* oxlint-enable typescript/no-unsafe-type-assertion */

export function isIssuedOutcomeFact(
  value: unknown,
  issuedOutcomeFacts: WeakSet<object>,
): value is OutcomeFact {
  return (
    typeof value === "object" && value !== null && issuedOutcomeFacts.has(value)
  );
}
