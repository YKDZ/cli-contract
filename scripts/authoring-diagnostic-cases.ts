import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { API, SignatureKind, SymbolFlags } from "typescript-7/unstable/sync";

const resolutions = ["nodenext", "bundler"] as const;

type Resolution = (typeof resolutions)[number];
type CompilerVersion = "6.0.3" | "7.0.2";

type SourceDerivation =
  | { readonly kind: "copy" }
  | {
      readonly kind: "removeAllTsExpectError";
      readonly fixture: string;
    }
  | {
      readonly kind: "removeMarkedTsExpectError";
      readonly fixture: string;
      readonly marker: string;
    };

type CliDiagnosticExpectation =
  | {
      readonly kind: "codes";
      readonly expectedDiagnostics?: number;
      readonly required: readonly string[];
      readonly requiredAny?: readonly string[];
      readonly allowAdditionalDiagnostics?: boolean;
      readonly forbidden?: readonly string[];
    }
  | {
      readonly kind: "completion";
      readonly required: readonly string[];
      readonly forbidden: readonly string[];
    }
  | {
      readonly kind: "namedVariant" | "streamText" | "streamRecordName";
      readonly expectedDiagnostics: number;
      readonly required: readonly string[];
      readonly forbidden?: readonly string[];
    }
  | {
      readonly kind: "fieldSet";
      readonly expectedDiagnostics: number;
      readonly required: readonly string[];
      readonly requiredAny?: readonly string[];
      readonly forbidden?: readonly string[];
    }
  | {
      readonly kind: "forward";
      readonly expectedDiagnostics: number;
      readonly required: readonly string[];
      readonly forbidden?: readonly string[];
    }
  | {
      readonly kind: "hierarchy";
      readonly required: readonly string[];
      readonly forbidden?: readonly string[];
    };

interface LanguageServiceDiagnosticExpectation {
  readonly count: number;
  readonly required: readonly string[];
  readonly requiredAny?: readonly string[];
}

interface CommonDiagnosticCodeExpectation {
  readonly code: string;
  readonly cliMultiplicity?: number;
  readonly languageServiceRequired?: true;
}

interface AuthoringDiagnosticSource {
  readonly fixture: string;
  readonly sourcePath?: string;
  readonly packageEntry?: string;
}

interface AuthoringDiagnosticCase extends AuthoringDiagnosticSource {
  readonly derivation: SourceDerivation;
  readonly common: {
    readonly codes: readonly CommonDiagnosticCodeExpectation[];
    readonly required: readonly string[];
    readonly requiredAny?: readonly string[];
  };
  readonly cli: CliDiagnosticExpectation;
  readonly languageService?: LanguageServiceDiagnosticExpectation;
}

async function verifyHierarchyTextCoverageDiagnostic(
  project: string,
  resolution: Resolution,
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (
    diagnostic.cli.kind !== "hierarchy" ||
    diagnostic.derivation.kind !== "removeMarkedTsExpectError"
  ) {
    throw new Error("Invalid hierarchy diagnostic case configuration");
  }
  const fixture = diagnostic.derivation.fixture;
  const { cli } = diagnostic;
  const expectedCodes = expectedCliCodes(diagnostic);
  const tsconfig = diagnosticTsconfigName(resolution, fixture);
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevelMessages = firstLevelCompilerMessages(diagnostics, fixture);
  const firstLevel = firstLevelMessages.join("\n");
  const headers = diagnostics
    .split(/\r?\n/)
    .filter(
      (line) => line.startsWith(`${fixture}(`) && line.includes(": error TS"),
    );
  const firstLevelCodes = firstLevelMessages.flatMap((line) => {
    const match = /^  [^ ].*ContractTypeError<"([^"]+)"/.exec(line);
    const code = match?.[1];
    return code === undefined ? [] : [code];
  });
  const actualCodes = [...firstLevelCodes].sort((left, right) =>
    left.localeCompare(right),
  );
  const sortedExpectedCodes = [...expectedCodes].sort((left, right) =>
    left.localeCompare(right),
  );
  const allHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  const unrelated = cli.forbidden ?? [];
  if (
    result.status === 0 ||
    required.some((fragment) => !firstLevel.includes(fragment)) ||
    unrelated.some((fragment) => diagnostics.includes(fragment)) ||
    headers.length !== expectedCodes.length ||
    actualCodes.join(",") !== sortedExpectedCodes.join(",") ||
    allHeaders?.length !== headers.length
  ) {
    throw new Error(
      `Hierarchy text diagnostic did not expose only local contract evidence\n${diagnostics}`,
    );
  }
}

