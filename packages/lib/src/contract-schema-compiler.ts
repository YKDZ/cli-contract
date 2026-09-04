import type {
  FieldDefinitions,
  FieldGrammar,
  SchemaManifest,
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
  checkInputDefaults(inputSchema, outputSchema, target, issues);
  return issues.length === initialIssueCount
    ? { inputSchema, outputSchema }
    : undefined;
}

export function compileInputFields(
  definitions: FieldDefinitions,
  inputSchema: JsonObject,
  command: string,
  issues: ContractDefinitionIssue[],
): readonly FieldGrammar[] {
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
  const incompatibleFields = fieldKeys.flatMap((field) => {
    const kind = definitions[field]?.kind;
    const expected: "boolean" | "string" | "stringArray" =
      kind === "flag"
        ? "boolean"
        : kind === "repeatableOption" || kind === "variadicPositional"
          ? "stringArray"
          : "string";
    return schemaPropertyAcceptsRawValue(schemaProperties[field], expected)
      ? []
      : [{ field, expected }];
  });
  if (incompatibleFields.length > 0) {
    issues.push({
      code: "schemaFieldDoesNotAcceptRawValue",
      command,
      location: "input",
      fields: incompatibleFields,
    });
    return [];
  }

  const fields = Object.entries(definitions).map(([key, field]) => {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key)) {
      issues.push({ code: "invalidFieldIdentity", command, field: key });
    }
    const invalidKind = readInvalidFieldKind(field);
    if (invalidKind !== undefined) {
      issues.push({
        code: "invalidFieldKind",
        command,
        field: key,
        expected: [
          "positional",
          "variadicPositional",
          "flag",
          "valueOption",
          "repeatableOption",
        ],
        received: invalidKind,
      });
      return {
        kind: "positional" as const,
        key,
        description: readFieldDescription(field),
        required: required.has(key),
      };
    }
    if (
      field.kind !== "positional" &&
      field.kind !== "variadicPositional" &&
      !/^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field.longOption)
    ) {
      issues.push({
        code: "invalidFieldLongOption",
        command,
        field: key,
        received:
          typeof field.longOption === "string" ? field.longOption : null,
      });
    }
    if (
      field.kind !== "positional" &&
      field.kind !== "variadicPositional" &&
      field.shortAlias !== undefined &&
      !/^-[A-Za-z0-9]$/.test(field.shortAlias)
    ) {
      issues.push({
        code: "invalidFieldShortAlias",
        command,
        field: key,
        received:
          typeof field.shortAlias === "string" ? field.shortAlias : null,
      });
    }
    if (
      field.kind === "flag" &&
      field.negatedLongOption !== undefined &&
      !/^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field.negatedLongOption)
    ) {
      issues.push({
        code: "invalidFieldLongOption",
        command,
        field: key,
        received:
          typeof field.negatedLongOption === "string"
            ? field.negatedLongOption
            : null,
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
      ...field,
      key,
      required: required.has(key),
      ...readSchemaDefault(schemaProperties[key]),
    } as FieldGrammar;
  });
  const fieldsByLongOption = new Map<string, FieldGrammar[]>();
  for (const field of fields) {
    if (field.kind === "positional" || field.kind === "variadicPositional") {
      continue;
    }
    for (const spelling of [
      field.longOption,
      field.kind === "flag" ? field.negatedLongOption : undefined,
    ]) {
      if (spelling === undefined) continue;
      const matchingFields = fieldsByLongOption.get(spelling) ?? [];
      matchingFields.push(field);
      fieldsByLongOption.set(spelling, matchingFields);
    }
  }
  for (const [longOption, matchingFields] of fieldsByLongOption) {
    if (matchingFields.length > 1) {
      issues.push({
        code: "duplicateFieldLongOption",
        command,
        longOption,
        fields: [...new Set(matchingFields.map((field) => field.key))].sort(),
      });
    }
  }
  const fieldsByShortAlias = new Map<string, FieldGrammar[]>();
  for (const field of fields) {
    if (
      field.kind === "positional" ||
      field.kind === "variadicPositional" ||
      field.shortAlias === undefined
    ) {
      continue;
    }
    const matchingFields = fieldsByShortAlias.get(field.shortAlias) ?? [];
    matchingFields.push(field);
    fieldsByShortAlias.set(field.shortAlias, matchingFields);
  }
  for (const [spelling, matchingFields] of fieldsByShortAlias) {
    if (matchingFields.length > 1) {
      issues.push({
        code: "duplicateFieldOptionSpelling",
        command,
        spelling,
        fields: matchingFields.map((field) => field.key).sort(),
      });
    }
  }
  let precedingOptionalField: string | undefined;
  let variadicField: string | undefined;
  for (const field of fields) {
    if (field.kind !== "positional" && field.kind !== "variadicPositional") {
      continue;
    }
    if (variadicField !== undefined) {
      issues.push({
        code: "positionalAfterVariadic",
        command,
        field: field.key,
        variadicField,
      });
    }
    if (field.kind === "variadicPositional") variadicField ??= field.key;
    if (!field.required) {
      precedingOptionalField ??= field.key;
    } else if (precedingOptionalField !== undefined) {
      issues.push({
        code: "requiredPositionalAfterOptional",
        command,
        field: field.key,
        precedingOptionalField,
      });
    }
  }
  return deepFreeze(fields);
}

