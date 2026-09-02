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
  return Object.freeze({
    schemaVersion,
    command,
    kind: "data" as const,
    variant,
    data,
  });
}

export function createDataWireSchema(
  command: string,
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  const envelope = createDataEnvelope(command, variant, null);
  return createEnvelopeSchema(envelope, { data: dataSchema });
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
