import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import coreMetadata from "@boringparts/cli-contract/package.json" with { type: "json" };

interface Manifest {
  name: string;
  version?: string;
  type?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const exampleRoot = resolve(import.meta.dirname, "..");
const configPackage = "@cli-contract/tooling-config";
const corePackage = "@boringparts/cli-contract";

export async function verifyExample(
  packedTarball?: string,
  argv?: readonly string[],
  requestedNodeVersion?: string,
): Promise<void> {
  const example = await manifestAt(exampleRoot);
  if (!example.scripts)
    throw new TypeError("The example package has no scripts");
  const coreVersion = coreMetadata.version;
  if (typeof coreVersion !== "string")
    throw new Error("The public core package metadata has no version");
  if (packedTarball === undefined) verifyPublishedSource(coreVersion);
  const runtimeVersions = resolveTargetRuntimes(example, requestedNodeVersion);
  for (const runtimeVersion of runtimeVersions) {
    await verifyExampleOnRuntime(
      example,
      coreVersion,
      runtimeVersion,
      packedTarball,
      argv,
    );
  }
}

function resolveTargetRuntimes(
  example: Manifest,
  requestedNodeVersion?: string,
): readonly string[] {
  if (requestedNodeVersion !== undefined) {
    if (!/^\d+\.\d+\.\d+$/.test(requestedNodeVersion)) {
      throw new Error(`Invalid --node-version value: ${requestedNodeVersion}`);
    }
    return [requestedNodeVersion];
  }
  const coreEngineRange = coreMetadata.engines?.node;
  const minimumMatch = /^>=(\d+\.\d+\.\d+)$/.exec(coreEngineRange);
  if (minimumMatch === null || minimumMatch[1] === undefined) {
    throw new Error(
      `Public core package engines.node must use >=x.y.z lower bound, got ${coreEngineRange}`,
    );
  }
  const exampleEngineRange = example.engines?.node;
  const baselineMatch =
    typeof exampleEngineRange === "string"
      ? /^(?:\^|>=)?(\d+\.\d+\.\d+)$/.exec(exampleEngineRange)
      : null;
  if (baselineMatch === null || baselineMatch[1] === undefined) {
    throw new Error(
      `Example package engines.node must contain an x.y.z baseline, got ${String(exampleEngineRange)}`,
    );
  }
  return minimumMatch[1] === baselineMatch[1]
    ? [minimumMatch[1]]
    : [minimumMatch[1], baselineMatch[1]];
}

async function verifyExampleOnRuntime(
  example: Manifest,
  coreVersion: string,
  runtimeVersion: string,
  packedTarball?: string,
  argv?: readonly string[],
): Promise<void> {
  const replacements: Record<string, string> = {
    [corePackage]: packedTarball ? `file:${packedTarball}` : coreVersion,
  };
  const manifest = {
    ...example,
    engines: { node: `>=${runtimeVersion}` },
    devEngines: {
      runtime: {
        name: "node",
        version: runtimeVersion,
        onFail: "download",
      },
    },
    dependencies: await installedDependencies(
      example.dependencies,
      replacements,
    ),
    devDependencies: await installedDependencies(
      example.devDependencies,
      replacements,
    ),
  };

  const project = await mkdtemp(
    resolve(tmpdir(), `cli-contract-example-consumer-${runtimeVersion}-`),
  );
  try {
    await writeFile(
      resolve(project, "package.json"),
      `${JSON.stringify(manifest)}\n`,
    );
    runCommand(
      "pnpm",
      ["install", "--ignore-scripts", "--prefer-offline"],
      project,
    );
    await verifyIsolatedPublicEntries(project, runtimeVersion);

    for (const directory of ["src", "test"]) {
      await cp(resolve(exampleRoot, directory), resolve(project, directory), {
        recursive: true,
      });
    }

    const tsconfig = showTsconfig(exampleRoot, "tsconfig.json");
    const buildTsconfig = showTsconfig(exampleRoot, "tsconfig.build.json");
    await writeFile(
      resolve(project, "tsconfig.json"),
      `${JSON.stringify({
        compilerOptions: {
          ...tsconfig.compilerOptions,
          customConditions: [],
        },
        include: ["src/**/*.ts", "test/**/*.ts"],
      })}\n`,
    );
    await writeFile(
      resolve(project, "tsconfig.build.json"),
      `${JSON.stringify({
        compilerOptions: {
          ...buildTsconfig.compilerOptions,
          customConditions: [],
        },
        include: ["src/**/*.ts"],
      })}\n`,
    );

    for (const task of ["typecheck", "build", "test", "test:e2e"]) {
      process.stderr.write(
        runCommand("pnpm", ["run", "--silent", task], project),
      );
    }
    if (argv) {
      const result = spawnSync(
        "pnpm",
        ["exec", "node", "dist/main.js", ...argv],
        {
          cwd: project,
          stdio: "inherit",
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `The example process exited with status ${result.status ?? "unknown"}`,
        );
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

async function verifyIsolatedPublicEntries(
  project: string,
  expectedRuntime: string,
): Promise<void> {
  const packageJsonPath = realpathSync(resolve(project, "package.json"));
  const nodeModulesDir = realpathSync(resolve(project, "node_modules"));
  const installedRoot = realpathSync(
    resolve(project, "node_modules/@boringparts/cli-contract"),
  );

  const probeScript = `
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const [anchorFile, expectedRoot, expectedRuntime] = process.argv.slice(1);
assert.equal(process.versions.node, expectedRuntime);
const anchorUrl = pathToFileURL(anchorFile).href;
const specifiers = [
  "@boringparts/cli-contract",
  "@boringparts/cli-contract/node",
  "@boringparts/cli-contract/testing",
  "@boringparts/cli-contract/package.json",
];
const resolved = Object.fromEntries(
  specifiers.map((specifier) => [
    specifier,
    realpathSync(fileURLToPath(import.meta.resolve(specifier, anchorUrl))),
  ]),
);
for (const [specifier, target] of Object.entries(resolved)) {
  if (!target.startsWith(expectedRoot + "/")) {
    throw new Error(\`Public entry \${specifier} escaped isolated install: \${target}\`);
  }
}
const requireFromTesting = createRequire(pathToFileURL(resolved["@boringparts/cli-contract/testing"]));
assert.equal(
  realpathSync(requireFromTesting.resolve("@boringparts/cli-contract")),
  resolved["@boringparts/cli-contract"],
  "Testing subpath and consumer must resolve to the same core instance",
);

const core = await import(pathToFileURL(resolved["@boringparts/cli-contract"]).href);
const nodeEntry = await import(pathToFileURL(resolved["@boringparts/cli-contract/node"]).href);
const testing = await import(pathToFileURL(resolved["@boringparts/cli-contract/testing"]).href);
assert.equal(typeof core.defineCli, "function");
assert.equal(typeof nodeEntry.nodeCliOutput, "function");
assert.equal(typeof testing.runCliScenario, "function");

const schema = {
  "~standard": {
    version: 1,
    vendor: "smoke",
    validate: (value) => ({ value }),
    jsonSchema: {
      input: () => ({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      output: () => ({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
    },
  },
};
const cli = core.defineCli()({
  root: "ping",
  help: core.helpCapability({
    wording: {
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
  usageFailureExitCode: 64,
  commands: {
    ping: {
      kind: "rootCommand",
      name: "ping",
      description: "Ping",
      input: schema,
      outputs: ({ atomic }) => ({
        modes: {
          structured: atomic({
            success: { kind: "completion" },
            failures: {},
            handler: ({ outcome }) => outcome.completion(),
          }).structured({ description: "Structured" }),
        },
      }),
    },
  },
});
const observation = await testing.runCliScenario(cli, {
  argv: [],
  dependencies: undefined,
});
assert.equal(observation.termination.exitCode, 0);
process.stdout.write(resolved["@boringparts/cli-contract/testing"]);
`;
  const testingEntry = runCommand(
    "pnpm",
    [
      "exec",
      "node",
      "--input-type=module",
      "-e",
      probeScript,
      packageJsonPath,
      installedRoot,
      expectedRuntime,
    ],
    project,
  ).trim();
  if (!isWithinDirectory(nodeModulesDir, testingEntry)) {
    throw new Error(
      `Resolved testing entry escaped isolated node_modules: ${testingEntry}`,
    );
  }

  const sideEffectFreeScript = `
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const [anchorFile, forbiddenTestingPath, expectedRuntime] = process.argv.slice(1);
assert.equal(process.versions.node, expectedRuntime);
const anchorUrl = pathToFileURL(anchorFile).href;
const forbiddenUrl = pathToFileURL(forbiddenTestingPath).href;

registerHooks({
  load(url, context, nextLoad) {
    if (url === forbiddenUrl) {
      throw new Error(\`Unexpected load of testing subpath: \${url}\`);
    }
    return nextLoad(url, context);
  },
});

const core = await import(import.meta.resolve("@boringparts/cli-contract", anchorUrl));
const nodeEntry = await import(import.meta.resolve("@boringparts/cli-contract/node", anchorUrl));
assert.equal(typeof core.defineCli, "function");
assert.equal(typeof nodeEntry.nodeCliOutput, "function");
`;
  runCommand(
    "pnpm",
    [
      "exec",
      "node",
      "--input-type=module",
      "-e",
      sideEffectFreeScript,
      packageJsonPath,
      testingEntry,
      expectedRuntime,
    ],
    project,
  );
}

function showTsconfig(
  cwd: string,
  configFile: string,
): { readonly compilerOptions: Record<string, unknown> } {
  const tsc = resolve(cwd, "node_modules/.bin/tsc");
  const raw = runCommand(tsc, ["--showConfig", "-p", configFile], cwd);
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !isRecord(parsed.compilerOptions)) {
    throw new Error(`Invalid tsc --showConfig output for ${configFile}`);
  }
  return { compilerOptions: { ...parsed.compilerOptions } };
}

function verifyPublishedSource(version: string): void {
  const modifiedExample = runCommand(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "."],
    exampleRoot,
  );
  if (modifiedExample.trim().length > 0) {
    throw new Error(
      "Post-publish example acceptance requires the example package to match the published source; run from a clean workspace at the corresponding native Changesets package tag",
    );
  }

  const tagsAtHead = new Set(
    runCommand("git", ["tag", "--points-at", "HEAD"], exampleRoot)
      .split("\n")
      .filter((tag) => tag.length > 0),
  );
  const requiredTag = `${corePackage}@${version}`;
  if (!tagsAtHead.has(requiredTag)) {
    throw new Error(
      `Post-publish example acceptance requires HEAD at the corresponding native Changesets package tag: ${requiredTag}`,
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
    (value.engines !== undefined && !isStringRecord(value.engines)) ||
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
    ...(value.engines === undefined ? {} : { engines: value.engines }),
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

function isWithinDirectory(directory: string, path: string): boolean {
  const fromDirectory = relative(directory, path);
  return (
    fromDirectory !== "" &&
    !isAbsolute(fromDirectory) &&
    !fromDirectory.startsWith(`..${sep}`) &&
    fromDirectory !== ".."
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

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? result.signal})\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}

if (import.meta.main) {
  const rawArgs = process.argv.slice(2);
  const values = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const separator = values.indexOf("--");
  const args = separator === -1 ? values : values.slice(0, separator);
  const cliArgs = separator === -1 ? [] : values.slice(separator + 1);
  let packedTarball: string | undefined;
  let published = false;
  let requestedNodeVersion: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--tarball") {
      const target = args[++index];
      if (!target || packedTarball !== undefined) {
        throw new Error(
          "Usage: release:verify -- --tarball <tgz> [--node-version <x.y.z>], or verify:published [--node-version <x.y.z>] [-- <CLI args>]",
        );
      }
      packedTarball = resolve(target);
    } else if (arg === "--published") {
      published = true;
    } else if (arg === "--node-version") {
      const version = args[++index];
      if (!version || requestedNodeVersion !== undefined) {
        throw new Error(
          "Usage: release:verify -- --tarball <tgz> [--node-version <x.y.z>], or verify:published [--node-version <x.y.z>] [-- <CLI args>]",
        );
      }
      requestedNodeVersion = version;
    } else {
      throw new Error(
        "Usage: release:verify -- --tarball <tgz> [--node-version <x.y.z>], or verify:published [--node-version <x.y.z>] [-- <CLI args>]",
      );
    }
  }
  if ((!packedTarball && !published) || (packedTarball && published))
    throw new Error(
      "Usage: release:verify -- --tarball <tgz> [--node-version <x.y.z>], or verify:published [--node-version <x.y.z>] [-- <CLI args>]",
    );
  await verifyExample(
    packedTarball,
    published ? cliArgs : undefined,
    requestedNodeVersion,
  );
}
