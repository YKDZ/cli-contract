export function isSingleLineText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\r") &&
    !value.includes("\n") &&
    !value.includes("\0")
  );
}

export function copySingleLineText(value: unknown, label: string): string {
  if (!isSingleLineText(value)) {
    throw new TypeError(`${label} must be valid single-line text`);
  }
  return value;
}
