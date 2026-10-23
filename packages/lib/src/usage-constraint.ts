import type {
  ForbiddenCombinationUsageConstraint,
  HelpFactTemplateParameters,
  SchemaManifest,
  UsageConstraintEffect,
  UsageFact,
  WhenUsageConstraint,
} from "#/cli-contract";
import type {
  ConditionalConstraintViolationIssue,
  CountConstraintViolationIssue,
  ForbiddenCombinationViolationIssue,
  UsageConstraintObservation,
} from "#/cli-invocation";
import type { ContractDefinitionIssue } from "#/contract-definition-error";
import { ContractExecutionError } from "#/contract-execution-error";
import type { JsonObject, JsonValue } from "#/contract-schema";
import { deepFreeze, isPlainRecord } from "#/json-value";

const countUsageConstraintPropertyKeys = [
  "kind",
  "fields",
  "min",
  "max",
] as const;

export const usageConstraintDefinitionPropertyKeys = {
  count: countUsageConstraintPropertyKeys,
  when: ["kind", "all", "onMatch", "otherwise"],
  effect: ["require", "forbid"],
  forbiddenCombination: ["kind", "all"],
  fact: {
    present: ["kind", "field"],
    equals: ["kind", "field", "value"],
  },
} as const;

/** 已校验并补全默认端点的数量约束。 */
export interface CountUsageConstraintGrammar {
  readonly kind: "count";
  readonly fields: readonly [string, ...string[]];
  readonly min: number;
  readonly max: number;
}

export type UsageConstraintGrammar =
  | CountUsageConstraintGrammar
  | WhenUsageConstraint
  | ForbiddenCombinationUsageConstraint;

type UsageConstraintHelpSlot = Exclude<
  keyof HelpFactTemplateParameters,
  "commandPlaceholder" | "choices" | "default"
>;

type UsageConstraintIssue =
  | CountConstraintViolationIssue
  | ConditionalConstraintViolationIssue
  | ForbiddenCombinationViolationIssue;

interface UsageConstraintField {
  readonly key: string;
  readonly kind:
    | "flag"
    | "valueOption"
    | "repeatableOption"
    | "positional"
    | "variadicPositional";
  readonly negatedLongOption?: string;
  readonly choices?: readonly string[];
}

export interface CompiledUsageConstraints {
  readonly constraints: readonly UsageConstraintGrammar[];
  readonly requiredHelpTemplates: readonly UsageConstraintHelpSlot[];
  readonly inputProjection: SchemaManifest | undefined;
}

export function collectUnknownUsageConstraintDefinitionProperties(
  definitions: unknown,
  path: readonly string[],
  issues: ContractDefinitionIssue[],
): void {
  if (!Array.isArray(definitions)) return;
  definitions.forEach((constraint, index) => {
    const constraintPath = [...path, String(index)];
    if (!isPlainRecord(constraint)) return;
    const allowed =
      constraint.kind === "when"
        ? usageConstraintDefinitionPropertyKeys.when
        : constraint.kind === "count"
          ? usageConstraintDefinitionPropertyKeys.count
          : constraint.kind === "forbiddenCombination"
            ? usageConstraintDefinitionPropertyKeys.forbiddenCombination
            : undefined;
    if (allowed === undefined) return;
    collectUnknownProperties(constraint, constraintPath, allowed, issues);
    if (
      (constraint.kind === "forbiddenCombination" ||
        constraint.kind === "when") &&
      Array.isArray(constraint.all)
    ) {
      constraint.all.forEach((fact, factIndex) => {
        if (!isPlainRecord(fact)) return;
        const allowedFact =
          fact.kind === "present"
            ? usageConstraintDefinitionPropertyKeys.fact.present
            : fact.kind === "equals"
              ? usageConstraintDefinitionPropertyKeys.fact.equals
              : undefined;
        if (allowedFact !== undefined) {
          collectUnknownProperties(
            fact,
            [...constraintPath, "all", String(factIndex)],
            allowedFact,
            issues,
          );
        }
      });
    }
    if (constraint.kind === "when") {
      for (const branch of ["onMatch", "otherwise"] as const) {
        const effect = constraint[branch];
        if (!isPlainRecord(effect)) continue;
        collectUnknownProperties(
          effect,
          [...constraintPath, branch],
          usageConstraintDefinitionPropertyKeys.effect,
          issues,
        );
      }
    }
  });
}

