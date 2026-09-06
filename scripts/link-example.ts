import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = process.cwd();
const manifest = JSON.parse(
  await readFile(resolve(directory, "package.json"), "utf8"),
) as {
  version: string;
  exports: Record<string, Record<string, string>>;
};
const url = `https://github.com/YKDZ/cli-contract/tree/v${manifest.version}/packages/example`;
const entries = new Set(
  Object.values(manifest.exports)
    .flatMap((entry) => Object.values(entry))
    .map((entry) => resolve(directory, entry)),
);

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
