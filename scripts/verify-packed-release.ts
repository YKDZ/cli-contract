import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corePackage = "@boringparts/cli-contract";
const expectedDescription = "Catch unhandled CLI outcomes at compile time.";

interface PackedRelease {
  readonly tarball: string;
  readonly version: string;
}

async function main(): Promise<void> {
  const requestedPackDirectory = parsePackDirectory(process.argv.slice(2));
  const generatedPackDirectory =
    requestedPackDirectory === undefined
      ? await mkdtemp(resolve(tmpdir(), "cli-contract-changesets-pack-"))
      : undefined;
  const packDirectory = requestedPackDirectory ?? generatedPackDirectory ?? "";

  try {
    if (generatedPackDirectory !== undefined) {
      const output = runCommand(
        "pnpm",
        ["exec", "changeset", "pack", "--out-dir", generatedPackDirectory],
        repositoryRoot,
      );
      if (output.length > 0) process.stdout.write(output);
    }

    const expectedLicense = await readFile(
      resolve(repositoryRoot, "LICENSE"),
      "utf8",
    );
    const packed = await readPackedRelease(
      packDirectory,
      expectedLicense,
      requestedPackDirectory !== undefined,
    );
    if (packed === undefined) {
      process.stderr.write(
        "Changesets publish plan is empty; no release artifacts to consume, so artifact verification was skipped.\n",
      );
      return;
    }

    process.stderr.write(
      "Verifying the standalone TypeScript 6/7 consumer matrix\n",
    );
    const typecheckOutput = runCommand(
      "pnpm",
      ["consumer:types", "--", "--tarball", packed.tarball],
      repositoryRoot,
    );
    if (typecheckOutput.length > 0) process.stdout.write(typecheckOutput);

    process.stderr.write(
      "Verifying real-process example consumption of the packed artifact\n",
    );
    const exampleOutput = runCommand(
      "pnpm",
      [
        "--filter",
        "@cli-contract/example",
        "release:verify",
        "--",
        "--tarball",
        packed.tarball,
      ],
      repositoryRoot,
    );
    if (exampleOutput.length > 0) process.stdout.write(exampleOutput);
    process.stdout.write(
      `${JSON.stringify({
        package: {
          name: corePackage,
          version: packed.version,
          tarball: packed.tarball,
        },
      })}\n`,
    );
  } finally {
    if (generatedPackDirectory !== undefined) {
      await rm(generatedPackDirectory, { recursive: true, force: true });
    }
  }
}

function parsePackDirectory(args: readonly string[]): string | undefined {
  const values = args[0] === "--" ? args.slice(1) : args;
  if (values.length === 0) return undefined;
  if (
    values.length !== 2 ||
    values[0] !== "--pack-dir" ||
    values[1] === undefined
  ) {
    throw new Error(
      "Usage: pnpm product:verify [-- --pack-dir <Changesets pack-dir>]",
    );
  }
  return resolve(repositoryRoot, values[1]);
}

