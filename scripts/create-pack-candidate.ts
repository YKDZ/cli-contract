import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corePackage = "@ykdz/cli-contract";
const testingPackage = "@ykdz/cli-contract-testing";

interface PackedManifest {
  readonly name: string;
  readonly version: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly tarball: string;
}

interface PackedResult {
  readonly filename: string;
  readonly name: string;
}

interface CandidateResult {
  readonly coreTarball: string;
  readonly testingTarball: string;
}

async function main(): Promise<void> {
  const commandArgs = process.argv.slice(2);
  const outputDirectory = await prepareOutputDirectory(
    commandArgs[0] === "--" ? commandArgs.slice(1) : commandArgs,
  );

  runPnpm(["--filter", corePackage, "run", "build"]);
  runPnpm(["--filter", testingPackage, "run", "build"]);

  const coreTarball = await packOnce(corePackage, outputDirectory);
  const testingTarball = await packOnce(testingPackage, outputDirectory);

  const core = await inspectTarball(coreTarball, corePackage);
  const testing = await inspectTarball(testingTarball, testingPackage);
  verifyLockstep(core, testing);

  await verifyInstalledRuntime(core.tarball, testing.tarball);
  const result: CandidateResult = {
    coreTarball: core.tarball,
    testingTarball: testing.tarball,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function prepareOutputDirectory(
  args: readonly string[],
): Promise<string> {
  if (
    args.length !== 2 ||
    args[0] !== "--output-dir" ||
    args[1] === undefined
  ) {
    throw new Error(
      "Usage: pnpm candidate:pack -- --output-dir <empty-directory>",
    );
  }

  const outputDirectory = resolve(repositoryRoot, args[1]);
  if (
    outputDirectory === repositoryRoot ||
    outputDirectory === dirname(outputDirectory)
  ) {
    throw new Error(
      "Candidate output directory must not be the repository or filesystem root",
    );
  }

  try {
    const outputStatus = await lstat(outputDirectory);
    if (!outputStatus.isDirectory() || outputStatus.isSymbolicLink()) {
      throw new Error(
        "Candidate output path must be a directory, not a symlink",
      );
    }
    if ((await readdir(outputDirectory)).length !== 0) {
      throw new Error("Candidate output directory must be empty");
    }
  } catch (error) {
    if (isMissingPath(error)) {
      const parent = await stat(dirname(outputDirectory));
      if (!parent.isDirectory()) {
        throw new Error("Candidate output parent must be a directory");
      }
      await mkdir(outputDirectory);
    } else {
      throw error;
    }
  }

  return outputDirectory;
}

async function packOnce(
  packageName: string,
  outputDirectory: string,
): Promise<string> {
  const before = await readdir(outputDirectory);
  const packed = parsePackedResult(
    runPnpm([
      "--filter",
      packageName,
      "pack",
      "--pack-destination",
      outputDirectory,
      "--json",
      "--reporter",
      "silent",
    ]),
  );
  if (packed.name !== packageName) {
    throw new Error(`pnpm pack returned an unexpected package: ${packed.name}`);
  }

  const tarball = resolve(outputDirectory, packed.filename);
  if (!isWithinDirectory(outputDirectory, tarball)) {
    throw new Error(
      "pnpm pack returned a tarball outside the candidate output directory",
    );
  }

  const after = await readdir(outputDirectory);
  const newEntries = after.filter((entry) => !before.includes(entry));
  if (
    newEntries.length !== 1 ||
    resolve(outputDirectory, newEntries[0] ?? "") !== tarball
  ) {
    throw new Error(
      `Expected one new tarball from ${packageName}, found ${newEntries.length}`,
    );
  }

  const tarballStatus = await lstat(tarball);
  if (!tarballStatus.isFile() || tarballStatus.isSymbolicLink()) {
    throw new Error(`Packed tarball is not a regular file: ${tarball}`);
  }
  return tarball;
}

function parsePackedResult(output: string): PackedResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("pnpm pack did not return its JSON result");
  }
  if (!isRecord(parsed))
    throw new Error("pnpm pack returned an invalid JSON result");
  if (typeof parsed.filename !== "string" || typeof parsed.name !== "string") {
    throw new Error("pnpm pack JSON result is missing filename or name");
  }
  return {
    filename: parsed.filename,
    name: parsed.name,
  };
}

