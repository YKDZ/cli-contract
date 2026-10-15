import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  outputCapability,
  parseCliInvocation,
} from "@ykdz/cli-contract";
import { z } from "zod";

function createCopyCli() {
  return defineCli()({
    root: "copyFiles",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      copyFiles: {
        kind: "rootCommand",
        name: "copy-files",
        description: "复制文件",
        fields: {
          source: {
            kind: "positional",
            description: "源文件",
          },
          destination: {
            kind: "positional",
            description: "目标文件",
          },
          force: {
            kind: "flag",
            longOption: "--force",
            shortAlias: "-f",
            description: "覆盖目标文件",
          },
          label: {
            kind: "valueOption",
            longOption: "--label",
            shortAlias: "-l",
            description: "复制标签",
          },
        },
        input: z.object({
          source: z.string(),
          destination: z.string().optional(),
          force: z.boolean().optional(),
          label: z.string().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  });
}

void test("基础 argv 语法归一化 positional、flag、option、alias 与 --", () => {
  const cli = createCopyCli();

  assert.deepEqual(
    parseCliInvocation(cli, [
      "--force",
      "source.txt",
      "-l",
      "release",
      "--",
      "--archive",
    ]),
    {
      kind: "parsed",
      command: "copyFiles",
      input: {
        source: "source.txt",
        destination: "--archive",
        force: true,
        label: "release",
      },
      outputFormat: "structured",
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--label=nightly"]), {
    kind: "parsed",
    command: "copyFiles",
    input: { source: "source.txt", label: "nightly" },
    outputFormat: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "-f"]), {
    kind: "parsed",
    command: "copyFiles",
    input: { source: "source.txt", force: true },
    outputFormat: "structured",
  });
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--help"]), {
    kind: "help",
    command: "copyFiles",
  });
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--", "--help"]), {
    kind: "parsed",
    command: "copyFiles",
    input: { source: "source.txt", destination: "--help" },
    outputFormat: "structured",
  });
});

void test("词法问题保留首个可靠 token、字段与 spelling 事实", () => {
  const cli = createCopyCli();
  const usage = {
    command: "copyFiles",
    synopsis: "copy-files <source> [<destination>] [--force] [--label <label>]",
  } as const;

  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--unknown", "x"]), {
    kind: "usageFailure",
    command: "copyFiles",
    issues: [{ code: "unknownOption", position: 1, option: "--unknown" }],
    usage,
  });
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--label"]), {
    kind: "usageFailure",
    command: "copyFiles",
    issues: [
      {
        code: "missingOptionValue",
        position: 1,
        field: "label",
        option: "--label",
      },
    ],
    usage,
  });
  assert.deepEqual(
    parseCliInvocation(cli, ["source.txt", "--label", "--unknown", "later"]),
    {
      kind: "usageFailure",
      command: "copyFiles",
      issues: [
        {
          code: "missingOptionValue",
          position: 1,
          field: "label",
          option: "--label",
        },
      ],
      usage,
    },
  );
  assert.deepEqual(parseCliInvocation(cli, ["source.txt", "--force=yes"]), {
    kind: "usageFailure",
    command: "copyFiles",
    issues: [
      {
        code: "unexpectedOptionValue",
        position: 1,
        field: "force",
        option: "--force",
        value: "yes",
      },
    ],
    usage,
  });
  for (const option of ["-l=value", "-lvalue", "-fl"]) {
    assert.deepEqual(parseCliInvocation(cli, ["source.txt", option]), {
      kind: "usageFailure",
      command: "copyFiles",
      issues: [{ code: "unknownOption", position: 1, option }],
      usage,
    });
  }
  assert.deepEqual(parseCliInvocation(cli, ["one", "two", "three"]), {
    kind: "usageFailure",
    command: "copyFiles",
    issues: [{ code: "unexpectedPositional", position: 2, value: "three" }],
    usage,
  });
});

void test("字段事实从同一 grammar 投影到 usage、help 与 manifest", async () => {
  const cli = createCopyCli();
  const fields = [
    {
      kind: "positional",
      key: "source",
      description: "源文件",
      required: true,
    },
    {
      kind: "positional",
      key: "destination",
      description: "目标文件",
      required: false,
    },
    {
      kind: "flag",
      key: "force",
      longOption: "--force",
      shortAlias: "-f",
      description: "覆盖目标文件",
      required: false,
    },
    {
      kind: "valueOption",
      key: "label",
      longOption: "--label",
      shortAlias: "-l",
      description: "复制标签",
      required: false,
    },
  ] as const;

  assert.deepEqual(cli.grammar.root.fields, fields);
  assert.strictEqual(
    cli.grammar.root.fields,
    cli.manifest.commands.copyFiles.fields,
  );
  assert.equal(
    cli.grammar.root.usage.synopsis,
    "copy-files <source> [<destination>] [--force] [--label <label>]",
  );

  const writes: string[] = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, ["--help"]),
    dependencies: undefined,
    write: ({ chunk }) => {
      writes.push(chunk);
    },
  });
  assert.deepEqual(writes, [
    "复制文件\n\n  copy-files <source> [<destination>] [--force] [--label <label>]\n\n  <source>\n    源文件\n  [<destination>]\n    目标文件\n\n  [--force, -f]\n    覆盖目标文件\n  [--label, -l <label>]\n    复制标签\n  --help\n",
  ]);
});