async function readPackedRelease(
  packDirectory: string,
  expectedLicense: string,
  requirePackages: boolean,
): Promise<PackedRelease | undefined> {
  const directoryStatus = await lstat(packDirectory);
  if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
    throw new Error(
      `Changesets pack-dir is not a regular directory: ${packDirectory}`,
    );
  }

  const plan = parsePublishPlan(
    await readFile(resolve(packDirectory, "publish-plan.json"), "utf8"),
  );
  const releases = plan.flat().filter((item) => item.kind === "publish");
  if (releases.length === 0) {
    if (requirePackages) {
      throw new Error(
        "The explicit pack-dir has no consumable Changesets publish plan",
      );
    }
    return undefined;
  }

  if (releases.length !== 1 || releases[0]?.name !== corePackage) {
    throw new Error(
      `The Changesets publish plan must contain exactly ${corePackage}`,
    );
  }

  const release = releases[0];
  if (release.tarball === undefined) {
    throw new Error(`Changesets did not record a tarball for ${release.name}`);
  }
  const tarball = resolve(packDirectory, release.tarball.path);
  if (!isWithinDirectory(packDirectory, tarball)) {
    throw new Error(
      `Changesets tarball path escapes the pack-dir: ${release.name}`,
    );
  }
  const status = await lstat(tarball);
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    !tarball.endsWith(".tgz")
  ) {
    throw new Error(`Changesets tarball is not a regular tgz file: ${tarball}`);
  }
  await verifyIntegrity(tarball, release.tarball.integrity);
  const version = await inspectTarball(tarball, release.name, expectedLicense);
  if (version !== release.version) {
    throw new Error(
      `Changesets plan version does not match the artifact version of ${release.name}`,
    );
  }

  const packageEntries = await readdir(resolve(packDirectory, "packages"));
  const expectedEntry = basename(tarball);
  if (packageEntries.length !== 1 || packageEntries[0] !== expectedEntry) {
    throw new Error(
      "The tgz files in the Changesets pack-dir do not match the publish plan",
    );
  }

  return { tarball, version };
}

interface PublishPlanRelease {
  readonly kind: string;
  readonly name: string;
  readonly version: string;
  readonly tarball?: Readonly<{ path: string; integrity: string }>;
}

function parsePublishPlan(
  text: string,
): readonly (readonly PublishPlanRelease[])[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Changesets publish-plan.json is not valid JSON");
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.plan)) {
    throw new Error("Changesets publish-plan.json has an invalid format");
  }
  return value.plan.map((group) => {
    if (!Array.isArray(group))
      throw new Error("Publish plan group has an invalid format");
    return group.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.kind !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.version !== "string"
      ) {
        throw new Error("Publish plan contains an invalid entry");
      }
      const rawTarball = entry.tarball;
      if (rawTarball === undefined) {
        return {
          kind: entry.kind,
          name: entry.name,
          version: entry.version,
        };
      }
      if (
        !isRecord(rawTarball) ||
        typeof rawTarball.path !== "string" ||
        typeof rawTarball.integrity !== "string"
      ) {
        throw new Error(
          `Invalid tarball info for ${entry.name} in the publish plan`,
        );
      }
      return {
        kind: entry.kind,
        name: entry.name,
        version: entry.version,
        tarball: {
          path: rawTarball.path,
          integrity: rawTarball.integrity,
        },
      };
    });
  });
}

async function verifyIntegrity(
  tarball: string,
  expected: string,
): Promise<void> {
  const actual = `sha256-${createHash("sha256")
    .update(await readFile(tarball))
    .digest("base64")}`;
  if (actual !== expected) {
    throw new Error(
      `Changesets tarball integrity does not match the publish plan: ${tarball}`,
    );
  }
}

async function inspectTarball(
  tarball: string,
  expectedName: string,
  expectedLicense: string,
): Promise<string> {
  const entries = tarEntries(tarball);
  verifyArchiveContents(entries, tarball);
  const manifest = parseManifest(readTarText(tarball, "package/package.json"));
  verifyManifestMetadata(manifest, expectedName);
  verifyManifestTargets(manifest, entries);
  const version = requiredString(manifest, "version", "artifact package.json");
  verifyPublicSourceLinks(tarball, version, manifest, entries);
  const readme = readTarText(tarball, "package/README.md");
  if (
    readme.trim().length === 0 ||
    !readme.includes("https://github.com/boringparts/cli-contract") ||
    !readme.includes(
      "https://github.com/boringparts/cli-contract/tree/main/packages/example",
    )
  ) {
    throw new Error(
      `Artifact README.md is missing repository or example links: ${tarball}`,
    );
  }
  const license = readTarText(tarball, "package/LICENSE");
  if (license !== expectedLicense) {
    throw new Error(
      `Artifact LICENSE does not match the repository license: ${tarball}`,
    );
  }
  if (
    !license.includes("MIT License") ||
    !license.includes("Copyright (c) 2026 boringparts")
  ) {
    throw new Error(
      `Artifact LICENSE is missing MIT license content: ${tarball}`,
    );
  }
  return version;
}