async function inspectTarball(
  tarball: string,
  expectedName: string,
): Promise<PackedManifest> {
  const entries = tarEntries(tarball);
  verifyArchiveContents(entries, tarball);

  const manifest = parseManifest(readTarText(tarball, "package/package.json"));
  verifyManifestMetadata(manifest, expectedName);
  verifyManifestTargets(manifest, entries, tarball);
  await verifyLicense(tarball);

  return {
    name: expectedName,
    version: requiredString(manifest, "version", "packed manifest"),
    manifest,
    tarball,
  };
}

function tarEntries(tarball: string): readonly string[] {
  const output = runCommand("tar", ["-tzf", tarball], dirname(tarball));
  const entries = output
    .split("\n")
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (!entry.startsWith("package/")) {
        throw new Error(`Tarball entry is outside package/: ${entry}`);
      }
      return entry.slice("package/".length);
    });
  if (new Set(entries).size !== entries.length) {
    throw new Error(`Tarball contains duplicate paths: ${tarball}`);
  }
  return entries;
}

function verifyArchiveContents(
  entries: readonly string[],
  tarball: string,
): void {
  const required = new Set(["package.json", "LICENSE"]);
  for (const entry of entries) {
    if (entry === "" || entry.includes("..") || entry.startsWith("/")) {
      throw new Error(`Tarball contains an unsafe path: ${entry}`);
    }
    if (isDeniedArchivePath(entry)) {
      throw new Error(`Tarball contains denied content: ${entry}`);
    }
    if (entry === "package.json" || entry === "LICENSE") {
      required.delete(entry);
      continue;
    }
    if (!isPublishedDistFile(entry)) {
      throw new Error(
        `Tarball contains content outside the publication allowlist: ${entry}`,
      );
    }
  }
  if (required.size > 0) {
    throw new Error(
      `Tarball is missing required content: ${[...required].join(", ")}`,
    );
  }
  if (!entries.some((entry) => entry.startsWith("dist/"))) {
    throw new Error(`Tarball does not contain dist output: ${tarball}`);
  }
}

function isDeniedArchivePath(entry: string): boolean {
  const lower = entry.toLowerCase();
  const segments = lower.split("/");
  return (
    lower.endsWith(".map") ||
    basename(lower).startsWith("readme") ||
    segments.some((segment) =>
      [
        "src",
        "test",
        "cache",
        ".agents",
        "agent",
        "agents",
        "docs",
        "domain",
      ].includes(segment),
    )
  );
}

function isPublishedDistFile(entry: string): boolean {
  return /^dist\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|d\.ts)$/.test(
    entry,
  );
}

function parseManifest(text: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Packed package.json is not valid JSON");
  }
  if (!isRecord(parsed))
    throw new Error("Packed package.json is not an object");
  if (findWorkspaceOrCatalog(parsed) !== undefined) {
    throw new Error(
      `Packed package.json retains ${findWorkspaceOrCatalog(parsed)}`,
    );
  }
  return parsed;
}

