import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContractDefinitionError,
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  queryCliContract,
  schemaCapability,
  text,
  versionCapability,
} from "@ykdz/cli-contract";
import { Ajv2020 } from "ajv/dist/2020.js";
import { z } from "zod";

import { englishHelpWording } from "./english-help.ts";

function createDiscoveryCli(payloadWidth = 0) {
  const define = defineCli();
  const observed = { inputValidation: 0, handler: 0 };
  const input = z
    .object({
      format: z.enum(["json", "text"]).default("json"),
      id: z.string(),
      note: z.string().optional(),
    })
    .superRefine(() => {
      observed.inputValidation += 1;
    });
  const item = z.object({
    id: z.string(),
    payload: z.string().describe("p".repeat(payloadWidth)),
  });
  const missing = z.object({
    message: z.string().describe("m".repeat(payloadWidth)),
  });
  const record = z.object({
    id: z.string(),
    payload: z.string().describe("r".repeat(payloadWidth)),
  });
  const inspect = define.command("inspect")({
    kind: "command",
    parent: "tools",
    name: "inspect",
    aliases: ["show"],
    description: "检查一个项目。",
    fields: {
      format: {
        kind: "valueOption",
        longOption: "--format",
        description: "结果格式。",
      },
      id: { kind: "positional", description: "项目标识。" },
      note: {
        kind: "valueOption",
        longOption: "--note",
        description: "备注。",
      },
    },
    input,
    examples: [
      { input: { format: "json", id: "sample" } },
      {
        input: { format: "text", id: "fixed-mode" },
        outputMode: "structured",
      },
    ],
    usageConstraints: [
      { kind: "count", fields: ["id", "note"], min: 1, max: 2 },
    ],
    outputs: define.outputModes("inspect", input, (mode) => ({
      default: "text",
      modes: {
        structured: mode.atomic({
          description: "供程序读取。",
          format: "structured",
          success: {
            kind: "data",
            variants: {
              found: {
                description: "找到项目。",
                schema: item,
                exitCode: 0,
              },
            },
          },
          failures: {
            missing: {
              description: "项目不存在。",
              schema: missing,
              exitCode: 1,
            },
          },
          handler: ({ input, outcome }) => {
            observed.handler += 1;
            return outcome.data.found({ id: input.id, payload: "" });
          },
        }),
        text: mode.atomic({
          description: "供人阅读。",
          format: "text",
          success: {
            kind: "data",
            variants: {
              found: {
                description: "找到项目。",
                schema: item,
                exitCode: 0,
                text: ({ id }) => text.lines([id]),
              },
            },
          },
          failures: {
            missing: {
              description: "项目不存在。",
              schema: missing,
              exitCode: 1,
              text: ({ message }) => text.lines([message]),
            },
          },
          handler: ({ input, outcome }) => {
            observed.handler += 1;
            return outcome.data.found({ id: input.id, payload: "" });
          },
        }),
        events: mode.stream({
          description: "供程序读取的事件。",
          format: "structured",
          success: {
            kind: "stream",
            records: {
              item: {
                description: "项目事件。",
                schema: record,
              },
            },
          },
          failures: {
            missing: {
              description: "项目不存在。",
              schema: missing,
              exitCode: 1,
            },
          },
          async *handler({ input, outcome }) {
            observed.handler += 1;
            yield outcome.record.item({ id: input.id, payload: "" });
            return outcome.streamSuccess();
          },
        }),
        textEvents: mode.stream({
          description: "供人阅读的事件。",
          format: "text",
          success: {
            kind: "stream",
            records: {
              item: {
                description: "项目事件。",
                schema: record,
                text: ({ id }) => text.fragment(`${id}\n`),
              },
            },
            text: () => text.silent,
          },
          failures: {
            missing: {
              description: "项目不存在。",
              schema: missing,
              exitCode: 1,
              text: ({ message }) => text.lines([message]),
            },
          },
          async *handler({ input, outcome }) {
            observed.handler += 1;
            yield outcome.record.item({ id: input.id, payload: "" });
            return outcome.streamSuccess();
          },
        }),
      },
    })),
  });

  const cli = define({
    root: "workspace",
    help: helpCapability({
      headings: {
        usage: "用法",
        commands: "命令",
        arguments: "参数",
        options: "选项",
        constraints: "约束",
        schema: "契约查询",
      },
      wording: englishHelpWording,
    }),
    version: versionCapability({ value: text.line("1.2.3") }),
    schema: schemaCapability({
      description: text.line("查询命令输入、输出方式和线表示。"),
    }),
    usageFailureExitCode: 64,
    commands: {
      workspace: {
        kind: "rootGroup",
        name: "workspace",
        description: "工作区工具。",
      },
      tools: {
        kind: "commandGroup",
        parent: "workspace",
        name: "tools",
        description: "工具命令。",
      },
      ...inspect,
    },
  });
  return { cli, observed };
}