function collectUnknownProperties(
  value: unknown,
  path: readonly string[],
  allowed: readonly string[],
  issues: ContractDefinitionIssue[],
): void {
  if (!isPlainRecord(value)) return;
  for (const property of Object.keys(value)) {
    if (!allowed.includes(property)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: [...path, property],
      });
    }
  }
}

type CountHelpFact =
  | Readonly<{
      readonly slot: "countExactly";
      readonly values: HelpFactTemplateParameters["countExactly"];
    }>
  | Readonly<{
      readonly slot: "countAtLeast";
      readonly values: HelpFactTemplateParameters["countAtLeast"];
    }>
  | Readonly<{
      readonly slot: "countAtMost";
      readonly values: HelpFactTemplateParameters["countAtMost"];
    }>
  | Readonly<{
      readonly slot: "countBetween";
      readonly values: HelpFactTemplateParameters["countBetween"];
    }>;

/** 从规范化数量规则派生帮助槽位及对应占位符。 */
function countHelpFactForConstraint(
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
function compileCountUsageConstraint(
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
function evaluateCountUsageConstraint(
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
function projectCountUsageConstraint(
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

export function compileUsageConstraints(
  definitions: unknown,
  fields: readonly UsageConstraintField[],
  command: string,
  issues: ContractDefinitionIssue[],
  input: SchemaManifest | undefined,
): CompiledUsageConstraints {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const compiled: UsageConstraintGrammar[] = [];
  if (!Array.isArray(definitions)) {
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index: null,
      aspect: "collection",
      received: null,
    });
    return finishUsageConstraintCompilation(compiled, input);
  }
  for (const [index, definition] of definitions.entries()) {
    if (typeof definition !== "object" || definition === null) {
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "entry",
        received: null,
      });
      continue;
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 定义条目已通过非 null 对象检查，此处读取动态属性。
    const candidate = definition as Readonly<Record<string, unknown>>;
    if (
      candidate.kind !== "count" &&
      candidate.kind !== "when" &&
      candidate.kind !== "forbiddenCombination"
    ) {
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "kind",
        received: typeof candidate.kind === "string" ? candidate.kind : null,
      });
      continue;
    }
    if (candidate.kind === "count") {
      const compiledCount = compileCountUsageConstraint(
        candidate,
        fields,
        command,
        index,
        issues,
      );
      if (compiledCount !== undefined) compiled.push(compiledCount);
      continue;
    }
    if (candidate.kind === "when") {
      const facts = compileUsageFacts(
        candidate.all,
        "when",
        index,
        command,
        fieldsByKey,
        issues,
      );
      const onMatch = compileUsageEffect(
        candidate.onMatch,
        "onMatch",
        index,
        command,
        fieldsByKey,
        issues,
      );
      const otherwise = compileUsageEffect(
        candidate.otherwise,
        "otherwise",
        index,
        command,
        fieldsByKey,
        issues,
      );
      const hasEffect = onMatch.hasEffect || otherwise.hasEffect;
      if (onMatch.valid && otherwise.valid && !hasEffect) {
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: "when",
          member: "effects",
          path: ["commands", command, "usageConstraints", index],
          expected: "至少一个分支包含非空 require 或 forbid 字段组",
        });
      }
      if (facts.valid && onMatch.valid && otherwise.valid && hasEffect) {
        compiled.push(
          deepFreeze({
            kind: "when" as const,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- compileUsageFacts仅在all非空且所有事实合法时返回valid。
            all: facts.facts as [UsageFact, ...UsageFact[]],
            ...(onMatch.effect === undefined
              ? {}
              : { onMatch: onMatch.effect }),
            ...(otherwise.effect === undefined
              ? {}
              : { otherwise: otherwise.effect }),
          }),
        );
      }
      continue;
    }
    if (candidate.kind === "forbiddenCombination") {
      const facts = compileUsageFacts(
        candidate.all,
        "forbiddenCombination",
        index,
        command,
        fieldsByKey,
        issues,
      );
      if (facts.valid)
        compiled.push(
          deepFreeze({
            kind: "forbiddenCombination" as const,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- compileUsageFacts仅在all非空且所有事实合法时返回valid。
            all: facts.facts as [UsageFact, ...UsageFact[]],
          }),
        );
      continue;
    }
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "kind",
      received: null,
    });
  }
  return finishUsageConstraintCompilation(compiled, input);
}

