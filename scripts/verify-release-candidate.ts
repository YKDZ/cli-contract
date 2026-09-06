import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");

interface CandidateResult {
  readonly coreTarball: string;
  readonly testingTarball: string;
}

async function main(): Promise<void> {
  const outputDirectory = parseOutputDirectory(process.argv.slice(2));

  reportStage("运行根检查");
  runPnpm(["run", "check", "--force"]);

  reportStage("打包并验证候选制品");
  const candidate = parseCandidateResult(
    runPnpmForOutput([
      "--silent",
      "candidate:pack",
      "--",
      "--output-dir",
      outputDirectory,
      "--skip-build",
    ]),
  );

  reportStage("验证 TypeScript 6/7 消费矩阵");
  runPnpm([
    "consumer:types",
    "--",
    "--core",
    candidate.coreTarball,
    "--testing",
    candidate.testingTarball,
  ]);

  process.stdout.write(`${JSON.stringify(candidate)}\n`);
}

function parseOutputDirectory(args: readonly string[]): string {
  const values = args[0] === "--" ? args.slice(1) : args;
  if (
    values.length !== 2 ||
    values[0] !== "--output-dir" ||
    values[1] === undefined
  ) {
    throw new Error("用法：pnpm candidate:verify -- --output-dir <空候选目录>");
  }
  return resolve(repositoryRoot, values[1]);
}

function parseCandidateResult(output: string): CandidateResult {
  let result: unknown;
  try {
    result = JSON.parse(output.trim());
  } catch {
    throw new Error("candidate:pack 未返回 JSON 候选结果");
  }
  if (!isCandidateResult(result)) {
    throw new Error("candidate:pack 返回了无效的候选结果");
  }
  return result;
}

function isCandidateResult(value: unknown): value is CandidateResult {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record.coreTarball === "string" &&
    typeof record.testingTarball === "string"
  );
}

function reportStage(stage: string): void {
  process.stderr.write(`发布候选：${stage}\n`);
}

function runPnpm(args: readonly string[]): void {
  const result = spawnSync("pnpm", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  writeDiagnostic(result.stdout);
  writeDiagnostic(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} 以状态 ${result.status} 失败`);
  }
}

function runPnpmForOutput(args: readonly string[]): string {
  const result = spawnSync("pnpm", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  writeDiagnostic(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    writeDiagnostic(result.stdout);
    throw new Error(`pnpm ${args.join(" ")} 以状态 ${result.status} 失败`);
  }
  return result.stdout;
}

function writeDiagnostic(output: string | null): void {
  if (output !== null && output.length > 0) process.stderr.write(output);
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`发布候选失败：${detail}\n`);
  process.exitCode = 1;
});
