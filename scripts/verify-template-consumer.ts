import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const templateCommit = "daaff03e01b597873a050eb9e4622ed1d5d226b1";
const templateRepository = "https://github.com/YKDZ/template.git";
const corePackage = "@ykdz/cli-contract";
const testingPackage = "@ykdz/cli-contract-testing";

interface CandidateTarballs {
  readonly core: string;
  readonly testing: string;
}

async function main(): Promise<void> {
  verifyNodeVersion();
  const candidate = await parseCandidateTarballs(process.argv.slice(2));
  const fixture = await readFile(
    resolve(repositoryRoot, "scripts/fixtures/template-consumer/consumer.ts"),
    "utf8",
  );
  const work = await mkdtemp(resolve(tmpdir(), "cli-contract-template-"));
  const npmCache = await mkdtemp(resolve(tmpdir(), "cli-contract-npm-cache-"));

  try {
    const template = resolve(work, "template");
    const probe = resolve(template, ".cli-contract-consumer-probe");
    runCommand(
      "git",
      ["clone", "--quiet", "--no-checkout", templateRepository, template],
      work,
    );
    runCommand(
      "git",
      ["checkout", "--quiet", "--detach", templateCommit],
      template,
    );
    const checkedOutCommit = runCommand(
      "git",
      ["rev-parse", "HEAD"],
      template,
    ).stdout.trim();
    if (checkedOutCommit !== templateCommit) {
      throw new Error(
        `Template clone is not at the required commit: ${checkedOutCommit}`,
      );
    }

    await writeProbe(probe, candidate, fixture);
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
      probe,
      { NPM_CONFIG_CACHE: npmCache },
    );
    runCommand(
      resolve(repositoryRoot, "node_modules/typescript-7/bin/tsc"),
      ["--project", "tsconfig.json", "--pretty", "false"],
      probe,
    );
    runCommand(process.execPath, ["consumer.ts"], probe);
  } finally {
    await Promise.all([
      rm(work, { recursive: true, force: true }),
      rm(npmCache, { recursive: true, force: true }),
    ]);
  }

  process.stdout.write("Template 消费探针通过\n");
}

function verifyNodeVersion(): void {
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    throw new Error(
      `Template 消费探针要求 Node 24，当前为 ${process.versions.node}`,
    );
  }
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
      "用法：pnpm consumer:template -- --core <绝对 core.tgz> --testing <绝对 testing.tgz>",
    );
  }
  if (!isAbsolute(values[1]) || !isAbsolute(values[3])) {
    throw new Error("core 与 testing 候选必须是绝对 tgz 路径");
  }

  const core = values[1];
  const testing = values[3];
  if (dirname(core) !== dirname(testing)) {
    throw new Error("core 与 testing 候选必须来自同一目录");
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
    throw new Error(`候选必须是普通 .tgz 文件：${tarball}`);
  }
}

async function writeProbe(
  probe: string,
  candidate: CandidateTarballs,
  fixture: string,
): Promise<void> {
  await mkdir(probe);
  await Promise.all([
    writeFile(
      resolve(probe, "package.json"),
      `${JSON.stringify({
        name: "cli-contract-template-consumer-probe",
        private: true,
        type: "module",
        dependencies: {
          [corePackage]: `file:${candidate.core}`,
          [testingPackage]: `file:${candidate.testing}`,
        },
        devDependencies: {
          "@valibot/to-json-schema": "1.7.1",
          valibot: "1.4.2",
        },
      })}\n`,
    ),
    writeFile(resolve(probe, "consumer.ts"), fixture),
    writeFile(
      resolve(probe, "tsconfig.json"),
      `${JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2023",
          types: ["node"],
        },
        files: ["consumer.ts"],
      })}\n`,
    ),
  ]);
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  environment?: Readonly<Record<string, string>>,
): Readonly<{ readonly stdout: string }> {
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
      `${basename(command)} ${args.join(" ")} 以状态 ${result.status ?? "unknown"} 失败\n${result.stderr}\n${result.stdout}`,
    );
  }
  return { stdout: result.stdout };
}

await main();