function createRootDiscoveryCli(
  discovery = true,
  optionSpelling: `--${string}` = "--extra",
) {
  const define = defineCli();
  const input = z.object({ id: z.string(), extra: z.string().optional() });
  const rootCommand = {
    kind: "rootCommand" as const,
    name: "root-app",
    description: "根命令。",
    fields: {
      id: { kind: "positional" as const, description: "项目标识。" },
      extra: {
        kind: "valueOption" as const,
        longOption: optionSpelling,
        description: "额外字段。",
      },
    },
    input,
    outputs: define.outputModes("rootApp", input, (mode) => ({
      default: "json",
      modes: {
        json: mode.atomic({
          description: "结构化结果。",
          format: "structured",
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        }),
      },
    })),
  };
  return define({
    root: "rootApp",
    help: helpCapability({
      headings: { usage: "用法", arguments: "参数", options: "选项" },
      wording: englishHelpWording,
    }),
    ...(discovery
      ? {
          schema: schemaCapability({
            description: text.line("查询根命令契约。"),
          }),
        }
      : {}),
    usageFailureExitCode: 64,
    commands: { rootApp: rootCommand },
  });
}

void test("public discovery query uses canonical paths and projects one exact section", () => {
  const { cli } = createDiscoveryCli();
  assert.deepEqual(cli.grammar.controls.schema, {
    longOption: "--schema",
    description: "查询命令输入、输出方式和线表示。",
  });
  assert.deepEqual(cli.manifest.controls.schema, cli.grammar.controls.schema);
  const directory = queryCliContract(cli, []);
  assert.equal(directory.kind, "directory");
  if (directory.kind !== "directory") return;
  assert.deepEqual(
    directory.children.map((child) => child.path),
    [["tools"]],
  );
  assert.deepEqual(directory.children[0]?.nextArgv, ["tools", "--schema"]);

  const toolsDirectory = queryCliContract(cli, ["tools"]);
  assert.equal(toolsDirectory.kind, "directory");
  if (toolsDirectory.kind !== "directory") return;
  assert.deepEqual(toolsDirectory.children[0]?.path, ["tools", "inspect"]);
  assert.deepEqual(toolsDirectory.children[0]?.nextArgv, [
    "tools",
    "inspect",
    "--schema",
  ]);

  const summary = queryCliContract(cli, ["tools", "inspect"]);
  assert.equal(summary.kind, "summary");
  if (summary.kind !== "summary") return;
  assert.deepEqual(summary.path, ["tools", "inspect"]);
  assert.equal(summary.outputs.default, "text");
  assert.deepEqual(summary.fields[0], {
    key: "format",
    kind: "valueOption",
    longOption: "--format",
    description: "结果格式。",
    required: false,
    choices: ["json", "text"],
    default: "json",
  });
  assert.ok(
    summary.next.some(
      (next) =>
        next.target === "success:structured" &&
        JSON.stringify(next.argv) ===
          JSON.stringify(["tools", "inspect", "--schema=success:structured"]),
    ),
  );
  assert.deepEqual(summary.examples, cli.manifest.commands.inspect.examples);
  assert.equal(summary.examples[0]?.outputMode, undefined);
  assert.equal(summary.examples[1]?.outputMode, "structured");
  assert.deepEqual(summary.examples[0]?.argv, [
    "tools",
    "inspect",
    "--format=json",
    "--",
    "sample",
  ]);

  const failures = queryCliContract(
    cli,
    ["tools", "inspect"],
    "failures:structured",
  );
  assert.equal(failures.kind, "failures");
  if (failures.kind !== "failures") return;
  assert.deepEqual(Object.keys(failures.failures), ["missing"]);
  assert.equal("commands" in failures, false);
  assert.equal("usageFailure" in failures, false);
  const missing = failures.failures.missing!;
  const validateMissing = new Ajv2020({ strict: false }).compile(
    missing.outputSchema,
  );
  assert.equal(validateMissing({ message: "missing" }), true);
  assert.equal(validateMissing({ message: 1 }), false);

  assert.equal(queryCliContract(cli, ["tools", "show"]).kind, "queryFailure");
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "wire:text").kind,
    "queryFailure",
  );
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "records:structured").kind,
    "queryFailure",
  );
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "future:structured").kind,
    "queryFailure",
  );
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "success:unknown").kind,
    "queryFailure",
  );
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "success:toString").kind,
    "queryFailure",
  );
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "success:structured:extra")
      .kind,
    "queryFailure",
  );
  const emptyTarget = queryCliContract(cli, ["tools", "inspect"], "");
  assert.equal(emptyTarget.kind, "queryFailure");
  if (emptyTarget.kind === "queryFailure") {
    assert.equal(emptyTarget.reason, "invalidSyntax");
  }
  assert.equal(queryCliContract(cli, ["tools"], "input").kind, "queryFailure");
  assert.deepEqual(
    Object.keys(
      cli.manifest.commands.inspect.outputs.modes.structured!.failures,
    ),
    ["missing"],
  );

  const input = queryCliContract(cli, ["tools", "inspect"], "input");
  assert.equal(input.kind, "input");
  if (input.kind !== "input") return;
  assert.deepEqual(input.fields[0]?.choices, ["json", "text"]);
  assert.equal(input.fields[0]?.default, "json");
  assert.deepEqual(input.usageConstraints, [
    { kind: "count", fields: ["id", "note"], min: 1, max: 2 },
  ]);
  assert.equal("outputs" in input, false);
  const validateInput = new Ajv2020({ strict: false }).compile(
    input.input.inputSchema,
  );
  assert.equal(validateInput({ format: "text", id: "sample" }), true);
  assert.equal(validateInput({ format: "other", id: "sample" }), false);

  const success = queryCliContract(
    cli,
    ["tools", "inspect"],
    "success:structured",
  );
  assert.equal(success.kind, "success");
  if (success.kind !== "success") return;
  assert.deepEqual(
    success.success,
    cli.manifest.commands.inspect.outputs.modes.structured!.success,
  );
  assert.equal("failures" in success, false);
  assert.equal("wire" in success, false);
  assert.equal(success.success.kind, "data");
  if (success.success.kind === "data") {
    const found = success.success.variants.found;
    assert.ok(found);
    const validate = new Ajv2020({ strict: false }).compile(found.outputSchema);
    assert.equal(validate({ id: "sample", payload: "" }), true);
    assert.equal(validate({ id: "sample", payload: 1 }), false);
  }

  const wire = queryCliContract(cli, ["tools", "inspect"], "wire:structured");
  assert.equal(wire.kind, "wire");
  if (wire.kind !== "wire") return;
  assert.deepEqual(Object.keys(wire.wire.data ?? {}), ["found"]);
  assert.deepEqual(Object.keys(wire.wire.failure ?? {}), ["missing"]);
  assert.equal("usageFailure" in wire, false);

  const streamSuccess = queryCliContract(
    cli,
    ["tools", "inspect"],
    "success:events",
  );
  assert.equal(streamSuccess.kind, "success");
  if (streamSuccess.kind !== "success") return;
  assert.deepEqual(streamSuccess.success, { kind: "stream" });

  const textSuccess = queryCliContract(
    cli,
    ["tools", "inspect"],
    "success:textEvents",
  );
  assert.equal(textSuccess.kind, "success");
  if (textSuccess.kind !== "success") return;
  assert.deepEqual(textSuccess.success, {
    kind: "stream",
    text: { recordFraming: "fragment" },
  });

  const records = queryCliContract(cli, ["tools", "inspect"], "records:events");
  assert.equal(records.kind, "records");
  if (records.kind !== "records") return;
  assert.deepEqual(Object.keys(records.records), ["item"]);
  const validateRecord = new Ajv2020({ strict: false }).compile(
    records.records.item!.outputSchema,
  );
  assert.equal(validateRecord({ id: "sample", payload: "" }), true);
  assert.equal(validateRecord({ id: "sample", payload: 1 }), false);

  const textRecords = queryCliContract(
    cli,
    ["tools", "inspect"],
    "records:textEvents",
  );
  assert.equal(textRecords.kind, "records");
  if (textRecords.kind !== "records") return;
  assert.deepEqual(Object.keys(textRecords.records), ["item"]);
  assert.equal(
    queryCliContract(cli, ["tools", "inspect"], "wire:textEvents").kind,
    "queryFailure",
  );

  const streamWire = queryCliContract(cli, ["tools", "inspect"], "wire:events");
  assert.equal(streamWire.kind, "wire");
  if (streamWire.kind !== "wire") return;
  assert.equal(streamWire.wire.stream?.records.item !== undefined, true);
  assert.equal(streamWire.wire.data, undefined);
  assert.equal(streamWire.wire.stream?.line !== undefined, true);
});