const authoringDiagnosticCases: readonly AuthoringDiagnosticCase[] = [
  {
    fixture: "invalid-authoring-identities.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-authoring-identities.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "bad_root"',
        'reason: "lowerCamelCase"',
        'command: "negatedRoot"',
        'received: "--no-Bad"',
        'command: "longOptionIdentity"',
        'received: "--Bad"',
        'command: "shortAliasIdentity"',
        'received: "-bad"',
        'command: "fieldIdentity"',
        'field: "bad_field"',
        'field: "constructor"',
        'field: "hasOwnProperty"',
        'field: "isPrototypeOf"',
        'field: "propertyIsEnumerable"',
        'field: "toString"',
        'field: "valueOf"',
        'field: "toLocaleString"',
        'reason: "reservedName"',
        "rename the field key and update the schema Input key and its references; the CLI spelling may stay unchanged",
        "start with a lowercase letter, letters and digits only",
        'command: "dataVariantIdentity"',
        'location: "data"',
        'command: "failureVariantIdentity"',
        'location: "failure"',
        'variant: "bad_name"',
        'command: "deploy"',
      ],
      codes: [
        {
          code: "invalidCommandIdentity",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "invalidFieldLongOption",
          cliMultiplicity: 3,
          languageServiceRequired: true,
        },
        {
          code: "invalidFieldShortAlias",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "invalidFieldIdentity",
          cliMultiplicity: 8,
          languageServiceRequired: true,
        },
        {
          code: "invalidVariantName",
          cliMultiplicity: 2,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
    },
    languageService: {
      count: 15,
      required: ['field: "token"'],
    },
  },
  {
    fixture: "invalid-conditional-usage-constraint.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-conditional-usage-constraint.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "missingWhenEffects"',
        'command: "branchConflict"',
        'command: "multiFieldConflict"',
        'command: "unionFieldConflict"',
        'command: "effectSuffixConflict"',
        'command: "factSuffixConflict"',
        'member: "effects"',
        'member: "onMatch"',
        'fields: "token"',
        'fields: "mode"',
      ],
      codes: [
        {
          code: "invalidUsageConstraint",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "contradictoryUsageConstraint",
          cliMultiplicity: 5,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: ['constraint: "when"'],
    },
    languageService: {
      count: 6,
      required: [],
    },
  },
  {
    fixture: "unknown-usage-constraint-field.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/unknown-usage-constraint-field.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "deploy"',
        'command: "rootDeploy"',
        'command: "mixedRest"',
        'command: "suffixMissingEffect"',
        'member: "onMatch.require"',
        'field: "token"',
        'field: "missing"',
      ],
      codes: [
        {
          code: "unknownUsageConstraintField",
          cliMultiplicity: 4,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: ['constraint: "when"'],
    },
    languageService: {
      count: 4,
      required: [],
    },
  },
  {
    fixture: "invalid-command-combination.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-command-combination.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: ['command: "inspect"', 'member: "all"', 'property: "typo"'],
      codes: [
        {
          code: "unknownDefinitionProperty",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
      allowAdditionalDiagnostics: true,
      forbidden: ["No overload matches this call", "StreamHandlerContext"],
    },
    languageService: {
      count: 1,
      required: [],
    },
  },
  {
    fixture: "invalid-forbidden-combination.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-forbidden-combination.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "invalidValue"',
        'command: "invalidKind"',
        'command: "invalidHierarchy"',
        'command: "invalidContradiction"',
        'command: "contradictoryHierarchy"',
        'command: "invalidClosedConstraint"',
        'command: "invalidClosedFact"',
        'command: "invalidClosedFactUnion"',
        'command: "invalidClosedFactUnionHierarchy"',
        'command: "invalidNumericValue"',
        'command: "invalidNullValue"',
        'command: "invalidObjectValue"',
        'command: "factSuffixConflict"',
        'member: "all.value"',
        'member: "all.field"',
        'field: "auth"',
        'field: "mode"',
        'field: "target"',
        'actual: "yes"',
        'actual: "staging"',
        "actual: 42",
        "actual: null",
        "expected: true",
        'kind: "repeatableOption"',
        'member: "all"',
        'fields: "token"',
        'fields: "mode"',
        'property: "typo"',
        'member: "forbiddenCombination"',
      ],
      requiredAny: ['expected: "safe" | "force"', 'expected: "force" | "safe"'],
      codes: [
        {
          code: "invalidUsageConstraintValue",
          cliMultiplicity: 5,
          languageServiceRequired: true,
        },
        { code: "contradictoryUsageConstraint", cliMultiplicity: 3 },
        {
          code: "inapplicableUsageConstraintField",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "unknownDefinitionProperty",
          cliMultiplicity: 4,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: ['constraint: "forbiddenCombination"', "readonly actual: {"],
      allowAdditionalDiagnostics: true,
    },
    languageService: {
      count: 14,
      required: ["actual: {"],
    },
  },
  {
    fixture: "invalid-help-fact-templates.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-help-fact-templates.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'slot: "commandPlaceholder"',
        'received: "   "',
        'reason: "empty"',
        'received: "<命令组>"',
        'reason: "placeholder"',
        'slot: "choices"',
        'received: "{usage} 候选 {choises}"',
        'property: "choises"',
        'slot: "present"',
        'slot: "equals"',
        'slot: "forbiddenCombination"',
        'reason: "singleLine"',
      ],
      codes: [
        {
          code: "invalidHelpFactTemplate",
          cliMultiplicity: 8,
          languageServiceRequired: true,
        },
        {
          code: "unknownDefinitionProperty",
          cliMultiplicity: 3,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [
        'path: readonly ["help", "wording", "choises"]',
        'received: "字段"',
        'received: "字段 {field}"',
      ],
    },
    languageService: {
      count: 11,
      required: [],
    },
  },
  {
    fixture: "invalid-count-constraint.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-count-constraint.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "deploy"',
        'command: "stage"',
        'command: "quota"',
        'command: "compound"',
        'command: "fractional"',
        'command: "rootDeploy"',
        'command: "rootMissingCountField"',
        'command: "missingCountChild"',
        'command: "missingSuffixCountField"',
        'command: "missingSuffixBeforeWideCountField"',
        'command: "duplicateSuffixCountField"',
        'constraint: "count"',
        'member: "fields"',
        'field: "missing"',
        'member: "min"',
        'reason: "ordered"',
        'reason: "nonNegative"',
        'reason: "fieldCount"',
        'reason: "duplicateFields"',
        'reason: "integer"',
      ],
      codes: [
        {
          code: "invalidCountConstraint",
          cliMultiplicity: 7,
          languageServiceRequired: true,
        },
        {
          code: "unknownUsageConstraintField",
          cliMultiplicity: 4,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
    },
    languageService: {
      count: 11,
      required: [],
    },
  },
  {
    fixture: "input-schema-raw-mismatch.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/input-schema-raw-mismatch.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "inspect"',
        'command: "rootInspect"',
        'command: "rootEnabled"',
        'command: "rootTags"',
        'field: "count"',
        'field: "enabled"',
        'field: "tags"',
        'location: "input"',
        "rawValue: string",
        "rawValue: true",
        "rawValue: [string, ...string[]]",
        "schemaInput: number",
        "schemaInput: string",
        "schemaInput: number[]",
      ],
      codes: [
        {
          code: "schemaFieldDoesNotAcceptRawValue",
          cliMultiplicity: 4,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
      allowAdditionalDiagnostics: true,
    },
    languageService: {
      count: 5,
      required: [],
    },
  },
  {
    fixture: "unexpected-text-presenter.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/unexpected-text-presenter.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "inspect"',
        'command: "rootInspect"',
        'location: "failure"',
        'variant: "permissionDenied"',
        'unexpected: "text"',
      ],
      codes: [
        {
          code: "unexpectedTextPresenter",
          cliMultiplicity: 2,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
    },
    languageService: {
      count: 2,
      required: [],
    },
  },
  {
    fixture: "missing-raw-field.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/missing-raw-field.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [],
      codes: [
        {
          code: "schemaFieldSetMismatch",
          cliMultiplicity: 2,
        },
      ],
    },
    cli: {
      kind: "fieldSet",
      expectedDiagnostics: 2,
      required: [
        "missingFields:",
        '"name"',
        '"count"',
        'command: "missingRawField"',
        'command: "missingUnionRawField"',
      ],
      forbidden: [
        "No overload matches this call",
        "implicitly has an 'any'",
        "Unused '@ts-expect-error'",
      ],
    },
    languageService: {
      count: 2,
      required: [
        'MissingRootFallbackFieldsContract<"missingRawField"',
        'MissingRootFallbackFieldsContract<"missingUnionRawField"',
      ],
    },
  },
  {
    fixture: "completion-missing.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/completion-missing.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [],
      codes: [{ code: "missingTextPresenter", languageServiceRequired: true }],
    },
    cli: {
      kind: "completion",
      required: [
        'command: "missingCompletion"',
        'command: "missingCompletionWithField"',
        'location: "completion"',
        'missing: "text"',
      ],
      forbidden: [
        "schemaFieldDoesNotAcceptRawValue",
        "Property 'completion' does not exist",
        "implicitly has an 'any'",
      ],
    },
    languageService: {
      count: 2,
      required: [
        'command: "missingCompletion"',
        'command: "missingCompletionWithField"',
        'location: "completion"',
        'missing: "text"',
      ],
    },
  },
  {
    fixture: "named-variant-missing.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/named-variant-missing.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [],
      codes: [{ code: "missingTextPresenter", languageServiceRequired: true }],
    },
    cli: {
      kind: "namedVariant",
      expectedDiagnostics: 3,
      required: [
        "named-variant-missing.ts",
        'command: "missingDataVariantText"',
        'command: "missingDataFailureText"',
        'command: "missingCompletionFailureText"',
        'location: "data"',
        'location: "failure"',
        'variant: "deferred"',
        'variant: "forbidden"',
        'missing: "text"',
      ],
    },
    languageService: {
      count: 3,
      required: [
        'command: "missingDataVariantText"',
        'command: "missingDataFailureText"',
        'command: "missingCompletionFailureText"',
        'location: "data"',
        'location: "failure"',
        'variant: "deferred"',
        'variant: "forbidden"',
        'missing: "text"',
      ],
    },
  },
  {
    fixture: "text-options-variable.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/text-options-variable.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [],
      codes: [{ code: "missingTextPresenter", languageServiceRequired: true }],
    },
    cli: {
      kind: "namedVariant",
      expectedDiagnostics: 2,
      required: [
        "text-options-variable.ts",
        'command: "extractedMissingFailure"',
        'command: "extractedMissingData"',
        'location: "failure"',
        'location: "data"',
        'variant: "unavailable"',
        'variant: "found"',
        'missing: "text"',
      ],
    },
    languageService: {
      count: 2,
      required: [
        'command: "extractedMissingFailure"',
        'command: "extractedMissingData"',
        'location: "failure"',
        'location: "data"',
        'variant: "unavailable"',
        'variant: "found"',
        'missing: "text"',
      ],
    },
  },
  {
    fixture: "generic-text-forward.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/generic-text-forward.ts",
    derivation: {
      kind: "removeAllTsExpectError",
      fixture: "generic-text-forward-unchecked.ts",
    },
    common: {
      required: ['command: "lookup"'],
      codes: [{ code: "missingTextPresenter", cliMultiplicity: 3 }],
    },
    cli: {
      kind: "forward",
      expectedDiagnostics: 10,
      required: [
        'location: "failure"',
        'location: "record"',
        'variant: "denied"',
        'variant: "update"',
        'missing: "text"',
        "Property 'missing' does not exist",
        "not assignable to type 'never'",
        "VariantPresenter<",
        "AtomicProjection",
        "RecordProjection",
        'AtomicTextOptions<"lookup"',
        'StreamTextOptions<"lookup"',
      ],
      forbidden: [
        "implicitly has an 'any'",
        "Unused '@ts-expect-error'",
        "No overload matches this call",
        "TS7031",
        "TS7006",
      ],
    },
  },
  {
    fixture: "stream-text-coverage.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/stream-text-coverage.ts",
    derivation: {
      kind: "removeAllTsExpectError",
      fixture: "stream-text-coverage-unchecked.ts",
    },
    common: {
      required: [],
      codes: [{ code: "missingTextPresenter", languageServiceRequired: true }],
    },
    cli: {
      kind: "streamText",
      expectedDiagnostics: 2,
      required: [
        'command: "missingRecord"',
        'command: "missingSuccess"',
        'location: "record"',
        'location: "streamSuccess"',
        'variant: "item"',
        'missing: "text"',
      ],
    },
    languageService: {
      count: 2,
      required: [
        'command: "missingRecord"',
        'command: "missingSuccess"',
        'location: "record"',
        'location: "streamSuccess"',
        'variant: "item"',
        'missing: "text"',
      ],
    },
  },
  {
    fixture: "stream-record-name.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/stream-record-name.ts",
    derivation: {
      kind: "removeAllTsExpectError",
      fixture: "stream-record-name-unchecked.ts",
    },
    common: {
      required: [],
      codes: [{ code: "invalidVariantName", languageServiceRequired: true }],
    },
    cli: {
      kind: "streamRecordName",
      expectedDiagnostics: 1,
      required: [
        'command: "invalidRecordName"',
        'location: "record"',
        'variant: "bad_name"',
        'reason: "lowerCamelCase"',
      ],
    },
    languageService: {
      count: 1,
      required: [
        'command: "invalidRecordName"',
        'location: "record"',
        'variant: "bad_name"',
        'reason: "lowerCamelCase"',
      ],
    },
  },
  {
    fixture: "hierarchy-text-coverage.typecheck.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/hierarchy-text-coverage.ts",
    derivation: {
      kind: "removeMarkedTsExpectError",
      fixture: "hierarchy-text-coverage-unchecked.ts",
      marker: "hierarchy-text-coverage",
    },
    common: {
      required: [
        'command: "leaf"',
        'location: "completion"',
        'location: "data"',
        'location: "failure"',
        'location: "record"',
        'location: "streamSuccess"',
        'variant: "found"',
        'variant: "unavailable"',
        'variant: "update"',
        'missing: "text"',
      ],
      codes: [
        {
          code: "missingTextPresenter",
          cliMultiplicity: 5,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "hierarchy",
      required: [],
      forbidden: [
        "TS7006",
        "TS7031",
        "Type '\"rootGroup\"' is not assignable to type '\"rootCommand\"'",
      ],
    },
    languageService: {
      count: 5,
      required: [],
    },
  },
  {
    fixture: "invalid-capabilities.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-capabilities.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'path: readonly ["help", "extra"]',
        'capability: "help"',
        'expected: "-h"',
        'received: "-x"',
        'path: readonly ["help", "headings"]',
        'path: readonly ["help", "headings", "extra"]',
        'path: readonly ["help", "headings", "usage"]',
        'heading: "usage"',
        'path: readonly ["help", "headings", "commands"]',
        'path: readonly ["help", "headings", "options"]',
        'path: readonly ["help", "wording"]',
        'path: readonly ["version", "extra"]',
        'path: readonly ["version", "value"]',
        'path: readonly ["version", "description"]',
        'capability: "version"',
        'expected: "-V"',
        'received: "-v"',
        'path: readonly ["schema", "extra"]',
        'path: readonly ["schema", "description"]',
        'capability: "schema"',
      ],
      codes: [
        {
          code: "unknownDefinitionProperty",
          cliMultiplicity: 5,
          languageServiceRequired: true,
        },
        {
          code: "invalidCapabilityShortAlias",
          cliMultiplicity: 3,
          languageServiceRequired: true,
        },
        {
          code: "invalidHelpHeadings",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "invalidHelpHeading",
          cliMultiplicity: 3,
          languageServiceRequired: true,
        },
        {
          code: "invalidHelpWording",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "invalidVersionValue",
          cliMultiplicity: 2,
          languageServiceRequired: true,
        },
        {
          code: "invalidCapabilityDescription",
          cliMultiplicity: 4,
          languageServiceRequired: true,
        },
        {
          code: "invalidCapability",
          cliMultiplicity: 12,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      expectedDiagnostics: 29,
      required: [],
    },
    languageService: {
      count: 29,
      required: [],
    },
  },
  {
    fixture: "invalid-field-placeholder.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-field-placeholder.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "badPlaceholders"',
        'field: "emptyPositional"',
        'reason: "empty"',
        'field: "blankVariadic"',
        'field: "multilineOption"',
        'reason: "singleLine"',
        'field: "bracketedRepeatable"',
        'reason: "placeholder"',
      ],
      codes: [
        {
          code: "invalidFieldPlaceholder",
          cliMultiplicity: 4,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
    },
    languageService: {
      count: 4,
      required: [],
    },
  },
  {
    fixture: "invalid-command-examples-and-outputs.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/invalid-command-examples-and-outputs.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [
        'command: "badExampleMode"',
        'command: "multiExampleInvalidMode"',
        'reason: "invalidOutputMode"',
        'received: "yaml"',
        'command: "badExampleShape"',
        'reason: "invalidShape"',
        'member: "input"',
        'command: "mismatched"',
        'reason: "mismatchedCommand"',
        'command: "badConstraintKind"',
        'aspect: "kind"',
        'command: "badConstraintCollection"',
        'aspect: "collection"',
      ],
      codes: [
        {
          code: "invalidCommandExample",
          cliMultiplicity: 3,
          languageServiceRequired: true,
        },
        {
          code: "invalidOutputModes",
          cliMultiplicity: 1,
          languageServiceRequired: true,
        },
        {
          code: "invalidUsageConstraint",
          cliMultiplicity: 2,
          languageServiceRequired: true,
        },
      ],
    },
    cli: {
      kind: "codes",
      required: [],
    },
    languageService: {
      count: 6,
      required: [],
    },
  },
];