function finishUsageConstraintCompilation(
  constraints: readonly UsageConstraintGrammar[],
  input: SchemaManifest | undefined,
): CompiledUsageConstraints {
  const normalized = deepFreeze([...constraints]);
  const requiredHelpTemplates =
    requiredUsageConstraintHelpTemplates(normalized);
  return deepFreeze({
    constraints: normalized,
    requiredHelpTemplates,
    inputProjection:
      input === undefined
        ? undefined
        : projectUsageConstraints(input, normalized),
  });
}

interface CompiledUsageFacts {
  readonly facts: readonly UsageFact[];
  readonly valid: boolean;
}

interface CompiledUsageEffect {
  readonly effect?: UsageConstraintEffect;
  readonly valid: boolean;
  readonly hasEffect: boolean;
}

type UsageFactForValidation =
  | UsageFact
  | Readonly<{
      readonly kind: "invalidEqualsValue";
      readonly field: string;
      readonly value: unknown;
    }>;

function compileUsageFacts(
  definitions: unknown,
  constraint: "when" | "forbiddenCombination",
  index: number,
  command: string,
  fieldsByKey: ReadonlyMap<string, UsageConstraintField>,
  issues: ContractDefinitionIssue[],
): CompiledUsageFacts {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "members",
      received: constraint,
      member: "all",
      path: ["commands", command, "usageConstraints", index, "all"],
      expected: "非空字段事实数组",
    });
    return { facts: [], valid: false };
  }

  const facts: UsageFact[] = [];
  const factsForValidation: UsageFactForValidation[] = [];
  let valid = true;
  for (const [factIndex, candidateFact] of definitions.entries()) {
    const path = [
      "commands",
      command,
      "usageConstraints",
      index,
      "all",
      factIndex,
    ];
    if (!isPlainRecord(candidateFact)) {
      valid = false;
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "members",
        received: candidateFact,
        member: "all",
        path,
        expected: "present 或 equals 字段事实对象",
      });
      continue;
    }
    if (
      candidateFact.kind === "present" &&
      typeof candidateFact.field === "string"
    ) {
      const fact = { kind: "present", field: candidateFact.field } as const;
      facts.push(fact);
      factsForValidation.push(fact);
      continue;
    }
    if (
      candidateFact.kind === "equals" &&
      typeof candidateFact.field === "string" &&
      Object.hasOwn(candidateFact, "value")
    ) {
      if (
        typeof candidateFact.value === "boolean" ||
        typeof candidateFact.value === "string"
      ) {
        const fact = {
          kind: "equals",
          field: candidateFact.field,
          value: candidateFact.value,
        } as const;
        facts.push(fact);
        factsForValidation.push(fact);
      } else {
        factsForValidation.push({
          kind: "invalidEqualsValue",
          field: candidateFact.field,
          value: candidateFact.value,
        });
      }
      continue;
    }
    valid = false;
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "members",
      received: candidateFact.kind,
      member: "all",
      path,
      expected: "present{field} 或 equals{field,value}",
    });
  }

  let invalidFactCount = 0;
  for (const fact of factsForValidation) {
    if (fact.kind === "invalidEqualsValue") {
      const field = fieldsByKey.get(fact.field);
      if (field === undefined) {
        invalidFactCount += 1;
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint,
          index,
          member: "all.field",
          field: fact.field,
        });
        continue;
      }
      if (
        field.kind !== "flag" &&
        field.kind !== "valueOption" &&
        field.kind !== "positional"
      ) {
        invalidFactCount += 1;
        issues.push({
          code: "inapplicableUsageConstraintField",
          command,
          constraint,
          index,
          member: "all.field",
          field: field.key,
          kind: field.kind,
        });
        continue;
      }
      invalidFactCount += 1;
      const expected =
        field.kind === "flag"
          ? field.negatedLongOption === undefined
            ? true
            : "boolean"
          : field.choices === undefined
            ? "string"
            : Object.freeze([...field.choices]);
      issues.push({
        code: "invalidUsageConstraintValue",
        command,
        constraint,
        index,
        member: "all.value",
        field: field.key,
        actual: fact.value,
        expected,
      });
      continue;
    }

    const field = fieldsByKey.get(fact.field);
    if (field === undefined) {
      invalidFactCount += 1;
      issues.push({
        code: "unknownUsageConstraintField",
        command,
        constraint,
        index,
        member: "all.field",
        field: fact.field,
      });
      continue;
    }
    if (
      fact.kind === "equals" &&
      field.kind !== "flag" &&
      field.kind !== "valueOption" &&
      field.kind !== "positional"
    ) {
      invalidFactCount += 1;
      issues.push({
        code: "inapplicableUsageConstraintField",
        command,
        constraint,
        index,
        member: "all.field",
        field: field.key,
        kind: field.kind,
      });
      continue;
    }
    if (fact.kind !== "equals") continue;

    const expectedKind = field.kind === "flag" ? "boolean" : "string";
    const hasExpectedType =
      expectedKind === "boolean"
        ? typeof fact.value === "boolean"
        : typeof fact.value === "string";
    const onlyTrue =
      field.kind === "flag" &&
      field.negatedLongOption === undefined &&
      fact.value !== true;
    const outsideChoices =
      typeof fact.value === "string" &&
      field.choices !== undefined &&
      !field.choices.includes(fact.value);
    if (!hasExpectedType || onlyTrue || outsideChoices) {
      invalidFactCount += 1;
      issues.push({
        code: "invalidUsageConstraintValue",
        command,
        constraint,
        index,
        member: "all.value",
        field: field.key,
        actual: fact.value,
        expected:
          outsideChoices && field.choices !== undefined
            ? Object.freeze([...field.choices])
            : onlyTrue
              ? true
              : expectedKind === "boolean"
                ? "boolean"
                : "string",
      });
    }
  }

  const conflictingFields = new Set<string>();
  for (const [factIndex, fact] of facts.entries()) {
    if (fact.kind !== "equals") continue;
    if (
      facts.some(
        (other, otherIndex) =>
          otherIndex !== factIndex &&
          other.kind === "equals" &&
          other.field === fact.field &&
          other.value !== fact.value,
      )
    ) {
      conflictingFields.add(fact.field);
    }
  }
  if (conflictingFields.size > 0) {
    issues.push({
      code: "contradictoryUsageConstraint",
      command,
      constraint,
      index,
      member: "all",
      fields: Object.freeze([...conflictingFields]),
    });
  }
  valid &&=
    invalidFactCount === 0 &&
    conflictingFields.size === 0 &&
    facts.length === definitions.length;
  return { facts: deepFreeze(facts), valid };
}

