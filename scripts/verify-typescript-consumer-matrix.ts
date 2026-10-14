import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

import { API, SignatureKind, SymbolFlags } from "typescript-7/unstable/sync";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corePackage = "@ykdz/cli-contract";
const testingPackage = "@ykdz/cli-contract-testing";
const compilerVersions = ["6.0.3", "7.0.2"] as const;
const resolutions = ["nodenext", "bundler"] as const;

interface CandidateTarballs {
  readonly core: string;
  readonly testing: string;
}

interface AuthoringDiagnosticCase {
  readonly fixture: string;
  readonly expectedCodes: readonly string[];
  readonly required: readonly string[];
  readonly requiredAny?: readonly string[];
  readonly allowAdditionalDiagnostics?: boolean;
  readonly forbidden?: readonly string[];
}

async function main(): Promise<void> {
  const candidate = await parseCandidateTarballs(process.argv.slice(2));
  const fixtures = await readFixtures();

  for (const compilerVersion of compilerVersions) {
    await verifyCompilerVersion(candidate, fixtures, compilerVersion);
  }
}

async function readFixtures(): Promise<Readonly<Record<string, string>>> {
  const hierarchyFixture = "hierarchy-text-coverage.typecheck.ts";
  return Object.fromEntries(
    await Promise.all([
      ...[
        "consumer.ts",
        "completion-missing.ts",
        "core-node.ts",
        "core-root.ts",
        "exportable-contract.ts",
        "exportable-contract-reconsumer.ts",
        "invalid-authoring-identities.ts",
        "invalid-count-constraint.ts",
        "invalid-conditional-usage-constraint.ts",
        "invalid-command-combination.ts",
        "invalid-forbidden-combination.ts",
        "invalid-help-fact-templates.ts",
        "input-schema-raw-mismatch.ts",
        "named-variant-missing.ts",
        "schema-input.ts",
        "stream-record-name.ts",
        "stream-text-coverage.ts",
        "unknown-usage-constraint-field.ts",
        "unexpected-text-presenter.ts",
        "valid-help-fact-templates.ts",
      ].map(async (name) => [
        name,
        await readFile(
          resolve(
            repositoryRoot,
            "scripts/fixtures/typescript-consumer-matrix",
            name,
          ),
          "utf8",
        ),
      ]),
      readFile(
        resolve(repositoryRoot, "packages/lib/test", hierarchyFixture),
        "utf8",
      ).then((source) => [hierarchyFixture, source]),
      readFile(
        resolve(repositoryRoot, "packages/example/src/index.ts"),
        "utf8",
      ).then((source) => ["authoring-example.ts", source]),
    ]),
  );
}

async function parseCandidateTarballs(
  args: readonly string[],
): Promise<CandidateTarballs> {
  const values = args[0] === "--" ? args.slice(1) : args;
  if (
    values.length !== 4 ||
    values[0] !== "--core" ||
    values[1] === undefined ||
    values[2] !== "--testing" ||
    values[3] === undefined
  ) {
    throw new Error(
      "Usage: pnpm consumer:types -- --core <core.tgz> --testing <testing.tgz>",
    );
  }

  const core = resolve(values[1]);
  const testing = resolve(values[3]);
  if (dirname(core) !== dirname(testing)) {
    throw new Error(
      "Core and testing tarballs must share one candidate directory",
    );
  }
  await Promise.all([verifyTarball(core), verifyTarball(testing)]);
  return { core, testing };
}

async function verifyTarball(tarball: string): Promise<void> {
  const status = await lstat(tarball);
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    !tarball.endsWith(".tgz")
  ) {
    throw new Error(`Candidate must be a regular .tgz file: ${tarball}`);
  }
}

async function verifyCompilerVersion(
  candidate: CandidateTarballs,
  fixtures: Readonly<Record<string, string>>,
  compilerVersion: (typeof compilerVersions)[number],
): Promise<void> {
  await verifyCoreOnly(candidate, fixtures, compilerVersion);
  await verifyCoreAndTesting(candidate, fixtures, compilerVersion);
}