const authoringDiscoverySources: readonly AuthoringDiagnosticSource[] = [
  {
    fixture: "authoring-example.ts",
    packageEntry: "@cli-contract/example",
  },
  {
    fixture: "exportable-contract.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/exportable-contract.ts",
  },
  {
    fixture: "core-node.ts",
    sourcePath: "scripts/fixtures/typescript-consumer-matrix/core-node.ts",
  },
] as const;

async function readAuthoringDiagnosticFixtures(): Promise<
  Readonly<Record<string, string>>
> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const sources: readonly AuthoringDiagnosticSource[] = [
    ...authoringDiagnosticCases.map(({ fixture, sourcePath }) => ({
      fixture,
      ...(sourcePath === undefined ? {} : { sourcePath }),
    })),
    ...authoringDiscoverySources,
  ];
  return Object.fromEntries(
    await Promise.all(
      sources.map(async ({ fixture, sourcePath, packageEntry }) => {
        if (sourcePath !== undefined) {
          return [
            fixture,
            await readFile(resolve(repositoryRoot, sourcePath), "utf8"),
          ];
        }
        if (packageEntry !== undefined) {
          const readEntryScript =
            'import { readFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; process.stdout.write(readFileSync(fileURLToPath(import.meta.resolve(process.argv[1])), "utf8"));';
          return [
            fixture,
            runCommand(
              "pnpm",
              [
                "--silent",
                "--filter",
                packageEntry,
                "exec",
                "node",
                "--conditions=source",
                "--input-type=module",
                "-e",
                readEntryScript,
                packageEntry,
              ],
              repositoryRoot,
            ),
          ];
        }
        throw new Error(`Authoring source not declared: ${fixture}`);
      }),
    ),
  );
}