void test("CLI discovery reuses the public query and stops at the first eager request", async () => {
  const { cli, observed } = createDiscoveryCli();
  observed.inputValidation = 0;
  observed.handler = 0;
  const invocation = parseCliInvocation(cli, [
    "tools",
    "show",
    "--output=text",
    "--schema=success:structured",
    "--unknown",
  ]);
  assert.equal(invocation.kind, "schema");
  if (invocation.kind !== "schema") return;

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation,
    write: (output) => {
      writes.push(output);
    },
  });
  assert.equal(termination.kind, "schema");
  if (termination.kind !== "schema") return;
  const queried = queryCliContract(
    cli,
    ["tools", "inspect"],
    "success:structured",
  );
  assert.deepEqual(termination.document, queried);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.destination, "stdout");
  assert.equal(writes[0]?.chunk, `${JSON.stringify(queried)}\n`);
  assert.deepEqual(observed, { inputValidation: 0, handler: 0 });
});

void test("invalid schema targets use the published usage failure wire", async () => {
  const { cli } = createDiscoveryCli();
  const invocation = parseCliInvocation(cli, [
    "tools",
    "inspect",
    "--schema=success:structured:extra",
  ]);
  assert.equal(invocation.kind, "usageFailure");
  if (invocation.kind !== "usageFailure") return;

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation,
    write: (output) => {
      writes.push(output);
    },
  });
  assert.equal(termination.kind, "usageFailure");
  const failure = JSON.parse(writes[0]?.chunk ?? "null") as unknown;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    cli.manifest.usageFailure.wire,
  );
  assert.equal(validate(failure), true);
});