function verifyPublicSourceLinks(
  tarball: string,
  version: string,
  manifest: Readonly<Record<string, unknown>>,
  entries: readonly string[],
): void {
  const sourceTag = encodeURIComponent(`${corePackage}@${version}`);
  const expected = `https://github.com/boringparts/cli-contract/tree/${sourceTag}/packages/example`;
  const publicEntries = targetStrings(manifest.exports, "exports").filter(
    (target) => target.endsWith(".js") || target.endsWith(".d.ts"),
  );
  if (publicEntries.length === 0) {
    throw new Error(
      "Artifact has no public JS/type entries for source-link verification",
    );
  }
  for (const target of publicEntries) {
    const entry = target.slice(2);
    if (!entries.includes(entry)) {
      throw new Error(`Artifact is missing public entry ${target}`);
    }
    if (!readTarText(tarball, `package/${entry}`).includes(expected)) {
      throw new Error(
        `Example link in artifact entry ${target} does not point to the matching Changesets source tag`,
      );
    }
  }
}

function tarEntries(tarball: string): readonly string[] {
  const entries = runCommand("tar", ["-tzf", tarball], dirname(tarball))
    .split("\n")
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (!entry.startsWith("package/")) {
        throw new Error(`tgz contains a path outside package/: ${entry}`);
      }
      return entry.slice("package/".length);
    });
  if (new Set(entries).size !== entries.length) {
    throw new Error(`tgz contains duplicate paths: ${tarball}`);
  }
  return entries;
}

function verifyArchiveContents(
  entries: readonly string[],
  tarball: string,
): void {
  const required = new Set(["package.json", "LICENSE", "README.md"]);
  for (const entry of entries) {
    if (entry === "" || entry.includes("..") || entry.startsWith("/")) {
      throw new Error(`tgz contains an invalid path: ${entry}`);
    }
    if (required.has(entry)) {
      required.delete(entry);
      continue;
    }
    if (isDeniedArchivePath(entry)) {
      throw new Error(
        `tgz contains content from a non-public directory: ${entry}`,
      );
    }
    if (!isPublishedDistFile(entry)) {
      throw new Error(`tgz contains content outside dist/: ${entry}`);
    }
  }
  if (required.size > 0) {
    throw new Error(`tgz is missing ${[...required].join(", ")}`);
  }
  if (!entries.some((entry) => entry.startsWith("dist/"))) {
    throw new Error(`tgz contains no build output: ${tarball}`);
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
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Artifact package.json is not valid JSON");
  }
  if (!isRecord(value))
    throw new Error("Artifact package.json must be an object");
  const workspaceReference = findWorkspaceOrCatalog(value);
  if (workspaceReference !== undefined) {
    throw new Error(`Artifact package.json retains ${workspaceReference}`);
  }
  return value;
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
  if (
    requiredString(manifest, "name", "artifact package.json") !== expectedName
  ) {
    throw new Error(`Artifact package identity does not match ${expectedName}`);
  }
  if (
    !isStableVersion(
      requiredString(manifest, "version", "artifact package.json"),
    )
  ) {
    throw new Error("Artifact version is not a stable three-part version");
  }
  if (manifest.private === true)
    throw new Error("Artifact package is still marked private");
  if (manifest.sideEffects !== false)
    throw new Error("Artifact package must declare sideEffects: false");
  if (requiredString(manifest, "type", "artifact package.json") !== "module") {
    throw new Error("Artifact package is not ESM");
  }
  if (requiredString(manifest, "license", "artifact package.json") !== "MIT") {
    throw new Error("Artifact package.json license is not MIT");
  }
  if (
    requiredString(manifest, "homepage", "artifact package.json") !==
    "https://github.com/boringparts/cli-contract"
  ) {
    throw new Error("Artifact homepage metadata is incorrect");
  }
  if (
    requiredString(manifest, "description", "artifact package.json") !==
    expectedDescription
  ) {
    throw new Error("Artifact description metadata is incorrect");
  }
  const keywords = manifest.keywords;
  if (
    !Array.isArray(keywords) ||
    keywords.length === 0 ||
    !keywords.every((keyword) => typeof keyword === "string")
  ) {
    throw new Error("Artifact keywords are missing");
  }
  const engines = requiredRecord(manifest, "engines", "artifact package.json");
  if (engines.node !== "^26.13.0") {
    throw new Error("Artifact package does not require Node ^26.13.0");
  }
  const publishConfig = requiredRecord(
    manifest,
    "publishConfig",
    "artifact package.json",
  );
  if (publishConfig.access !== "public") {
    throw new Error(
      "Artifact package does not request public npm publish access",
    );
  }
  const repository = requiredRecord(
    manifest,
    "repository",
    "artifact package.json",
  );
  if (
    repository.url !== "git+https://github.com/boringparts/cli-contract.git"
  ) {
    throw new Error("Artifact repository metadata is incorrect");
  }
  const bugs = requiredRecord(manifest, "bugs", "artifact package.json");
  if (bugs.url !== "https://github.com/boringparts/cli-contract/issues") {
    throw new Error("Artifact bugs metadata is incorrect");
  }
}