void test("defineCli 聚合动态字段身份、spelling 与 positional 顺序冲突", () => {
  const definition = {
    root: "copyFiles",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      copyFiles: {
        kind: "rootCommand",
        name: "copy-files",
        description: "复制文件",
        fields: {
          optional: { kind: "positional", description: "可选位置参数" },
          Bad_Field: { kind: "positional", description: "非法身份" },
          required: { kind: "positional", description: "必填位置参数" },
          first: {
            kind: "flag",
            longOption: "--first",
            shortAlias: "-x",
            description: "第一个 flag",
          },
          second: {
            kind: "valueOption",
            longOption: "--second",
            shortAlias: "-x",
            description: "第二个 option",
          },
          invalidAlias: {
            kind: "flag",
            longOption: "--invalid-alias",
            shortAlias: "--i",
            description: "非法 alias",
          },
          invalidKind: {
            kind: "other",
            longOption: "--invalid-kind",
            description: "非法 kind",
          },
          broken: null,
        },
        input: z.object({
          optional: z.string().optional(),
          Bad_Field: z.string().optional(),
          required: z.string(),
          first: z.boolean().optional(),
          second: z.string().optional(),
          invalidAlias: z.boolean().optional(),
          invalidKind: z.string().optional(),
          broken: z.string().optional(),
        }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证定义期拒绝。
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidDescription",
          command: "copyFiles",
          location: "field",
          field: "broken",
          received: null,
        },
        {
          code: "invalidFieldIdentity",
          command: "copyFiles",
          field: "Bad_Field",
          reason: "lowerCamelCase",
        },
        {
          code: "invalidFieldShortAlias",
          command: "copyFiles",
          field: "invalidAlias",
          received: "--i",
        },
        {
          code: "invalidFieldKind",
          command: "copyFiles",
          field: "invalidKind",
          expected: [
            "positional",
            "variadicPositional",
            "flag",
            "valueOption",
            "repeatableOption",
          ],
          received: "other",
        },
        {
          code: "invalidFieldKind",
          command: "copyFiles",
          field: "broken",
          expected: [
            "positional",
            "variadicPositional",
            "flag",
            "valueOption",
            "repeatableOption",
          ],
          received: null,
        },
        {
          code: "duplicateFieldOptionSpelling",
          command: "copyFiles",
          spelling: "-x",
          fields: ["first", "second"],
        },
        {
          code: "requiredPositionalAfterOptional",
          command: "copyFiles",
          field: "required",
          precedingOptionalField: "optional",
        },
      ]);
      return true;
    },
  );
});

void test("输入字段固定禁名覆盖全部字段形态，并区分拼写错误", () => {
  const entries = [
    ["constructor", "positional"],
    ["hasOwnProperty", "flag"],
    ["isPrototypeOf", "valueOption"],
    ["propertyIsEnumerable", "repeatableOption"],
    ["toString", "valueOption"],
    ["valueOf", "valueOption"],
    ["bad_field", "valueOption"],
    ["toLocaleString", "variadicPositional"],
  ] as const;
  const definition = {
    root: "inspect",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      inspect: {
        kind: "rootCommand",
        name: "inspect",
        description: "检查输入字段身份",
        fields: Object.fromEntries(
          entries.map(([field, kind]) => [
            field,
            {
              kind,
              description: "输入字段",
              ...(kind === "positional" || kind === "variadicPositional"
                ? {}
                : {
                    longOption: `--${field.replaceAll("_", "-").toLowerCase()}`,
                  }),
            },
          ]),
        ),
        input: z.object(
          Object.fromEntries(
            entries.map(([field, kind]) => [
              field,
              (kind === "flag"
                ? z.boolean()
                : kind === "repeatableOption" || kind === "variadicPositional"
                  ? z.array(z.string()).min(1)
                  : z.string()
              ).optional(),
            ]),
          ),
        ),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态负例通过公开定义入口验证身份规则。
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "constructor",
          reason: "reservedName",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "hasOwnProperty",
          reason: "reservedName",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "isPrototypeOf",
          reason: "reservedName",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "propertyIsEnumerable",
          reason: "reservedName",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "toString",
          reason: "reservedName",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "valueOf",
          reason: "reservedName",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "bad_field",
          reason: "lowerCamelCase",
        },
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "toLocaleString",
          reason: "reservedName",
        },
      ]);
      assert.match(error.message, /constructor.*保留/);
      assert.match(error.message, /模式 Input/);
      assert.match(error.message, /引用/);
      assert.match(error.message, /CLI 拼写可保留/);
      assert.match(error.message, /bad_field.*lowerCamelCase/);
      return true;
    },
  );
});