function readInvalidFieldKind(field: unknown): string | null | undefined {
  if (typeof field !== "object" || field === null || !("kind" in field)) {
    return null;
  }
  const kind = field.kind;
  return kind === "positional" ||
    kind === "variadicPositional" ||
    kind === "flag" ||
    kind === "valueOption" ||
    kind === "repeatableOption"
    ? undefined
    : typeof kind === "string"
      ? kind
      : null;
}

function readFieldDescription(field: unknown): string {
  return typeof field === "object" &&
    field !== null &&
    "description" in field &&
    typeof field.description === "string"
    ? field.description
    : "";
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

function checkInputDefaults(
  inputSchema: JsonObject,
  outputSchema: JsonObject,
  target: SchemaDefinitionTarget,
  issues: ContractDefinitionIssue[],
): void {
  if (target.location !== "input") return;
  const inputProperties = readSchemaProperties(inputSchema);
  const outputProperties = readSchemaProperties(outputSchema);
  const inputRequired = readRequiredSchemaKeys(inputSchema);
  const outputRequired = readRequiredSchemaKeys(outputSchema);
  if (
    inputProperties === undefined ||
    outputProperties === undefined ||
    inputRequired === undefined ||
    outputRequired === undefined
  ) {
    return;
  }
  for (const field of outputRequired) {
    if (inputRequired.has(field) || !Object.hasOwn(inputProperties, field)) {
      continue;
    }
    if (readSchemaDefault(inputProperties[field]) === undefined) {
      issues.push({
        code: "missingInputDefault",
        command: target.command,
        location: "input",
        field,
      });
    }
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

function readSchemaDefault(
  propertySchema: unknown,
): Readonly<{ readonly default: JsonObject[string] }> | undefined {
  if (
    typeof propertySchema !== "object" ||
    propertySchema === null ||
    Array.isArray(propertySchema) ||
    !Object.hasOwn(propertySchema, "default")
  ) {
    return undefined;
  }
  const defaultValue = (propertySchema as JsonObject).default;
  if (defaultValue === undefined) return undefined;
  return {
    default: defaultValue,
  };
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

function schemaPropertyAcceptsRawValue(
  propertySchema: unknown,
  rawType: "boolean" | "string" | "stringArray",
): boolean {
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
  if (rawType === "stringArray") {
    return (
      (propertySchema.type === "array" ||
        (Array.isArray(propertySchema.type) &&
          propertySchema.type.includes("array"))) &&
      "items" in propertySchema &&
      schemaPropertyAcceptsRawValue(propertySchema.items, "string")
    );
  }
  return (
    propertySchema.type === rawType ||
    (Array.isArray(propertySchema.type) &&
      propertySchema.type.includes(rawType))
  );
}
