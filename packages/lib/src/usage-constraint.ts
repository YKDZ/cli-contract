import type { ContractDefinitionIssue } from "#/contract-definition-error";
import type { JsonObject, JsonValue } from "#/contract-schema";
import { deepFreeze } from "#/json-value";

export const countUsageConstraintPropertyKeys = [
  "kind",
  "fields",
  "min",
  "max",
] as const;

/** 已校验并补全默认端点的数量约束。 */
export interface CountUsageConstraintGrammar {
  readonly kind: "count";
  readonly fields: readonly [string, ...string[]];
  readonly min: number;
  readonly max: number;
}

export type CountHelpFact = Readonly<{
  readonly slot:
    | "countExactly"
    | "countAtLeast"
    | "countAtMost"
    | "countBetween";
  readonly values: Readonly<Record<string, string>>;
}>;

/** 从规范化数量规则派生帮助槽位及对应占位符。 */
export function countHelpFactForConstraint(
  constraint: CountUsageConstraintGrammar,
): CountHelpFact {
  const fields = constraint.fields.join(", ");
  if (constraint.min === constraint.max) {
    return {
      slot: "countExactly",
      values: { fields, count: String(constraint.min) },
    };
  }
  if (constraint.max === constraint.fields.length) {
    return {
      slot: "countAtLeast",
      values: { fields, min: String(constraint.min) },
    };
  }
  if (constraint.min === 0) {
    return {
      slot: "countAtMost",
      values: { fields, max: String(constraint.max) },
    };
  }
  return {
    slot: "countBetween",
    values: {
      fields,
      min: String(constraint.min),
      max: String(constraint.max),
    },
  };
}

/** 校验动态数量定义并生成不可变的规范化事实。 */
export function compileCountUsageConstraint(
  candidate: Readonly<Record<string, unknown>>,
  fields: readonly Readonly<{ readonly key: string }>[],
  command: string,
  index: number,
  issues: ContractDefinitionIssue[],
): CountUsageConstraintGrammar | undefined {
  const fieldsCandidate = candidate.fields;
  const hasFieldArray = Array.isArray(fieldsCandidate);
  const rawFieldNames: readonly unknown[] = hasFieldArray
    ? fieldsCandidate
    : [];
  let valid = true;
  if (!hasFieldArray || rawFieldNames.length === 0) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "fields",
      reason: "nonEmpty",
    });
    valid = false;
  }

  const stringFieldNames: string[] = [];
  let hasInvalidFieldName = false;
  for (const field of rawFieldNames) {
    if (typeof field === "string") {
      stringFieldNames.push(field);
    } else {
      hasInvalidFieldName = true;
    }
  }
  if (hasInvalidFieldName) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "fields",
      reason: "fieldName",
    });
    valid = false;
  }

  const fieldsByKey = new Set(fields.map(({ key }) => key));
  for (const field of stringFieldNames) {
    if (!fieldsByKey.has(field)) {
      issues.push({
        code: "unknownUsageConstraintField",
        command,
        constraint: "count",
        index,
        member: "fields",
        field,
      });
      valid = false;
    }
  }

  const duplicateFields = stringFieldNames.filter(
    (field, fieldIndex) => stringFieldNames.indexOf(field) !== fieldIndex,
  );
  if (duplicateFields.length > 0) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "fields",
      reason: "duplicateFields",
      fields: Object.freeze([...new Set(duplicateFields)]),
    });
    valid = false;
  }

  const hasMin = Object.hasOwn(candidate, "min");
  const hasMax = Object.hasOwn(candidate, "max");
  if (!hasMin && !hasMax) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "min",
      reason: "endpointRequired",
    });
    valid = false;
  }

  const min = hasMin ? candidate.min : 0;
  const fieldCount = hasFieldArray ? rawFieldNames.length : undefined;
  const normalizedMin = normalizeCountEndpoint(
    min,
    "min",
    fieldCount,
    command,
    index,
    issues,
  );
  const normalizedMax = hasMax
    ? normalizeCountEndpoint(
        candidate.max,
        "max",
        fieldCount,
        command,
        index,
        issues,
      )
    : fieldCount === undefined
      ? undefined
      : { value: fieldCount, valid: true };
  if (!normalizedMin.valid || normalizedMax?.valid === false) valid = false;
  if (
    normalizedMin.value !== undefined &&
    normalizedMax?.value !== undefined &&
    normalizedMin.value > normalizedMax.value
  ) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member: "min",
      reason: "ordered",
      actual: normalizedMin.value,
      maximum: normalizedMax.value,
    });
    valid = false;
  }
  if (
    !valid ||
    normalizedMin.value === undefined ||
    normalizedMax?.value === undefined
  ) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fields 已检查非空且每项都是字符串。
  const nonEmptyFields = Object.freeze([...stringFieldNames]) as [
    string,
    ...string[],
  ];
  return deepFreeze({
    kind: "count" as const,
    fields: nonEmptyFields,
    min: normalizedMin.value,
    max: normalizedMax.value,
  });
}

