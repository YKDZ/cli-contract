import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = process.cwd();
const manifest: unknown = JSON.parse(
  await readFile(resolve(directory, "package.json"), "utf8"),
);
if (
  !isRecord(manifest) ||
  typeof manifest.version !== "string" ||
  !isRecord(manifest.exports)
) {
  throw new TypeError("示例包元数据缺少有效的 version 或 exports");
}
const url = `https://github.com/YKDZ/cli-contract/tree/v${manifest.version}/packages/example`;
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