void test("叶命令必填字段同样拒绝保留名称", () => {
  const definition = {
    root: "tool",
    help: helpCapability({ wording: { commandPlaceholder: "命令" } }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      tool: { kind: "rootGroup", name: "tool", description: "工具" },
      inspect: {
        kind: "command",
        parent: "tool",
        name: "inspect",
        description: "检查",
        fields: {
          constructor: { kind: "positional", description: "构造器" },
        },
        input: z.object({ constructor: z.string() }),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };
  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例验证层级叶命令的定义期检查。
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        {
          code: "invalidFieldIdentity",
          command: "inspect",
          field: "constructor",
          reason: "reservedName",
        },
      ]);
      return true;
    },
  );
});

void test("字段身份更名可保留 CLI 拼写，其他命名域继续合法", async () => {
  const cli = defineCli()({
    root: "constructor",
    help: helpCapability({ wording: { default: "默认 {value}" } }),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      constructor: {
        kind: "rootCommand",
        name: "inspect",
        description: "检查构造器",
        fields: {
          constructorName: {
            kind: "valueOption",
            longOption: "--constructor",
            description: "构造器名称",
          },
          // oxlint-disable-next-line unicorn/no-thenable -- 应用自定义字段身份，并非条件分支或 Promise。
          then: {
            kind: "valueOption",
            longOption: "--then",
            description: "随后",
          },
        },
        input: z.object({
          constructorName: z.string().default("fallback"),
          // oxlint-disable-next-line unicorn/no-thenable -- 模式保留应用自定义字段身份。
          then: z.string().optional(),
        }),
        success: {
          kind: "data",
          variants: {
            toString: {
              description: "构造器资料",
              schema: z.object({
                constructor: z.string(),
                // oxlint-disable-next-line unicorn/no-thenable -- 任意 JSON 载荷键不受条件分支更名影响。
                then: z.string(),
              }),
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ input, outcome }) =>
          outcome.data.toString({
            constructor: input.constructorName,
            // oxlint-disable-next-line unicorn/no-thenable -- JSON 载荷中的普通数据键。
            then: input.then ?? "absent",
          }),
      },
    },
  });

  for (const [argv, expected] of [
    // oxlint-disable-next-line unicorn/no-thenable -- 应用 JSON 载荷的预期值。
    [[], { constructor: "fallback", then: "absent" }],
    [
      ["--constructor", "named", "--then", "later"],
      // oxlint-disable-next-line unicorn/no-thenable -- 应用 JSON 载荷的预期值。
      { constructor: "named", then: "later" },
    ],
  ] as const) {
    const invocation = parseCliInvocation(cli, argv);
    assert.equal(invocation.kind, "parsed");
    if (invocation.kind !== "parsed") throw new Error("应解析为可执行调用");
    assert.deepEqual(
      invocation.input,
      // oxlint-disable-next-line unicorn/no-thenable -- 应用自定义字段的原始输入预期值。
      argv.length === 0 ? {} : { constructorName: "named", then: "later" },
    );
    let stdout = "";
    const termination = await executeCli(cli, {
      invocation,
      dependencies: undefined,
      write: ({ chunk }) => {
        stdout += chunk;
      },
    });
    assert.equal(termination.kind, "applicationResult");
    assert.deepEqual(JSON.parse(stdout), {
      schemaVersion: "2",
      command: "constructor",
      kind: "data",
      variant: "toString",
      data: expected,
    });
  }
});

void test("defineCli 拒绝动态非法命令身份", () => {
  const definition = {
    root: "copy-files",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      "copy-files": {
        kind: "rootCommand",
        name: "copy-files",
        description: "复制文件",
        input: z.object({}),
        success: { kind: "completion" },
        failures: {},
        handler: () => undefined,
      },
    },
  };

  assert.throws(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 负例故意绕过静态限制，以验证定义期拒绝。
    () => defineCli()(definition as never),
    (error) => {
      assert.ok(error instanceof ContractDefinitionError);
      assert.deepEqual(error.issues, [
        { code: "invalidCommandIdentity", command: "copy-files" },
      ]);
      return true;
    },
  );
});
