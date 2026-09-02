import type { ContractSchema } from "#/contract-schema";

const outcomeFactType = Symbol("OutcomeFact.type");

export interface DataVariantDefinition<Payload = unknown> {
  readonly description: string;
  readonly schema: ContractSchema<Payload>;
  readonly exitCode: number;
}

export type DataVariantDefinitions = Readonly<
  Record<string, DataVariantDefinition>
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

export type OutcomeFact = CompletionFact | DataFact;

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

export function isIssuedOutcomeFact(
  value: unknown,
  issuedOutcomeFacts: WeakSet<object>,
): value is OutcomeFact {
  return (
    typeof value === "object" && value !== null && issuedOutcomeFacts.has(value)
  );
}