function compileUsageEffect(
  definition: unknown,
  branch: "onMatch" | "otherwise",
  index: number,
  command: string,
  fieldsByKey: ReadonlyMap<string, UsageConstraintField>,
  issues: ContractDefinitionIssue[],
): CompiledUsageEffect {
  if (definition === undefined) return { valid: true, hasEffect: false };
  const path = ["commands", command, "usageConstraints", index, branch];
  if (!isPlainRecord(definition)) {
    issues.push({
      code: "invalidUsageConstraint",
      command,
      index,
      aspect: "members",
      received: definition,
      member: branch,
      path,
      expected: "只包含 require 和 forbid 字段数组的效果对象",
    });
    return { valid: false, hasEffect: false };
  }

  let valid = true;
  let hasEffect = false;
  const compiled: { require?: string[]; forbid?: string[] } = {};
  for (const member of ["require", "forbid"] as const) {
    if (!Object.hasOwn(definition, member)) continue;
    const values = definition[member];
    if (!Array.isArray(values)) {
      valid = false;
      issues.push({
        code: "invalidUsageConstraint",
        command,
        index,
        aspect: "members",
        received: values,
        member: `${branch}.${member}`,
        path: [...path, member],
        expected: "字段名称数组",
      });
      continue;
    }
    if (values.length > 0) hasEffect = true;
    const compiledFields: string[] = [];
    for (const [fieldIndex, field] of values.entries()) {
      if (typeof field !== "string") {
        valid = false;
        issues.push({
          code: "invalidUsageConstraint",
          command,
          index,
          aspect: "members",
          received: field,
          member: `${branch}.${member}`,
          path: [...path, member, fieldIndex],
          expected: "字段名称字符串",
        });
        continue;
      }
      if (!fieldsByKey.has(field)) {
        valid = false;
        issues.push({
          code: "unknownUsageConstraintField",
          command,
          constraint: "when",
          index,
          member: `${branch}.${member}`,
          field,
        });
        continue;
      }
      compiledFields.push(field);
    }
    compiled[member] = compiledFields;
  }

  const forbidden = new Set(compiled.forbid ?? []);
  const conflictingFields = [...new Set(compiled.require ?? [])].filter(
    (field) => forbidden.has(field),
  );
  if (conflictingFields.length > 0) {
    valid = false;
    issues.push({
      code: "contradictoryUsageConstraint",
      command,
      constraint: "when",
      index,
      member: branch,
      fields: Object.freeze(conflictingFields),
    });
  }
  return {
    effect: deepFreeze(compiled),
    valid,
    hasEffect,
  };
}

