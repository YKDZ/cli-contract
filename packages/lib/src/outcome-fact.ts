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

export interface FailureVariantDefinition<Payload = unknown> {
  readonly description: string;
  readonly schema: ContractSchema<Payload>;
  readonly exitCode: number;
}

export type FailureVariantDefinitions = Readonly<
  Record<string, FailureVariantDefinition>
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

export type OutcomeFact = CompletionFact | DataFact | FailureFact;

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

export function isIssuedOutcomeFact(
  value: unknown,
  issuedOutcomeFacts: WeakSet<object>,
): value is OutcomeFact {
  return (
    typeof value === "object" && value !== null && issuedOutcomeFacts.has(value)
  );
}
