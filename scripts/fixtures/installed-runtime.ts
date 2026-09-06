import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = import.meta.dirname;
const repository = process.env.CANDIDATE_REPOSITORY_ROOT;
if (!repository) throw new Error("缺少仓库位置");
const imports = {
  core: "@ykdz/cli-contract",
  coreNode: "@ykdz/cli-contract/node",
  testing: "@ykdz/cli-contract-testing",
};
const paths = Object.fromEntries(
  Object.entries(imports).map(([key, specifier]) => [
    key,
    realpathSync(fileURLToPath(import.meta.resolve(specifier))),
  ]),
);
for (const path of Object.values(paths)) {
  if (
    !within(resolve(project, "node_modules"), path) ||
    within(repository, path)
  ) {
    throw new Error(`公共入口未来自独立安装：${path}`);
  }
}
const { core, testing } = paths;
if (!core || !testing) throw new Error("缺少公共入口");
if (
  realpathSync(createRequire(pathToFileURL(testing)).resolve(imports.core)) !==
  core
) {
  throw new Error("testing 与消费者使用了不同的 core 实例");
}

function within(directory: string, path: string): boolean {
  const from = relative(directory, path);
  return (
    from !== "" &&
    from !== ".." &&
    !isAbsolute(from) &&
    !from.startsWith(`..${sep}`)
  );
}

const coreModule = await import(imports.core);
const nodeModule = await import(imports.coreNode);
const testingModule = await import(imports.testing);
if (
  typeof coreModule.defineCli !== "function" ||
  typeof nodeModule.nodeCliOutput !== "function" ||
  typeof testingModule.runCliScenario !== "function"
) {
  throw new Error("公共入口缺少预期导出");
}