async function verifyCoreOnly(
  candidate: CandidateTarballs,
  fixtures: Readonly<Record<string, string>>,
  compilerVersion: (typeof compilerVersions)[number],
): Promise<void> {
  const project = await mkdtemp(
    resolve(tmpdir(), `cli-contract-typescript-${compilerVersion}-`),
  );
  const npmCache = await mkdtemp(resolve(tmpdir(), "cli-contract-npm-cache-"));
  try {
    await writeFile(
      resolve(project, "package.json"),
      `${JSON.stringify({
        name: "cli-contract-typescript-consumer",
        private: true,
        type: "module",
        dependencies: { [corePackage]: `file:${candidate.core}` },
        devDependencies: {
          "@valibot/to-json-schema": "1.7.1",
          typescript: compilerVersion,
          valibot: "1.4.2",
          zod: "4.5.4",
        },
      })}\n`,
    );
    await writeFixtures(project, fixtures, [
      "core-node.ts",
      "core-root.ts",
      "authoring-example.ts",
      "invalid-authoring-identities.ts",
      "invalid-count-constraint.ts",
      "invalid-conditional-usage-constraint.ts",
      "invalid-command-combination.ts",
      "invalid-forbidden-combination.ts",
      "invalid-help-fact-templates.ts",
      "input-schema-raw-mismatch.ts",
      "completion-missing.ts",
      "named-variant-missing.ts",
      "schema-input.ts",
      "stream-record-name.ts",
      "stream-text-coverage.ts",
      "unknown-usage-constraint-field.ts",
      "unexpected-text-presenter.ts",
      "valid-help-fact-templates.ts",
      "hierarchy-text-coverage.typecheck.ts",
    ]);
    runCommand(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-package-lock",
        "--no-audit",
        "--no-fund",
        "--loglevel",
        "error",
      ],
      project,
      { NPM_CONFIG_CACHE: npmCache },
    );

    for (const resolution of resolutions) {
      await verifyExportableDeclarations(project, resolution, fixtures);
      for (const fixture of [
        "core-root.ts",
        "core-node.ts",
        "authoring-example.ts",
        "schema-input.ts",
        "valid-help-fact-templates.ts",
      ]) {
        await compileFixture(project, resolution, fixture);
      }
      await verifyMissingCompletionDiagnostic(project, resolution);
      await verifyMissingNamedVariantDiagnostic(project, resolution);
      await compileFixture(project, resolution, "stream-text-coverage.ts");
      await compileFixture(project, resolution, "stream-record-name.ts");
      await compileFixture(
        project,
        resolution,
        "hierarchy-text-coverage.typecheck.ts",
      );
      await verifyHierarchyTextCoverageDiagnostic(
        project,
        resolution,
        fixtures,
      );
      for (const diagnostic of authoringDiagnosticCases) {
        await verifyAuthoringDiagnostic(project, resolution, diagnostic);
      }
      if (compilerVersion === "7.0.2" && resolution === "nodenext") {
        verifyAuthoringLanguageService(project, resolution, fixtures);
      }
      await verifyMissingStreamDiagnostic(project, resolution, fixtures);
      await verifyInvalidStreamRecordNameDiagnostic(
        project,
        resolution,
        fixtures,
      );
    }
  } finally {
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(npmCache, { recursive: true, force: true }),
    ]);
  }
}

async function verifyHierarchyTextCoverageDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  fixtures: Readonly<Record<string, string>>,
): Promise<void> {
  const source = fixtures["hierarchy-text-coverage.typecheck.ts"];
  if (source === undefined)
    throw new Error("Missing hierarchy coverage fixture");
  const fixture = "hierarchy-text-coverage-unchecked.ts";
  await writeFile(
    resolve(project, fixture),
    source.replaceAll(
      /\s*\/\/ @ts-expect-error \[hierarchy-text-coverage\][^\n]*/g,
      "",
    ),
  );
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevel = firstLevelCompilerMessages(diagnostics, fixture).join(
    "\n",
  );
  const required = [
    "missingTextPresenter",
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
  ];
  const headers = diagnostics.match(
    /^hierarchy-text-coverage-unchecked\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const firstLevelCodes = firstLevel.match(/^  [^ ].*missingTextPresenter/gm);
  const allHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  const unrelated = [
    "TS7006",
    "TS7031",
    `Type '"rootGroup"' is not assignable to type '"rootCommand"'`,
  ];
  if (
    result.status === 0 ||
    required.some((fragment) => !firstLevel.includes(fragment)) ||
    unrelated.some((fragment) => diagnostics.includes(fragment)) ||
    headers?.length !== 5 ||
    firstLevelCodes?.length !== 5 ||
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
    expectedCodes: [
      "invalidCommandIdentity",
      "invalidFieldLongOption",
      "invalidFieldLongOption",
      "invalidFieldLongOption",
      "invalidFieldShortAlias",
      "invalidFieldIdentity",
      "invalidVariantName",
      "invalidVariantName",
    ],
    required: [
      'command: "bad_root"',
      'reason: "lowerCamelCase"',
      'command: "negatedRoot"',
      'received: "--no-Bad"',
      'command: "longOptionIdentity"',
      'received: "--Bad"',
      'command: "shortAliasIdentity"',
      "invalidFieldShortAlias",
      'received: "-bad"',
      'command: "fieldIdentity"',
      'field: "bad_field"',
      'command: "dataVariantIdentity"',
      'location: "data"',
      'command: "failureVariantIdentity"',
      'location: "failure"',
      'variant: "bad_name"',
      'command: "deploy"',
    ],
  },
  {
    fixture: "invalid-conditional-usage-constraint.ts",
    expectedCodes: [
      "invalidUsageConstraint",
      "contradictoryUsageConstraint",
      "contradictoryUsageConstraint",
      "contradictoryUsageConstraint",
      "contradictoryUsageConstraint",
      "contradictoryUsageConstraint",
    ],
    required: [
      'command: "missingWhenEffects"',
      'command: "branchConflict"',
      'command: "multiFieldConflict"',
      'command: "unionFieldConflict"',
      'command: "effectSuffixConflict"',
      'command: "factSuffixConflict"',
      'constraint: "when"',
      'member: "effects"',
      'member: "then"',
      'fields: "token"',
      'fields: "mode"',
      'fields: "token"',
    ],
  },
  {
    fixture: "unknown-usage-constraint-field.ts",
    expectedCodes: [
      "unknownUsageConstraintField",
      "unknownUsageConstraintField",
      "unknownUsageConstraintField",
      "unknownUsageConstraintField",
    ],
    required: [
      'command: "deploy"',
      'command: "rootDeploy"',
      'command: "mixedRest"',
      'command: "suffixMissingEffect"',
      'constraint: "when"',
      'member: "then.require"',
      'field: "token"',
      'field: "missing"',
    ],
  },
  {
    fixture: "invalid-command-combination.ts",
    expectedCodes: ["unknownDefinitionProperty"],
    required: ['command: "inspect"', 'member: "all"', 'property: "typo"'],
    allowAdditionalDiagnostics: true,
    forbidden: ["No overload matches this call", "StreamHandlerContext"],
  },
  {
    fixture: "invalid-forbidden-combination.ts",
    expectedCodes: [
      "invalidUsageConstraintValue",
      "contradictoryUsageConstraint",
      "invalidUsageConstraintValue",
      "inapplicableUsageConstraintField",
      "contradictoryUsageConstraint",
      "contradictoryUsageConstraint",
      "unknownDefinitionProperty",
      "unknownDefinitionProperty",
      "invalidUsageConstraintValue",
      "invalidUsageConstraintValue",
      "unknownDefinitionProperty",
      "unknownDefinitionProperty",
      "invalidUsageConstraintValue",
    ],
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
      'constraint: "forbiddenCombination"',
      'member: "all.value"',
      'member: "all.field"',
      'field: "auth"',
      'field: "mode"',
      'field: "target"',
      'actual: "yes"',
      'actual: "staging"',
      "actual: 42",
      "actual: null",
      "readonly actual: {",
      "expected: true",
      'kind: "repeatableOption"',
      'member: "all"',
      'fields: "token"',
      'fields: "mode"',
      'property: "typo"',
      'member: "forbiddenCombination"',
    ],
    requiredAny: ['expected: "safe" | "force"', 'expected: "force" | "safe"'],
    allowAdditionalDiagnostics: true,
  },
  {
    fixture: "invalid-help-fact-templates.ts",
    expectedCodes: [
      "invalidHelpFactTemplate",
      "invalidHelpFactTemplate",
      "invalidHelpFactTemplate",
      "unknownDefinitionProperty",
      "invalidHelpFactTemplate",
      "invalidHelpFactTemplate",
      "invalidHelpFactTemplate",
      "unknownDefinitionProperty",
      "invalidHelpFactTemplate",
      "invalidHelpFactTemplate",
      "unknownDefinitionProperty",
    ],
    required: [
      'slot: "commandPlaceholder"',
      'received: "   "',
      'reason: "empty"',
      'received: "<命令组>"',
      'reason: "placeholder"',
      'slot: "choices"',
      'received: "候选 {choises}"',
      'property: "choises"',
      'path: readonly ["help", "wording", "choises"]',
      'reason: "placeholder"',
      'slot: "present"',
      'received: "字段"',
      'slot: "equals"',
      'received: "字段 {field}"',
      'slot: "forbiddenCombination"',
      'reason: "singleLine"',
    ],
  },
  {
    fixture: "invalid-count-constraint.ts",
    expectedCodes: [
      "invalidCountConstraint",
      "invalidCountConstraint",
      "invalidCountConstraint",
      "invalidCountConstraint",
      "invalidCountConstraint",
      "invalidCountConstraint",
      "invalidCountConstraint",
      "unknownUsageConstraintField",
      "unknownUsageConstraintField",
      "unknownUsageConstraintField",
      "unknownUsageConstraintField",
    ],
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
  },
  {
    fixture: "input-schema-raw-mismatch.ts",
    expectedCodes: [
      "fieldInputMustAcceptRawValue",
      "fieldInputMustAcceptRawValue",
      "fieldInputMustAcceptRawValue",
      "fieldInputMustAcceptRawValue",
    ],
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
    allowAdditionalDiagnostics: true,
  },
  {
    fixture: "unexpected-text-presenter.ts",
    expectedCodes: ["unexpectedTextPresenter", "unexpectedTextPresenter"],
    required: [
      'command: "inspect"',
      'command: "rootInspect"',
      'location: "failure"',
      'variant: "permissionDenied"',
      'unexpected: "text"',
    ],
  },
];

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