function findWorkspaceOrCatalog(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.includes("workspace:") || value.includes("catalog:")
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const member of value) {
      const found = findWorkspaceOrCatalog(member);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const member of Object.values(value)) {
      const found = findWorkspaceOrCatalog(member);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function verifyManifestMetadata(
  manifest: Readonly<Record<string, unknown>>,
  expectedName: string,
): void {
  if (requiredString(manifest, "name", "packed manifest") !== expectedName) {
    throw new Error(`Packed manifest identity does not match ${expectedName}`);
  }
  if (requiredString(manifest, "version", "packed manifest").length === 0) {
    throw new Error("Packed manifest version is empty");
  }
  if (manifest.private === true)
    throw new Error("Packed manifest remains private");
  if (requiredString(manifest, "type", "packed manifest") !== "module") {
    throw new Error("Packed manifest is not ESM");
  }
  if (requiredString(manifest, "license", "packed manifest") !== "MIT") {
    throw new Error("Packed manifest license is not MIT");
  }
  if (
    requiredString(manifest, "homepage", "packed manifest") !==
    "https://github.com/YKDZ/cli-contract"
  ) {
    throw new Error("Packed manifest has unexpected homepage metadata");
  }
  const description = requiredString(
    manifest,
    "description",
    "packed manifest",
  );
  if (description.length === 0)
    throw new Error("Packed manifest description is empty");
  const keywords = manifest.keywords;
  if (
    !Array.isArray(keywords) ||
    keywords.length === 0 ||
    !keywords.every((keyword) => typeof keyword === "string")
  ) {
    throw new Error("Packed manifest keywords are missing");
  }
  const engines = requiredRecord(manifest, "engines", "packed manifest");
  if (engines.node !== ">=24")
    throw new Error("Packed manifest does not require Node >=24");
  const publishConfig = requiredRecord(
    manifest,
    "publishConfig",
    "packed manifest",
  );
  if (publishConfig.access !== "public") {
    throw new Error("Packed manifest does not request public npm access");
  }
  const repository = requiredRecord(manifest, "repository", "packed manifest");
  if (repository.url !== "git+https://github.com/YKDZ/cli-contract.git") {
    throw new Error("Packed manifest repository metadata is invalid");
  }
  const bugs = requiredRecord(manifest, "bugs", "packed manifest");
  if (bugs.url !== "https://github.com/YKDZ/cli-contract/issues") {
    throw new Error("Packed manifest bugs metadata is invalid");
  }
}

function verifyManifestTargets(
  manifest: Readonly<Record<string, unknown>>,
  entries: readonly string[],
  tarball: string,
): void {
  const targets = [
    ...targetStrings(manifest.exports, "exports"),
    ...targetStrings(manifest.imports, "imports"),
    ...targetStrings(manifest.types, "types"),
  ];
  if (targets.length === 0) {
    throw new Error("Packed manifest does not expose any package targets");
  }
  for (const target of targets) {
    if (!target.startsWith("./") || target.includes("..")) {
      throw new Error(
        `Packed manifest target is not package-relative: ${target}`,
      );
    }
    const pattern = target.slice(2);
    if (!entries.some((entry) => matchesTarget(pattern, entry))) {
      throw new Error(
        `Packed manifest target is missing from ${tarball}: ${target}`,
      );
    }
  }

  for (const dependencyField of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = manifest[dependencyField];
    if (dependencies === undefined) continue;
    if (!isRecord(dependencies)) {
      throw new Error(`Packed manifest ${dependencyField} must be an object`);
    }
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (
        typeof specifier !== "string" ||
        !isRegistryVersionSpecifier(specifier)
      ) {
        throw new Error(
          `Packed manifest dependency is not a registry identity: ${name}`,
        );
      }
    }
  }
}

function targetStrings(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((member) => targetStrings(member, field));
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap((member) =>
      targetStrings(member, field),
    );
  }
  if (value === null) return [];
  throw new Error(`Packed manifest ${field} contains an invalid target`);
}

