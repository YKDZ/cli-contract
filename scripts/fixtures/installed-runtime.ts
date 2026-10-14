/* oxlint-disable unicorn/no-thenable -- then 是 when 条件的公开分支名。 */
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

assert.throws(
  () =>
    Reflect.apply(coreModule.helpCapability, coreModule, [
      {
        wording: {
          choises: "候选 {choices}",
          defalt: "默认 {value}",
        },
      },
    ]),
  (error: unknown) => {
    if (typeof error !== "object" || error === null) return false;
    assert.ok(error instanceof coreModule.ContractDefinitionError);
    assert.deepEqual(Reflect.get(error, "issues"), [
      {
        code: "unknownDefinitionProperty",
        path: ["help", "wording", "choises"],
      },
      {
        code: "unknownDefinitionProperty",
        path: ["help", "wording", "defalt"],
      },
    ]);
    return true;
  },
);

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
    if (
      typeof error !== "object" ||
      error === null ||
      !(error instanceof coreModule.ContractDefinitionError)
    ) {
      return false;
    }
    assert.deepEqual(Reflect.get(error, "issues"), [
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
      String(Reflect.get(error, "message")),
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

type JsonSchemaValidation = (value: unknown) => boolean;
type JsonSchemaValidatorConstructor = new (options?: unknown) => {
  compile(schema: unknown): JsonSchemaValidation;
};

function isJsonSchemaValidatorConstructor(
  value: unknown,
): value is JsonSchemaValidatorConstructor {
  if (typeof value !== "function") return false;
  const prototype = Reflect.get(value, "prototype");
  return (
    typeof prototype === "object" &&
    prototype !== null &&
    typeof Reflect.get(prototype, "compile") === "function"
  );
}

const validatorNamespace: unknown = await import(
  import.meta.resolve("ajv/dist/2020.js")
);
const Ajv2020 = readProperty(validatorNamespace, "default");
if (!isJsonSchemaValidatorConstructor(Ajv2020)) {
  throw new TypeError("消费者安装的 Draft 2020-12 验证器无效");
}

const constrainedInputSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.test/installed-consumer-input",
  $defs: {
    reference: { const: "stable", type: "string" },
  },
  additionalProperties: false,
  properties: {
    format: { enum: ["json", "yaml"], type: "string" },
    mode: { enum: ["live", "after"], type: "string" },
    quiet: { type: "boolean" },
    reference: { $ref: "#/$defs/reference", type: "string" },
  },
  required: ["reference"],
  type: "object",
};
const constrainedStandardSchema = {
  "~standard": {
    version: 1,
    vendor: "installed-consumer",
    validate(value: unknown) {
      return { value };
    },
    jsonSchema: {
      input: () => constrainedInputSchema,
      output: () => constrainedInputSchema,
    },
  },
};
let constrainedHandlerExecutions = 0;
const constrainedCli = coreModule.defineCli()({
  root: "installedFacts",
  help: coreModule.helpCapability({
    wording: {
      choices: "候选 {choices}",
      whenThenOtherwise: "当全部满足 {facts} 时，{then}；否则，{otherwise}",
      require: "必须提供 {fields}",
      present: "字段 {field} 已出现",
      equals: "字段 {field}={value}",
      forbiddenCombination: "禁配事实：{facts}",
      countAtMost: "字段数 {fields} 至多 {max} 项",
    },
  }),
  output: coreModule.outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    installedFacts: {
      kind: "rootCommand",
      name: "installed-facts",
      description: "安装消费事实",
      fields: {
        format: {
          kind: "valueOption",
          longOption: "--format",
          description: "格式",
        },
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        quiet: {
          kind: "flag",
          longOption: "--quiet",
          description: "静默",
        },
        reference: {
          kind: "valueOption",
          longOption: "--reference",
          description: "引用值",
        },
      },
      input: constrainedStandardSchema,
      usageConstraints: [
        {
          kind: "count",
          fields: ["format", "quiet"],
          max: 1,
        },
        {
          kind: "when",
          all: [{ kind: "equals", field: "mode", value: "after" }],
          then: { require: ["quiet"] },
          otherwise: { require: ["format"] },
        },
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "format", value: "json" },
            { kind: "present", field: "quiet" },
          ],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler() {
        constrainedHandlerExecutions += 1;
      },
    },
  },
});