async function verifyAuthoringDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  diagnostic: (typeof authoringDiagnosticCases)[number],
): Promise<void> {
  const {
    fixture,
    expectedCodes,
    required,
    requiredAny = [],
    allowAdditionalDiagnostics = false,
    forbidden = [],
  } = diagnostic;
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevelMessages = firstLevelCompilerMessages(diagnostics, fixture);
  const firstLevel = firstLevelMessages.join("\n");
  const lines = diagnostics.split("\n");
  const headers = lines.filter(
    (line) => line.startsWith(`${fixture}(`) && line.includes(": error TS"),
  );
  const firstLevelCodes = firstLevelMessages.flatMap((line) => {
    const match = /^  [^ ].*ContractTypeError<"([^"]+)"/.exec(line);
    const code = match?.[1];
    return code === undefined ? [] : [code];
  });
  if (
    result.status === 0 ||
    (allowAdditionalDiagnostics
      ? headers.length < expectedCodes.length
      : headers.length !== expectedCodes.length) ||
    firstLevelCodes.length !== expectedCodes.length ||
    firstLevelCodes
      .sort((left, right) => left.localeCompare(right))
      .join(",") !==
      [...expectedCodes]
        .sort((left, right) => left.localeCompare(right))
        .join(",") ||
    required.some((fragment) => !firstLevel.includes(fragment)) ||
    (requiredAny.length > 0 &&
      !requiredAny.some((fragment) => firstLevel.includes(fragment))) ||
    forbidden.some((fragment) => firstLevel.includes(fragment))
  ) {
    throw new Error(
      [
        `已发布作者诊断的首层信息不完整：${fixture}`,
        `预期错误码：${expectedCodes.join(", ")}`,
        `实际错误码：${firstLevelCodes.join(", ")}`,
        `缺少首层证据：${required
          .filter((fragment) => !firstLevel.includes(fragment))
          .join(", ")}`,
        requiredAny.length === 0 ||
        requiredAny.some((fragment) => firstLevel.includes(fragment))
          ? ""
          : `缺少以下任一首层证据：${requiredAny.join(" 或 ")}`,
        firstLevel,
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
  const cases: readonly LanguageServiceDiagnosticCase[] = [
    {
      fixture: "invalid-authoring-identities.ts",
      count: 8,
      required: [
        "invalidCommandIdentity",
        "invalidFieldLongOption",
        "invalidFieldShortAlias",
        "invalidFieldIdentity",
        "invalidVariantName",
        'command: "bad_root"',
        'command: "negatedRoot"',
        'command: "longOptionIdentity"',
        'command: "shortAliasIdentity"',
        'command: "fieldIdentity"',
        'command: "dataVariantIdentity"',
        'command: "failureVariantIdentity"',
        'command: "deploy"',
        'field: "token"',
        'field: "bad_field"',
        'received: "--no-Bad"',
        'received: "--Bad"',
        'received: "-bad"',
        'location: "data"',
        'location: "failure"',
        'variant: "bad_name"',
        'reason: "lowerCamelCase"',
      ],
    },
    {
      fixture: "invalid-conditional-usage-constraint.ts",
      count: 6,
      required: [
        "invalidUsageConstraint",
        "contradictoryUsageConstraint",
        'command: "missingWhenEffects"',
        'command: "branchConflict"',
        'command: "multiFieldConflict"',
        'command: "unionFieldConflict"',
        'command: "effectSuffixConflict"',
        'command: "factSuffixConflict"',
        'member: "effects"',
        'member: "then"',
        'fields: "token"',
        'fields: "mode"',
        'fields: "token"',
      ],
    },
    {
      fixture: "unknown-usage-constraint-field.ts",
      count: 4,
      required: [
        "unknownUsageConstraintField",
        'command: "deploy"',
        'command: "rootDeploy"',
        'command: "mixedRest"',
        'command: "suffixMissingEffect"',
        'member: "then.require"',
        'field: "token"',
        'field: "missing"',
      ],
    },
    {
      fixture: "invalid-command-combination.ts",
      count: 2,
      required: [
        "unknownDefinitionProperty",
        'command: "inspect"',
        'member: "all"',
        'property: "typo"',
      ],
    },
    {
      fixture: "invalid-forbidden-combination.ts",
      count: 14,
      required: [
        "invalidUsageConstraintValue",
        "unknownDefinitionProperty",
        "inapplicableUsageConstraintField",
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
        "actual: {",
        "expected: true",
        'kind: "repeatableOption"',
        'member: "all"',
        'fields: "mode"',
        'property: "typo"',
        'member: "forbiddenCombination"',
        'fields: "token"',
      ],
      requiredAny: ['expected: "safe" | "force"', 'expected: "force" | "safe"'],
    },
    {
      fixture: "invalid-help-fact-templates.ts",
      count: 11,
      required: [
        "invalidHelpFactTemplate",
        "unknownDefinitionProperty",
        'slot: "commandPlaceholder"',
        'received: "   "',
        'reason: "empty"',
        'received: "<命令组>"',
        'slot: "choices"',
        'property: "choises"',
        'received: "候选 {choises}"',
        'reason: "placeholder"',
        'slot: "present"',
        'slot: "equals"',
        'slot: "forbiddenCombination"',
        'reason: "singleLine"',
      ],
    },
    {
      fixture: "invalid-count-constraint.ts",
      count: 10,
      required: [
        "invalidCountConstraint",
        "unknownUsageConstraintField",
        'command: "deploy"',
        'command: "stage"',
        'command: "quota"',
        'command: "compound"',
        'command: "fractional"',
        'command: "rootDeploy"',
        'command: "rootMissingCountField"',
        'command: "missingCountChild"',
        'command: "missingSuffixCountField"',
        'command: "duplicateSuffixCountField"',
        'constraint: "count"',
        'member: "fields"',
        'field: "missing"',
        'member: "min"',
        'reason: "ordered"',
        'reason: "nonNegative"',
        'reason: "fieldCount"',
        'reason: "integer"',
        'reason: "duplicateFields"',
      ],
    },
    {
      fixture: "input-schema-raw-mismatch.ts",
      count: 5,
      required: [
        "fieldInputMustAcceptRawValue",
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
    },
    {
      fixture: "hierarchy-text-coverage-unchecked.ts",
      count: 5,
      required: [
        "missingTextPresenter",
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
    },
    {
      fixture: "unexpected-text-presenter.ts",
      count: 2,
      required: [
        "unexpectedTextPresenter",
        'command: "inspect"',
        'command: "rootInspect"',
        'location: "failure"',
        'variant: "permissionDenied"',
        'unexpected: "text"',
      ],
    },
  ] as const;
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
  fixtures: Readonly<Record<string, string>>,
): Promise<void> {
  const fixture = "stream-text-coverage-unchecked.ts";
  const source = fixtures["stream-text-coverage.ts"];
  if (source === undefined) throw new Error("Missing stream coverage fixture");
  await writeFile(
    resolve(project, fixture),
    source.replaceAll(/\s*\/\/ @ts-expect-error[^\n]*/g, ""),
  );
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevel = firstLevelCompilerMessages(diagnostics, fixture).join(
    "\n",
  );
  const required = [
    "missingTextPresenter",
    'command: "missingRecord"',
    'command: "missingSuccess"',
    'location: "record"',
    'location: "streamSuccess"',
    'variant: "item"',
    'missing: "text"',
  ];
  const headers = diagnostics.match(
    /^stream-text-coverage-unchecked\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const allHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  if (
    result.status === 0 ||
    required.some((fragment) => !firstLevel.includes(fragment)) ||
    headers?.length !== 2 ||
    allHeaders?.length !== headers.length
  ) {
    throw new Error(
      `流记录诊断首层没有只暴露局部契约证据\n首层诊断：\n${firstLevel}\n完整诊断：\n${diagnostics}`,
    );
  }
}

async function verifyInvalidStreamRecordNameDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
  fixtures: Readonly<Record<string, string>>,
): Promise<void> {
  const fixture = "stream-record-name-unchecked.ts";
  const source = fixtures["stream-record-name.ts"];
  if (source === undefined)
    throw new Error("Missing stream record name fixture");
  await writeFile(
    resolve(project, fixture),
    source.replaceAll(/\s*\/\/ @ts-expect-error[^\n]*/g, ""),
  );
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevel = firstLevelCompilerMessages(diagnostics, fixture).join(
    "\n",
  );
  const required = [
    "invalidVariantName",
    'command: "invalidRecordName"',
    'location: "record"',
    'variant: "bad_name"',
    'reason: "lowerCamelCase"',
  ];
  const headers = diagnostics.match(
    /^stream-record-name-unchecked\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const allHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  if (
    result.status === 0 ||
    required.some((fragment) => !firstLevel.includes(fragment)) ||
    headers?.length !== 1 ||
    allHeaders?.length !== headers.length
  ) {
    throw new Error(
      `流记录名称诊断首层没有暴露局部契约证据\n首层诊断：\n${firstLevel}\n完整诊断：\n${diagnostics}`,
    );
  }
}

async function verifyCoreAndTesting(
  candidate: CandidateTarballs,
  fixtures: Readonly<Record<string, string>>,
  compilerVersion: (typeof compilerVersions)[number],
): Promise<void> {
  const project = await mkdtemp(
    resolve(tmpdir(), `cli-contract-typescript-testing-${compilerVersion}-`),
  );
  const npmCache = await mkdtemp(resolve(tmpdir(), "cli-contract-npm-cache-"));
  try {
    await writeFile(
      resolve(project, "package.json"),
      `${JSON.stringify({
        name: "cli-contract-typescript-consumer",
        private: true,
        type: "module",
        dependencies: {
          [corePackage]: `file:${candidate.core}`,
          [testingPackage]: `file:${candidate.testing}`,
        },
        devDependencies: { typescript: compilerVersion },
      })}\n`,
    );
    await writeFixtures(project, fixtures, ["consumer.ts"]);
    runCommand(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-package-lock",
        "--no-audit",
        "--no-fund",
        "--loglevel",
        "error",
      ],
      project,
      { NPM_CONFIG_CACHE: npmCache },
    );
    for (const resolution of resolutions) {
      await compileFixture(project, resolution, "consumer.ts");
    }
  } finally {
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(npmCache, { recursive: true, force: true }),
    ]);
  }
}

async function verifyExportableDeclarations(
  project: string,
  resolution: (typeof resolutions)[number],
  fixtures: Readonly<Record<string, string>>,
): Promise<void> {
  const producerFixture = "exportable-contract.ts";
  const consumerFixture = "exportable-contract-reconsumer.ts";
  const consumerSource = fixtures[consumerFixture];
  if (consumerSource === undefined)
    throw new Error("缺少可导出声明的消费者夹具");
  await writeFixtures(project, fixtures, [producerFixture]);
  await writeFile(
    resolve(project, consumerFixture),
    consumerSource.replaceAll(
      "__DECLARATION_IMPORT__",
      `./.declarations-${resolution}/exportable-contract.js`,
    ),
  );

  const producerConfig = `tsconfig.${resolution}.exportable-contract.json`;
  await writeFile(
    resolve(project, producerConfig),
    `${JSON.stringify(declarationTsconfigFor(resolution, producerFixture))}\n`,
  );
  runCommand(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", producerConfig, "--pretty", "false"],
    project,
  );

  await compileFixture(project, resolution, consumerFixture);
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
  resolution: (typeof resolutions)[number],
  fixture: string,
): Promise<void> {
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  runCommand(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    project,
  );
}

async function verifyMissingCompletionDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
): Promise<void> {
  const fixture = "completion-missing.ts";
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevel = firstLevelCompilerMessages(diagnostics, fixture).join(
    "\n",
  );
  const requiredFragments = [
    "missingTextPresenter",
    'command: "missingCompletion"',
    'command: "missingCompletionWithField"',
    'location: "completion"',
    'missing: "text"',
  ];
  if (
    result.status === 0 ||
    requiredFragments.some((fragment) => !firstLevel.includes(fragment))
  ) {
    throw new Error(
      `补全诊断首层没有暴露局部契约证据\n首层诊断：\n${firstLevel}\n完整诊断：\n${diagnostics}`,
    );
  }
  const unrelatedFragments = [
    "fieldInputMustAcceptRawValue",
    "Property 'completion' does not exist",
    "implicitly has an 'any'",
  ];
  if (unrelatedFragments.some((fragment) => diagnostics.includes(fragment))) {
    throw new Error(
      `Missing-completion diagnostic included unrelated fallback errors\n${diagnostics}`,
    );
  }
}

async function verifyMissingNamedVariantDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
): Promise<void> {
  const fixture = "named-variant-missing.ts";
  const tsconfig = `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`;
  await writeFile(
    resolve(project, tsconfig),
    `${JSON.stringify(tsconfigFor(resolution, fixture))}\n`,
  );
  const result = spawnSync(
    resolve(project, "node_modules/.bin/tsc"),
    ["--project", tsconfig, "--pretty", "false"],
    { cwd: project, encoding: "utf8" },
  );
  if (result.error !== undefined) throw result.error;
  const diagnostics = `${result.stderr}\n${result.stdout}`;
  const firstLevel = firstLevelCompilerMessages(diagnostics, fixture).join(
    "\n",
  );
  const requiredFragments = [
    "named-variant-missing.ts",
    "missingTextPresenter",
    'command: "missingDataVariantText"',
    'command: "missingDataFailureText"',
    'command: "missingCompletionFailureText"',
    'location: "data"',
    'location: "failure"',
    'variant: "deferred"',
    'variant: "forbidden"',
    'missing: "text"',
  ];
  if (
    result.status === 0 ||
    requiredFragments.some((fragment) => !firstLevel.includes(fragment))
  ) {
    throw new Error(
      `具名变体诊断首层没有暴露局部契约证据\n首层诊断：\n${firstLevel}\n完整诊断：\n${diagnostics}`,
    );
  }
  const diagnosticHeaders = diagnostics.match(
    /^named-variant-missing\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const allErrorHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  if (
    diagnosticHeaders?.length !== 3 ||
    allErrorHeaders?.length !== diagnosticHeaders.length
  ) {
    throw new Error(
      `Named-variant diagnostic included an unexpected compiler error\n${diagnostics}`,
    );
  }
}

function tsconfigFor(
  resolution: (typeof resolutions)[number],
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

function declarationTsconfigFor(
  resolution: (typeof resolutions)[number],
  fixture: string,
): Readonly<Record<string, unknown>> {
  return {
    compilerOptions: {
      module: resolution === "nodenext" ? "NodeNext" : "ESNext",
      moduleResolution: resolution === "nodenext" ? "NodeNext" : "Bundler",
      declaration: true,
      emitDeclarationOnly: true,
      outDir: `.declarations-${resolution}`,
      skipLibCheck: false,
      strict: true,
      target: "ES2023",
      types: [],
    },
    files: [fixture],
  };
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  environment?: Readonly<Record<string, string>>,
): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env:
      environment === undefined
        ? process.env
        : { ...process.env, ...environment },
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} ${args.join(" ")} failed with status ${result.status ?? "unknown"}\n${result.stderr}\n${result.stdout}`,
    );
  }
}

await main();
