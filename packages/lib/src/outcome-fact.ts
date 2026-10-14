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

export type CompletionTextPresenter = () => TextLine | TextLines | SilentText;
export type AtomicTextPresenter<Payload> = {
  bivarianceHack(payload: Payload): TextLine | TextLines;
}["bivarianceHack"];
export type StreamTextPresenter<Payload> = {
  bivarianceHack(payload: Payload): TextLine | TextFragment;
}["bivarianceHack"];

export type TextValueErrorIssue =
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
      /** `text.lines` 中从 0 开始的非法成员位置。 */
      readonly line: number;
    }>
  | Readonly<{
      readonly code: "invalidTextFragment";
      readonly reason: "empty";
    }>
  | Readonly<{
      readonly code: "invalidTextFragment";
      readonly reason: "nullCharacter";
      /** 片段中从 0 开始、含 NUL 的行号，按 LF 计数。 */
      readonly line: number;
    }>;

/**
 * 文本构造器发现动态值违反分帧规则时抛出的 TypeError。
 * `message` 保留稳定 code；`issue` 给出闭合原因和适用的 0 基行位置，且不包含文本内容。
 */
export class TextValueError extends TypeError {
  readonly issue: TextValueErrorIssue;

  constructor(issue: TextValueErrorIssue) {
    super(issue.code);
    this.name = "TextValueError";
    this.issue = Object.freeze(issue);
  }
}

/* oxlint-disable typescript/no-unsafe-type-assertion -- 文本投影仅由这些工厂签发，运行时身份由 WeakSet 核对。 */
function createTextLine(value: string): TextLine {
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
  for (const [line, value] of values.entries()) {
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
  if (values.every((value) => value.length === 0)) {
    throw new TextValueError({
      code: "invalidTextLines",
      reason: "noNonEmptyLine",
    });
  }
  const projection = Object.freeze({
    kind: "lines" as const,
    lines: Object.freeze([...values]),
  });
  issuedTextProjections.add(projection);
  return projection as TextLines;
}

const silentProjection = Object.freeze({ kind: "silent" as const });
issuedTextProjections.add(silentProjection);
const silentText = silentProjection as SilentText;

function createTextFragment(value: string): TextFragment {
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
 * 在呈现器中显式构造文本投影；这里只验证文本值，实际通道路由与分帧由执行内核负责。
 * 动态值违反构造规则时抛出 {@link TextValueError}，其 message 是稳定 code，issue 不含原文。
 */
export const text = Object.freeze({
  /**
   * 构造非空单行，拒绝 CR、LF、NUL；核心写出时追加恰好一个 LF。
   * 适用于 completion、data、failure、stream success 终态和普通 stream record；
   * 呈现器提供完整文本，核心不补写文案。非法值会说明具体拒绝原因。
   */
  line: createTextLine,
  /**
   * 构造非空元组行组（readonly [string, ...string[]]），至少一个成员非空；每行拒绝 CR、LF、NUL。
   * 空成员可显式保留空白行。核心以 LF 连接并追加一个终止 LF；动态非法成员会报告其 0 基位置。
   * 适用于 completion、data、failure、stream success 终态及帮助补充，不适用于 stream record。
   * 例如 `text.lines(["处理完成", "", "详细说明"])`。
   */
  lines: createTextLines,
  /**
   * 仅用于 stream record 中需要连续拼接的增量文本；必须非空且不含 NUL，可以含 LF。
   * 核心原样写出，不追加或转换字符，因此不承诺一行对应一条记录；NUL 的错误位置按 0 基行号给出。
   */
  fragment: createTextFragment,
  /**
   * 仅供 completion 成功或 stream success 终态显式选择不写文本字节；仍须由呈现器返回此值。
   * 省略呈现器不等于静默；data、failure 和 stream record 都必须产生文本。
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

/* oxlint-disable typescript/no-unsafe-type-assertion -- 结果事实的私有类型品牌由签发工厂与 WeakSet 共同保证。 */
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
