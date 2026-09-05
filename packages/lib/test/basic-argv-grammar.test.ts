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
    "copy-files <source> [<destination>] [--force] [--label <label>]\n复制文件\n<source>\t源文件\n[<destination>]\t目标文件\n[--force, -f]\t覆盖目标文件\n[--label, -l <label>]\t复制标签\n--help\n",
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
