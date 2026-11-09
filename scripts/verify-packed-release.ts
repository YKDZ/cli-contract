import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";

import {
  installedRuntimeDevDependencies,
  verifyInstalledRuntime,
  withInstalledConsumer,
} from "@cli-contract/tooling-config/release-consumer";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corePackage = "@ykdz/cli-contract";
const testingPackage = "@ykdz/cli-contract-testing";

interface PackedPackage {
  readonly name: string;
  readonly version: string;
  readonly tarball: string;
  readonly manifest: Readonly<Record<string, unknown>>;
}

interface PackedRelease {
  readonly coreTarball: string;
  readonly coreVersion: string;
  readonly testingTarball: string;
  readonly testingVersion: string;
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
        "Changesets 发布计划为空，本次没有可消费的发布制品；已跳过制品验收。\n",
      );
      return;
    }

    process.stderr.write("检查同批制品的独立安装与公开运行时入口\n");
    await withInstalledConsumer(
      {
        name: "cli-contract-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          [corePackage]: `file:${packed.coreTarball}`,
          [testingPackage]: `file:${packed.testingTarball}`,
        },
        devDependencies: installedRuntimeDevDependencies,
      },
      verifyInstalledRuntime,
    );

    process.stderr.write("检查 TypeScript 6/7 的独立消费者矩阵\n");
    const typecheckOutput = runCommand(
      "pnpm",
      [
        "consumer:types",
        "--",
        "--core",
        packed.coreTarball,
        "--testing",
        packed.testingTarball,
      ],
      repositoryRoot,
    );
    if (typecheckOutput.length > 0) process.stdout.write(typecheckOutput);

    process.stderr.write("检查示例对同批制品的真实进程消费\n");
    const exampleOutput = runCommand(
      "pnpm",
      [
        "--filter",
        "@cli-contract/example",
        "release:verify",
        "--",
        "--core",
        packed.coreTarball,
        "--testing",
        packed.testingTarball,
      ],
      repositoryRoot,
    );
    if (exampleOutput.length > 0) process.stdout.write(exampleOutput);
    process.stdout.write(
      `${JSON.stringify({
        core: { version: packed.coreVersion, tarball: packed.coreTarball },
        testing: {
          version: packed.testingVersion,
          tarball: packed.testingTarball,
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
      "用法：pnpm product:verify [-- --pack-dir <Changesets pack-dir>]",
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
    throw new Error(`Changesets pack-dir 不是普通目录：${packDirectory}`);
  }

  const plan = parsePublishPlan(
    await readFile(resolve(packDirectory, "publish-plan.json"), "utf8"),
  );
  const releases = plan.flat().filter((item) => item.kind === "publish");
  if (releases.length === 0) {
    if (requirePackages) {
      throw new Error("显式 pack-dir 没有可消费的 Changesets 发布计划");
    }
    return undefined;
  }

  if (
    releases.length !== 2 ||
    new Set(releases.map((release) => release.name)).size !== 2 ||
    !releases.some((release) => release.name === corePackage) ||
    !releases.some((release) => release.name === testingPackage)
  ) {
    throw new Error("Changesets 发布计划必须只包含 core 与 testing 两个公共包");
  }

  const packedPackages = await Promise.all(
    releases.map(async (release) => {
      if (release.tarball === undefined) {
        throw new Error(`Changesets 未为 ${release.name} 记录 tarball`);
      }
      const tarball = resolve(packDirectory, release.tarball.path);
      if (!isWithinDirectory(packDirectory, tarball)) {
        throw new Error(
          `Changesets tarball 路径越出 pack-dir：${release.name}`,
        );
      }
      const status = await lstat(tarball);
      if (
        !status.isFile() ||
        status.isSymbolicLink() ||
        !tarball.endsWith(".tgz")
      ) {
        throw new Error(`Changesets tarball 不是普通 tgz：${tarball}`);
      }
      await verifyIntegrity(tarball, release.tarball.integrity);
      const pkg = await inspectTarball(tarball, release.name, expectedLicense);
      if (pkg.version !== release.version) {
        throw new Error(`Changesets 计划版本与 ${release.name} 制品版本不一致`);
      }
      return pkg;
    }),
  );

  const core = packedPackages.find((pkg) => pkg.name === corePackage);
  const testing = packedPackages.find((pkg) => pkg.name === testingPackage);
  if (core === undefined || testing === undefined) {
    throw new Error("Changesets pack-dir 缺少 core 或 testing 制品");
  }
  verifyLockstep(core, testing);

  const packageEntries = await readdir(resolve(packDirectory, "packages"));
  const expectedEntries = new Set(
    packedPackages.map((pkg) => basename(pkg.tarball)),
  );
  if (
    packageEntries.length !== expectedEntries.size ||
    packageEntries.some((entry) => !expectedEntries.has(entry))
  ) {
    throw new Error("Changesets pack-dir 中的 tgz 与发布计划不一致");
  }

  return {
    coreTarball: core.tarball,
    coreVersion: core.version,
    testingTarball: testing.tarball,
    testingVersion: testing.version,
  };
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
    throw new Error("Changesets publish-plan.json 不是有效 JSON");
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.plan)) {
    throw new Error("Changesets publish-plan.json 格式无效");
  }
  return value.plan.map((group) => {
    if (!Array.isArray(group)) throw new Error("发布计划分组格式无效");
    return group.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.kind !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.version !== "string"
      ) {
        throw new Error("发布计划包含无效条目");
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
        throw new Error(`发布计划中的 ${entry.name} tarball 信息无效`);
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
    throw new Error(`Changesets tarball 完整性与发布计划不一致：${tarball}`);
  }
}

async function inspectTarball(
  tarball: string,
  expectedName: string,
  expectedLicense: string,
): Promise<PackedPackage> {
  const entries = tarEntries(tarball);
  verifyArchiveContents(entries, tarball);
  const manifest = parseManifest(readTarText(tarball, "package/package.json"));
  verifyManifestMetadata(manifest, expectedName);
  verifyManifestTargets(manifest, entries);
  const version = requiredString(manifest, "version", "制品 package.json");
  verifyPublicSourceLinks(tarball, version, manifest, entries);
  const license = readTarText(tarball, "package/LICENSE");
  if (license !== expectedLicense) {
    throw new Error(`制品 LICENSE 与仓库许可证不一致：${tarball}`);
  }
  if (
    !license.includes("MIT License") ||
    !license.includes("Copyright (c) 2026 YKDZ")
  ) {
    throw new Error(`制品 LICENSE 缺少 MIT 许可证内容：${tarball}`);
  }
  return {
    name: expectedName,
    version,
    tarball,
    manifest,
  };
}

function verifyPublicSourceLinks(
  tarball: string,
  version: string,
  manifest: Readonly<Record<string, unknown>>,
  entries: readonly string[],
): void {
  const sourceTag = encodeURIComponent(`${corePackage}@${version}`);
  const expected = `https://github.com/YKDZ/cli-contract/tree/${sourceTag}/packages/example`;
  const publicEntries = targetStrings(manifest.exports, "exports").filter(
    (target) => target.endsWith(".js") || target.endsWith(".d.ts"),
  );
  if (publicEntries.length === 0) {
    throw new Error("制品没有可核对源码链接的公开 JS/类型入口");
  }
  for (const target of publicEntries) {
    const entry = target.slice(2);
    if (!entries.includes(entry)) {
      throw new Error(`制品缺少公开入口 ${target}`);
    }
    if (!readTarText(tarball, `package/${entry}`).includes(expected)) {
      throw new Error(
        `制品入口 ${target} 的示例链接未指向对应 Changesets 源码 tag`,
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
        throw new Error(`tgz 包含 package/ 之外的路径：${entry}`);
      }
      return entry.slice("package/".length);
    });
  if (new Set(entries).size !== entries.length) {
    throw new Error(`tgz 包含重复路径：${tarball}`);
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
      throw new Error(`tgz 包含无效路径：${entry}`);
    }
    if (isDeniedArchivePath(entry)) {
      throw new Error(`tgz 包含非公开目录内容：${entry}`);
    }
    if (required.has(entry)) {
      required.delete(entry);
      continue;
    }
    if (!isPublishedDistFile(entry)) {
      throw new Error(`tgz 包含 dist/ 之外的内容：${entry}`);
    }
  }
  if (required.size > 0) {
    throw new Error(`tgz 缺少 ${[...required].join("、")}`);
  }
  if (!entries.some((entry) => entry.startsWith("dist/"))) {
    throw new Error(`tgz 不包含构建输出：${tarball}`);
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
    throw new Error("制品 package.json 不是有效 JSON");
  }
  if (!isRecord(value)) throw new Error("制品 package.json 必须是对象");
  const workspaceReference = findWorkspaceOrCatalog(value);
  if (workspaceReference !== undefined) {
    throw new Error(`制品 package.json 保留了 ${workspaceReference}`);
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
  if (requiredString(manifest, "name", "制品 package.json") !== expectedName) {
    throw new Error(`制品包身份与 ${expectedName} 不一致`);
  }
  if (
    !isStableVersion(requiredString(manifest, "version", "制品 package.json"))
  ) {
    throw new Error("制品版本不是稳定的三段版本号");
  }
  if (manifest.private === true) throw new Error("制品包仍标记为 private");
  if (requiredString(manifest, "type", "制品 package.json") !== "module") {
    throw new Error("制品包不是 ESM");
  }
  if (requiredString(manifest, "license", "制品 package.json") !== "MIT") {
    throw new Error("制品 package.json 的许可证不是 MIT");
  }
  if (
    requiredString(manifest, "homepage", "制品 package.json") !==
    "https://github.com/YKDZ/cli-contract"
  ) {
    throw new Error("制品 homepage 元数据不正确");
  }
  if (
    requiredString(manifest, "description", "制品 package.json").length === 0
  ) {
    throw new Error("制品 description 不能为空");
  }
  const keywords = manifest.keywords;
  if (
    !Array.isArray(keywords) ||
    keywords.length === 0 ||
    !keywords.every((keyword) => typeof keyword === "string")
  ) {
    throw new Error("制品 keywords 缺失");
  }
  const engines = requiredRecord(manifest, "engines", "制品 package.json");
  if (engines.node !== "^26.13.0") {
    throw new Error("制品包没有要求 Node ^26.13.0");
  }
  const publishConfig = requiredRecord(
    manifest,
    "publishConfig",
    "制品 package.json",
  );
  if (publishConfig.access !== "public") {
    throw new Error("制品包没有请求公开 npm 发布范围");
  }
  const repository = requiredRecord(
    manifest,
    "repository",
    "制品 package.json",
  );
  if (repository.url !== "git+https://github.com/YKDZ/cli-contract.git") {
    throw new Error("制品 repository 元数据不正确");
  }
  const bugs = requiredRecord(manifest, "bugs", "制品 package.json");
  if (bugs.url !== "https://github.com/YKDZ/cli-contract/issues") {
    throw new Error("制品 bugs 元数据不正确");
  }
}