function verifyManifestTargets(
  manifest: Readonly<Record<string, unknown>>,
  entries: readonly string[],
): void {
  if (manifest.imports !== undefined) {
    throw new Error("Artifact package.json must not declare private imports");
  }
  const exportsRecord = requiredRecord(
    manifest,
    "exports",
    "artifact package.json",
  );
  for (const requiredSubpath of [
    ".",
    "./node",
    "./testing",
    "./package.json",
  ]) {
    if (!Object.hasOwn(exportsRecord, requiredSubpath)) {
      throw new Error(
        `Artifact package.json exports is missing ${requiredSubpath}`,
      );
    }
  }
  const targets = [
    ...targetStrings(manifest.exports, "exports"),
    ...targetStrings(manifest.types, "types"),
  ];
  if (targets.length === 0) {
    throw new Error("Artifact package.json has no public entries");
  }
  for (const target of targets) {
    if (!target.startsWith("./") || target.includes("..")) {
      throw new Error(
        `Artifact entry is not a package-relative path: ${target}`,
      );
    }
    if (!entries.some((entry) => matchesTarget(target.slice(2), entry))) {
      throw new Error(`Artifact entry is not included in the tgz: ${target}`);
    }
  }
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    if (!isRecord(dependencies)) {
      throw new Error(`Artifact package.json ${field} must be an object`);
    }
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== "string" || !isRegistryVersionSpecifier(version)) {
        throw new Error(
          `Artifact dependency is not pinned to a registry version: ${name}`,
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
  throw new Error(`Artifact package.json ${field} contains an invalid entry`);
}

function matchesTarget(pattern: string, entry: string): boolean {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`).test(entry);
}

function isRegistryVersionSpecifier(value: string): boolean {
  return /^(?:\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    value,
  );
}

function isStableVersion(value: string): boolean {
  return /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value);
}

function readTarText(tarball: string, entry: string): string {
  return execFileSync("tar", ["-xOf", tarball, entry], {
    cwd: dirname(tarball),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${context} is missing string field ${key}`);
  }
  return value;
}

function requiredRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): Readonly<Record<string, unknown>> {
  const value = record[key];
  if (!isRecord(value))
    throw new Error(`${context} is missing object field ${key}`);
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

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} ${args.join(" ")} failed (${result.status ?? "unknown status"})\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Artifact verification failed: ${detail}\n`);
  process.exitCode = 1;
});