void test("eager schema tokens keep parser order, value boundaries, and exact targets", () => {
  const { cli } = createDiscoveryCli();
  const request = (...argv: string[]) => parseCliInvocation(cli, argv);

  const directory = request("--schema", "--help", "--unknown");
  assert.equal(directory.kind, "schema");
  if (directory.kind === "schema")
    assert.equal(directory.document.kind, "directory");

  assert.equal(
    request("tools", "inspect", "--help", "--schema=bad").kind,
    "help",
  );
  assert.equal(
    request("tools", "inspect", "--version", "--schema=bad").kind,
    "version",
  );

  const badTarget = request("tools", "inspect", "--schema=bad", "--help");
  assert.equal(badTarget.kind, "usageFailure");
  if (badTarget.kind === "usageFailure") {
    assert.deepEqual(badTarget.issues[0], {
      code: "invalidSchemaQuery",
      position: 2,
      option: "--schema",
      target: "bad",
      reason: "unknownPart",
    });
  }

  const prototypeMode = request(
    "tools",
    "inspect",
    "--schema=success:toString",
  );
  assert.equal(prototypeMode.kind, "usageFailure");
  if (prototypeMode.kind === "usageFailure") {
    assert.deepEqual(prototypeMode.issues[0], {
      code: "invalidSchemaQuery",
      position: 2,
      option: "--schema",
      target: "success:toString",
      reason: "unknownOutputMode",
    });
  }

  const optionValue = request("tools", "inspect", "--format", "--schema=input");
  assert.equal(optionValue.kind, "schema");
  if (optionValue.kind === "schema")
    assert.equal(optionValue.document.kind, "input");

  const outputValue = request("tools", "inspect", "--output", "--schema=bad");
  assert.equal(outputValue.kind, "usageFailure");
  if (outputValue.kind === "usageFailure") {
    assert.equal(outputValue.issues[0]?.code, "invalidSchemaQuery");
  }

  const priorError = request(
    "tools",
    "inspect",
    "--output=unknown",
    "--schema",
  );
  assert.equal(priorError.kind, "usageFailure");
  if (priorError.kind === "usageFailure") {
    assert.equal(priorError.issues[0]?.code, "invalidOutputMode");
  }

  const laterError = request(
    "tools",
    "inspect",
    "--schema=success:structured",
    "--output=unknown",
  );
  assert.equal(laterError.kind, "schema");

  const rawValue = request(
    "tools",
    "inspect",
    "item-1",
    "--note=--schema=input",
  );
  assert.equal(rawValue.kind, "parsed");
  if (rawValue.kind === "parsed")
    assert.equal(rawValue.input.note, "--schema=input");

  const afterTerminator = request("tools", "inspect", "--", "--schema=input");
  assert.equal(afterTerminator.kind, "parsed");
  if (afterTerminator.kind === "parsed") {
    assert.equal(afterTerminator.input.id, "--schema=input");
  }
});

