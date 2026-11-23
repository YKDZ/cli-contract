#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const directory = process.cwd();
const manifest: unknown = JSON.parse(
  await readFile(resolve(directory, "package.json"), "utf8"),
);
if (
  !isRecord(manifest) ||
  (manifest.name !== "@ykdz/cli-contract" &&
    manifest.name !== "@ykdz/cli-contract-testing") ||
  typeof manifest.version !== "string" ||
  !isRecord(manifest.exports)
) {
  throw new TypeError(
    "Public package metadata is missing a valid name, version, or exports",
  );
}
const coreMetadata =
  manifest.name === "@ykdz/cli-contract"
    ? manifest
    : await readCoreMetadata(directory, manifest.version);
const coreVersion = coreMetadata.version;
if (typeof coreVersion !== "string") {
  throw new TypeError("core package metadata is missing a valid version");
}
const sourceTag = encodeURIComponent(`@ykdz/cli-contract@${coreVersion}`);
const url = `https://github.com/YKDZ/cli-contract/tree/${sourceTag}/packages/example`;
const entries = new Set<string>();
for (const exported of Object.values(manifest.exports)) {
  if (!isRecord(exported))
    throw new TypeError("Package exports entries must be objects");
  for (const entry of Object.values(exported)) {
    if (typeof entry !== "string")
      throw new TypeError("Package exports paths must be strings");
    entries.add(resolve(directory, entry));
  }
}

for (const entry of await readdir(resolve(directory, "dist"), {
  recursive: true,
})) {
  if (!entry.endsWith(".js") && !entry.endsWith(".d.ts")) continue;
  const file = resolve(directory, "dist", entry);
  const original = await readFile(file, "utf8");
  let content = original.replaceAll(
    /https:\/\/github\.com\/YKDZ\/cli-contract\/tree\/[^/]+\/packages\/example/g,
    url,
  );
  if (entries.has(file)) {
    content = content.replace(/^\/\*\* Full example: .*? \*\/\n/, "");
    content = `/** Full example: ${url} */\n${content}`;
  }
  if (content !== original) await writeFile(file, content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readCoreMetadata(
  packageDirectory: string,
  packageVersion: string,
): Promise<Readonly<{ version: string }>> {
  const require = createRequire(resolve(packageDirectory, "package.json"));
  const path = require.resolve("@ykdz/cli-contract/package.json");
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value) || typeof value.version !== "string") {
    throw new TypeError(
      "The testing build requires valid core package metadata",
    );
  }
  if (value.version !== packageVersion) {
    throw new Error("core and testing build versions do not match");
  }
  return { version: value.version };
}
