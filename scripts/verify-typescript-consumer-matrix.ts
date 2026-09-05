import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

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
  return Object.fromEntries(
    await Promise.all(
      [
        "consumer.ts",
        "completion-missing.ts",
        "core-node.ts",
        "core-root.ts",
        "schema-input.ts",
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
    ),
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
      "completion-missing.ts",
      "schema-input.ts",
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
    }
  } finally {
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(npmCache, { recursive: true, force: true }),
    ]);
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
    "missingCompletionTextPresenter",
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
