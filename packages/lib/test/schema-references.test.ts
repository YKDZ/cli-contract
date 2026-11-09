import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  parseCliInvocation,
  type CommandWireManifest,
  type ContractSchema,
} from "@ykdz/cli-contract";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

const emptyInput = z.object({});

function structuredWire(cli: {
  readonly manifest: {
    readonly wire: CommandWireManifest;
  };
}): CommandWireManifest[string] {
  const wire = cli.manifest.wire.structured;
  assert.ok(wire);
  return wire;
}

interface TreeNode {
  readonly name: string;
  readonly children: readonly TreeNode[];
}

void test("recursive Zod data 经过信封后仍通过公开线模式", async () => {
  let treeSchema: z.ZodType<TreeNode, TreeNode>;
  treeSchema = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(treeSchema) }),
  );
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  assert.equal(treeSchema.safeParse(tree).success, true);

  const cli = defineCli()({
    root: "tree",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      tree: {
        kind: "rootCommand",
        name: "tree",
        description: "读取树",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "data",
                variants: {
                  tree: {
                    description: "树数据",
                    schema: treeSchema,
                    exitCode: 0,
                  },
                },
              },
              failures: {},
              handler({ outcome }) {
                return outcome.data.tree(tree);
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];

  const termination = await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  assert.deepEqual(termination, {
    kind: "applicationResult",
    command: "tree",
    outputMode: "structured",
    result: { kind: "data", command: "tree", variant: "tree", data: tree },
    exitCode: 0,
  });
  assert.equal(writes.length, 1);
  const output = writes[0];
  assert.ok(output);
  assert.equal(output.destination, "stdout");
  const wireValue: unknown = JSON.parse(output.chunk);
  const wireSchema = structuredWire(cli).data?.tree;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validatesWire = ajv.compile(wireSchema);

  assert.equal(
    validatesWire(wireValue),
    true,
    ajv.errorsText(validatesWire.errors),
  );
});

void test("递归 Zod data 的根 URI 经信封后仍指向载荷根", async () => {
  let treeSchema: z.ZodType<TreeNode, TreeNode>;
  treeSchema = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(treeSchema) }),
  );
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  for (const id of ["", "#", ".", "./"] as const) {
    const projection = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: id,
      type: "object",
      properties: {
        name: { type: "string" },
        children: { type: "array", items: { $ref: "#" } },
      },
      required: ["name", "children"],
      additionalProperties: false,
    } as const;
    const schema: ContractSchema<TreeNode, TreeNode> = {
      "~standard": {
        ...treeSchema["~standard"],
        jsonSchema: {
          input: () => projection,
          output: () => projection,
        },
      },
    };
    const ajvPayload = new Ajv2020({ strict: false });
    const validatePayload = ajvPayload.compile(projection);
    assert.equal(
      validatePayload(tree),
      true,
      ajvPayload.errorsText(validatePayload.errors),
    );

    const cli = defineCli()({
      root: "tree",
      help: englishHelpCapability(),

      usageFailureExitCode: 64,
      commands: {
        tree: {
          kind: "rootCommand",
          name: "tree",
          description: "读取树",
          fields: {},
          input: emptyInput,

          outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
            default: "structured",
            modes: {
              structured: mode.atomic({
                description: "结构化输出",
                format: "structured",
                success: {
                  kind: "data",
                  variants: {
                    tree: {
                      description: "树数据",
                      schema,
                      exitCode: 0,
                    },
                  },
                },
                failures: {},
                handler({ outcome }) {
                  return outcome.data.tree(tree);
                },
              }),
            },
          })),
        },
      },
    });
    const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
    await executeCli(cli, {
      invocation: parseCliInvocation(cli, []),
      dependencies: undefined,
      write(output) {
        writes.push(output);
      },
    });

    const output = writes[0];
    assert.ok(output);
    const wireSchema = structuredWire(cli).data?.tree;
    assert.ok(wireSchema);
    const ajvWire = new Ajv2020({ strict: false });
    const validateWire = ajvWire.compile(wireSchema);
    assert.equal(
      validateWire(JSON.parse(output.chunk) as unknown),
      true,
      ajvWire.errorsText(validateWire.errors),
    );
  }
});

