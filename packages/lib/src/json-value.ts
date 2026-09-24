import type { JsonObject, JsonValue } from "#/contract-schema";

export function copyJsonObject(value: Record<string, unknown>): JsonObject {
  const copy = copyJsonValue(value);
  if (typeof copy !== "object" || copy === null || Array.isArray(copy)) {
    throw new TypeError("invalidJsonSchemaObject");
  }
  return copy as JsonObject;
}

export function copyJsonValue(value: unknown): JsonValue {
  return copyJsonValueWithAncestors(value, new WeakSet<object>());
}

export function deepFreeze<const Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) {
    deepFreeze(item);
  }
  return Object.freeze(value);
}

function copyJsonValueWithAncestors(
  value: unknown,
  ancestors: WeakSet<object>,
): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("nonFiniteJsonNumber");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("nonJsonValue");
  }
  if (ancestors.has(value)) {
    throw new TypeError("cyclicJsonValue");
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError("invalidJsonObject");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("symbolKeyInJsonObject");
  }

  ancestors.add(value);
  const copy: JsonValue = Array.isArray(value)
    ? copyJsonArray(value, ancestors)
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          copyJsonValueWithAncestors(item, ancestors),
        ]),
      );
  ancestors.delete(value);
  return deepFreeze(copy);
}

function copyJsonArray(
  value: readonly unknown[],
  ancestors: WeakSet<object>,
): readonly JsonValue[] {
  return Array.from({ length: value.length }, (_, index) => {
    if (!(index in value)) {
      throw new TypeError("sparseJsonArray");
    }
    return copyJsonValueWithAncestors(value[index], ancestors);
  });
}