function projectUsageConstraints(
  schema: SchemaManifest,
  constraints: readonly UsageConstraintGrammar[],
): SchemaManifest {
  const constraintSchemas: JsonObject[] = [];
  const countDefinitions: Record<string, JsonValue> = isPlainRecord(
    schema.inputSchema.$defs,
  )
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- inputSchema 的 $defs 是已验证 JSON Schema 对象。
      { ...(schema.inputSchema.$defs as JsonObject) }
    : {};
  let countConstraintIndex = 0;
  for (const constraint of constraints) {
    if (constraint.kind === "count") {
      const projection = projectCountUsageConstraint(
        constraint,
        countDefinitions,
        countConstraintIndex,
      );
      if (projection !== undefined) {
        constraintSchemas.push(projection);
        countConstraintIndex += 1;
      }
      continue;
    }
    if (constraint.kind === "when") {
      const condition = {
        allOf: constraint.all.map((fact) =>
          fact.kind === "present"
            ? { required: [fact.field] }
            : {
                properties: { [fact.field]: { const: fact.value } },
                required: [fact.field],
              },
        ),
      };
      const effects: Record<string, JsonValue> = {};
      const onMatch = constraint.onMatch;
      if (
        onMatch !== undefined &&
        ((onMatch.require?.length ?? 0) > 0 ||
          (onMatch.forbid?.length ?? 0) > 0)
      ) {
        // oxlint-disable-next-line unicorn/no-thenable -- Draft 2020-12 固定关键字。
        effects.then = usageEffectSchema(onMatch);
      }
      const otherwise = constraint.otherwise;
      if (
        otherwise !== undefined &&
        ((otherwise.require?.length ?? 0) > 0 ||
          (otherwise.forbid?.length ?? 0) > 0)
      ) {
        effects.else = usageEffectSchema(otherwise);
      }
      constraintSchemas.push({ if: condition, ...effects });
      continue;
    }
    constraintSchemas.push({
      not: {
        allOf: constraint.all.map((fact) =>
          fact.kind === "present"
            ? { required: [fact.field] }
            : {
                properties: { [fact.field]: { const: fact.value } },
                required: [fact.field],
              },
        ),
      },
    });
  }
  if (constraintSchemas.length === 0) return schema;
  return deepFreeze({
    inputSchema: {
      ...schema.inputSchema,
      ...(countConstraintIndex === 0 ? {} : { $defs: countDefinitions }),
      allOf: [
        ...(Array.isArray(schema.inputSchema.allOf)
          ? schema.inputSchema.allOf
          : []),
        ...constraintSchemas,
      ],
    },
    outputSchema: schema.outputSchema,
  });
}

