export const reservedFieldNames = [
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toString",
  "valueOf",
  "toLocaleString",
] as const;

export function invalidFieldIdentityReason(
  field: string,
): "lowerCamelCase" | "reservedName" | undefined {
  if (!/^[a-z][A-Za-z0-9]*$/.test(field)) return "lowerCamelCase";
  return reservedFieldNames.some((reserved) => reserved === field)
    ? "reservedName"
    : undefined;
}
