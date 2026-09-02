import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec";

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export interface ContractSchema<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output> &
    StandardJSONSchemaV1.Props<Input, Output>;
}

export type ContractSchemaInput<Schema> =
  Schema extends ContractSchema<infer Input, unknown> ? Input : never;

export type ContractSchemaOutput<Schema> =
  Schema extends ContractSchema<unknown, infer Output> ? Output : never;

export type EmptyCliInput = Readonly<Record<string, never>>;