function verifyManifestTargets(
  manifest: Readonly<Record<string, unknown>>,
  entries: readonly string[],
): void {
  const targets = [
    ...targetStrings(manifest.exports, "exports"),
    ...targetStrings(manifest.imports, "imports"),
    ...targetStrings(manifest.types, "types"),
  ];
  if (targets.length === 0) {
    throw new Error("制品 package.json 没有公开入口");
  }
  for (const target of targets) {
    if (!target.startsWith("./") || target.includes("..")) {
      throw new Error(`制品入口不是包内路径：${target}`);
    }
    if (!entries.some((entry) => matchesTarget(target.slice(2), entry))) {
      throw new Error(`制品入口未包含在 tgz 中：${target}`);
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
      throw new Error(`制品 package.json 的 ${field} 必须是对象`);
    }
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== "string" || !isRegistryVersionSpecifier(version)) {
        throw new Error(`制品依赖没有固定 registry 版本：${name}`);
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
  throw new Error(`制品 package.json 的 ${field} 含有无效入口`);
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

function verifyLockstep(core: PackedPackage, testing: PackedPackage): void {
  if (core.version !== testing.version) {
    throw new Error("Changesets pack 中 core/testing 版本不一致");
  }
  const dependencies = requiredRecord(
    testing.manifest,
    "dependencies",
    "testing 制品 package.json",
  );
  if (dependencies[corePackage] !== core.version) {
    throw new Error("testing 制品没有精确依赖同批 core 版本");
  }
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
    throw new Error(`${context} 缺少字符串字段 ${key}`);
  }
  return value;
}

function requiredRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): Readonly<Record<string, unknown>> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`${context} 缺少对象字段 ${key}`);
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
      `${basename(command)} ${args.join(" ")} 失败（${result.status ?? "未知状态"}）\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`制品验收失败：${detail}\n`);
  process.exitCode = 1;
});
