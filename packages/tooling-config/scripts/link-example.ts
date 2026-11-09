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
  throw new TypeError("公共包元数据缺少有效的 name、version 或 exports");
}
const coreMetadata =
  manifest.name === "@ykdz/cli-contract"
    ? manifest
    : await readCoreMetadata(directory, manifest.version);
const coreVersion = coreMetadata.version;
if (typeof coreVersion !== "string") {
  throw new TypeError("core 包元数据缺少有效的 version");
}
const sourceTag = encodeURIComponent(`@ykdz/cli-contract@${coreVersion}`);
const url = `https://github.com/YKDZ/cli-contract/tree/${sourceTag}/packages/example`;
const entries = new Set<string>();
for (const exported of Object.values(manifest.exports)) {
  if (!isRecord(exported)) throw new TypeError("示例包 exports 项必须是对象");
  for (const entry of Object.values(exported)) {
    if (typeof entry !== "string")
      throw new TypeError("示例包 exports 路径必须是字符串");
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
    content = content.replace(/^\/\*\* 完整示例：.*? \*\/\n/, "");
    content = `/** 完整示例：${url} */\n${content}`;
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
    throw new TypeError("testing 构建需要有效的 core 包元数据");
  }
  if (value.version !== packageVersion) {
    throw new Error("core 与 testing 构建版本不一致");
  }
  return { version: value.version };
}
