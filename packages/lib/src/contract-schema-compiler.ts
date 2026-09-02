import type {
  SchemaManifest,
  ValueOptionDefinitions,
  ValueOptionGrammar,
} from "#/cli-contract";
import type {
  ContractDefinitionIssue,
  SchemaDefinitionTarget,
} from "#/contract-definition-error";
import type { ContractSchema, JsonObject } from "#/contract-schema";
import { copyJsonObject, deepFreeze } from "#/json-value";

export function compileContractSchema(
  schema: ContractSchema,
  target: SchemaDefinitionTarget,
  issues: ContractDefinitionIssue[],
): SchemaManifest | undefined {
  const initialIssueCount = issues.length;
  const standard = schema?.["~standard"];
  if (typeof standard !== "object" || standard === null) {
    issues.push({
      code: "missingSchemaCapability",
      ...target,
      capability: "standard",
    });
    return undefined;
  }
  if (typeof standard.validate !== "function") {
    issues.push({
      code: "missingSchemaCapability",
      ...target,
      capability: "validation",
    });
    return undefined;
  }
  if (
    typeof standard.jsonSchema !== "object" ||
    standard.jsonSchema === null ||
    typeof standard.jsonSchema.input !== "function" ||
    typeof standard.jsonSchema.output !== "function"
  ) {
    issues.push({
      code: "missingSchemaCapability",
      ...target,
      capability: "jsonSchema",
    });
    return undefined;
  }
  const exportedInput = exportSchemaProjection(
    standard.jsonSchema.input,
    target,
    "input",
    issues,
  );
  const exportedOutput = exportSchemaProjection(
    standard.jsonSchema.output,
    target,
    "output",
    issues,
  );
  const inputSchema =
    exportedInput === undefined
      ? undefined
      : copySchemaProjection(exportedInput, target, "input", issues);
  const outputSchema =
    exportedOutput === undefined
      ? undefined
      : copySchemaProjection(exportedOutput, target, "output", issues);
  if (inputSchema === undefined || outputSchema === undefined) {
    return undefined;
  }
  checkDraft202012(inputSchema, target, "input", issues);
  checkDraft202012(outputSchema, target, "output", issues);
  return issues.length === initialIssueCount
    ? { inputSchema, outputSchema }
    : undefined;
}

export function compileInputFields(
  definitions: ValueOptionDefinitions,
  inputSchema: JsonObject,
  command: string,
  issues: ContractDefinitionIssue[],
): readonly ValueOptionGrammar[] {
  if (inputSchema.type !== "object") {
    issues.push({
      code: "invalidInputSchemaShape",
      command,
      location: "input",
      aspect: "type",
    });
    return [];
  }
  const schemaProperties = readSchemaProperties(inputSchema);
  if (schemaProperties === undefined) {
    issues.push({
      code: "invalidInputSchemaShape",
      command,
      location: "input",
      aspect: "properties",
    });
    return [];
  }
  const schemaKeys = Object.keys(schemaProperties).sort();
  const fieldKeys = Object.keys(definitions).sort();
  if (schemaKeys.join("\0") !== fieldKeys.join("\0")) {
    issues.push({
      code: "schemaFieldSetMismatch",
      command,
      location: "input",
      missingFields: schemaKeys.filter((key) => !fieldKeys.includes(key)),
      unexpectedFields: fieldKeys.filter((key) => !schemaKeys.includes(key)),
    });
    return [];
  }
  const required = readRequiredSchemaKeys(inputSchema);
  if (required === undefined) {
    issues.push({
      code: "invalidInputSchemaShape",
      command,
      location: "input",
      aspect: "required",
    });
    return [];
  }
  const incompatibleFields = fieldKeys.filter(
    (key) => !schemaPropertyAcceptsRawString(schemaProperties[key]),
  );
  if (incompatibleFields.length > 0) {
    issues.push({
      code: "schemaFieldDoesNotAcceptRawString",
      command,
      location: "input",
      fields: incompatibleFields,
    });
    return [];
  }

  const fields = Object.entries(definitions).map(([key, field]) => {
    if (!/^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field.longOption)) {
      issues.push({
        code: "invalidFieldLongOption",
        command,
        field: key,
        received: field.longOption,
      });
    }
    if (field.description.length === 0) {
      issues.push({
        code: "missingFieldDescription",
        command,
        field: key,
      });
    }
    return {
      kind: "valueOption" as const,
      key,
      longOption: field.longOption,
      description: field.description,
      required: required.has(key),
    };
  });
  const fieldsByLongOption = new Map<string, ValueOptionGrammar[]>();
  for (const field of fields) {
    const matchingFields = fieldsByLongOption.get(field.longOption) ?? [];
    matchingFields.push(field);
    fieldsByLongOption.set(field.longOption, matchingFields);
  }
  for (const [longOption, matchingFields] of fieldsByLongOption) {
    if (matchingFields.length > 1) {
      issues.push({
        code: "duplicateFieldLongOption",
        command,
        longOption,
        fields: matchingFields.map((field) => field.key).sort(),
      });
    }
  }
  return deepFreeze(fields);
}

function copySchemaProjection(
  value: Record<string, unknown>,
  target: SchemaDefinitionTarget,
  projection: "input" | "output",
  issues: ContractDefinitionIssue[],
): JsonObject | undefined {
  try {
    return copyJsonObject(value);
  } catch {
    issues.push({ code: "invalidSchemaProjection", ...target, projection });
    return undefined;
  }
}

function exportSchemaProjection(
  exporter: (options: {
    readonly target: "draft-2020-12";
  }) => Record<string, unknown>,
  target: SchemaDefinitionTarget,
  projection: "input" | "output",
  issues: ContractDefinitionIssue[],
): Record<string, unknown> | undefined {
  try {
    return exporter({ target: "draft-2020-12" });
  } catch {
    issues.push({ code: "schemaExportFailed", ...target, projection });
    return undefined;
  }
}

function checkDraft202012(
  schema: JsonObject,
  target: SchemaDefinitionTarget,
  projection: "input" | "output",
  issues: ContractDefinitionIssue[],
): void {
  const dialect = schema.$schema;
  if (dialect !== "https://json-schema.org/draft/2020-12/schema") {
    issues.push({
      code: "schemaDialectMismatch",
      ...target,
      projection,
      received: typeof dialect === "string" ? dialect : null,
    });
  }
}

function readSchemaProperties(schema: JsonObject): JsonObject | undefined {
  const properties = schema.properties;
  if (
    typeof properties !== "object" ||
    properties === null ||
    Array.isArray(properties)
  ) {
    return undefined;
  }
  return properties as JsonObject;
}

function readRequiredSchemaKeys(
  schema: JsonObject,
): ReadonlySet<string> | undefined {
  const required = schema.required;
  if (required === undefined) {
    return new Set();
  }
  if (
    !Array.isArray(required) ||
    required.some((key) => typeof key !== "string")
  ) {
    return undefined;
  }
  return new Set(required);
}

function schemaPropertyAcceptsRawString(propertySchema: unknown): boolean {
  if (propertySchema === true) {
    return true;
  }
  if (
    typeof propertySchema !== "object" ||
    propertySchema === null ||
    Array.isArray(propertySchema) ||
    !("type" in propertySchema)
  ) {
    return false;
  }
  return (
    propertySchema.type === "string" ||
    (Array.isArray(propertySchema.type) &&
      propertySchema.type.includes("string"))
  );
}
