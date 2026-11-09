import type { JsonObject, JsonValue } from "@ykdz/cli-contract";

export function omitPayloadRootResourceId(wire: JsonObject): JsonObject {
  const properties = wire.properties;
  if (!isJsonObject(properties) || !isJsonObject(properties.data)) return wire;

  const data = { ...properties.data };
  delete data.$id;
  return { ...wire, properties: { ...properties, data } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
