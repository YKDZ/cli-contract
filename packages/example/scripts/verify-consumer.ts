import { spawnSync } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  installedRuntimeDevDependencies,
  runCommand,
  withInstalledConsumer,
} from "@cli-contract/tooling-config/release-consumer";
import coreMetadata from "@ykdz/cli-contract/package.json" with { type: "json" };

interface Manifest {
  name: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PackedTarballs {
  readonly coreTarball: string;
  readonly testingTarball: string;
}

const exampleRoot = resolve(import.meta.dirname, "..");
const configPackage = "@cli-contract/tooling-config";
const corePackage = "@ykdz/cli-contract";
const testingPackage = "@ykdz/cli-contract-testing";

export async function verifyExample(
  packed?: PackedTarballs,
  argv?: readonly string[],
): Promise<void> {
  const example = await manifestAt(exampleRoot);
  if (!example.scripts)
    throw new TypeError("The example package has no scripts");
  const coreVersion = coreMetadata.version;
  if (typeof coreVersion !== "string")
    throw new Error("The public core package metadata has no version");
  if (packed === undefined) verifyPublishedSource(coreVersion);
  const replacements: Record<string, string> = {
    [corePackage]: packed ? `file:${packed.coreTarball}` : coreVersion,
    [testingPackage]: packed ? `file:${packed.testingTarball}` : coreVersion,
  };
  const manifest = {
    ...example,
    dependencies: await installedDependencies(
      example.dependencies,
      replacements,
    ),
    devDependencies: {
      ...(await installedDependencies(example.devDependencies, replacements)),
      ...installedRuntimeDevDependencies,
    },
  };
  await withInstalledConsumer(manifest, async (project) => {
    for (const directory of ["src", "test"]) {
      await cp(resolve(exampleRoot, directory), resolve(project, directory), {
        recursive: true,
      });
    }
    // Flatten the Node config so the temporary project uses the same compiler options as the workspace.
    const config = JSON.parse(
      await readFile(resolve(exampleRoot, "tsconfig.json"), "utf8"),
    );
    const baseConfig = JSON.parse(
      await readFile(
        fileURLToPath(import.meta.resolve(`${configPackage}/base.json`)),
        "utf8",
      ),
    );
    const nodeConfig = JSON.parse(
      await readFile(
        fileURLToPath(import.meta.resolve(`${configPackage}/node.json`)),
        "utf8",
      ),
    );
    const { extends: _baseExtends, ...base } = baseConfig;
    const { extends: _nodeExtends, ...node } = nodeConfig;
    const { extends: _extends, ...local } = config;
    await writeFile(
      resolve(project, "tsconfig.json"),
      JSON.stringify({
        ...base,
        ...node,
        ...local,
        compilerOptions: {
          ...base.compilerOptions,
          ...node.compilerOptions,
          ...local.compilerOptions,
        },
      }),
    );
    await cp(
      resolve(exampleRoot, "tsconfig.build.json"),
      resolve(project, "tsconfig.build.json"),
    );
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
      if (result.status !== 0)
        throw new Error(
          `The example process exited with status ${result.status ?? "unknown"}`,
        );
    }
  });
}

function verifyPublishedSource(version: string): void {
  const modifiedExample = runCommand(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "."],
    exampleRoot,
  );
  if (modifiedExample.trim().length > 0) {
    throw new Error(
      "Post-publish example acceptance requires the example package to match the published source; run from a clean workspace at the corresponding native Changesets package tags",
    );
  }

  const tagsAtHead = new Set(
    runCommand("git", ["tag", "--points-at", "HEAD"], exampleRoot)
      .split("\n")
      .filter((tag) => tag.length > 0),
  );
  const requiredTags = [
    `${corePackage}@${version}`,
    `${testingPackage}@${version}`,
  ];
  const missingTags = requiredTags.filter((tag) => !tagsAtHead.has(tag));
  if (missingTags.length > 0) {
    throw new Error(
      `Post-publish example acceptance requires HEAD at the corresponding native Changesets package tags: ${missingTags.join(", ")}`,
    );
  }
}

async function manifestAt(directory: string): Promise<Manifest> {
  const value: unknown = JSON.parse(
    await readFile(resolve(directory, "package.json"), "utf8"),
  );
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    (value.version !== undefined && typeof value.version !== "string") ||
    (value.type !== undefined && typeof value.type !== "string") ||
    (value.scripts !== undefined && !isStringRecord(value.scripts)) ||
    (value.dependencies !== undefined && !isStringRecord(value.dependencies)) ||
    (value.devDependencies !== undefined &&
      !isStringRecord(value.devDependencies))
  ) {
    throw new TypeError(`Invalid package metadata: ${directory}`);
  }
  return {
    ...value,
    name: value.name,
    ...(value.scripts === undefined ? {} : { scripts: value.scripts }),
    ...(value.version === undefined ? {} : { version: value.version }),
    ...(value.type === undefined ? {} : { type: value.type }),
    ...(value.dependencies === undefined
      ? {}
      : { dependencies: value.dependencies }),
    ...(value.devDependencies === undefined
      ? {}
      : { devDependencies: value.devDependencies }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
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
          throw new Error(
            `Cannot determine the installed dependency version: ${name}`,
          );
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
  const rawArgs = process.argv.slice(2);
  const values = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const separator = values.indexOf("--");
  const args = separator === -1 ? values : values.slice(0, separator);
  const cliArgs = separator === -1 ? [] : values.slice(separator + 1);
  const packed =
    args.length === 4 &&
    args[0] === "--core" &&
    args[2] === "--testing" &&
    args[1] &&
    args[3]
      ? { coreTarball: resolve(args[1]), testingTarball: resolve(args[3]) }
      : undefined;
  const published = args[0] === "--published";
  if ((!packed && !published) || (published && args.length !== 1))
    throw new Error(
      "Usage: release:verify --core <tgz> --testing <tgz>, or verify:published [CLI args]",
    );
  await verifyExample(packed, published ? cliArgs : undefined);
}