function firstLevelCompilerMessages(
  output: string,
  fixture: string,
): readonly string[] {
  const firstLevel: string[] = [];
  let inFixtureDiagnostic = false;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith(`${fixture}(`) && line.includes(": error TS")) {
      inFixtureDiagnostic = true;
      firstLevel.push(line);
    } else if (!inFixtureDiagnostic) {
      continue;
    } else if (/^  [^ ]/.test(line)) {
      firstLevel.push(line);
    } else if (line.startsWith("    ")) {
      continue;
    } else {
      inFixtureDiagnostic = false;
    }
  }
  return firstLevel;
}

function commonEvidence(
  diagnostic: AuthoringDiagnosticCase,
  channel: "cli" | "languageService" = "cli",
): readonly string[] {
  const codes = diagnostic.common.codes
    .filter(
      ({ languageServiceRequired }) =>
        channel === "cli" || languageServiceRequired === true,
    )
    .map(({ code }) => code);
  return [...new Set([...codes, ...diagnostic.common.required])];
}

function expectedCliCodes(
  diagnostic: AuthoringDiagnosticCase,
): readonly string[] {
  if (
    diagnostic.common.codes.some(
      ({ cliMultiplicity }) => cliMultiplicity === undefined,
    )
  ) {
    throw new Error(
      `Case does not declare CLI error-code multiplicity completely: ${diagnostic.fixture}`,
    );
  }
  return diagnostic.common.codes.flatMap(({ code, cliMultiplicity }) =>
    cliMultiplicity === undefined
      ? []
      : Array.from({ length: cliMultiplicity }, () => code),
  );
}

interface CliDiagnosticObservation {
  readonly status: number | null;
  readonly diagnostics: string;
  readonly firstLevelMessages: readonly string[];
  readonly firstLevel: string;
  readonly headers: readonly string[];
  readonly allHeaders: readonly string[];
}

function observeCliDiagnostic(
  project: string,
  resolution: Resolution,
  fixture: string,
): CliDiagnosticObservation {
  const tsconfig = diagnosticTsconfigName(resolution, fixture);
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevelMessages = firstLevelCompilerMessages(diagnostics, fixture);
  return {
    status: result.status,
    diagnostics,
    firstLevelMessages,
    firstLevel: firstLevelMessages.join("\n"),
    headers: diagnostics
      .split(/\r?\n/)
      .filter(
        (line) => line.startsWith(`${fixture}(`) && line.includes(": error TS"),
      ),
    allHeaders: diagnostics
      .split(/\r?\n/)
      .filter((line) => line.includes(": error TS")),
  };
}

function extractFirstLevelDiagnosticCodes(
  firstLevelMessages: readonly string[],
  fixture: string,
): string[] {
  const firstLevelCodes: string[] = [];
  let currentHeaderCodes: string[] = [];
  let currentChildCodes: string[] = [];
  const flushDiagnosticBlock = () => {
    if (currentChildCodes.length > 0) {
      firstLevelCodes.push(...currentChildCodes);
      for (const headerCode of currentHeaderCodes) {
        if (!currentChildCodes.includes(headerCode)) {
          firstLevelCodes.push(headerCode);
        }
      }
    } else if (currentHeaderCodes.length > 0) {
      firstLevelCodes.push(...currentHeaderCodes);
    }
    currentHeaderCodes = [];
    currentChildCodes = [];
  };
  for (const line of firstLevelMessages) {
    if (line.startsWith(`${fixture}(`) && line.includes(": error TS")) {
      flushDiagnosticBlock();
      currentHeaderCodes = Array.from(
        line.matchAll(/ContractTypeError<"([^"]+)"/g),
        (match) => match[1],
      ).filter((code): code is string => code !== undefined);
    } else if (/^  [^ ]/.test(line)) {
      for (const match of line.matchAll(/ContractTypeError<"([^"]+)"/g)) {
        if (match[1] !== undefined) {
          currentChildCodes.push(match[1]);
        }
      }
    }
  }
  flushDiagnosticBlock();
  return firstLevelCodes;
}

async function verifyAuthoringDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: (typeof authoringDiagnosticCases)[number],
): Promise<void> {
  if (diagnostic.cli.kind !== "codes") {
    throw new Error("This case must use the compiler error-code adapter");
  }
  const { fixture, common, cli } = diagnostic;
  const expectedCodes = expectedCliCodes(diagnostic);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  const requiredAnyGroups = [common.requiredAny, cli.requiredAny].filter(
    (group): group is readonly string[] => group !== undefined,
  );
  const allowAdditionalDiagnostics = cli.allowAdditionalDiagnostics ?? false;
  const expectedHeaders = cli.expectedDiagnostics ?? expectedCodes.length;
  const forbidden = cli.forbidden ?? [];
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const firstLevelCodes = extractFirstLevelDiagnosticCodes(
    observation.firstLevelMessages,
    fixture,
  );
  if (
    observation.status === 0 ||
    (allowAdditionalDiagnostics
      ? observation.headers.length < expectedHeaders
      : observation.headers.length !== expectedHeaders) ||
    firstLevelCodes.length !== expectedCodes.length ||
    firstLevelCodes
      .sort((left, right) => left.localeCompare(right))
      .join(",") !==
      [...expectedCodes]
        .sort((left, right) => left.localeCompare(right))
        .join(",") ||
    required.some((fragment) => !observation.firstLevel.includes(fragment)) ||
    requiredAnyGroups.some(
      (group) =>
        !group.some((fragment) => observation.firstLevel.includes(fragment)),
    ) ||
    forbidden.some((fragment) => observation.firstLevel.includes(fragment))
  ) {
    throw new Error(
      [
        `Published authoring diagnostic first-level evidence is incomplete: ${fixture}`,
        `Expected codes: ${expectedCodes.join(", ")}`,
        `Actual codes: ${firstLevelCodes.join(", ")}`,
        `Missing first-level evidence: ${required
          .filter((fragment) => !observation.firstLevel.includes(fragment))
          .join(", ")}`,
        ...requiredAnyGroups.flatMap((group) =>
          group.some((fragment) => observation.firstLevel.includes(fragment))
            ? []
            : [
                `Missing any of these first-level fragments: ${group.join(" or ")}`,
              ],
        ),
        observation.firstLevel,
      ].join("\n"),
    );
  }
}