function usageEffectSchema(effect: UsageConstraintEffect): JsonObject {
  const required = effect.require ?? [];
  const forbidden = effect.forbid ?? [];
  const hasRepeatedRequiredField = new Set(required).size < required.length;
  return {
    ...(required.length === 0
      ? {}
      : hasRepeatedRequiredField
        ? { allOf: required.map((field) => ({ required: [field] })) }
        : { required: [...required] }),
    ...(forbidden.length === 0
      ? {}
      : {
          not: {
            anyOf: forbidden.map((field) => ({ required: [field] })),
          },
        }),
  };
}

type UsageConstraintHelpUse = {
  [Slot in UsageConstraintHelpSlot]: Readonly<{
    readonly slot: Slot;
    readonly values: HelpFactTemplateParameters[Slot];
  }>;
}[UsageConstraintHelpSlot];

type UsageConstraintHelpRenderer = <Slot extends UsageConstraintHelpSlot>(
  slot: Slot,
  values: HelpFactTemplateParameters[Slot],
) => string;

interface UsageConstraintHelpPlan {
  readonly requiredSlots: readonly UsageConstraintHelpSlot[];
  readonly format: (render: UsageConstraintHelpRenderer) => string;
}

export function requiredUsageConstraintHelpTemplates(
  constraints: readonly UsageConstraintGrammar[],
): readonly UsageConstraintHelpSlot[] {
  const slots = new Set<UsageConstraintHelpSlot>();
  for (const constraint of constraints) {
    for (const slot of usageConstraintHelpPlan(constraint).requiredSlots) {
      slots.add(slot);
    }
  }
  return Object.freeze([...slots]);
}

export function formatUsageConstraint(
  constraint: UsageConstraintGrammar,
  render: UsageConstraintHelpRenderer,
): string {
  return usageConstraintHelpPlan(constraint).format(render);
}

function usageConstraintHelpPlan(
  constraint: UsageConstraintGrammar,
): UsageConstraintHelpPlan {
  if (constraint.kind === "count") {
    const use = countHelpFactForConstraint(constraint);
    return {
      requiredSlots: [use.slot],
      format: (render) => formatUsageConstraintHelpUse(use, render),
    };
  }

  const facts = constraint.all.map(usageFactHelpUse);
  if (constraint.kind === "forbiddenCombination") {
    const primarySlot = "forbiddenCombination" as const;
    return {
      requiredSlots: [primarySlot, ...facts.map(({ slot }) => slot)],
      format: (render) => {
        const factsText = facts
          .map((fact) => formatUsageConstraintHelpUse(fact, render))
          .join(", ");
        return render(primarySlot, { facts: factsText });
      },
    };
  }

  const onMatch = usageEffectHelpUses(constraint.onMatch);
  const otherwise = usageEffectHelpUses(constraint.otherwise);
  const hasOnMatch = onMatch.length > 0;
  const hasOtherwise = otherwise.length > 0;
  const primarySlot = hasOnMatch
    ? hasOtherwise
      ? "whenOnMatchOtherwise"
      : "whenOnMatch"
    : "whenOtherwise";
  const requiredSlots: UsageConstraintHelpSlot[] = [
    primarySlot,
    ...facts.map(({ slot }) => slot),
    ...(onMatch.some(({ slot }) => slot === "require") ||
    otherwise.some(({ slot }) => slot === "require")
      ? (["require"] as const)
      : []),
    ...(onMatch.some(({ slot }) => slot === "forbid") ||
    otherwise.some(({ slot }) => slot === "forbid")
      ? (["forbid"] as const)
      : []),
  ];
  return {
    requiredSlots,
    format: (render) => {
      const factsText = facts
        .map((fact) => formatUsageConstraintHelpUse(fact, render))
        .join(", ");
      const onMatchText = onMatch
        .map((use) => formatUsageConstraintHelpUse(use, render))
        .join(", ");
      const otherwiseText = otherwise
        .map((use) => formatUsageConstraintHelpUse(use, render))
        .join(", ");
      if (primarySlot === "whenOnMatchOtherwise") {
        return render(primarySlot, {
          facts: factsText,
          onMatch: onMatchText,
          otherwise: otherwiseText,
        });
      }
      if (primarySlot === "whenOnMatch") {
        return render(primarySlot, { facts: factsText, onMatch: onMatchText });
      }
      return render(primarySlot, {
        facts: factsText,
        otherwise: otherwiseText,
      });
    },
  };
}

