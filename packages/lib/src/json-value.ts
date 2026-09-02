import type { JsonObject, JsonValue } from "#/contract-schema";

export function copyJsonObject(value: Record<string, unknown>): JsonObject {
  const copy = copyJsonValue(value);
  if (typeof copy !== "object" || copy === null || Array.isArray(copy)) {
    throw new TypeError("JSON Schema 必须是对象");
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
      throw new TypeError("JSON 数值必须是有限数");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("值无法表示为 JSON");
  }
  if (ancestors.has(value)) {
    throw new TypeError("JSON 值不能包含循环引用");
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError("JSON object 必须是普通对象");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("JSON object 不能包含 symbol key");
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
      throw new TypeError("JSON array 不能包含空位");
    }
    return copyJsonValueWithAncestors(value[index], ancestors);
  });
}