const invalidConstraintDefinition: unknown = {
  root: "workspace",
  help: coreModule.helpCapability({
    wording: {
      commandPlaceholder: "命令",
      choices: "候选 {choices}",
      present: "字段 {field} 已出现",
      equals: "字段 {field}={value}",
      forbiddenCombination: "禁配事实：{facts}",
    },
  }),
  output: coreModule.outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    probe: {
      kind: "command",
      parent: "workspace",
      name: "probe",
      description: "检查约束",
      fields: {
        format: {
          kind: "valueOption",
          longOption: "--format",
          description: "格式",
        },
        mode: {
          kind: "valueOption",
          longOption: "--mode",
          description: "模式",
        },
        quiet: {
          kind: "flag",
          longOption: "--quiet",
          description: "静默",
        },
        reference: {
          kind: "valueOption",
          longOption: "--reference",
          description: "引用值",
        },
      },
      input: constrainedStandardSchema,
      usageConstraints: [
        {
          kind: "forbiddenCombination",
          all: [
            { kind: "equals", field: "missing", value: "json" },
            42,
            { kind: "equals", field: "format", value: "toml" },
          ],
        },
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "format", value: 42 }],
        },
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "format", value: null }],
        },
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "format", value: { nested: true } }],
        },
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "format", value: undefined }],
        },
        {
          kind: "forbiddenCombination",
          all: [{ kind: "equals", field: "format" }],
        },
        {
          kind: "forbiddenCombination",
          all: [{ kind: "present", field: "format", typo: true }],
        },
      ],
      success: { kind: "completion" },
      failures: {},
      handler() {},
    },
  },
};
assert.throws(
  () =>
    Reflect.apply(coreModule.defineCli(), undefined, [
      invalidConstraintDefinition,
    ]),
  (error: unknown) => {
    if (
      typeof error !== "object" ||
      error === null ||
      !(error instanceof coreModule.ContractDefinitionError)
    ) {
      return false;
    }
    assert.deepEqual(Reflect.get(error, "issues"), [
      {
        code: "unknownDefinitionProperty",
        path: [
          "commands",
          "probe",
          "usageConstraints",
          "6",
          "all",
          "0",
          "typo",
        ],
      },
      {
        code: "invalidUsageConstraint",
        command: "probe",
        index: 0,
        aspect: "members",
        received: 42,
        member: "all",
        path: ["commands", "probe", "usageConstraints", 0, "all", 1],
        expected: "present 或 equals 字段事实对象",
      },
      {
        code: "unknownUsageConstraintField",
        command: "probe",
        constraint: "forbiddenCombination",
        index: 0,
        member: "all.field",
        field: "missing",
      },
      {
        code: "invalidUsageConstraintValue",
        command: "probe",
        constraint: "forbiddenCombination",
        index: 0,
        member: "all.value",
        field: "format",
        actual: "toml",
        expected: ["json", "yaml"],
      },
      {
        code: "invalidUsageConstraintValue",
        command: "probe",
        constraint: "forbiddenCombination",
        index: 1,
        member: "all.value",
        field: "format",
        actual: 42,
        expected: ["json", "yaml"],
      },
      {
        code: "invalidUsageConstraintValue",
        command: "probe",
        constraint: "forbiddenCombination",
        index: 2,
        member: "all.value",
        field: "format",
        actual: null,
        expected: ["json", "yaml"],
      },
      {
        code: "invalidUsageConstraintValue",
        command: "probe",
        constraint: "forbiddenCombination",
        index: 3,
        member: "all.value",
        field: "format",
        actual: { nested: true },
        expected: ["json", "yaml"],
      },
      {
        code: "invalidUsageConstraintValue",
        command: "probe",
        constraint: "forbiddenCombination",
        index: 4,
        member: "all.value",
        field: "format",
        actual: undefined,
        expected: ["json", "yaml"],
      },
      {
        code: "invalidUsageConstraint",
        command: "probe",
        index: 5,
        aspect: "members",
        received: "equals",
        member: "all",
        path: ["commands", "probe", "usageConstraints", 5, "all", 0],
        expected: "present{field} 或 equals{field,value}",
      },
    ]);
    return true;
  },
);

assert.equal(constrainedCli.manifest.schemaVersion, "4");
const projectedInput =
  constrainedCli.manifest.commands.installedFacts.input.inputSchema;