interface LanguageServiceDiagnosticCase {
  readonly fixture: string;
  readonly count: number;
  readonly required: readonly string[];
  readonly requiredAny?: readonly string[];
}

interface AuthoringLanguageServiceCase {
  readonly fixture: string;
  readonly marker: string;
  readonly token: string;
  readonly declaredType?: boolean;
  readonly installedDeclaration?: string;
  readonly requiredType: readonly string[];
  readonly requiredDocumentation?: readonly string[];
  readonly requiredSignature?: readonly string[];
}

interface CapabilityCompletionCase {
  readonly marker: string;
  readonly required: readonly string[];
  readonly forbidden: readonly string[];
}

const capabilityCompletionsFixture = "capability-completions.ts";

const capabilityCompletionsSource = [
  'import { helpCapability, schemaCapability, text, versionCapability } from "@boringparts/cli-contract";',
  "",
  "helpCapability({ /* help-options */ });",
  "helpCapability({ headings: { /* help-headings */ } });",
  "helpCapability({ wording: { /* help-wording */ } });",
  "versionCapability({ /* version-options */ });",
  'versionCapability({ shortAlias: "-V", /* version-partial */ });',
  "schemaCapability({ /* schema-options */ });",
  'void text.line("1.0.0");',
  "",
].join("\n");

const capabilityCompletionCases: readonly CapabilityCompletionCase[] = [
  {
    marker: "/* help-options */",
    required: ["shortAlias", "headings", "wording"],
    forbidden: ["contractTypeError"],
  },
  {
    marker: "/* help-headings */",
    required: [
      "usage",
      "commands",
      "arguments",
      "options",
      "constraints",
      "schema",
      "examples",
      "supplement",
    ],
    forbidden: ["contractTypeError"],
  },
  {
    marker: "/* help-wording */",
    required: [
      "commandPlaceholder",
      "outputModePlaceholder",
      "choices",
      "default",
      "choicesAndDefault",
      "list",
      "facts",
      "effects",
    ],
    forbidden: ["contractTypeError"],
  },
  {
    marker: "/* version-options */",
    required: ["value", "description", "shortAlias"],
    forbidden: ["contractTypeError"],
  },
  {
    marker: "/* version-partial */",
    required: ["value", "description"],
    forbidden: ["contractTypeError"],
  },
  {
    marker: "/* schema-options */",
    required: ["description"],
    forbidden: ["contractTypeError"],
  },
];