void test("recursive Zod failure 经过信封后仍通过公开线模式", async () => {
  let treeSchema: z.ZodType<TreeNode, TreeNode>;
  treeSchema = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(treeSchema) }),
  );
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  const cli = defineCli()({
    root: "tree",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      tree: {
        kind: "rootCommand",
        name: "tree",
        description: "读取树",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: { kind: "completion" },
              failures: {
                unavailable: {
                  description: "无法读取树",
                  schema: treeSchema,
                  exitCode: 8,
                },
              },
              handler({ outcome }) {
                return outcome.failure.unavailable(tree);
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const output = writes[0];
  assert.ok(output);
  assert.equal(output.destination, "stderr");
  const wireValue: unknown = JSON.parse(output.chunk);
  const wireSchema = structuredWire(cli).failure?.unavailable;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validatesWire = ajv.compile(wireSchema);

  assert.equal(
    validatesWire(wireValue),
    true,
    ajv.errorsText(validatesWire.errors),
  );
});

void test("recursive Zod stream record 经过信封后仍通过公开线模式", async () => {
  let treeSchema: z.ZodType<TreeNode, TreeNode>;
  treeSchema = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(treeSchema) }),
  );
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  const cli = defineCli()({
    root: "tree",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      tree: {
        kind: "rootCommand",
        name: "tree",
        description: "读取树",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.stream({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "stream",
                records: {
                  item: { description: "树节点", schema: treeSchema },
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.item(tree);
                return outcome.streamSuccess();
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const wireSchema = structuredWire(cli).stream?.line;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validatesLine = ajv.compile(wireSchema);
  const lines = writes.map(({ chunk }) => JSON.parse(chunk) as unknown);
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.equal(
      validatesLine(line),
      true,
      ajv.errorsText(validatesLine.errors),
    );
  }
});

void test("多个 stream record 复用同一资源时 line 模式仍可离线编译", async () => {
  let treeSchema: z.ZodType<TreeNode, TreeNode>;
  treeSchema = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(treeSchema) }),
  );
  const projection = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/tree",
    $anchor: "tree-node",
    type: "object",
    properties: {
      name: { type: "string" },
      children: { type: "array", items: { $ref: "#tree-node" } },
    },
    required: ["name", "children"],
    additionalProperties: false,
  } as const;
  const schema: ContractSchema<TreeNode, TreeNode> = {
    "~standard": {
      ...treeSchema["~standard"],
      jsonSchema: {
        input: () => projection,
        output: () => projection,
      },
    },
  };
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  const cli = defineCli()({
    root: "tree",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      tree: {
        kind: "rootCommand",
        name: "tree",
        description: "读取树",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.stream({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "stream",
                records: {
                  item: { description: "树", schema },
                  other: { description: "另一种树记录", schema },
                },
              },
              failures: {
                unavailable: {
                  description: "无法取得树",
                  schema,
                  exitCode: 8,
                },
              },
              async *handler({ outcome }) {
                yield outcome.record.item(tree);
                yield outcome.record.other(tree);
                return outcome.failure.unavailable(tree);
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const wireSchema = structuredWire(cli).stream?.line;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validateLine = ajv.compile(wireSchema);
  const stdoutLines = writes
    .filter(({ destination }) => destination === "stdout")
    .map(({ chunk }) => JSON.parse(chunk) as unknown);
  assert.equal(stdoutLines.length, 3);
  for (const line of stdoutLines) {
    assert.equal(validateLine(line), true, ajv.errorsText(validateLine.errors));
  }

  const failure = writes.find(({ destination }) => destination === "stderr");
  assert.ok(failure);
  const failureSchema = structuredWire(cli).failure?.unavailable;
  assert.ok(failureSchema);
  const ajvFailure = new Ajv2020({ strict: false });
  const validateFailure = ajvFailure.compile(failureSchema);
  assert.equal(
    validateFailure(JSON.parse(failure.chunk) as unknown),
    true,
    ajvFailure.errorsText(validateFailure.errors),
  );
});

void test("stream record 各自保留重复资源 ID 下的载荷约束", async () => {
  const namedSchema = <Value>(
    runtimeSchema: ContractSchema<Value, Value>,
    id: string,
    type: "string" | "number",
  ): ContractSchema<Value, Value> => {
    const projection = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: id,
      type,
    } as const;
    return {
      "~standard": {
        ...runtimeSchema["~standard"],
        jsonSchema: {
          input: () => projection,
          output: () => projection,
        },
      },
    };
  };

  const idVariants = [
    ["https://example.test/shared", "word", "count"],
    ["tree.json", "relativeWord", "relativeCount"],
  ] as const;
  const cli = defineCli()({
    root: "sample",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      sample: {
        kind: "rootCommand",
        name: "sample",
        description: "样本",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("sample", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.stream({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "stream",
                records: {
                  word: {
                    description: "词",
                    schema: namedSchema(z.string(), idVariants[0][0], "string"),
                  },
                  count: {
                    description: "数",
                    schema: namedSchema(z.number(), idVariants[0][0], "number"),
                  },
                  relativeWord: {
                    description: "相对路径文本",
                    schema: namedSchema(z.string(), idVariants[1][0], "string"),
                  },
                  relativeCount: {
                    description: "相对路径数值",
                    schema: namedSchema(z.number(), idVariants[1][0], "number"),
                  },
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.word("word");
                yield outcome.record.count(42);
                yield outcome.record.relativeWord("relative");
                yield outcome.record.relativeCount(43);
                return outcome.streamSuccess();
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const wireSchema = structuredWire(cli).stream?.line;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validateLine = ajv.compile(wireSchema);
  const stdoutLines = writes
    .filter(({ destination }) => destination === "stdout")
    .map(({ chunk }) => JSON.parse(chunk) as Record<string, unknown>);
  assert.equal(stdoutLines.length, 6);
  for (const line of stdoutLines) {
    assert.equal(validateLine(line), true, ajv.errorsText(validateLine.errors));
    if (line.kind !== "record") continue;
    const invalidData = typeof line.data === "string" ? 42 : "not a number";
    assert.equal(
      validateLine({ ...line, data: invalidData }),
      false,
      `${String(line.variant)} must retain its own payload constraint`,
    );
  }
});

void test("组合 stream line 保留嵌套资源与本地 JSON Pointer", async () => {
  const runtimeSchema = z.object({
    name: z.string(),
    alias: z.string(),
    relativeName: z.string(),
    marker: z.object({ $id: z.string(), $ref: z.string() }),
  });
  const marker = {
    $id: "https://example.test/instance-data",
    $ref: "#/$defs/missing",
  };
  const projection = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: {
      name: {
        $id: "https://example.test/name",
        type: "string",
        $defs: { text: { type: "string" } },
      },
      relativeName: {
        $id: "relative-name",
        type: "string",
      },
    },
    type: "object",
    properties: {
      name: { $ref: "https://example.test/name" },
      alias: { $ref: "#/$defs/name/$defs/text" },
      relativeName: { $ref: "relative-name" },
      marker: { const: marker },
    },
    required: ["name", "alias", "relativeName", "marker"],
    additionalProperties: false,
  } as const;
  const schema: ContractSchema<
    {
      readonly name: string;
      readonly alias: string;
      readonly relativeName: string;
      readonly marker: typeof marker;
    },
    {
      readonly name: string;
      readonly alias: string;
      readonly relativeName: string;
      readonly marker: typeof marker;
    }
  > = {
    "~standard": {
      ...runtimeSchema["~standard"],
      jsonSchema: {
        input: () => projection,
        output: () => projection,
      },
    },
  };
  const cli = defineCli()({
    root: "sample",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      sample: {
        kind: "rootCommand",
        name: "sample",
        description: "样本",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("sample", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.stream({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "stream",
                records: {
                  first: { description: "前项", schema },
                  second: { description: "后项", schema },
                },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.first({
                  name: "a",
                  alias: "a",
                  relativeName: "relative-a",
                  marker,
                });
                yield outcome.record.second({
                  name: "b",
                  alias: "b",
                  relativeName: "relative-b",
                  marker,
                });
                return outcome.streamSuccess();
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const wireSchema = structuredWire(cli).stream?.line;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validateLine = ajv.compile(wireSchema);
  const stdoutLines = writes
    .filter(({ destination }) => destination === "stdout")
    .map(({ chunk }) => JSON.parse(chunk) as unknown);
  assert.equal(stdoutLines.length, 4);
  for (const line of stdoutLines) {
    assert.equal(validateLine(line), true, ajv.errorsText(validateLine.errors));
  }
});

void test("重定位保留跨资源的 dynamicRef 作用域", async () => {
  let runtimeTree: z.ZodType<TreeNode, TreeNode>;
  runtimeTree = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(runtimeTree) }).strict(),
  );
  const projection = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/strict-tree",
    $dynamicAnchor: "node",
    $ref: "tree",
    unevaluatedProperties: false,
    $defs: {
      tree: {
        $id: "tree",
        $dynamicAnchor: "node",
        type: "object",
        properties: {
          name: { type: "string" },
          children: { type: "array", items: { $dynamicRef: "#node" } },
        },
        required: ["name", "children"],
      },
    },
  } as const;
  const schema: ContractSchema<TreeNode, TreeNode> = {
    "~standard": {
      ...runtimeTree["~standard"],
      jsonSchema: {
        input: () => projection,
        output: () => projection,
      },
    },
  };
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  const cli = defineCli()({
    root: "tree",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      tree: {
        kind: "rootCommand",
        name: "tree",
        description: "读取树",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.stream({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "stream",
                records: { item: { description: "树节点", schema } },
              },
              failures: {},
              async *handler({ outcome }) {
                yield outcome.record.item(tree);
                return outcome.streamSuccess();
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const wireSchema = structuredWire(cli).stream?.line;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validateLine = ajv.compile(wireSchema);
  const lines = writes
    .filter(({ destination }) => destination === "stdout")
    .map(({ chunk }) => JSON.parse(chunk) as Record<string, unknown>);
  for (const line of lines) {
    assert.equal(validateLine(line), true, ajv.errorsText(validateLine.errors));
  }
  const record = lines.find((line) => line.kind === "record");
  assert.ok(record);
  const data = record.data as {
    readonly name: string;
    readonly children: readonly Record<string, unknown>[];
  };
  assert.equal(
    validateLine({
      ...record,
      data: {
        ...data,
        children: [{ ...data.children[0], extra: true }],
      },
    }),
    false,
  );
});

void test("data 线模式保留局部定义引用与资源 anchor", async () => {
  let treeSchema: z.ZodType<TreeNode, TreeNode>;
  treeSchema = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(treeSchema) }),
  );
  const resourceProjection = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.example.invalid/tree.json",
    $anchor: "tree-node",
    $defs: { nodeName: { type: "string" } },
    additionalProperties: false,
    properties: {
      name: { $ref: "#/$defs/nodeName" },
      children: {
        items: {
          $ref: "https://schemas.example.invalid/tree.json#tree-node",
        },
        type: "array",
      },
    },
    required: ["name", "children"],
    type: "object",
  } as const;
  const resourceTreeSchema: ContractSchema<TreeNode> = {
    "~standard": {
      ...treeSchema["~standard"],
      jsonSchema: {
        input: () => resourceProjection,
        output: () => resourceProjection,
      },
    },
  };
  const tree = {
    name: "root",
    children: [{ name: "leaf", children: [] }],
  } satisfies TreeNode;
  const cli = defineCli()({
    root: "tree",
    help: englishHelpCapability(),

    usageFailureExitCode: 64,
    commands: {
      tree: {
        kind: "rootCommand",
        name: "tree",
        description: "读取树",
        fields: {},
        input: emptyInput,

        outputs: defineCli().outputModes("tree", emptyInput, (mode) => ({
          default: "structured",
          modes: {
            structured: mode.atomic({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "data",
                variants: {
                  tree: {
                    description: "树数据",
                    schema: resourceTreeSchema,
                    exitCode: 0,
                  },
                },
              },
              failures: {},
              handler({ outcome }) {
                return outcome.data.tree(tree);
              },
            }),
          },
        })),
      },
    },
  });
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation: parseCliInvocation(cli, []),
    dependencies: undefined,
    write(output) {
      writes.push(output);
    },
  });

  const output = writes[0];
  assert.ok(output);
  const wireSchema = structuredWire(cli).data?.tree;
  assert.ok(wireSchema);
  const ajv = new Ajv2020({ strict: false });
  const validatesWire = ajv.compile(wireSchema);

  assert.equal(
    validatesWire(JSON.parse(output.chunk) as unknown),
    true,
    ajv.errorsText(validatesWire.errors),
  );
});

void test("不能自包含的外部 schema 引用产生定义诊断且不加载网络", () => {
  const runtimeSchema = z.object({ reason: z.string() });
  const externalReference =
    "https://schemas.example.invalid/common.json#/$defs/Reason";
  const externalSchema: ContractSchema<
    { readonly reason: string },
    { readonly reason: string }
  > = {
    "~standard": {
      ...runtimeSchema["~standard"],
      jsonSchema: {
        input: () => ({
          $schema: "https://json-schema.org/draft/2020-12/schema",
          properties: { reason: { type: "string" } },
          required: ["reason"],
          type: "object",
        }),
        output: () => ({
          $schema: "https://json-schema.org/draft/2020-12/schema",
          properties: { reason: { $ref: externalReference } },
          required: ["reason"],
          type: "object",
        }),
      },
    },
  };
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("schema reference must not load over network");
  };

  try {
    assert.throws(
      () =>
        defineCli()({
          root: "remote",
          help: englishHelpCapability(),

          usageFailureExitCode: 64,
          commands: {
            remote: {
              kind: "rootCommand",
              name: "remote",
              description: "检查远端契约",
              fields: {},
              input: emptyInput,

              outputs: defineCli().outputModes(
                "remote",
                emptyInput,
                (mode) => ({
                  default: "structured",
                  modes: {
                    structured: mode.atomic({
                      description: "结构化输出",
                      format: "structured",
                      success: {
                        kind: "data",
                        variants: {
                          reason: {
                            description: "原因",
                            schema: externalSchema,
                            exitCode: 0,
                          },
                        },
                      },
                      failures: {},
                      handler({ outcome }) {
                        return outcome.data.reason({ reason: "offline" });
                      },
                    }),
                  },
                }),
              ),
            },
          },
        }),
      (error) => {
        assert.ok(error instanceof ContractDefinitionError);
        assert.ok(
          error.issues.some(
            (issue) =>
              issue.code === "schemaReferenceNotSelfContained" &&
              issue.command === "remote" &&
              issue.location === "data" &&
              issue.variant === "reason" &&
              issue.projection === "output" &&
              issue.reference === externalReference,
          ),
        );
        return true;
      },
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
