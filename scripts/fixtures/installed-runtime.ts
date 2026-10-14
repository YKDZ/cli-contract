import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ContractDefinitionError } from "@ykdz/cli-contract";

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

const installedTextSchema = {
  "~standard": {
    version: 1,
    vendor: "installed-consumer-text-diagnostics",
    validate() {
      return { value: {} };
    },
    jsonSchema: {
      input() {
        return {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          additionalProperties: false,
          properties: {},
          type: "object",
        };
      },
      output() {
        return {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          additionalProperties: false,
          properties: {},
          type: "object",
        };
      },
    },
  },
};
const define = coreModule.defineCli();
const installedHelp = coreModule.helpCapability({
  wording: {
    commandPlaceholder: "command",
    choices: "(choices: {choices})",
    default: "(default: {value})",
    requires: "{field} requires {requires}",
    exclusive: "exclusive {fields}",
    forbiddenCombination: "forbidden {values}",
  },
});
let handlerCalled = false;
assert.throws(
  () =>
    define({
      root: "workspace",
      help: installedHelp,
      output: coreModule.outputCapability({ defaultFormat: "text" }),
      usageFailureExitCode: 64,
      commands: {
        workspace: {
          kind: "rootGroup",
          name: "workspace",
          description: "工作区",
        },
        ...define.command("inspect")({
          kind: "command",
          parent: "workspace",
          name: "inspect",
          description: "检查",
          input: installedTextSchema,
          success: { kind: "completion" },
          failures: {},
          handler() {
            handlerCalled = true;
          },
        }),
        ...define.command("show")({
          kind: "command",
          parent: "workspace",
          name: "show",
          description: "显示",
          input: installedTextSchema,
          success: { kind: "completion" },
          failures: {},
          handler() {
            handlerCalled = true;
          },
        }),
      },
    }),
  (error) => {
    if (typeof error !== "object" || error === null) return false;
    assert.ok(error instanceof coreModule.ContractDefinitionError);
    assert.deepEqual(Reflect.get(error, "issues"), [
      {
        code: "missingTextPresenter",
        command: "inspect",
        location: "completion",
      },
      {
        code: "missingTextPresenter",
        command: "show",
        location: "completion",
      },
    ]);
    return true;
  },
);
assert.equal(handlerCalled, false);

handlerCalled = false;
assert.throws(
  () =>
    define({
      root: "workspace",
      help: installedHelp,
      output: coreModule.outputCapability({ defaultFormat: "structured" }),
      usageFailureExitCode: 64,
      commands: {
        workspace: {
          kind: "rootGroup",
          name: "workspace",
          description: "工作区",
        },
        ...define.command("inspect")({
          kind: "command",
          parent: "workspace",
          name: "inspect",
          description: "检查",
          input: installedTextSchema,
          success: {
            kind: "completion",
            text: () => coreModule.text.silent,
          },
          failures: {
            permissionDenied: {
              description: "无权限",
              schema: installedTextSchema,
              exitCode: 13,
              text: () => coreModule.text.line("无权限"),
            },
          },
          handler() {
            handlerCalled = true;
          },
        }),
      },
    }),
  (error) => {
    if (typeof error !== "object" || error === null) return false;
    assert.ok(error instanceof coreModule.ContractDefinitionError);
    assert.deepEqual(Reflect.get(error, "issues"), [
      {
        code: "unexpectedTextPresenter",
        command: "inspect",
        location: "completion",
      },
      {
        code: "unexpectedTextPresenter",
        command: "inspect",
        location: "failure",
        variant: "permissionDenied",
      },
    ]);
    return true;
  },
);
assert.equal(handlerCalled, false);

const emptyJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: {},
  type: "object",
};

const incompatibleInputSchema = {
  "~standard": {
    version: 1,
    vendor: "installed-consumer",
    validate(value: unknown) {
      return { value };
    },
    jsonSchema: {
      input() {
        return {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          properties: { count: { type: "number" } },
          required: ["count"],
          type: "object",
        };
      },
      output() {
        return {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          properties: { count: { type: "number" } },
          required: ["count"],
          type: "object",
        };
      },
    },
  },
};

assert.throws(
  () =>
    coreModule.defineCli()({
      root: "rawMismatch",
      help: coreModule.helpCapability(),
      output: coreModule.outputCapability({ defaultFormat: "structured" }),
      usageFailureExitCode: 64,
      commands: {
        rawMismatch: {
          kind: "rootCommand",
          name: "raw-mismatch",
          description: "Raw mismatch",
          fields: {
            count: {
              kind: "valueOption",
              longOption: "--count",
              description: "Count",
            },
          },
          input: incompatibleInputSchema,
          success: { kind: "completion" },
          failures: {},
          handler({
            outcome,
          }: {
            readonly outcome: { completion(): unknown };
          }) {
            return outcome.completion();
          },
        },
      },
    }),
  (error: unknown) => {
    assert.ok(error instanceof ContractDefinitionError);
    assert.deepEqual(error.issues, [
      {
        code: "schemaFieldDoesNotAcceptRawValue",
        command: "rawMismatch",
        location: "input",
        fields: [
          {
            field: "count",
            path: ["commands", "rawMismatch", "input", "properties", "count"],
            expected: "string",
            received: { type: "number" },
          },
        ],
      },
    ]);
    assert.match(
      error.message,
      /命令 rawMismatch 的输入字段 count（commands\.rawMismatch\.input\.properties\.count）需要 raw string，实际输入模式属性为 \{"type":"number"\}/,
    );
    return true;
  },
);

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
