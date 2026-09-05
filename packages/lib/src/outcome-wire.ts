import type { JsonObject, JsonValue } from "#/contract-schema";

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

export interface UsageFailureWireScope {
  readonly command: string;
  readonly usage: string;
  readonly helpArgv: readonly string[];
}

export function createUsageFailureEnvelope<Command extends string>(
  command: Command,
  issues: unknown,
  usage: string,
  helpArgv: readonly string[],
) {
  return Object.freeze({
    schemaVersion,
    command,
    kind: "usageFailure" as const,
    issues,
    usage,
    helpArgv,
  });
}

export function createUsageFailureWireSchema(
  scopes: readonly UsageFailureWireScope[],
): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    oneOf: scopes.map(({ command, usage, helpArgv }) =>
      createEnvelopeSchema(
        createUsageFailureEnvelope(command, null, usage, helpArgv),
        {
          issues: {
            items: { oneOf: usageIssueSchemas() },
            minItems: 1,
            type: "array",
          },
        },
      ),
    ),
  };
}

function usageIssueSchemas(): JsonObject[] {
  const string = { type: "string" } as const;
  const position = { minimum: 0, type: "integer" } as const;
  const occurrence = objectSchema({ option: string, position }, [
    "position",
    "option",
  ]);
  const occurrences = (minimum: number): JsonObject => ({
    items: occurrence,
    minItems: minimum,
    type: "array",
  });
  const evidence = objectSchema(
    {
      message: string,
      path: {
        items: { oneOf: [string, { type: "number" }] },
        type: "array",
      },
    },
    ["message"],
  );
  const constraintValue = objectSchema(
    {
      field: string,
      value: { oneOf: [{ type: "boolean" }, string] },
    },
    ["field", "value"],
  );
  const outputOccurrence = objectSchema(
    {
      format: { enum: ["structured", "text"] },
      option: string,
      position,
    },
    ["position", "option", "format"],
  );

  return [
    issueSchema("conflictingFlag", {
      field: string,
      negativeOccurrences: occurrences(1),
      positiveOccurrences: occurrences(1),
    }),
    issueSchema("conflictingOutputFormat", {
      occurrences: { items: outputOccurrence, minItems: 2, type: "array" },
    }),
    issueSchema("exclusiveUsageConstraint", {
      fields: { items: string, minItems: 2, type: "array" },
    }),
    issueSchema("forbiddenUsageCombination", {
      values: { items: constraintValue, minItems: 2, type: "array" },
    }),
    issueSchema("inputRejected", {
      evidence: { items: evidence, minItems: 1, type: "array" },
    }),
    issueSchema("invalidFieldChoice", {
      choices: { items: string, minItems: 1, type: "array" },
      field: string,
      position,
      value: string,
    }),
    issueSchema("invalidOutputFormat", {
      option: string,
      position,
      received: { oneOf: [string, { type: "null" }] },
    }),
    issueSchema("missingOptionValue", {
      field: string,
      option: string,
      position,
    }),
    issueSchema("missingRequiredField", { field: string }),
    issueSchema("repeatedOption", {
      field: string,
      occurrences: occurrences(2),
    }),
    issueSchema("requiredByUsageConstraint", {
      field: string,
      requires: string,
    }),
    issueSchema("unexpectedOptionValue", {
      field: string,
      option: string,
      position,
      value: string,
    }),
    issueSchema("unexpectedPositional", { position, value: string }),
    issueSchema("unknownCommand", {
      command: string,
      position,
      suggestedCommand: string,
    }),
    issueSchema("unknownOption", {
      option: string,
      position,
      suggestedOption: string,
    }),
  ];
}

function issueSchema(
  code: string,
  properties: Readonly<Record<string, JsonValue>>,
): JsonObject {
  return objectSchema({ code: { const: code }, ...properties }, [
    "code",
    ...Object.keys(properties).filter(
      (key) => key !== "suggestedCommand" && key !== "suggestedOption",
    ),
  ]);
}

function objectSchema(
  properties: Readonly<Record<string, JsonValue>>,
  required: readonly string[],
): JsonObject {
  return { additionalProperties: false, properties, required, type: "object" };
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
