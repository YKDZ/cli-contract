export function isSingleLineText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\r") &&
    !value.includes("\n") &&
    !value.includes("\0")
  );
}

/** Read a `text.line` projection while copying its single-line string value. */
export function readCapabilityTextLine(value: unknown): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("kind" in value) ||
    value.kind !== "line" ||
    !("value" in value) ||
    !isSingleLineText(value.value)
  ) {
    return undefined;
  }
  return value.value;
}
