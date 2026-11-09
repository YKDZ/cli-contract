import type { JsonObject, JsonValue } from "#/contract-schema";
import { embedSchemaResource } from "#/schema-resource";

const schemaVersion = "3" as const;

export function createCompletionEnvelope<Command extends string>(
  command: Command,
  outputMode: string,
) {
  return Object.freeze({
    schemaVersion,
    command,
    outputMode,
    kind: "completion" as const,
  });
}

export function createCompletionWireSchema(
  command: string,
  outputMode: string,
): JsonObject {
  const envelope = createCompletionEnvelope(command, outputMode);
  return createEnvelopeSchema(envelope, {});
}

export function createDataEnvelope<
  Command extends string,
  Variant extends string,
  Data,
>(command: Command, outputMode: string, variant: Variant, data: Data) {
  return createAtomicEnvelope(command, outputMode, "data", variant, data);
}

export function createDataWireSchema(
  command: string,
  outputMode: string,
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  const envelope = createDataEnvelope(command, outputMode, variant, null);
  return createEnvelopeSchema(envelope, {
    data: embedSchemaResource(
      dataSchema,
      `data:${command}:${outputMode}:${variant}`,
    ),
  });
}

export function createFailureEnvelope<
  Command extends string,
  Variant extends string,
  Data,
>(command: Command, outputMode: string, variant: Variant, data: Data) {
  return createAtomicEnvelope(command, outputMode, "failure", variant, data);
}

function createAtomicEnvelope<
  Command extends string,
  Kind extends "data" | "failure",
  Variant extends string,
  Data,
>(
  command: Command,
  outputMode: string,
  kind: Kind,
  variant: Variant,
  data: Data,
) {
  return Object.freeze({
    schemaVersion,
    command,
    outputMode,
    kind,
    variant,
    data,
  });
}

export function createFailureWireSchema(
  command: string,
  outputMode: string,
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  const envelope = createFailureEnvelope(command, outputMode, variant, null);
  return createEnvelopeSchema(envelope, {
    data: embedSchemaResource(
      dataSchema,
      `failure:${command}:${outputMode}:${variant}`,
    ),
  });
}

export function createStreamHeaderEnvelope<Command extends string>(
  command: Command,
  outputMode: string,
) {
  return Object.freeze({
    schemaVersion,
    command,
    outputMode,
    kind: "stream" as const,
  });
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

export function createStreamHeaderWireSchema(
  command: string,
  outputMode: string,
): JsonObject {
  return createEnvelopeSchema(
    createStreamHeaderEnvelope(command, outputMode),
    {},
  );
}

export function createStreamRecordWireSchema(
  command: string,
  outputMode: string,
  variant: string,
  dataSchema: JsonObject,
): JsonObject {
  return createEnvelopeSchema(createStreamRecordEnvelope(variant, null), {
    data: embedSchemaResource(
      dataSchema,
      `record:${command}:${outputMode}:${variant}`,
    ),
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
  const usageFact = {
    oneOf: [
      objectSchema({ field: string, kind: { const: "present" } }, [
        "kind",
        "field",
      ]),
      objectSchema(
        {
          field: string,
          kind: { const: "equals" },
          value: { oneOf: [{ type: "boolean" }, string] },
        },
        ["kind", "field", "value"],
      ),
    ],
  };
  const usageObservation = {
    oneOf: [
      objectSchema(
        {
          field: string,
          kind: { const: "present" },
          present: { type: "boolean" },
        },
        ["kind", "field", "present"],
      ),
      objectSchema(
        {
          expected: { oneOf: [{ type: "boolean" }, string] },
          field: string,
          kind: { const: "equals" },
          present: { const: false },
        },
        ["kind", "field", "expected", "present"],
      ),
      objectSchema(
        {
          actual: { oneOf: [{ type: "boolean" }, string] },
          expected: { oneOf: [{ type: "boolean" }, string] },
          field: string,
          kind: { const: "equals" },
          present: { const: true },
        },
        ["kind", "field", "expected", "present", "actual"],
      ),
    ],
  };
  const outputOccurrence = objectSchema(
    {
      mode: string,
      option: string,
      position,
    },
    ["position", "option", "mode"],
  );

  return [
    issueSchema("conflictingFlag", {
      field: string,
      negativeOccurrences: occurrences(1),
      positiveOccurrences: occurrences(1),
    }),
    issueSchema("conflictingOutputMode", {
      occurrences: { items: outputOccurrence, minItems: 2, type: "array" },
    }),
    {
      ...issueSchema("countConstraintViolation", {
        min: { minimum: 0, type: "integer" },
        max: { minimum: 0, type: "integer" },
        presentFields: { items: string, type: "array" },
        absentFields: { items: string, type: "array" },
      }),
      anyOf: [
        { properties: { presentFields: { minItems: 1 } } },
        { properties: { absentFields: { minItems: 1 } } },
      ],
    },
    issueSchema("forbiddenCombinationViolation", {
      facts: { items: usageFact, minItems: 1, type: "array" },
    }),
    {
      ...issueSchema("conditionalConstraintViolation", {
        branch: { enum: ["onMatch", "otherwise"] },
        conditions: {
          items: usageObservation,
          minItems: 1,
          type: "array",
        },
        missingRequiredFields: { items: string, type: "array" },
        presentForbiddenFields: { items: string, type: "array" },
      }),
      anyOf: [
        {
          properties: {
            missingRequiredFields: { minItems: 1 },
          },
        },
        {
          properties: {
            presentForbiddenFields: { minItems: 1 },
          },
        },
      ],
    },
    issueSchema("inputRejected", {
      evidence: { items: evidence, type: "array" },
    }),
    issueSchema("invalidFieldChoice", {
      choices: { items: string, minItems: 1, type: "array" },
      field: string,
      position,
      value: string,
    }),
    issueSchema("invalidOutputMode", {
      available: { items: string, minItems: 1, type: "array" },
      option: string,
      position,
      received: { oneOf: [string, { type: "null" }] },
    }),
    issueSchema("invalidSchemaQuery", {
      option: { const: "--schema" },
      position,
      reason: {
        enum: [
          "invalidSyntax",
          "unknownPart",
          "unknownOutputMode",
          "unsupportedPart",
        ],
      },
      target: { oneOf: [string, { type: "null" }] },
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 闭合问题联合只生成 JSON Schema 的 JSON 值。
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
