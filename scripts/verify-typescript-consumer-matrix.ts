import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

import { API } from "typescript-7/unstable/sync";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corePackage = "@ykdz/cli-contract";
const testingPackage = "@ykdz/cli-contract-testing";
const compilerVersions = ["6.0.3", "7.0.2"] as const;
const resolutions = ["nodenext", "bundler"] as const;

interface CandidateTarballs {
  readonly core: string;
  readonly testing: string;
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
        "input-schema-raw-mismatch.ts",
        "named-variant-missing.ts",
        "schema-input.ts",
        "stream-record-name.ts",
        "stream-text-coverage.ts",
        "unknown-usage-constraint-field.ts",
        "unexpected-text-presenter.ts",
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
      "input-schema-raw-mismatch.ts",
      "completion-missing.ts",
      "named-variant-missing.ts",
      "schema-input.ts",
      "stream-record-name.ts",
      "stream-text-coverage.ts",
      "unknown-usage-constraint-field.ts",
      "unexpected-text-presenter.ts",
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
      for (const fixture of [
        "core-root.ts",
        "core-node.ts",
        "schema-input.ts",
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
      await verifyUnknownUsageConstraintFieldDiagnostic(project, resolution);
      await verifyInputSchemaRawMismatchDiagnostic(project, resolution);
      await verifyUnexpectedTextPresenterDiagnostic(project, resolution);
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
  ];
  const headers = diagnostics.match(
    /^hierarchy-text-coverage-unchecked\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const firstLevelCodes = diagnostics.match(/^  [^ ].*missingTextPresenter/gm);
  const allHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  const unrelated = [
    "TS7006",
    "TS7031",
    `Type '"rootGroup"' is not assignable to type '"rootCommand"'`,
  ];
  if (
    result.status === 0 ||
    required.some((fragment) => !diagnostics.includes(fragment)) ||
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

async function verifyUnknownUsageConstraintFieldDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
): Promise<void> {
  const fixture = "unknown-usage-constraint-field.ts";
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
  const required = [
    "unknownUsageConstraintField",
    'command: "deploy"',
    'command: "rootDeploy"',
    'constraint: "requires"',
    'member: "requires"',
    'field: "token"',
  ];
  const headers = diagnostics.match(
    /^unknown-usage-constraint-field\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const firstLevelCodes = diagnostics.match(
    /^  [^ ].*unknownUsageConstraintField/gm,
  );
  if (
    result.status === 0 ||
    headers?.length !== 2 ||
    firstLevelCodes?.length !== 2 ||
    required.some((fragment) => !diagnostics.includes(fragment))
  ) {
    throw new Error(
      `Unknown usage constraint field diagnostic is incomplete\n${diagnostics}`,
    );
  }
}

async function verifyInputSchemaRawMismatchDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
): Promise<void> {
  const fixture = "input-schema-raw-mismatch.ts";
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
  const required = [
    "fieldInputMustAcceptRawValue",
    'command: "inspect"',
    'command: "rootInspect"',
    'field: "count"',
    "rawValue: string",
    "schemaInput: number",
  ];
  const headers = diagnostics.match(
    /^input-schema-raw-mismatch\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const firstLevelCodes = diagnostics.match(
    /^  [^ ].*fieldInputMustAcceptRawValue/gm,
  );
  if (
    result.status === 0 ||
    headers?.length !== 2 ||
    firstLevelCodes?.length !== 2 ||
    required.some((fragment) => !diagnostics.includes(fragment))
  ) {
    throw new Error(`Input schema raw mismatch is incomplete\n${diagnostics}`);
  }
}

async function verifyUnexpectedTextPresenterDiagnostic(
  project: string,
  resolution: (typeof resolutions)[number],
): Promise<void> {
  const fixture = "unexpected-text-presenter.ts";
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
  const required = [
    "unexpectedTextPresenter",
    'command: "inspect"',
    'command: "rootInspect"',
    'location: "failure"',
    'variant: "permissionDenied"',
  ];
  const headers = diagnostics.match(
    /^unexpected-text-presenter\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const firstLevelCodes = diagnostics.match(
    /^  [^ ].*unexpectedTextPresenter/gm,
  );
  if (
    result.status === 0 ||
    headers?.length !== 2 ||
    firstLevelCodes?.length !== 2 ||
    required.some((fragment) => !diagnostics.includes(fragment))
  ) {
    throw new Error(
      `Unexpected text presenter diagnostic is incomplete\n${diagnostics}`,
    );
  }
}

function verifyAuthoringLanguageService(
  project: string,
  resolution: (typeof resolutions)[number],
  fixtures: Readonly<Record<string, string>>,
): void {
  const cases = [
    {
      fixture: "unknown-usage-constraint-field.ts",
      count: 2,
      required: [
        "unknownUsageConstraintField",
        'command: "deploy"',
        'command: "rootDeploy"',
        'member: "requires"',
        'field: "token"',
      ],
    },
    {
      fixture: "input-schema-raw-mismatch.ts",
      count: 2,
      required: [
        "fieldInputMustAcceptRawValue",
        'command: "inspect"',
        'command: "rootInspect"',
        'field: "count"',
        "rawValue: string",
        "schemaInput: number",
      ],
    },
    {
      fixture: "hierarchy-text-coverage-unchecked.ts",
      count: 5,
      required: [
        "missingTextPresenter",
        'location: "completion"',
        'location: "data"',
        'location: "failure"',
        'location: "record"',
        'location: "streamSuccess"',
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
      ],
    },
  ] as const;
  const api = new API({ cwd: project });
  try {
    const coreSource = fixtures["core-root.ts"];
    if (coreSource === undefined) throw new Error("Missing core root fixture");
    const coreConfig = resolve(
      project,
      `tsconfig.${resolution}.core-root.json`,
    );
    const coreSnapshot = api.updateSnapshot({ openProject: coreConfig });
    try {
      const coreProject = coreSnapshot.getProject(coreConfig);
      if (coreProject === undefined)
        throw new Error(`Project unavailable: ${coreConfig}`);
      for (const name of ["defineCli", "helpCapability", "outputCapability"]) {
        const position = coreSource.indexOf(name);
        const symbol = coreProject.checker.getSymbolAtPosition(
          resolve(project, "core-root.ts"),
          position,
        );
        const documentation =
          symbol === undefined
            ? ""
            : coreProject.checker.getDocumentationCommentOfSymbol(
                coreProject.checker.getAliasedSymbol(symbol),
              );
        if (position < 0 || documentation.trim() === "") {
          throw new Error(`Published authoring hint unavailable: ${name}`);
        }
      }
    } finally {
      coreSnapshot.dispose();
    }
    for (const { fixture, count, required } of cases) {
      const config = resolve(
        project,
        `tsconfig.${resolution}.${fixture.replace(".ts", "")}.json`,
      );
      const snapshot = api.updateSnapshot({ openProject: config });
      try {
        const target = snapshot.getProject(config);
        if (target === undefined)
          throw new Error(`Project unavailable: ${config}`);
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
          required.some((fragment) => !visible.includes(fragment))
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
    required.some((fragment) => !diagnostics.includes(fragment)) ||
    headers?.length !== 2 ||
    allHeaders?.length !== headers.length
  ) {
    throw new Error(
      `Missing-stream diagnostic did not expose only local contract evidence\n${diagnostics}`,
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
  const required = ["streamRecordMustBeLowerCamelCase", 'records: "bad_name"'];
  const headers = diagnostics.match(
    /^stream-record-name-unchecked\.ts\(\d+,\d+\): error TS\d+:/gm,
  );
  const allHeaders = diagnostics.match(/^.+\(\d+,\d+\): error TS\d+:/gm);
  if (
    result.status === 0 ||
    required.some((fragment) => !diagnostics.includes(fragment)) ||
    headers?.length !== 1 ||
    allHeaders?.length !== headers.length
  ) {
    throw new Error(
      `Invalid-stream-record-name diagnostic did not expose only local contract evidence\n${diagnostics}`,
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
  const requiredFragments = [
    "completion-missing.ts",
    "missingTextPresenter",
    'command: "missingCompletion"',
    'command: "missingCompletionWithField"',
    'location: "completion"',
    'missing: "text"',
  ];
  if (
    result.status === 0 ||
    requiredFragments.some((fragment) => !diagnostics.includes(fragment))
  ) {
    throw new Error(
      `Missing-completion diagnostic did not expose its local contract evidence\n${diagnostics}`,
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
    requiredFragments.some((fragment) => !diagnostics.includes(fragment))
  ) {
    throw new Error(
      `Named-variant diagnostic did not expose its local contract evidence\n${diagnostics}`,
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
