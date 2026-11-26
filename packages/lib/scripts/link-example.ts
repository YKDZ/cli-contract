import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(import.meta.dirname, "..");
const manifest: unknown = JSON.parse(
  await readFile(resolve(directory, "package.json"), "utf8"),
);
if (
  !isRecord(manifest) ||
  manifest.name !== "@boringparts/cli-contract" ||
  typeof manifest.version !== "string" ||
  manifest.version.length === 0 ||
  !isRecord(manifest.exports)
) {
  throw new TypeError(
    "Public package metadata is missing a valid name, version, or exports",
  );
}
const sourceTag = encodeURIComponent(
  `@boringparts/cli-contract@${manifest.version}`,
);
const url = `https://github.com/boringparts/cli-contract/tree/${sourceTag}/packages/example`;
const entries = new Set<string>();
for (const exported of Object.values(manifest.exports)) {
  if (!isRecord(exported))
    throw new TypeError("Package exports entries must be objects");
  for (const entry of Object.values(exported)) {
    if (typeof entry !== "string")
      throw new TypeError("Package exports paths must be strings");
    if (entry.endsWith(".js") || entry.endsWith(".d.ts")) {
      entries.add(resolve(directory, entry));
    }
  }
}

for (const entry of await readdir(resolve(directory, "dist"), {
  recursive: true,
})) {
  if (!entry.endsWith(".js") && !entry.endsWith(".d.ts")) continue;
  const file = resolve(directory, "dist", entry);
  const original = await readFile(file, "utf8");
  let content = original.replaceAll(
    /https:\/\/github\.com\/boringparts\/cli-contract\/tree\/[^/]+\/packages\/example/g,
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
