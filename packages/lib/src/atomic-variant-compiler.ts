import type { DataVariantManifest } from "#/cli-contract";
import type { ContractDefinitionIssue } from "#/contract-definition-error";
import type { ContractSchema, JsonObject } from "#/contract-schema";
import { compileContractSchema } from "#/contract-schema-compiler";
import { deepFreeze } from "#/json-value";

interface AtomicVariantDefinition {
  readonly description: string;
  readonly schema: ContractSchema;
  readonly exitCode: number;
}

export type RuntimeAtomicVariant = AtomicVariantDefinition;

export interface CompiledAtomicVariants {
  readonly runtime: Readonly<Record<string, RuntimeAtomicVariant>>;
  readonly manifest: Readonly<Record<string, DataVariantManifest>>;
  readonly wire: Readonly<Record<string, JsonObject>>;
}

export function compileAtomicVariants(
  command: string,
  location: "data" | "failure",
  definitions: Readonly<Record<string, AtomicVariantDefinition>>,
  minimumExitCode: 0 | 1,
  createWireSchema: (
    command: string,
    variant: string,
    dataSchema: JsonObject,
  ) => JsonObject,
  issues: ContractDefinitionIssue[],
): CompiledAtomicVariants {
  const runtime: Record<string, RuntimeAtomicVariant> = {};
  const manifest: Record<string, DataVariantManifest> = {};
  const wire: Record<string, JsonObject> = {};

  for (const [variant, definition] of Object.entries(definitions)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(variant)) {
      issues.push({ code: "invalidVariantName", command, location, variant });
    }
    if (
      !Number.isInteger(definition.exitCode) ||
      definition.exitCode < minimumExitCode ||
      definition.exitCode > 255
    ) {
      issues.push({
        code: "invalidVariantExitCode",
        command,
        location,
        variant,
        received:
          typeof definition.exitCode === "number" ? definition.exitCode : null,
        minimum: minimumExitCode,
        maximum: 255,
      });
    }
    if (definition.description.length === 0) {
      issues.push({
        code: "missingVariantDescription",
        command,
        location,
        variant,
      });
    }

    const schema = compileContractSchema(
      definition.schema,
      { command, location, variant },
      issues,
    );
    runtime[variant] = deepFreeze({
      description: definition.description,
      schema: definition.schema,
      exitCode: definition.exitCode,
    });
    if (schema !== undefined) {
      manifest[variant] = deepFreeze({
        description: definition.description,
        exitCode: definition.exitCode,
        ...schema,
      });
      wire[variant] = deepFreeze(
        createWireSchema(command, variant, schema.outputSchema),
      );
    }
  }

  return deepFreeze({ runtime, manifest, wire });
}