function matchesTarget(pattern: string, entry: string): boolean {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`).test(entry);
}

function isRegistryVersionSpecifier(specifier: string): boolean {
  return /^(?:\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    specifier,
  );
}

async function verifyLicense(tarball: string): Promise<void> {
  const packedLicense = readTarText(tarball, "package/LICENSE");
  const repositoryLicense = await readFile(
    resolve(repositoryRoot, "LICENSE"),
    "utf8",
  );
  if (packedLicense !== repositoryLicense) {
    throw new Error("Packed LICENSE does not match the repository MIT license");
  }
  if (
    !packedLicense.includes("MIT License") ||
    !packedLicense.includes("Copyright (c) 2026 YKDZ")
  ) {
    throw new Error("Packed LICENSE is missing its public MIT content");
  }
}

function verifyLockstep(core: PackedManifest, testing: PackedManifest): void {
  if (core.version !== testing.version) {
    throw new Error("Packed core and testing versions are not lockstep");
  }
  const dependencies = requiredRecord(
    testing.manifest,
    "dependencies",
    "testing packed manifest",
  );
  if (dependencies[corePackage] !== core.version) {
    throw new Error(
      "Packed testing manifest does not exactly depend on the packed core version",
    );
  }
}

async function verifyInstalledRuntime(
  coreTarball: string,
  testingTarball: string,
): Promise<void> {
  const project = await mkdtemp(resolve(tmpdir(), "cli-contract-candidate-"));
  const npmCache = await mkdtemp(
    resolve(tmpdir(), "cli-contract-candidate-npm-cache-"),
  );
  try {
    await writeFile(
      resolve(project, "package.json"),
      `${JSON.stringify({
        name: "cli-contract-candidate-consumer",
        private: true,
        type: "module",
        dependencies: {
          [corePackage]: `file:${coreTarball}`,
          [testingPackage]: `file:${testingTarball}`,
        },
      })}\n`,
    );
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
    await writeFile(
      resolve(project, "runtime-probe.mjs"),
      runtimeProbeSource(),
    );
    runCommand("node", ["runtime-probe.mjs"], project, {
      CANDIDATE_PROJECT_ROOT: project,
      CANDIDATE_REPOSITORY_ROOT: repositoryRoot,
    });
  } finally {
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(npmCache, { recursive: true, force: true }),
    ]);
  }
}

function runtimeProbeSource(): string {
  return [
    'import { realpathSync } from "node:fs";',
    'import { createRequire } from "node:module";',
    'import { relative, resolve, sep } from "node:path";',
    'import { fileURLToPath, pathToFileURL } from "node:url";',
    "",
    'const project = resolve(process.env.CANDIDATE_PROJECT_ROOT ?? "");',
    'const repository = resolve(process.env.CANDIDATE_REPOSITORY_ROOT ?? "");',
    'const nodeModules = resolve(project, "node_modules");',
    "const imports = {",
    '  core: "@ykdz/cli-contract",',
    '  coreNode: "@ykdz/cli-contract/node",',
    '  testing: "@ykdz/cli-contract-testing",',
    "};",
    "const resolved = Object.fromEntries(",
    "  Object.entries(imports).map(([key, specifier]) => [",
    "    key,",
    "    realpathSync(fileURLToPath(import.meta.resolve(specifier))),",
    "  ]),",
    ");",
    "for (const path of Object.values(resolved)) {",
    "  const fromNodeModules = relative(nodeModules, path);",
    "  const fromRepository = relative(repository, path);",
    "  if (",
    '    fromNodeModules === "" ||',
    '    fromNodeModules.startsWith(".." + sep) ||',
    '    fromRepository === "" ||',
    '    !fromRepository.startsWith(".." + sep)',
    "  ) {",
    '    throw new Error("Package resolution escaped the temporary installation: " + path);',
    "  }",
    "}",
    "const testingCore = realpathSync(",
    '  createRequire(pathToFileURL(resolved.testing)).resolve("@ykdz/cli-contract"),',
    ");",
    "if (testingCore !== resolved.core) {",
    '  throw new Error("Testing entry resolved a different core implementation");',
    "}",
    "const core = await import(imports.core);",
    "const coreNode = await import(imports.coreNode);",
    "const testing = await import(imports.testing);",
    'if (typeof core.defineCli !== "function") throw new Error("Core root entry did not load");',
    'if (typeof coreNode.nodeCliOutput !== "function") throw new Error("Core node entry did not load");',
    'if (typeof testing.runCliScenario !== "function") throw new Error("Testing root entry did not load");',
    "",
  ].join("\n");
}

function runPnpm(args: readonly string[]): string {
  return runCommand("pnpm", args, repositoryRoot);
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  environment?: Readonly<Record<string, string>>,
): string {
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
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}

function readTarText(tarball: string, entry: string): string {
  return runCommand("tar", ["-xOf", tarball, entry], dirname(tarball));
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== "string")
    throw new Error(`${context} is missing string ${key}`);
  return value;
}

function requiredRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): Readonly<Record<string, unknown>> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`${context} is missing object ${key}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWithinDirectory(directory: string, path: string): boolean {
  const fromDirectory = relative(directory, path);
  return (
    fromDirectory !== "" &&
    !fromDirectory.startsWith(`..${sep}`) &&
    fromDirectory !== ".."
  );
}

function isMissingPath(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`candidate: ${message}\n`);
  process.exitCode = 1;
});
