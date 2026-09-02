import type { JsonObject } from "#/contract-schema";

const completionSchemaVersion = "1" as const;
const completionKind = "completion" as const;

export function createCompletionEnvelope<Command extends string>(
  command: Command,
) {
  return Object.freeze({
    schemaVersion: completionSchemaVersion,
    command,
    kind: completionKind,
  });
}

export function createCompletionWireSchema(command: string): JsonObject {
  const envelope = createCompletionEnvelope(command);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {
      schemaVersion: { const: envelope.schemaVersion },
      command: { const: envelope.command },
      kind: { const: envelope.kind },
    },
    required: Object.keys(envelope),
    type: "object",
  };
}
