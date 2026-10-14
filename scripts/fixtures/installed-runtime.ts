import assert from "node:assert/strict";
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

function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !Reflect.has(value, key)) {
    return undefined;
  }
  return Reflect.get(value, key);
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

const privateText = "安装消费者私有文本";
assert.throws(
  () =>
    Reflect.apply(coreModule.text.lines, coreModule.text, [
      ["有效文本", `${privateText}\r内容`],
    ]),
  (error: unknown) => {
    if (!(error instanceof TypeError)) return false;
    assert.ok(error instanceof coreModule.TextValueError);
    const issue = Reflect.get(error, "issue");
    assert.equal(error.message, "invalidTextLines");
    assert.deepEqual(issue, {
      code: "invalidTextLines",
      reason: "carriageReturn",
      line: 1,
    });
    assert.equal(
      `${error.message} ${JSON.stringify(issue)}`.includes(privateText),
      false,
    );
    return true;
  },
);

const emptyJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: {},
  type: "object",
};

for (const withValue of [false, true]) {
  let handlerCalled = false;
  const inputSchema = {
    "~standard": {
      version: 1,
      vendor: "installed-consumer",
      validate() {
        if (withValue) {
          const failureWithValue = { issues: [], value: {} };
          return failureWithValue;
        }
        return { issues: [] };
      },
      jsonSchema: {
        input() {
          return emptyJsonSchema;
        },
        output() {
          return emptyJsonSchema;
        },
      },
    },
  };
  const cli = coreModule.defineCli()({
    root: "standard",
    help: coreModule.helpCapability(),
    output: coreModule.outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      standard: {
        kind: "rootCommand",
        name: "standard",
        description: "Standard Schema consumer",
        input: inputSchema,
        success: { kind: "completion" },
        failures: {},
        handler() {
          handlerCalled = true;
        },
      },
    },
  });
  const capture = await testingModule.runCliScenario({
    cliContract: cli,
    argv: [],
    dependencies: undefined,
  });
  const issue = { code: "inputRejected", evidence: [] };
  const usageScopes = readProperty(cli.manifest.usageFailure.wire, "oneOf");
  assert.ok(Array.isArray(usageScopes));
  const usageProperties = readProperty(usageScopes[0], "properties");
  const lineSchemaVersion = readProperty(
    readProperty(usageProperties, "schemaVersion"),
    "const",
  );
  const issuesSchema = readProperty(usageProperties, "issues");
  const issueVariants = readProperty(
    readProperty(issuesSchema, "items"),
    "oneOf",
  );
  assert.ok(Array.isArray(issueVariants));
  const inputRejected = issueVariants.find((variant: unknown) => {
    const properties = readProperty(variant, "properties");
    return (
      readProperty(readProperty(properties, "code"), "const") ===
      "inputRejected"
    );
  });
  assert.ok(inputRejected !== undefined);
  const evidence = readProperty(
    readProperty(inputRejected, "properties"),
    "evidence",
  );
  assert.equal(readProperty(evidence, "type"), "array");
  assert.equal(readProperty(evidence, "minItems"), undefined);

  assert.deepEqual(capture.termination, {
    kind: "usageFailure",
    command: "standard",
    issues: [issue],
    exitCode: 64,
  });
  assert.equal(capture.stdout, "");
  assert.deepEqual(JSON.parse(capture.stderr), {
    schemaVersion: lineSchemaVersion,
    command: "standard",
    kind: "usageFailure",
    issues: [issue],
    usage: "standard",
    helpArgv: ["standard", "--help"],
  });
  assert.equal(capture.stderr.endsWith("\n"), true);
  assert.equal(handlerCalled, false);
}