void test("ordinary help lists only applicable schema calls", async () => {
  const { cli } = createDiscoveryCli();
  const invocation = parseCliInvocation(cli, ["tools", "inspect", "--help"]);
  assert.equal(invocation.kind, "help");
  if (invocation.kind !== "help") return;
  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  await executeCli(cli, {
    invocation,
    write: (output) => {
      writes.push(output);
    },
  });

  const help = writes[0]?.chunk ?? "";
  assert.ok(help.includes("契约查询"));
  assert.ok(help.includes("--schema=input"));
  assert.ok(help.includes("--schema=success:structured"));
  assert.ok(help.includes("--schema=wire:structured"));
  assert.ok(help.includes("--schema=records:events"));
  assert.ok(help.includes("--schema=records:textEvents"));
  assert.ok(!help.includes("--schema=wire:text"));
  assert.ok(!help.includes("--schema=wire:textEvents"));
  assert.ok(help.includes("查询命令输入、输出方式和线表示。"));
  assert.ok(help.includes("workspace"));
  assert.ok(
    help.includes(cli.manifest.commands.inspect.examples?.[0]?.shell ?? ""),
  );
});

void test("根作者省略发现标题时帮助保留机械查询形状与准确argv", async () => {
  const cli = createRootDiscoveryCli();
  const invocation = parseCliInvocation(cli, ["--help"]);
  assert.equal(invocation.kind, "help");
  if (invocation.kind !== "help") return;

  const writes: Array<Readonly<{ readonly chunk: string }>> = [];
  await executeCli(cli, {
    invocation,
    write: (output) => {
      writes.push(output);
    },
  });

  const help = writes[0]?.chunk ?? "";
  assert.match(help, /^  --schema\n    查询根命令契约。$/m);
  for (const argv of [
    ["--schema=input"],
    ["--schema=success:json"],
    ["--schema=failures:json"],
    ["--schema=wire:json"],
  ]) {
    assert.ok(help.includes(JSON.stringify(argv)));
  }
  assert.doesNotMatch(help, /契约查询|裸请求返回|准确参数/);
});

