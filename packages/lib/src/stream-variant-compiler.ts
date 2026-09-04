import type { ContractDefinitionIssue } from "#/contract-definition-error";
import type { ContractSchema, JsonObject } from "#/contract-schema";
import { compileContractSchema } from "#/contract-schema-compiler";
import { deepFreeze } from "#/json-value";
import type { StreamRecordDefinition } from "#/outcome-fact";

export type RuntimeStreamRecord = StreamRecordDefinition & {
  readonly schema: ContractSchema;
};

export interface StreamRecordManifest {
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema: JsonObject;
}

export function compileStreamRecords(
  command: string,
  definitions: Readonly<Record<string, StreamRecordDefinition>>,
  issues: ContractDefinitionIssue[],
): Readonly<{
  readonly runtime: Readonly<Record<string, RuntimeStreamRecord>>;
  readonly manifest: Readonly<Record<string, StreamRecordManifest>>;
  readonly wire: Readonly<Record<string, JsonObject>>;
}> {
  const runtime: Record<string, RuntimeStreamRecord> = {};
  const manifest: Record<string, StreamRecordManifest> = {};
  const wire: Record<string, JsonObject> = {};
  for (const [variant, definition] of Object.entries(definitions)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(variant)) {
      issues.push({
        code: "invalidVariantName",
        command,
        location: "record",
        variant,
      });
    }
    if (definition.description.length === 0) {
      issues.push({
        code: "missingVariantDescription",
        command,
        location: "record",
        variant,
      });
    }
    const schema = compileContractSchema(
      definition.schema,
      { command, location: "record", variant },
      issues,
    );
    runtime[variant] = deepFreeze({
      description: definition.description,
      schema: definition.schema,
      ...("text" in definition ? { text: definition.text } : {}),
    });
    if (schema !== undefined) {
      manifest[variant] = deepFreeze({
        description: definition.description,
        ...schema,
      });
      wire[variant] = deepFreeze(schema.outputSchema);
    }
  }
  return deepFreeze({ runtime, manifest, wire });
}
