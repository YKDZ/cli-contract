import { spawnSync } from "node:child_process";
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

interface AuthoringDiagnosticCase {
  readonly fixture: string;
  readonly sourcePath: string;
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
    throw new Error("hierarchy 诊断场景配置无效");
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
        "更换字段键，同步模式 Input 键及引用；CLI 拼写可保留",
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
        { code: "invalidFieldShortAlias", cliMultiplicity: 1 },
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
      count: 2,
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
        'received: "候选 {choises}"',
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
        "rawValue: string",
        "rawValue: true",
        "rawValue: [string, ...string[]]",
        "schemaInput: number",
        "schemaInput: string",
        "schemaInput: number[]",
      ],
      codes: [
        {
          code: "fieldInputMustAcceptRawValue",
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
    fixture: "completion-missing.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/completion-missing.ts",
    derivation: {
      kind: "copy",
    },
    common: {
      required: [],
      codes: [{ code: "missingTextPresenter" }],
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
        "fieldInputMustAcceptRawValue",
        "Property 'completion' does not exist",
        "implicitly has an 'any'",
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
      codes: [{ code: "missingTextPresenter" }],
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
      codes: [{ code: "missingTextPresenter" }],
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
      codes: [{ code: "invalidVariantName" }],
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
  },
  {
    fixture: "hierarchy-text-coverage.typecheck.ts",
    sourcePath: "packages/lib/test/hierarchy-text-coverage.typecheck.ts",
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
      codes: [{ code: "missingTextPresenter", cliMultiplicity: 5 }],
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
];

const authoringDiscoverySources = [
  {
    fixture: "authoring-example.ts",
    sourcePath: "packages/example/src/index.ts",
  },
  {
    fixture: "exportable-contract.ts",
    sourcePath:
      "scripts/fixtures/typescript-consumer-matrix/exportable-contract.ts",
  },
] as const;

async function readAuthoringDiagnosticFixtures(): Promise<
  Readonly<Record<string, string>>
> {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const sources = [
    ...authoringDiagnosticCases.map(({ fixture, sourcePath }) => ({
      fixture,
      sourcePath,
    })),
    ...authoringDiscoverySources,
  ];
  return Object.fromEntries(
    await Promise.all(
      sources.map(async ({ fixture, sourcePath }) => [
        fixture,
        await readFile(resolve(repositoryRoot, sourcePath), "utf8"),
      ]),
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
    throw new Error(`场景未完整声明 CLI 错误码数量：${diagnostic.fixture}`);
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

async function verifyAuthoringDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: (typeof authoringDiagnosticCases)[number],
): Promise<void> {
  if (diagnostic.cli.kind !== "codes") {
    throw new Error("该场景应使用编译器错误码适配器");
  }
  const { fixture, common, cli } = diagnostic;
  const expectedCodes = expectedCliCodes(diagnostic);
  const required = [...commonEvidence(diagnostic), ...cli.required];
  const requiredAnyGroups = [common.requiredAny, cli.requiredAny].filter(
    (group): group is readonly string[] => group !== undefined,
  );
  const allowAdditionalDiagnostics = cli.allowAdditionalDiagnostics ?? false;
  const forbidden = cli.forbidden ?? [];
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const firstLevelCodes = observation.firstLevelMessages.flatMap((line) => {
    const match = /^  [^ ].*ContractTypeError<"([^"]+)"/.exec(line);
    const code = match?.[1];
    return code === undefined ? [] : [code];
  });
  if (
    observation.status === 0 ||
    (allowAdditionalDiagnostics
      ? observation.headers.length < expectedCodes.length
      : observation.headers.length !== expectedCodes.length) ||
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
        `已发布作者诊断的首层信息不完整：${fixture}`,
        `预期错误码：${expectedCodes.join(", ")}`,
        `实际错误码：${firstLevelCodes.join(", ")}`,
        `缺少首层证据：${required
          .filter((fragment) => !observation.firstLevel.includes(fragment))
          .join(", ")}`,
        ...requiredAnyGroups.flatMap((group) =>
          group.some((fragment) => observation.firstLevel.includes(fragment))
            ? []
            : [`缺少以下任一首层证据：${group.join(" 或 ")}`],
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
  readonly requiredType: readonly string[];
  readonly requiredDocumentation?: readonly string[];
  readonly requiredSignature?: readonly string[];
}

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
      requiredDocumentation: ["闭合 CLI 契约", "结果投影"],
      requiredSignature: ["DefineCli<Dependencies>"],
    },
    {
      fixture: "authoring-example.ts",
      marker: 'define.command("lookup")',
      token: "command",
      requiredType: ["DefineCommand<Command, Dependencies>"],
      requiredDocumentation: ["创建可执行后代", "最终", "装配"],
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
      requiredDocumentation: ["装配全树帮助", "wording"],
      requiredSignature: ["definition"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "output: outputCapability(",
      token: "outputCapability",
      requiredType: ["OutputCapability"],
      requiredDocumentation: ["根契约", "整棵命令树"],
      requiredSignature: ["definition"],
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
      requiredDocumentation: ["非空元组行组", "completion", "stream record"],
      requiredSignature: ["readonly [string, ...string[]]"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "fragment(`",
      token: "fragment",
      requiredType: ["TextFragment"],
      requiredDocumentation: ["stream record", "增量文本"],
      requiredSignature: ["value: string"],
    },
    {
      fixture: "authoring-example.ts",
      marker: "text.silent",
      token: "silent",
      requiredType: ["SilentText"],
      requiredDocumentation: ["completion 成功", "呈现器"],
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
        "运行时验证",
        "JSON Schema 投影",
        "输入字段的必填",
        "候选值",
        "格式",
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
        "具名失败",
      ],
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
        throw new Error(`缺少作者夹具：${authoringCase.fixture}`);
      const markerPosition = source.indexOf(authoringCase.marker);
      const tokenOffset = authoringCase.marker.indexOf(authoringCase.token);
      if (markerPosition < 0 || tokenOffset < 0) {
        throw new Error(
          `找不到作者标记：${authoringCase.fixture} ${authoringCase.marker}`,
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
        if (target === undefined) throw new Error(`无法加载项目：${config}`);
        const file = resolve(project, authoringCase.fixture);
        const installedDeclaration = resolve(
          project,
          "node_modules/@ykdz/cli-contract/dist/index.d.ts",
        );
        if (
          !target.program
            .getSourceFileNames()
            .some((name) => resolve(name) === installedDeclaration)
        ) {
          throw new Error(
            `作者夹具未加载已安装的公开声明：${authoringCase.fixture}`,
          );
        }
        const diagnostics = target.program.getSemanticDiagnostics(file);
        if (diagnostics.length > 0) {
          throw new Error(
            `作者夹具仍有类型诊断：${authoringCase.fixture}\n${diagnostics
              .map((diagnostic) => diagnostic.text)
              .join("\n")}`,
          );
        }
        const valueType = target.checker.getTypeAtPosition(file, position);
        const symbol = target.checker.getSymbolAtPosition(file, position);
        if (valueType === undefined || symbol === undefined) {
          throw new Error(
            `无法获取作者位置的悬停信息：${authoringCase.fixture} ${authoringCase.marker}`,
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
              `作者夹具的已安装接口提示信息不完整：${authoringCase.fixture}，位置 ${authoringCase.marker}`,
              `缺少类型证据：${requiredType.join(", ")}`,
              `缺少文档证据：${requiredDocumentation.join(", ")}`,
              `缺少签名证据：${requiredSignature.join(", ")}`,
              `类型：${typeText}`,
              `文档：${documentation}`,
              `签名：${signatureHelp}`,
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
        if (target === undefined) throw new Error(`无法加载项目：${config}`);
        const diagnostics = target.program.getSemanticDiagnostics(
          resolve(project, fixture),
        );
        const firstLevel = diagnostics.flatMap((diagnostic) =>
          (diagnostic.messageChain ?? []).map((message) => message.text),
        );
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
    throw new Error("该场景应使用流文本诊断适配器");
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
      `流记录诊断首层没有只暴露局部契约证据\n首层诊断：\n${observation.firstLevel}\n完整诊断：\n${observation.diagnostics}`,
    );
  }
}

async function verifyInvalidStreamRecordNameDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "streamRecordName") {
    throw new Error("该场景应使用流记录名称诊断适配器");
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
      `流记录名称诊断首层没有暴露局部契约证据\n首层诊断：\n${observation.firstLevel}\n完整诊断：\n${observation.diagnostics}`,
    );
  }
}

async function verifyMissingCompletionDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: AuthoringDiagnosticCase,
): Promise<void> {
  if (diagnostic.cli.kind !== "completion") {
    throw new Error("该场景应使用 completion 诊断适配器");
  }
  const { fixture } = diagnostic;
  const observation = observeCliDiagnostic(project, resolution, fixture);
  const required = [...commonEvidence(diagnostic), ...diagnostic.cli.required];
  if (
    observation.status === 0 ||
    required.some((fragment) => !observation.firstLevel.includes(fragment))
  ) {
    throw new Error(
      `补全诊断首层没有暴露局部契约证据\n首层诊断：\n${observation.firstLevel}\n完整诊断：\n${observation.diagnostics}`,
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
    throw new Error("该场景应使用 named variant 诊断适配器");
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
      `具名变体诊断首层没有暴露局部契约证据\n首层诊断：\n${observation.firstLevel}\n完整诊断：\n${observation.diagnostics}`,
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
  const configuredFixtures = new Set(authoringDiagnosticFixtureNames);
  for (const diagnostic of authoringDiagnosticCases) {
    if (diagnostic.derivation.kind === "copy") continue;
    const source = fixtures[diagnostic.fixture];
    if (source === undefined) {
      throw new Error(`缺少作者期诊断源文件：${diagnostic.fixture}`);
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

export async function verifyAuthoringDiagnosticCases(
  project: string,
  resolution: Resolution,
  compilerVersion: CompilerVersion,
): Promise<void> {
  const fixtures = await readAuthoringDiagnosticFixtures();
  await prepareAuthoringDiagnosticCases(project, resolution, fixtures);
  await compileFixture(project, resolution, "authoring-example.ts");
  for (const diagnostic of authoringDiagnosticCases) {
    switch (diagnostic.cli.kind) {
      case "codes":
        await verifyAuthoringDiagnostic(project, resolution, diagnostic);
        break;
      case "completion":
        await verifyMissingCompletionDiagnostic(
          project,
          resolution,
          diagnostic,
        );
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

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}\n${result.stderr}\n${result.stdout}`,
    );
  }
}