void test("root executable discovery needs no app input and is absent unless installed", async () => {
  const cli = createRootDiscoveryCli();
  const invocation = parseCliInvocation(cli, ["--schema"]);
  assert.equal(invocation.kind, "schema");
  if (invocation.kind !== "schema") return;
  assert.equal(invocation.command, "rootApp");
  assert.equal(invocation.document.kind, "summary");
  if (invocation.document.kind !== "summary") return;
  assert.deepEqual(invocation.document.path, []);
  assert.deepEqual(invocation.document.next[0]?.argv, ["--schema=input"]);

  const completion = queryCliContract(cli, [], "success:json");
  assert.equal(completion.kind, "success");
  if (completion.kind === "success") {
    assert.deepEqual(completion.success, { kind: "completion" });
  }
  const emptyFailures = queryCliContract(cli, [], "failures:json");
  assert.equal(emptyFailures.kind, "failures");
  if (emptyFailures.kind === "failures") {
    assert.deepEqual(emptyFailures.failures, {});
  }

  const writes: Array<Readonly<{ destination: string; chunk: string }>> = [];
  const termination = await executeCli(cli, {
    invocation,
    write: (output) => {
      writes.push(output);
    },
  });
  assert.equal(termination.kind, "schema");
  assert.equal(writes[0]?.destination, "stdout");
  assert.deepEqual(JSON.parse(writes[0]?.chunk ?? "null"), invocation.document);

  const withoutDiscovery = createRootDiscoveryCli(false);
  const noControl = parseCliInvocation(withoutDiscovery, ["--schema"]);
  assert.equal(noControl.kind, "usageFailure");
  if (noControl.kind === "usageFailure") {
    assert.equal(noControl.issues[0]?.code, "unknownOption");
  }
  const uninstalledAdjacentValue = parseCliInvocation(withoutDiscovery, [
    "Ada",
    "--extra",
    "--schema",
  ]);
  const ordinaryUnknownAdjacentValue = parseCliInvocation(withoutDiscovery, [
    "Ada",
    "--extra",
    "--unknown",
  ]);
  assert.equal(uninstalledAdjacentValue.kind, "usageFailure");
  assert.deepEqual(uninstalledAdjacentValue, ordinaryUnknownAdjacentValue);
  if (uninstalledAdjacentValue.kind === "usageFailure") {
    assert.ok(
      uninstalledAdjacentValue.issues.some(
        (issue) => issue.code === "missingOptionValue",
      ),
    );
  }
  const unavailable = queryCliContract(withoutDiscovery, []);
  assert.equal(unavailable.kind, "queryFailure");
  if (unavailable.kind === "queryFailure") {
    assert.equal(unavailable.reason, "discoveryNotInstalled");
  }

  assert.throws(
    () => createRootDiscoveryCli(true, "--schema"),
    (error: unknown) =>
      error instanceof ContractDefinitionError &&
      error.issues.some(
        (issue) =>
          issue.code === "fieldOptionConflictsWithControl" &&
          issue.control === "schema",
      ),
  );
});

void test("every summary next argv succeeds through the formal parser and executor", async () => {
  const { cli } = createDiscoveryCli();
  const replayBare = async (
    argv: readonly string[],
    path: readonly string[],
  ) => {
    const invocation = parseCliInvocation(cli, argv);
    assert.equal(invocation.kind, "schema", JSON.stringify(argv));
    if (invocation.kind !== "schema") return;
    const termination = await executeCli(cli, {
      invocation,
      write: () => undefined,
    });
    assert.equal(termination.kind, "schema", JSON.stringify(argv));
    if (termination.kind !== "schema") return;
    assert.deepEqual(termination.document, queryCliContract(cli, path));
  };

  const rootDirectory = queryCliContract(cli, []);
  assert.equal(rootDirectory.kind, "directory");
  if (rootDirectory.kind !== "directory") return;
  for (const child of rootDirectory.children) {
    await replayBare(child.nextArgv, child.path);
    const childDirectory = queryCliContract(cli, child.path);
    assert.equal(childDirectory.kind, "directory");
    if (childDirectory.kind !== "directory") continue;
    for (const nestedChild of childDirectory.children) {
      await replayBare(nestedChild.nextArgv, nestedChild.path);
    }
  }

  const summary = queryCliContract(cli, ["tools", "inspect"]);
  assert.equal(summary.kind, "summary");
  if (summary.kind !== "summary") return;

  for (const next of summary.next) {
    const invocation = parseCliInvocation(cli, next.argv);
    assert.equal(invocation.kind, "schema", next.target);
    if (invocation.kind !== "schema") continue;
    assert.equal(invocation.document.kind, next.target.split(":")[0]);
    const termination = await executeCli(cli, {
      invocation,
      write: () => undefined,
    });
    assert.equal(termination.kind, "schema", next.target);
    if (termination.kind !== "schema") continue;
    assert.deepEqual(
      termination.document,
      queryCliContract(cli, summary.path, next.target),
    );
  }
});

void test("directory and summary size ignore wider result and failure payload schemas", () => {
  const small = createDiscoveryCli().cli;
  const large = createDiscoveryCli(500).cli;
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

  assert.equal(
    bytes(queryCliContract(small, [])),
    bytes(queryCliContract(large, [])),
  );
  assert.equal(
    bytes(queryCliContract(small, ["tools", "inspect"])),
    bytes(queryCliContract(large, ["tools", "inspect"])),
  );
  assert.ok(bytes(large.manifest) > bytes(small.manifest));

  for (const target of [
    "success:structured",
    "failures:structured",
    "wire:structured",
  ]) {
    assert.ok(
      bytes(queryCliContract(large, ["tools", "inspect"], target)) >
        bytes(queryCliContract(small, ["tools", "inspect"], target)),
      target,
    );
  }
});