assert.equal(readProperty(projectedInput, "$id"), constrainedInputSchema.$id);
const projectedDefinitions = readProperty(projectedInput, "$defs");
assert.deepEqual(
  readProperty(projectedDefinitions, "reference"),
  constrainedInputSchema.$defs.reference,
);
if (typeof projectedDefinitions !== "object" || projectedDefinitions === null) {
  throw new TypeError("count 投影缺少模式定义");
}
assert.equal(
  readProperty(
    readProperty(readProperty(projectedInput, "properties"), "reference"),
    "$ref",
  ),
  "#/$defs/reference",
);

const validateBaseInput = new Ajv2020({ strict: false }).compile(
  constrainedInputSchema,
);
const validateProjectedInput = new Ajv2020({ strict: false }).compile(
  projectedInput,
);
const rawForbiddenInput = {
  format: "json",
  quiet: true,
  reference: "stable",
};
assert.equal(validateBaseInput(rawForbiddenInput), true);
assert.equal(validateProjectedInput(rawForbiddenInput), false);

const countOnlyInput = {
  format: "yaml",
  quiet: true,
  reference: "stable",
};
assert.equal(validateBaseInput(countOnlyInput), true);
assert.equal(validateProjectedInput(countOnlyInput), false);

const countOnlyInvocation = coreModule.parseCliInvocation(constrainedCli, [
  "--format",
  "yaml",
  "--quiet",
  "--reference",
  "stable",
]);
assert.deepEqual(countOnlyInvocation.issues, [
  {
    code: "countConstraintViolation",
    min: 0,
    max: 1,
    presentFields: ["format", "quiet"],
    absentFields: [],
  },
]);
const rawThenMissingQuiet = {
  format: "json",
  mode: "after",
  reference: "stable",
};
const rawOtherwiseMissingFormat = { reference: "stable" };
const rawThenAllowedInput = {
  mode: "after",
  quiet: true,
  reference: "stable",
};
const rawOtherwiseAllowedInput = {
  format: "yaml",
  mode: "live",
  reference: "stable",
};
for (const raw of [
  rawThenMissingQuiet,
  rawOtherwiseMissingFormat,
  rawThenAllowedInput,
  rawOtherwiseAllowedInput,
]) {
  assert.equal(validateBaseInput(raw), true);
}
assert.equal(validateProjectedInput(rawThenMissingQuiet), false);
assert.equal(validateProjectedInput(rawOtherwiseMissingFormat), false);
assert.equal(validateProjectedInput(rawThenAllowedInput), true);
assert.equal(validateProjectedInput(rawOtherwiseAllowedInput), true);

const allowedInvocation = coreModule.parseCliInvocation(constrainedCli, [
  "--format",
  "json",
  "--reference",
  "stable",
]);
assert.equal(allowedInvocation.kind, "parsed");
assert.equal(validateProjectedInput(allowedInvocation.input), true);

const forbiddenInvocation = coreModule.parseCliInvocation(constrainedCli, [
  "--format",
  "json",
  "--quiet",
  "--reference",
  "stable",
]);
const expectedFacts = [
  { kind: "equals", field: "format", value: "json" },
  { kind: "present", field: "quiet" },
];
assert.equal(forbiddenInvocation.kind, "usageFailure");
assert.deepEqual(forbiddenInvocation.issues, [
  {
    code: "countConstraintViolation",
    min: 0,
    max: 1,
    presentFields: ["format", "quiet"],
    absentFields: [],
  },
  { code: "forbiddenCombinationViolation", facts: expectedFacts },
]);

const thenViolation = coreModule.parseCliInvocation(constrainedCli, [
  "--mode",
  "after",
  "--format",
  "json",
  "--reference",
  "stable",
]);
const expectedThenIssue = {
  code: "conditionalConstraintViolation",
  branch: "then",
  conditions: [
    {
      kind: "equals",
      field: "mode",
      expected: "after",
      present: true,
      actual: "after",
    },
  ],
  missingRequiredFields: ["quiet"],
  presentForbiddenFields: [],
};
assert.equal(thenViolation.kind, "usageFailure");
assert.deepEqual(thenViolation.issues, [expectedThenIssue]);

const otherwiseViolation = coreModule.parseCliInvocation(constrainedCli, [
  "--reference",
  "stable",
]);
const expectedOtherwiseIssue = {
  code: "conditionalConstraintViolation",
  branch: "otherwise",
  conditions: [
    {
      kind: "equals",
      field: "mode",
      expected: "after",
      present: false,
    },
  ],
  missingRequiredFields: ["format"],
  presentForbiddenFields: [],
};
assert.equal(otherwiseViolation.kind, "usageFailure");
assert.deepEqual(otherwiseViolation.issues, [expectedOtherwiseIssue]);

