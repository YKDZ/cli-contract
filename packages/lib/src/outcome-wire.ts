import type { JsonObject } from "#/contract-schema";

const schemaVersion = "1" as const;

export function createCompletionEnvelope<Command extends string>(
  command: Command,
) {
  return Object.freeze({
    schemaVersion,
    command,
    kind: "completion" as const,
  });
}

export function createCompletionWireSchema(command: string): JsonObject {
  const envelope = createCompletionEnvelope(command);
  return createEnvelopeSchema(envelope, {});
}

export function createDataEnvelope<
  Command extends string,
  Variant extends string,
  Data,
>(command: Command, variant: Variant, data: Data) {
  return createAtomicEnvelope(command, "data", variant, data);
}

export function createDataWireSchema(
  command: string,
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  const envelope = createDataEnvelope(command, variant, null);
  return createEnvelopeSchema(envelope, { data: dataSchema });
}

export function createFailureEnvelope<
  Command extends string,
  Variant extends string,
  Data,
>(command: Command, variant: Variant, data: Data) {
  return createAtomicEnvelope(command, "failure", variant, data);
}

function createAtomicEnvelope<
  Command extends string,
  Kind extends "data" | "failure",
  Variant extends string,
  Data,
>(command: Command, kind: Kind, variant: Variant, data: Data) {
  return Object.freeze({
    schemaVersion,
    command,
    kind,
    variant,
    data,
  });
}

export function createFailureWireSchema(
  command: string,
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  const envelope = createFailureEnvelope(command, variant, null);
  return createEnvelopeSchema(envelope, { data: dataSchema });
}

export function createStreamHeaderEnvelope<Command extends string>(
  command: Command,
) {
  return Object.freeze({ schemaVersion, command, kind: "stream" as const });
}

export function createStreamRecordEnvelope<Variant extends string, Data>(
  variant: Variant,
  data: Data,
) {
  return Object.freeze({ kind: "record" as const, variant, data });
}

export function createStreamSuccessEnvelope() {
  return Object.freeze({ kind: "streamSuccess" as const });
}

export function createStreamHeaderWireSchema(command: string): JsonObject {
  return createEnvelopeSchema(createStreamHeaderEnvelope(command), {});
}

export function createStreamRecordWireSchema(
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  return createEnvelopeSchema(createStreamRecordEnvelope(variant, null), {
    data: dataSchema,
  });
}

export function createStreamSuccessWireSchema(): JsonObject {
  return createEnvelopeSchema(createStreamSuccessEnvelope(), {});
}

function createEnvelopeSchema(
  envelope: Readonly<Record<string, unknown>>,
  propertySchemas: Readonly<Record<string, JsonObject>>,
): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(envelope).map(([key, value]) => [
        key,
        propertySchemas[key] ?? { const: value },
      ]),
    ) as JsonObject,
    required: Object.keys(envelope),
    type: "object",
  };
}