function verifyAuthoringLanguageService(
  project: string,
  resolution: (typeof resolutions)[number],
  fixtures: Readonly<Record<string, string>>,
): void {
  const authoringCases: readonly AuthoringLanguageServiceCase[] = [
    {
      fixture: "authoring-example.ts",
      marker: "defineCli<Dependencies>",
      token: "defineCli",
      requiredType: ["DefineCli<Dependencies>"],
      requiredDocumentation: ["closed CLI contract", "result projections"],
      requiredSignature: ["DefineCli<Dependencies>"],
    },
    {
      fixture: "authoring-example.ts",
      marker: 'define.command("lookup")',
      token: "command",
      requiredType: ["DefineCommand<Command, Dependencies>"],
      requiredDocumentation: [
        "Bind a leaf command",
        "Spread the returned record",
        "command tree",
      ],
      requiredSignature: [
        "command: Command",
        "DefineCommand<Command, Dependencies>",
      ],
    },
    {
      fixture: "authoring-example.ts",
      marker: "help: helpCapability(",
      token: "helpCapability",
      requiredType: ["HelpCapability"],
      requiredDocumentation: ["Assemble help for the whole tree", "wording"],
      requiredSignature: ["definition"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "const lookupUser = atomic({",
      token: "atomic",
      requiredType: ['AtomicExecutionFactory<"lookup", Dependencies'],
      requiredSignature: [
        "DeclaredVariants",
        "RejectUnknownProperties",
        "handler:",
      ],
    },
    {
      fixture: "authoring-example.ts",
      marker: "const readLogs = stream({",
      token: "stream",
      requiredType: ['StreamExecutionFactory<"logs", Dependencies'],
      requiredSignature: [
        "DeclaredRecords",
        "RejectUnknownProperties",
        "AsyncGenerator",
      ],
    },
    {
      fixture: "authoring-example.ts",
      marker: "text: lookupUser.text({",
      token: "text",
      requiredType: ['AtomicOutputModeDefinition<"lookup"', '"text"'],
    },
    {
      fixture: "authoring-example.ts",
      marker: "structured: lookupUser.structured({",
      token: "structured",
      requiredType: ['AtomicOutputModeDefinition<"lookup"', '"structured"'],
    },
    {
      fixture: "authoring-example.ts",
      marker: "text: readLogs.text({",
      token: "text",
      requiredType: ['StreamOutputModeDefinition<"logs"', '"text"'],
    },
    {
      fixture: "authoring-example.ts",
      marker: "outcome.completion()",
      token: "completion",
      requiredType: ['CompletionFact<"validate">'],
      requiredSignature: ["completion(): CompletionFact<Command>"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "outcome.data.found",
      token: "found",
      requiredType: ['DataFact<"lookup", "found", { name: string; }>'],
      requiredSignature: ["payload: { name: string; }"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "outcome.failure.notFound",
      token: "notFound",
      requiredType: ['FailureFact<"lookup", "notFound", { id: string; }>'],
      requiredSignature: ["payload: { id: string; }"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "outcome.record.entry",
      token: "entry",
      requiredType: ['StreamRecordFact<"logs", "entry", { message: string; }>'],
      requiredSignature: ["payload: { message: string; }"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "outcome.streamSuccess()",
      token: "streamSuccess",
      requiredType: ['StreamSuccessFact<"logs">'],
      requiredSignature: ["streamSuccess(): StreamSuccessFact<Command>"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "usageConstraints: [",
      token: "usageConstraints",
      requiredType: [
        'kind: "count"',
        'kind: "when"',
        'kind: "present"',
        'field: "domain"',
        'require: ["email"]',
      ],
    },
    {
      fixture: "authoring-example.ts",
      marker: "lines([",
      token: "lines",
      requiredType: ["TextLines"],
      requiredDocumentation: [
        "non-empty tuple of lines",
        "completion",
        "stream records",
      ],
      requiredSignature: ["readonly [string, ...string[]]"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "fragment(`",
      token: "fragment",
      requiredType: ["TextFragment"],
      requiredDocumentation: ["stream records", "incremental text"],
      requiredSignature: ["value: string"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "text.silent",
      token: "silent",
      requiredType: ["SilentText"],
      requiredDocumentation: ["completion success", "presenter"],
    },
    {
      fixture: "exportable-contract.ts",
      marker: 'kind: "forbiddenCombination"',
      token: "kind",
      requiredType: ['"forbiddenCombination"'],
    },
    {
      fixture: "exportable-contract.ts",
      marker: 'kind: "forbiddenCombination",\n      all: [',
      token: "all",
      requiredType: [
        '{ kind: "equals"; field: "query"; value: "alpha"; }',
        '{ kind: "equals"; field: "dryRun"; value: true; }',
      ],
    },
    {
      fixture: "exportable-contract.ts",
      marker: "ContractSchema<InspectInput",
      token: "ContractSchema",
      declaredType: true,
      requiredType: ["ContractSchema<Input, Output>"],
      requiredDocumentation: [
        "runtime validation",
        "JSON Schema projection",
        "Required",
        "input fields",
        "choices",
        "format rules",
      ],
    },
    {
      fixture: "exportable-contract.ts",
      marker: "UsageConstraint<",
      token: "UsageConstraint",
      declaredType: true,
      requiredType: ["UsageConstraint<Fields, Input>"],
      requiredDocumentation: [
        "parser",
        "Draft 2020-12",
        "forbiddenCombination",
        "named failures",
      ],
    },
    {
      fixture: "core-node.ts",
      marker: "nodeCliOutput({",
      token: "nodeCliOutput",
      installedDeclaration:
        "node_modules/@boringparts/cli-contract/dist/node.d.ts",
      requiredType: ["NodeCliOutputOptions", "WriteCliOutput"],
      requiredDocumentation: [
        "direct call awaits the write callback",
        "awaits `drain`",
        "before crossing channels and before reporting termination",
        "never reads the global process, closes the streams",
        "The host awaits executeCli",
      ],
      requiredSignature: ["NodeCliOutputOptions", "WriteCliOutput"],
    },
  ];

  const cases: readonly LanguageServiceDiagnosticCase[] =
    authoringDiagnosticCases.flatMap((diagnostic) => {
      const expectation = diagnostic.languageService;
      if (expectation === undefined) return [];
      const requiredAny =
        diagnostic.common.requiredAny ?? expectation.requiredAny;
      return [
        {
          fixture:
            diagnostic.derivation.kind === "copy"
              ? diagnostic.fixture
              : diagnostic.derivation.fixture,
          count: expectation.count,
          required: [
            ...commonEvidence(diagnostic, "languageService"),
            ...expectation.required,
          ],
          ...(requiredAny === undefined ? {} : { requiredAny }),
        },
      ];
    });
  const api = new API({ cwd: project });
  try {
    for (const authoringCase of authoringCases) {
      const source = fixtures[authoringCase.fixture];
      if (source === undefined)
        throw new Error(`Missing authoring fixture: ${authoringCase.fixture}`);
      const markerPosition = source.indexOf(authoringCase.marker);
      const tokenOffset = authoringCase.marker.indexOf(authoringCase.token);
      if (markerPosition < 0 || tokenOffset < 0) {
        throw new Error(
          `Authoring marker not found: ${authoringCase.fixture} ${authoringCase.marker}`,
        );
      }
      const position = markerPosition + tokenOffset;
      const config = resolve(
        project,
        `tsconfig.${resolution}.${authoringCase.fixture.replace(".ts", "")}.json`,
      );
      const snapshot = api.updateSnapshot({ openProject: config });
      try {
        const target = snapshot.getProject(config);
        if (target === undefined)
          throw new Error(`Cannot load project: ${config}`);
        const file = resolve(project, authoringCase.fixture);
        const installedDeclaration = realpathSync(
          resolve(
            project,
            authoringCase.installedDeclaration ??
              "node_modules/@boringparts/cli-contract/dist/index.d.ts",
          ),
        );
        if (
          !target.program
            .getSourceFileNames()
            .some((name) => realPathOrResolve(name) === installedDeclaration)
        ) {
          throw new Error(
            `Authoring fixture did not load the installed public declarations: ${authoringCase.fixture}`,
          );
        }
        const diagnostics = target.program.getSemanticDiagnostics(file);
        if (diagnostics.length > 0) {
          throw new Error(
            `Authoring fixture still has type diagnostics: ${authoringCase.fixture}\n${diagnostics
              .map((diagnostic) => diagnostic.text)
              .join("\n")}`,
          );
        }
        const valueType = target.checker.getTypeAtPosition(file, position);
        const symbol = target.checker.getSymbolAtPosition(file, position);
        if (valueType === undefined || symbol === undefined) {
          throw new Error(
            `Cannot read hover information at the authoring position: ${authoringCase.fixture} ${authoringCase.marker}`,
          );
        }
        const resolvedSymbol =
          (symbol.flags & SymbolFlags.Alias) !== 0
            ? target.checker.getAliasedSymbol(symbol)
            : symbol;
        const type = authoringCase.declaredType
          ? target.checker.getDeclaredTypeOfSymbol(resolvedSymbol)
          : valueType;
        const typeText = target.checker.typeToString(type);
        const documentation = resolvedSymbol.getDocumentationComment(
          target.checker,
        );
        const signatures = target.checker.getSignaturesOfType(
          type,
          SignatureKind.Call,
        );
        const signatureHelp = signatures
          .map((signature) => {
            const declaration = signature.declaration?.resolve(target);
            if (declaration === undefined) return typeText;
            const printed = target.emitter.printNode(declaration);
            const parameters = signature.getParameters().map((parameter) => {
              const parameterType = target.checker.getTypeOfSymbolAtLocation(
                parameter,
                declaration,
              );
              return `${parameter.name}: ${target.checker.typeToString(parameterType, declaration)}`;
            });
            return `${printed}\n${parameters.join("; ")}`;
          })
          .join("\n");
        const requiredType = authoringCase.requiredType.filter(
          (fragment) => !typeText.includes(fragment),
        );
        const requiredDocumentation = (
          authoringCase.requiredDocumentation ?? []
        ).filter((fragment) => !documentation.includes(fragment));
        const requiredSignature = (
          authoringCase.requiredSignature ?? []
        ).filter((fragment) => !signatureHelp.includes(fragment));
        if (
          requiredType.length > 0 ||
          requiredDocumentation.length > 0 ||
          requiredSignature.length > 0
        ) {
          throw new Error(
            [
              `Installed interface hover evidence is incomplete: ${authoringCase.fixture}, at ${authoringCase.marker}`,
              `Missing type evidence: ${requiredType.join(", ")}`,
              `Missing documentation evidence: ${requiredDocumentation.join(", ")}`,
              `Missing signature evidence: ${requiredSignature.join(", ")}`,
              `Type: ${typeText}`,
              `Documentation: ${documentation}`,
              `Signature: ${signatureHelp}`,
            ].join("\n"),
          );
        }
      } finally {
        snapshot.dispose();
      }
    }
    for (const { fixture, count, required, requiredAny } of cases) {
      const config = resolve(
        project,
        `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`,
      );
      const snapshot = api.updateSnapshot({ openProject: config });
      try {
        const target = snapshot.getProject(config);
        if (target === undefined)
          throw new Error(`Cannot load project: ${config}`);
        const diagnostics = target.program.getSemanticDiagnostics(
          resolve(project, fixture),
        );
        const firstLevel = diagnostics.flatMap((diagnostic) => [
          diagnostic.text,
          ...(diagnostic.messageChain ?? []).map((message) => message.text),
        ]);
        const visible = firstLevel.join("\n");
        if (
          diagnostics.length !== count ||
          firstLevel.length < count ||
          required.some((fragment) => !visible.includes(fragment)) ||
          (requiredAny !== undefined &&
            !requiredAny.some((fragment) => visible.includes(fragment)))
        ) {
          throw new Error(
            `Language service first-level diagnostic is incomplete for ${fixture}\n${visible}`,
          );
        }
      } finally {
        snapshot.dispose();
      }
    }
    const completionConfig = resolve(
      project,
      diagnosticTsconfigName(resolution, capabilityCompletionsFixture),
    );
    const completionSnapshot = api.updateSnapshot({
      openProject: completionConfig,
    });
    try {
      const target = completionSnapshot.getProject(completionConfig);
      if (target === undefined) {
        throw new Error(`Cannot load project: ${completionConfig}`);
      }
      const completionFile = resolve(project, capabilityCompletionsFixture);
      const installedDeclaration = realpathSync(
        resolve(
          project,
          "node_modules/@boringparts/cli-contract/dist/index.d.ts",
        ),
      );
      if (
        !target.program
          .getSourceFileNames()
          .some((name) => realPathOrResolve(name) === installedDeclaration)
      ) {
        throw new Error(
          `Completion fixture did not load the installed public declarations: ${capabilityCompletionsFixture}`,
        );
      }
      for (const completionCase of capabilityCompletionCases) {
        const position = capabilityCompletionsSource.indexOf(
          completionCase.marker,
        );
        if (position < 0) {
          throw new Error(
            `Completion marker not found: ${completionCase.marker}`,
          );
        }
        const completions = target.checker.getCompletionsAtPosition(
          completionFile,
          position,
        );
        const rawNames = (completions?.entries ?? []).map(
          (entry) => entry.name,
        );
        const normalizedNames = new Set(
          rawNames.map((name) => name.replace(/\?$/, "")),
        );
        const missingRequired = completionCase.required.filter(
          (name) => !normalizedNames.has(name),
        );
        const presentForbidden = completionCase.forbidden.filter(
          (name) =>
            normalizedNames.has(name) ||
            rawNames.some((rawName) => rawName.includes(name)),
        );
        if (missingRequired.length > 0 || presentForbidden.length > 0) {
          throw new Error(
            [
              `Capability completions did not match public authoring options at ${completionCase.marker}`,
              `Missing required completions: ${missingRequired.join(", ")}`,
              `Unexpected internal completions: ${presentForbidden.join(", ")}`,
              `Actual completions: ${rawNames.join(", ")}`,
            ].join("\n"),
          );
        }
      }
    } finally {
      completionSnapshot.dispose();
    }
  } finally {
    api.close();
  }
}

async function verifyMissingStreamDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "streamText") {
    throw new Error("This case must use the stream-text diagnostic adapter");
  }
  const fixture =
    diagnostic.derivation.kind === "copy"
      ? diagnostic.fixture
      : diagnostic.derivation.fixture;
  const { cli } = diagnostic;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  if (
    observation.status === 0 ||
    required.some((fragment) => !observation.firstLevel.includes(fragment)) ||
    observation.headers.length !== cli.expectedDiagnostics ||
    observation.allHeaders.length !== observation.headers.length
  ) {
    throw new Error(
      `Stream-text diagnostic first level did not expose only local contract evidence\nFirst level:\n${observation.firstLevel}\nFull diagnostics:\n${observation.diagnostics}`,
    );
  }
}

async function verifyInvalidStreamRecordNameDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "streamRecordName") {
    throw new Error(
      "This case must use the stream-record-name diagnostic adapter",
    );
  }
  const fixture =
    diagnostic.derivation.kind === "copy"
      ? diagnostic.fixture
      : diagnostic.derivation.fixture;
  const { cli } = diagnostic;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  if (
    observation.status === 0 ||
    required.some((fragment) => !observation.firstLevel.includes(fragment)) ||
    observation.headers.length !== cli.expectedDiagnostics ||
    observation.allHeaders.length !== observation.headers.length
  ) {
    throw new Error(
      `Stream-record-name diagnostic first level did not expose local contract evidence\nFirst level:\n${observation.firstLevel}\nFull diagnostics:\n${observation.diagnostics}`,
    );
  }
}

async function verifyFieldSetDiagnostic(
  project: string,
  resolution: Resolution,
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "fieldSet") {
    throw new Error("This case must use the field-set diagnostic adapter");
  }
  const { fixture, cli } = diagnostic;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  const requiredAnyGroups = [
    diagnostic.common.requiredAny,
    cli.requiredAny,
  ].filter((group): group is readonly string[] => group !== undefined);
  const forbidden = cli.forbidden ?? [];
  const [code] = expectedCliCodes(diagnostic);
  const brandedCount =
    observation.diagnostics.split(`ContractTypeError<"${code}"`).length - 1;
  // The compact leaf form gives TS 6 and TS 7 a common TS2345 position at the
  // command definition argument (the root form diverged to a TS2769 overload at
  // the define call). The branded field evidence stays unsuppressed in both.
  // TS 6 prints it on the first message line; TS 7 nests it one level deeper
  // under the MissingRootFallbackFieldsContract wrapper elaboration, so the
  // field evidence is asserted on the whole diagnostic while the editor
  // first-level check below covers the wrapper that names the command.
  if (
    observation.status === 0 ||
    observation.headers.length !== cli.expectedDiagnostics ||
    observation.allHeaders.length !== observation.headers.length ||
    observation.headers.some((header) => !header.includes(": error TS2345:")) ||
    brandedCount !== cli.expectedDiagnostics ||
    required.some((fragment) => !observation.diagnostics.includes(fragment)) ||
    requiredAnyGroups.some(
      (group) =>
        !group.some((fragment) => observation.diagnostics.includes(fragment)),
    ) ||
    forbidden.some((fragment) => observation.diagnostics.includes(fragment))
  ) {
    throw new Error(
      `Field-set diagnostic did not expose local contract evidence at the command definition\n${observation.diagnostics}`,
    );
  }
}

async function verifyGenericForwardDiagnostic(
  project: string,
  resolution: Resolution,
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "forward") {
    throw new Error(
      "This case must use the generic-forward diagnostic adapter",
    );
  }
  const { cli } = diagnostic;
  // The marker version must compile clean: assertion-free generic forwarding plus
  // every closed-set negative caught by its own @ts-expect-error.
  await compileFixture(project, resolution, diagnostic.fixture);
  const fixture =
    diagnostic.derivation.kind === "copy"
      ? diagnostic.fixture
      : diagnostic.derivation.fixture;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const expectedCodes = expectedCliCodes(diagnostic);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  const forbidden = cli.forbidden ?? [];
  const firstLevelCodes = extractFirstLevelDiagnosticCodes(
    observation.firstLevelMessages,
    fixture,
  );
  // A wrapper author names the long AtomicTextOptions/StreamTextOptions alias as
  // the parameter, so the call-site header is that alias and the branded coverage
  // evidence lands on the elaboration child (still tsc first level). The closed
  // mode-key, extra-key and wrong-payload rejections surface as TS2339/TS2322
  // without a branded code. This pins the exact mixed-form set; the formal
  // root/leaf `.text` entries expand the branded coverage in the header itself and
  // are covered by the codes adapter.
  if (
    observation.status === 0 ||
    observation.headers.length !== cli.expectedDiagnostics ||
    observation.allHeaders.length !== observation.headers.length ||
    firstLevelCodes.length !== expectedCodes.length ||
    firstLevelCodes
      .sort((left, right) => left.localeCompare(right))
      .join(",") !==
      [...expectedCodes]
        .sort((left, right) => left.localeCompare(right))
        .join(",") ||
    required.some((fragment) => !observation.firstLevel.includes(fragment)) ||
    forbidden.some((fragment) => observation.firstLevel.includes(fragment))
  ) {
    throw new Error(
      `Generic-forward diagnostic did not expose the closed-set call-site evidence\nFirst level:\n${observation.firstLevel}\nFull diagnostics:\n${observation.diagnostics}`,
    );
  }
}

async function verifyMissingCompletionDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "completion") {
    throw new Error("This case must use the completion diagnostic adapter");
  }
  const { fixture } = diagnostic;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const required = [...commonEvidence(diagnostic), ...diagnostic.cli.required];
  if (
    observation.status === 0 ||
    required.some((fragment) => !observation.firstLevel.includes(fragment))
  ) {
    throw new Error(
      `Completion diagnostic first level did not expose local contract evidence\nFirst level:\n${observation.firstLevel}\nFull diagnostics:\n${observation.diagnostics}`,
    );
  }
  if (
    diagnostic.cli.forbidden.some((fragment) =>
      observation.diagnostics.includes(fragment),
    )
  ) {
    throw new Error(
      `Missing-completion diagnostic included unrelated fallback errors\n${observation.diagnostics}`,
    );
  }
}

async function verifyMissingNamedVariantDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "namedVariant") {
    throw new Error("This case must use the named-variant diagnostic adapter");
  }
  const { fixture } = diagnostic;
  const { cli } = diagnostic;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  if (
    observation.status === 0 ||
    required.some((fragment) => !observation.firstLevel.includes(fragment))
  ) {
    throw new Error(
      `Named-variant diagnostic first level did not expose local contract evidence\nFirst level:\n${observation.firstLevel}\nFull diagnostics:\n${observation.diagnostics}`,
    );
  }
  if (
    observation.headers.length !== cli.expectedDiagnostics ||
    observation.allHeaders.length !== observation.headers.length
  ) {
    throw new Error(
      `Named-variant diagnostic included an unexpected compiler error\n${observation.diagnostics}`,
    );
  }
}

function tsconfigFor(
  resolution: Resolution,
  fixture: string,
): Readonly<Record<string, unknown>> {
  return {
    compilerOptions: {
      module: resolution === "nodenext" ? "NodeNext" : "ESNext",
      moduleResolution: resolution === "nodenext" ? "NodeNext" : "Bundler",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2023",
      types: [],
    },
    files: [fixture],
  };
}

function diagnosticTsconfigName(
  resolution: Resolution,
  fixture: string,
): string {
  return `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
}

async function writeDiagnosticTsconfig(
  project: string,
  resolution: Resolution,
  fixture: string,
): Promise<void> {
  await writeFile(
    resolve(project, diagnosticTsconfigName(resolution, fixture)),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
}

const authoringDiagnosticFixtureNames = [
  ...new Set([
    ...authoringDiagnosticCases.map(({ fixture }) => fixture),
    ...authoringDiscoverySources.map(({ fixture }) => fixture),
  ]),
];

async function prepareAuthoringDiagnosticCases(
  project: string,
  resolution: Resolution,
  fixtures: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFixtures(project, fixtures, authoringDiagnosticFixtureNames);
  await writeFile(
    resolve(project, capabilityCompletionsFixture),
    capabilityCompletionsSource,
  );
  const configuredFixtures = new Set([
    ...authoringDiagnosticFixtureNames,
    capabilityCompletionsFixture,
  ]);
  for (const diagnostic of authoringDiagnosticCases) {
    if (diagnostic.derivation.kind === "copy") continue;
    const source = fixtures[diagnostic.fixture];
    if (source === undefined) {
      throw new Error(
        `Missing authoring diagnostic source fixture: ${diagnostic.fixture}`,
      );
    }
    const derived = deriveDiagnosticSource(source, diagnostic.derivation);
    await writeFile(resolve(project, diagnostic.derivation.fixture), derived);
    configuredFixtures.add(diagnostic.derivation.fixture);
  }
  await Promise.all(
    [...configuredFixtures].map(async (fixture) => {
      await writeDiagnosticTsconfig(project, resolution, fixture);
    }),
  );
}

function deriveDiagnosticSource(
  source: string,
  derivation: Exclude<SourceDerivation, { readonly kind: "copy" }>,
): string {
  if (derivation.kind === "removeAllTsExpectError") {
    return source.replaceAll(/\s*\/\/ @ts-expect-error[^\n]*/g, "");
  }
  const marker = derivation.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.replaceAll(
    new RegExp(`\\s*\\/\\/ @ts-expect-error \\[${marker}\\][^\\n]*`, "g"),
    "",
  );
}

async function verifySingleAuthoringDiagnosticCase(
  project: string,
  resolution: Resolution,
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  switch (diagnostic.cli.kind) {
    case "codes":
      await verifyAuthoringDiagnostic(project, resolution, diagnostic);
      break;
    case "fieldSet":
      await verifyFieldSetDiagnostic(project, resolution, diagnostic);
      break;
    case "forward":
      await verifyGenericForwardDiagnostic(project, resolution, diagnostic);
      break;
    case "completion":
      await verifyMissingCompletionDiagnostic(project, resolution, diagnostic);
      break;
    case "namedVariant":
      await verifyMissingNamedVariantDiagnostic(
        project,
        resolution,
        diagnostic,
      );
      break;
    case "streamText":
      await compileFixture(project, resolution, diagnostic.fixture);
      await verifyMissingStreamDiagnostic(project, resolution, diagnostic);
      break;
    case "streamRecordName":
      await compileFixture(project, resolution, diagnostic.fixture);
      await verifyInvalidStreamRecordNameDiagnostic(
        project,
        resolution,
        diagnostic,
      );
      break;
    case "hierarchy":
      await compileFixture(project, resolution, diagnostic.fixture);
      await verifyHierarchyTextCoverageDiagnostic(
        project,
        resolution,
        diagnostic,
      );
      break;
  }
}

export async function verifyAuthoringDiagnosticCases(
  project: string,
  resolution: Resolution,
  compilerVersion: CompilerVersion,
): Promise<void> {
  const fixtures = await readAuthoringDiagnosticFixtures();
  await prepareAuthoringDiagnosticCases(project, resolution, fixtures);
  await compileFixture(project, resolution, "authoring-example.ts");
  for (const diagnostic of authoringDiagnosticCases) {
    await verifySingleAuthoringDiagnosticCase(project, resolution, diagnostic);
  }
  if (compilerVersion === "7.0.2" && resolution === "nodenext") {
    verifyAuthoringLanguageService(project, resolution, fixtures);
  }
}

async function writeFixtures(
  project: string,
  fixtures: Readonly<Record<string, string>>,
  names: readonly string[],
): Promise<void> {
  await Promise.all(
    names.map(async (name) => {
      const fixture = fixtures[name];
      if (fixture === undefined) throw new Error(`Missing fixture: ${name}`);
      await writeFile(resolve(project, name), fixture);
    }),
  );
}

async function compileFixture(
  project: string,
  resolution: Resolution,
  fixture: string,
): Promise<void> {
  const tsconfig = diagnosticTsconfigName(resolution, fixture);
  await writeDiagnosticTsconfig(project, resolution, fixture);
  runCommand(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    project,
  );
}

function realPathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}
