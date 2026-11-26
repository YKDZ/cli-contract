import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

import { verifyAuthoringDiagnosticCases } from "./authoring-diagnostic-cases.ts";
import {
  parseJsonObject,
  readRuntimeMetadata,
  requiredString,
} from "./runtime-metadata.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corePackage = "@boringparts/cli-contract";
const compilerVersions = ["6.0.3", "7.0.2"] as const;
const resolutions = ["nodenext", "bundler"] as const;

interface NodeTypesTarget {
  readonly major: string;
  readonly specifier: string;
}

async function main(): Promise<void> {
  const tarball = await parseCandidateTarball(process.argv.slice(2));
  const fixtures = await readFixtures();
  const runtimeMetadata = await readRuntimeMetadata(
    repositoryRoot,
    corePackage,
  );
  const nodeTypesTargets: readonly NodeTypesTarget[] = [
    {
      major: runtimeMetadata.minimumMajor,
      specifier: runtimeMetadata.minimumNodeTypes,
    },
    {
      major: runtimeMetadata.workspaceMajor,
      specifier: runtimeMetadata.workspaceNodeTypes,
    },
  ];

  for (const compilerVersion of compilerVersions) {
    for (const [index, nodeTypesTarget] of nodeTypesTargets.entries()) {
      await verifyCompilerAndNodeTypes(
        tarball,
        fixtures,
        compilerVersion,
        nodeTypesTarget,
        index === 0,
      );
    }
  }
}

async function readFixtures(): Promise<Readonly<Record<string, string>>> {
  return Object.fromEntries(
    await Promise.all(
      [
        "consumer.ts",
        "core-node.ts",
        "core-root.ts",
        "exportable-contract.ts",
        "exportable-contract-reconsumer.ts",
        "generic-text-forward.ts",
        "schema-input.ts",
        "typed-command-examples.ts",
        "public-contract-discovery.ts",
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
    ),
  );
}

async function parseCandidateTarball(args: readonly string[]): Promise<string> {
  const values = args[0] === "--" ? args.slice(1) : args;
  if (values.length !== 2 || values[0] !== "--tarball" || !values[1]) {
    throw new Error("Usage: pnpm consumer:types -- --tarball <package.tgz>");
  }

  const tarball = resolve(values[1]);
  const status = await lstat(tarball);
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    !tarball.endsWith(".tgz")
  ) {
    throw new Error(`Candidate must be a regular .tgz file: ${tarball}`);
  }
  return tarball;
}

async function verifyCompilerAndNodeTypes(
  tarball: string,
  fixtures: Readonly<Record<string, string>>,
  compilerVersion: (typeof compilerVersions)[number],
  nodeTypesTarget: NodeTypesTarget,
  runAuthoringDiagnostics: boolean,
): Promise<void> {
  const project = await mkdtemp(
    resolve(
      tmpdir(),
      `cli-contract-typescript-${compilerVersion}-node${nodeTypesTarget.major}-`,
    ),
  );
  try {
    await writeFile(
      resolve(project, "package.json"),
      `${JSON.stringify({
        name: "cli-contract-typescript-consumer",
        private: true,
        type: "module",
        dependencies: { [corePackage]: `file:${tarball}` },
        devDependencies: {
          "@types/node": nodeTypesTarget.specifier,
          "@valibot/to-json-schema": "1.7.1",
          typescript: compilerVersion,
          valibot: "1.5.0",
          zod: "4.6.5",
        },
      })}\n`,
    );
    await writeFixtures(project, fixtures, [
      "consumer.ts",
      "core-node.ts",
      "core-root.ts",
      "generic-text-forward.ts",
      "schema-input.ts",
      "typed-command-examples.ts",
      "public-contract-discovery.ts",
      "valid-help-fact-templates.ts",
    ]);
    runCommand(
      "pnpm",
      ["install", "--ignore-scripts", "--prefer-offline"],
      project,
    );
    const installedNodeTypes = parseJsonObject(
      await readFile(
        resolve(project, "node_modules/@types/node/package.json"),
        "utf8",
      ),
      "installed @types/node package.json",
    );
    const installedNodeTypesVersion = requiredString(
      installedNodeTypes,
      "version",
      "installed @types/node package.json",
    );
    if (!installedNodeTypesVersion.startsWith(`${nodeTypesTarget.major}.`)) {
      throw new Error(
        `Expected @types/node major ${nodeTypesTarget.major} for specifier ${nodeTypesTarget.specifier}, got ${installedNodeTypesVersion}`,
      );
    }

    for (const resolution of resolutions) {
      await verifyExportableDeclarations(project, resolution, fixtures);
      for (const fixture of [
        "core-root.ts",
        "core-node.ts",
        "generic-text-forward.ts",
        "schema-input.ts",
        "typed-command-examples.ts",
        "public-contract-discovery.ts",
        "valid-help-fact-templates.ts",
        "consumer.ts",
      ]) {
        await compileFixture(project, resolution, fixture);
      }
      if (runAuthoringDiagnostics) {
        await verifyAuthoringDiagnosticCases(
          project,
          resolution,
          compilerVersion,
        );
      }
    }
  } finally {
    await rm(project, { recursive: true, force: true });
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
    throw new Error("Missing exportable-declaration consumer fixture");
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
      ...(fixture === "consumer.ts"
        ? { lib: ["ES2023"], types: ["node"] }
        : { types: [] }),
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
): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} ${args.join(" ")} failed with status ${result.status ?? "unknown"}\n${result.stderr}\n${result.stdout}`,
    );
  }
}

await main();