const outsideExpectedViolation = coreModule.parseCliInvocation(constrainedCli, [
  "--mode",
  "outside",
  "--reference",
  "stable",
]);
assert.equal(outsideExpectedViolation.kind, "usageFailure");
assert.deepEqual(outsideExpectedViolation.issues, [
  {
    code: "invalidFieldChoice",
    position: 1,
    field: "mode",
    value: "outside",
    choices: ["live", "after"],
  },
  {
    ...expectedOtherwiseIssue,
    conditions: [
      {
        kind: "equals",
        field: "mode",
        expected: "after",
        present: true,
        actual: "outside",
      },
    ],
  },
]);

const usageWrites: Array<Readonly<{ destination: string; chunk: string }>> = [];
const usageTermination = await coreModule.executeCli(constrainedCli, {
  invocation: forbiddenInvocation,
  dependencies: undefined,
  write(output: Readonly<{ destination: string; chunk: string }>) {
    usageWrites.push(output);
  },
});
assert.deepEqual(usageTermination, {
  kind: "usageFailure",
  command: "installedFacts",
  issues: [
    {
      code: "countConstraintViolation",
      min: 0,
      max: 1,
      presentFields: ["format", "quiet"],
      absentFields: [],
    },
    { code: "forbiddenCombinationViolation", facts: expectedFacts },
  ],
  exitCode: 64,
});
assert.equal(usageWrites.length, 1);
const usageEnvelope: unknown = JSON.parse(usageWrites[0]!.chunk);
assert.equal(readProperty(usageEnvelope, "schemaVersion"), "2");
assert.deepEqual(readProperty(usageEnvelope, "issues"), [
  {
    code: "countConstraintViolation",
    min: 0,
    max: 1,
    presentFields: ["format", "quiet"],
    absentFields: [],
  },
  { code: "forbiddenCombinationViolation", facts: expectedFacts },
]);
const validateUsageWire = new Ajv2020({ strict: false }).compile(
  constrainedCli.manifest.usageFailure.wire,
);
assert.equal(validateUsageWire(usageEnvelope), true);

const conditionalTermination = await coreModule.executeCli(constrainedCli, {
  invocation: thenViolation,
  dependencies: undefined,
  write(output: Readonly<{ destination: string; chunk: string }>) {
    usageWrites.push(output);
  },
});
assert.deepEqual(conditionalTermination, {
  kind: "usageFailure",
  command: "installedFacts",
  issues: [expectedThenIssue],
  exitCode: 64,
});
assert.equal(usageWrites.length, 2);
const conditionalEnvelope: unknown = JSON.parse(usageWrites[1]!.chunk);
assert.deepEqual(readProperty(conditionalEnvelope, "issues"), [
  expectedThenIssue,
]);
assert.equal(validateUsageWire(conditionalEnvelope), true);

const conditionalCapture = await testingModule.runCliScenario({
  cliContract: constrainedCli,
  argv: ["--mode", "after", "--format", "json", "--reference", "stable"],
  dependencies: undefined,
});
assert.deepEqual(conditionalCapture.termination, conditionalTermination);
assert.equal(constrainedHandlerExecutions, 0);

const helpWrites: Array<Readonly<{ destination: string; chunk: string }>> = [];
const helpTermination = await coreModule.executeCli(constrainedCli, {
  invocation: coreModule.parseCliInvocation(constrainedCli, ["--help"]),
  dependencies: undefined,
  write(output: Readonly<{ destination: string; chunk: string }>) {
    helpWrites.push(output);
  },
});
assert.deepEqual(helpTermination, {
  kind: "help",
  command: "installedFacts",
  exitCode: 0,
});
assert.equal(helpWrites.length, 1);
assert.match(helpWrites[0]!.chunk, /字段数 format, quiet 至多 1 项/u);
assert.match(
  helpWrites[0]!.chunk,
  /禁配事实：字段 format="json", 字段 quiet 已出现/u,
);
assert.match(
  helpWrites[0]!.chunk,
  /当全部满足 字段 mode="after" 时，必须提供 quiet；否则，必须提供 format/u,
);
