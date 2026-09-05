import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const tagRefPrefix = "refs/tags/v";
const stableTagPattern =
  /^refs\/tags\/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const commitPattern = /^[0-9a-f]{40}$/;

async function main(): Promise<void> {
  const { tagRef, eventSha } = parseArguments(process.argv.slice(2));
  const version = parseStableTagRef(tagRef);
  verifyEventSha(eventSha);

  verifyAnnotatedTag(tagRef);
  const tagCommit = gitOutput(["rev-parse", "--verify", `${tagRef}^{commit}`]);
  const eventCommit = gitOutput([
    "rev-parse",
    "--verify",
    `${eventSha}^{commit}`,
  ]);
  const headCommit = gitOutput(["rev-parse", "--verify", "HEAD^{commit}"]);

  if (
    tagCommit !== eventSha ||
    eventCommit !== eventSha ||
    headCommit !== eventSha
  ) {
    throw new Error("tag commit、事件 SHA 与 checkout HEAD 必须完全一致");
  }

  await verifyPackageVersions(version);
  process.stdout.write(
    `${JSON.stringify({ tagRef, version, commit: eventSha })}\n`,
  );
}

function parseArguments(args: readonly string[]): Readonly<{
  tagRef: string;
  eventSha: string;
}> {
  if (args.length !== 2 || args[0] === undefined || args[1] === undefined) {
    throw new Error(
      "用法：validate-release-tag <完整 tag ref> <事件 commit SHA>",
    );
  }
  return { tagRef: args[0], eventSha: args[1] };
}

function parseStableTagRef(tagRef: string): string {
  const match = stableTagPattern.exec(tagRef);
  if (match?.[0] !== tagRef) {
    throw new Error("release ref 必须是稳定的 refs/tags/vX.Y.Z");
  }
  return tagRef.slice(tagRefPrefix.length);
}

function verifyEventSha(eventSha: string): void {
  if (!commitPattern.test(eventSha)) {
    throw new Error("事件 SHA 必须是完整的小写 commit SHA");
  }
}

function verifyAnnotatedTag(tagRef: string): void {
  gitOutput(["rev-parse", "--verify", `${tagRef}^{tag}`]);
}

function gitOutput(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function verifyPackageVersions(version: string): Promise<void> {
  const manifests = await Promise.all(
    ["packages/lib/package.json", "packages/testing/package.json"].map(
      async (path) => {
        const text = await readFile(resolve(repositoryRoot, path), "utf8");
        return parseManifest(text, path);
      },
    ),
  );

  for (const manifest of manifests) {
    if (manifest.version !== version) {
      throw new Error("tag 版本必须与两个 package manifest 完全一致");
    }
  }
}

function parseManifest(
  text: string,
  path: string,
): Readonly<{ version: string }> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${path} 不是有效 JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as Readonly<Record<string, unknown>>).version !== "string"
  ) {
    throw new Error(`${path} 缺少字符串 version`);
  }
  return {
    version: (value as Readonly<Record<string, unknown>>).version as string,
  };
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`发布 tag 校验失败：${detail}\n`);
  process.exitCode = 1;
});
