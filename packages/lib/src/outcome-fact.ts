import type { ContractSchema } from "#/contract-schema";

const outcomeFactType = Symbol("OutcomeFact.type");
const textProjectionType = Symbol("TextProjection.type");

export interface TextLine {
  readonly kind: "line";
  readonly value: string;
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

export type CompletionTextPresenter = () => TextLine | SilentText;
export type AtomicTextPresenter<Payload> = {
  bivarianceHack(payload: Payload): TextLine;
}["bivarianceHack"];
export type StreamTextPresenter<Payload> = {
  bivarianceHack(payload: Payload): TextLine | TextFragment;
}["bivarianceHack"];

function createTextLine(value: string): TextLine {
  if (
    value.length === 0 ||
    value.includes("\r") ||
    value.includes("\n") ||
    value.includes("\0")
  ) {
    throw new TypeError("文本行必须非空且不能包含 CR、LF 或 NUL");
  }
  return Object.freeze({ kind: "line" as const, value }) as TextLine;
}

const silentText = Object.freeze({ kind: "silent" as const }) as SilentText;

function createTextFragment(value: string): TextFragment {
  if (value.length === 0 || value.includes("\0")) {
    throw new TypeError("文本片段必须非空且不能包含 NUL");
  }
  return Object.freeze({ kind: "fragment" as const, value }) as TextFragment;
}

/** 受控文本投影构造器；执行内核拥有实际 framing。 */
export const text = Object.freeze({
  line: createTextLine,
  fragment: createTextFragment,
  silent: silentText,
});

export type DataVariantDefinition<
  Payload = unknown,
  TextEnabled extends boolean = boolean,
> = {
  readonly description: string;
  readonly schema: ContractSchema<Payload>;
  readonly exitCode: number;
} & (TextEnabled extends true
  ? Readonly<{ readonly text: AtomicTextPresenter<Payload> }>
  : TextEnabled extends false
    ? Readonly<{ readonly text?: never }>
    : Readonly<{ readonly text?: AtomicTextPresenter<Payload> }>);

export type DataVariantDefinitions<TextEnabled extends boolean = boolean> =
  Readonly<Record<string, DataVariantDefinition<unknown, TextEnabled>>>;

export type StreamRecordDefinition<
  Payload = unknown,
  TextEnabled extends boolean = boolean,
> = Readonly<{
  readonly description: string;
  readonly schema: ContractSchema<Payload>;
}> &
  (TextEnabled extends true
    ? Readonly<{ readonly text: StreamTextPresenter<Payload> }>
    : TextEnabled extends false
      ? Readonly<{ readonly text?: never }>
      : Readonly<{ readonly text?: StreamTextPresenter<Payload> }>);

export type StreamRecordDefinitions<TextEnabled extends boolean = boolean> =
  Readonly<Record<string, StreamRecordDefinition<unknown, TextEnabled>>>;

export type FailureVariantDefinition<
  Payload = unknown,
  TextEnabled extends boolean = boolean,
> = {
  readonly description: string;
  readonly schema: ContractSchema<Payload>;
  readonly exitCode: number;
} & (TextEnabled extends true
  ? Readonly<{ readonly text: AtomicTextPresenter<Payload> }>
  : TextEnabled extends false
    ? Readonly<{ readonly text?: never }>
    : Readonly<{ readonly text?: AtomicTextPresenter<Payload> }>);

export type FailureVariantDefinitions<TextEnabled extends boolean = boolean> =
  Readonly<Record<string, FailureVariantDefinition<unknown, TextEnabled>>>;

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

export interface CompletionOutcome<Command extends string> {
  completion(): CompletionFact<Command>;
}

type DataVariantPayload<Variant> =
  Variant extends DataVariantDefinition<infer Payload> ? Payload : never;

export type DataFactUnion<
  Command extends string,
  Variants extends DataVariantDefinitions,
> = {
  readonly [Variant in keyof Variants & string]: DataFact<
    Command,
    Variant,
    DataVariantPayload<Variants[Variant]>
  >;
}[keyof Variants & string];

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

type FailureVariantPayload<Variant> =
  Variant extends FailureVariantDefinition<infer Payload> ? Payload : never;

export type FailureFactUnion<
  Command extends string,
  Failures extends FailureVariantDefinitions,
> = {
  readonly [Variant in keyof Failures & string]: FailureFact<
    Command,
    Variant,
    FailureVariantPayload<Failures[Variant]>
  >;
}[keyof Failures & string];

export type FailureOutcome<
  Command extends string,
  Failures extends FailureVariantDefinitions,
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

type StreamRecordPayload<Variant> =
  Variant extends StreamRecordDefinition<infer Payload> ? Payload : never;

export type StreamRecordFactUnion<
  Command extends string,
  Records extends StreamRecordDefinitions,
> = {
  readonly [Variant in keyof Records & string]: StreamRecordFact<
    Command,
    Variant,
    StreamRecordPayload<Records[Variant]>
  >;
}[keyof Records & string];

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

export function isIssuedOutcomeFact(
  value: unknown,
  issuedOutcomeFacts: WeakSet<object>,
): value is OutcomeFact {
  return (
    typeof value === "object" && value !== null && issuedOutcomeFacts.has(value)
  );
}
