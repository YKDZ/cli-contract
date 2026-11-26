import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

export interface RuntimeMetadata {
  readonly expectedEnginesNode: string;
  readonly minimumRuntime: string;
  readonly minimumMajor: string;
  readonly minimumNodeTypes: string;
  readonly workspaceRuntime: string;
  readonly workspaceMajor: string;
  readonly workspaceNodeTypes: string;
}

/**
 * Derives the promised minimum Node runtime, workspace baseline Node runtime,
 * and corresponding `@types/node` specifiers from package metadata without
 * hardcoding version literals or crossing workspace package boundaries directly.
 */
export async function readRuntimeMetadata(
  repositoryRoot: string,
  corePackage: string,
): Promise<RuntimeMetadata> {
  const publicManifestRaw = captureCommand(
    "pnpm",
    [
      "--silent",
      "--filter",
      corePackage,
      "exec",
      "node",
      "--input-type=module",
      "-e",
      'import metadata from "@boringparts/cli-contract/package.json" with { type: "json" }; process.stdout.write(JSON.stringify(metadata));',
    ],
    repositoryRoot,
  );
  const publicManifest = parseJsonObject(
    publicManifestRaw,
    `${corePackage} package.json`,
  );
  const publicEngines = requiredRecord(
    publicManifest,
    "engines",
    `${corePackage} package.json`,
  );
  const expectedEnginesNode = requiredString(
    publicEngines,
    "node",
    `${corePackage} engines`,
  );
  const minimumMatch = /^>=((\d+)\.\d+\.\d+)$/.exec(expectedEnginesNode);
  if (
    minimumMatch === null ||
    minimumMatch[1] === undefined ||
    minimumMatch[2] === undefined
  ) {
    throw new Error(
      `${corePackage} engines.node must use >=x.y.z lower bound, got ${expectedEnginesNode}`,
    );
  }
  const minimumRuntime = minimumMatch[1];
  const minimumMajor = minimumMatch[2];

  const publicDevDependencies = requiredRecord(
    publicManifest,
    "devDependencies",
    `${corePackage} package.json`,
  );
  const minimumNodeTypes = requiredString(
    publicDevDependencies,
    "@types/node",
    `${corePackage} devDependencies`,
  );

  const rootManifest = parseJsonObject(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    "root package.json",
  );
  const rootEngines = requiredRecord(
    rootManifest,
    "engines",
    "root package.json",
  );
  const workspaceEnginesNode = requiredString(
    rootEngines,
    "node",
    "root engines",
  );
  const workspaceMatch = /^((\d+)\.\d+\.\d+)$/.exec(workspaceEnginesNode);
  if (
    workspaceMatch === null ||
    workspaceMatch[1] === undefined ||
    workspaceMatch[2] === undefined
  ) {
    throw new Error(
      `Root package.json engines.node must be an exact x.y.z version, got ${workspaceEnginesNode}`,
    );
  }
  const workspaceRuntime = workspaceMatch[1];
  const workspaceMajor = workspaceMatch[2];
  if (minimumRuntime === workspaceRuntime || minimumMajor === workspaceMajor) {
    throw new Error(
      `Minimum promised runtime (${minimumRuntime}) and workspace baseline (${workspaceRuntime}) must have distinct versions and majors`,
    );
  }

  const installedRootNodeTypes = parseJsonObject(
    await readFile(
      resolve(repositoryRoot, "node_modules/@types/node/package.json"),
      "utf8",
    ),
    "root installed @types/node package.json",
  );
  const workspaceNodeTypes = requiredString(
    installedRootNodeTypes,
    "version",
    "root installed @types/node package.json",
  );
  if (!workspaceNodeTypes.startsWith(`${workspaceMajor}.`)) {
    throw new Error(
      `Root installed @types/node (${workspaceNodeTypes}) does not match workspace baseline Node major ${workspaceMajor}`,
    );
  }

  return {
    expectedEnginesNode,
    minimumRuntime,
    minimumMajor,
    minimumNodeTypes,
    workspaceRuntime,
    workspaceMajor,
    workspaceNodeTypes,
  };
}

export function parseJsonObject(
  text: string,
  context: string,
): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${context} is not valid JSON`);
  }
  if (!isRecord(value)) throw new Error(`${context} must be an object`);
  return value;
}

export function requiredString(
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

export function requiredRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): Readonly<Record<string, unknown>> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`${context} is missing object field ${key}`);
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function captureCommand(
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