function normalizeCountEndpoint(
  value: unknown,
  member: "min" | "max",
  fieldCount: number | undefined,
  command: string,
  index: number,
  issues: ContractDefinitionIssue[],
): { readonly value: number | undefined; readonly valid: boolean } {
  if (typeof value !== "number") {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "integer",
    });
    return { value: undefined, valid: false };
  }
  if (value < 0) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "nonNegative",
      actual: value,
    });
    return {
      value: Number.isFinite(value) ? value : undefined,
      valid: false,
    };
  }
  if (!Number.isFinite(value)) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "finite",
      actual: value,
    });
    return { value: undefined, valid: false };
  }
  if (!Number.isInteger(value)) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "integer",
      actual: value,
    });
    return { value, valid: false };
  }
  if (fieldCount !== undefined && value > fieldCount) {
    issues.push({
      code: "invalidCountConstraint",
      command,
      index,
      member,
      reason: "fieldCount",
      actual: value,
      maximum: fieldCount,
    });
    return { value, valid: false };
  }
  return { value, valid: true };
}

/** 在原始输入上求值一条已规范化的数量规则。 */
export function evaluateCountUsageConstraint(
  constraint: CountUsageConstraintGrammar,
  input: Readonly<Record<string, unknown>>,
):
  | Readonly<{
      readonly code: "countConstraintViolation";
      readonly min: number;
      readonly max: number;
      readonly presentFields: readonly string[];
      readonly absentFields: readonly string[];
    }>
  | undefined {
  const presentFields = constraint.fields.filter((field) =>
    Object.hasOwn(input, field),
  );
  if (
    presentFields.length >= constraint.min &&
    presentFields.length <= constraint.max
  ) {
    return undefined;
  }
  const present = new Set(presentFields);
  return {
    code: "countConstraintViolation",
    min: constraint.min,
    max: constraint.max,
    presentFields: Object.freeze(presentFields),
    absentFields: Object.freeze(
      constraint.fields.filter((field) => !present.has(field)),
    ),
  };
}

/** 将一条非冗余数量规则投影为输入模式中的 JSON Schema。 */
export function projectCountUsageConstraint(
  constraint: CountUsageConstraintGrammar,
  definitions: Record<string, JsonValue>,
  index: number,
): JsonObject | undefined {
  if (constraint.min === 0 && constraint.max === constraint.fields.length) {
    return undefined;
  }

  const prefix = uniqueCountDefinitionPrefix(
    definitions,
    index,
    constraint.fields.length,
  );
  const fieldCount = constraint.fields.length;
  for (let position = 0; position <= fieldCount; position += 1) {
    for (let present = 0; present <= position; present += 1) {
      const definitionName = countStateDefinitionName(
        prefix,
        position,
        present,
      );
      const remaining = fieldCount - position;
      if (present > constraint.max || present + remaining < constraint.min) {
        definitions[definitionName] = { not: {} };
        continue;
      }
      if (position === fieldCount) {
        definitions[definitionName] = {};
        continue;
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- position < fieldCount，索引来自已校验的非空元组。
      const field = constraint.fields[position] as string;
      definitions[definitionName] = {
        if: { required: [field] },
        // oxlint-disable-next-line unicorn/no-thenable -- Draft 2020-12 固定关键字。
        then: {
          $ref: `#/$defs/${countStateDefinitionName(prefix, position + 1, present + 1)}`,
        },
        else: {
          $ref: `#/$defs/${countStateDefinitionName(prefix, position + 1, present)}`,
        },
      };
    }
  }
  return {
    $ref: `#/$defs/${countStateDefinitionName(prefix, 0, 0)}`,
  };
}

function uniqueCountDefinitionPrefix(
  definitions: Readonly<Record<string, JsonValue>>,
  index: number,
  fieldCount: number,
): string {
  let prefix = `__cliContract_count_${index}`;
  while (
    Array.from({ length: fieldCount + 1 }, (_, position) =>
      Array.from({ length: position + 1 }, (_unused, present) =>
        countStateDefinitionName(prefix, position, present),
      ),
    )
      .flat()
      .some((name) => Object.hasOwn(definitions, name))
  ) {
    prefix += "_";
  }
  return prefix;
}

function countStateDefinitionName(
  prefix: string,
  position: number,
  present: number,
): string {
  return `${prefix}_state_${position}_${present}`;
}