function usageFactHelpUse(fact: UsageFact): UsageConstraintHelpUse {
  return fact.kind === "present"
    ? { slot: "present", values: { field: fact.field } }
    : {
        slot: "equals",
        values: { field: fact.field, value: JSON.stringify(fact.value) },
      };
}

function usageEffectHelpUses(
  effect: UsageConstraintEffect | undefined,
): readonly UsageConstraintHelpUse[] {
  if (effect === undefined) return [];
  const uses: UsageConstraintHelpUse[] = [];
  const required = effect.require ?? [];
  const forbidden = effect.forbid ?? [];
  if (required.length > 0) {
    uses.push({ slot: "require", values: { fields: required.join(", ") } });
  }
  if (forbidden.length > 0) {
    uses.push({ slot: "forbid", values: { fields: forbidden.join(", ") } });
  }
  return uses;
}

function formatUsageConstraintHelpUse(
  use: UsageConstraintHelpUse,
  render: UsageConstraintHelpRenderer,
): string {
  switch (use.slot) {
    case "countExactly":
    case "countAtLeast":
    case "countAtMost":
    case "countBetween":
    case "forbiddenCombination":
    case "whenOnMatch":
    case "whenOtherwise":
    case "whenOnMatchOtherwise":
    case "require":
    case "forbid":
    case "present":
    case "equals":
      return render(use.slot, use.values);
    default:
      return assertNeverUsageHelpUse(use);
  }
}

function assertNeverUsageHelpUse(value: never): never {
  throw new Error(`unhandledUsageConstraintHelpUse:${JSON.stringify(value)}`);
}

export function evaluateUsageConstraints(
  constraints: readonly UsageConstraintGrammar[],
  input: Readonly<Record<string, boolean | string | string[]>>,
): UsageConstraintIssue[] {
  return constraints.flatMap((constraint): UsageConstraintIssue[] => {
    if (constraint.kind === "count") {
      const issue = evaluateCountUsageConstraint(constraint, input);
      return issue === undefined ? [] : [issue];
    }
    if (constraint.kind === "when") {
      const observed = constraint.all.map((fact) =>
        observeUsageFact(fact, input),
      );
      const branch = observed.every(({ matches }) => matches)
        ? "onMatch"
        : "otherwise";
      const effect = constraint[branch];
      if (effect === undefined) return [];
      const missingRequiredFields = (effect.require ?? []).filter(
        (field) => !Object.hasOwn(input, field),
      );
      const presentForbiddenFields = (effect.forbid ?? []).filter((field) =>
        Object.hasOwn(input, field),
      );
      if (
        missingRequiredFields.length === 0 &&
        presentForbiddenFields.length === 0
      ) {
        return [];
      }
      return [
        {
          code: "conditionalConstraintViolation",
          branch,
          conditions: Object.freeze(
            observed.map(({ observation }) => observation),
          ),
          missingRequiredFields: Object.freeze(missingRequiredFields),
          presentForbiddenFields: Object.freeze(presentForbiddenFields),
        },
      ];
    }
    return constraint.all.every((fact) => observeUsageFact(fact, input).matches)
      ? [
          {
            code: "forbiddenCombinationViolation",
            facts: constraint.all,
          },
        ]
      : [];
  });
}

function observeUsageFact(
  fact: UsageFact,
  input: Readonly<Record<string, boolean | string | string[]>>,
): Readonly<{
  readonly matches: boolean;
  readonly observation: UsageConstraintObservation;
}> {
  const present = Object.hasOwn(input, fact.field);
  if (fact.kind === "present") {
    return {
      matches: present,
      observation: Object.freeze({
        kind: "present",
        field: fact.field,
        present,
      }),
    };
  }
  if (!present) {
    return {
      matches: false,
      observation: Object.freeze({
        kind: "equals",
        field: fact.field,
        expected: fact.value,
        present: false,
      }),
    };
  }
  const actual = input[fact.field];
  if (typeof actual !== "boolean" && typeof actual !== "string") {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return {
    matches: actual === fact.value,
    observation: Object.freeze({
      kind: "equals",
      field: fact.field,
      expected: fact.value,
      present: true,
      actual,
    }),
  };
}
