import { spawnSync } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  repositoryRoot,
  runCommand,
  verifyInstalledRuntime,
  withInstalledConsumer,
} from "./installed-consumer.ts";

interface Manifest {
  name: string;
  version?: string;
  type?: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface CandidateTarballs {
  readonly coreTarball: string;
  readonly testingTarball: string;
}

const exampleRoot = resolve(repositoryRoot, "packages/example");
const configPackage = "@cli-contract/typescript-config";

export async function verifyExample(
  candidate?: CandidateTarballs,
  argv?: readonly string[],
): Promise<void> {
  const example = await manifestAt(exampleRoot);
  const core = await manifestAt(resolve(repositoryRoot, "packages/lib"));
  const testing = await manifestAt(resolve(repositoryRoot, "packages/testing"));
  if (!core.version || core.version !== testing.version)
    throw new Error("公共包版本必须一致");
  if (!candidate) {
    const tag = runCommand("git", [
      "describe",
      "--exact-match",
      "--tags",
      "HEAD",
    ]).trim();
    if (tag !== `v${core.version}`)
      throw new Error("请在对应发布 tag 上运行 npm 示例");
    const modified = runCommand("git", [
      "status",
      "--porcelain",
      "--",
      "packages/example",
      "packages/lib/package.json",
      "packages/testing/package.json",
      "packages/typescript-config",
      "pnpm-lock.yaml",
      "scripts/verify-example.ts",
      "scripts/installed-consumer.ts",
      "scripts/fixtures/installed-runtime.ts",
    ]);
    if (modified.trim())
      throw new Error(
        "发布版本体验要求示例及其依赖配置与 tag 一致；请先保存或撤回相关修改",
      );
  }
  const replacements: Record<string, string> = {
    [core.name]: candidate ? `file:${candidate.coreTarball}` : core.version,
    [testing.name]: candidate
      ? `file:${candidate.testingTarball}`
      : core.version,
  };
  const manifest = {
    ...example,
    dependencies: await installedDependencies(
      example.dependencies,
      replacements,
    ),
    devDependencies: await installedDependencies(
      example.devDependencies,
      replacements,
    ),
  };
  await withInstalledConsumer(manifest, async (project) => {
    for (const directory of ["src", "test"]) {
      await cp(resolve(exampleRoot, directory), resolve(project, directory), {
        recursive: true,
      });
    }
    // 展平共享配置，让临时项目保持相同严格性，同时脱离 workspace。
    const config = JSON.parse(
      await readFile(resolve(exampleRoot, "tsconfig.json"), "utf8"),
    );
    const base = JSON.parse(
      await readFile(
        resolve(exampleRoot, "node_modules", configPackage, "base.json"),
        "utf8",
      ),
    );
    const { extends: _extends, ...local } = config;
    await writeFile(
      resolve(project, "tsconfig.json"),
      JSON.stringify({
        ...base,
        ...local,
        compilerOptions: { ...base.compilerOptions, ...local.compilerOptions },
      }),
    );
    await cp(
      resolve(exampleRoot, "tsconfig.build.json"),
      resolve(project, "tsconfig.build.json"),
    );
    await verifyInstalledRuntime(project);
    for (const task of ["typecheck", "build", "test", "test:e2e"]) {
      process.stderr.write(
        runCommand("npm", ["run", "--silent", task], project),
      );
    }
    if (argv) {
      const result = spawnSync(process.execPath, ["src/main.ts", ...argv], {
        cwd: project,
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  });
}

async function manifestAt(directory: string): Promise<Manifest> {
  return JSON.parse(
    await readFile(resolve(directory, "package.json"), "utf8"),
  ) as Manifest;
}

async function installedDependencies(
  dependencies: Readonly<Record<string, string>> = {},
  replacements: Readonly<Record<string, string>>,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.keys(dependencies)
      .filter((name) => name !== configPackage)
      .map(async (name) => {
        const replacement = replacements[name];
        if (replacement) return [name, replacement] as const;
        const installed = await manifestAt(
          resolve(exampleRoot, "node_modules", name),
        );
        if (!installed.version)
          throw new Error(`无法确定已安装依赖的版本：${name}`);
        return [
          name,
          installed.name === name
            ? installed.version
            : `npm:${installed.name}@${installed.version}`,
        ] as const;
      }),
  );
  return Object.fromEntries(entries);
}

if (import.meta.main) {
  const args = process.argv
    .slice(2)
    .filter((arg, index) => !(index === 0 && arg === "--"));
  const candidate =
    args.length === 4 &&
    args[0] === "--core" &&
    args[2] === "--testing" &&
    args[1] &&
    args[3]
      ? { coreTarball: resolve(args[1]), testingTarball: resolve(args[3]) }
      : undefined;
  const published = args[0] === "--published";
  if (!candidate && !published)
    throw new Error(
      "用法：verify-example --core <tgz> --testing <tgz> 或 --published [CLI 参数]",
    );
  const cliArgs = args[1] === "--" ? args.slice(2) : args.slice(1);
  await verifyExample(candidate, published ? cliArgs : undefined);
}
