import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dirname, "..");

export function runCommand(
  command: string,
  args: readonly string[],
  cwd = repositoryRoot,
  environment: Readonly<Record<string, string>> = {},
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} 失败（${result.status ?? result.signal}）\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout;
}

export async function withInstalledConsumer(
  manifest: Readonly<Record<string, unknown>>,
  consume: (project: string) => Promise<void>,
): Promise<void> {
  const project = await mkdtemp(resolve(tmpdir(), "cli-contract-consumer-"));
  try {
    await writeFile(
      resolve(project, "package.json"),
      `${JSON.stringify(manifest)}\n`,
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
    );
    await consume(project);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

export async function verifyInstalledRuntime(project: string): Promise<void> {
  await copyFile(
    resolve(import.meta.dirname, "fixtures/installed-runtime.ts"),
    resolve(project, "installed-runtime.ts"),
  );
  runCommand("node", ["installed-runtime.ts"], project, {
    CANDIDATE_REPOSITORY_ROOT: repositoryRoot,
  });
}
