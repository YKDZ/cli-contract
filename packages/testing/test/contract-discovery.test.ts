import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  helpCapability,
  schemaCapability,
  text,
  type ContractSchema,
} from "@ykdz/cli-contract";
import { runCliScenario } from "@ykdz/cli-contract-testing";

void test("consumer runner captures schema termination without application input", async () => {
  let validations = 0;
  let handlerRuns = 0;
  const define = defineCli();
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: { id: { type: "string" } },
    required: ["id"],
    type: "object",
  };
  const input: ContractSchema<Readonly<{ readonly id: string }>> = {
    "~standard": {
      version: 1,
      vendor: "@ykdz/cli-contract-testing",
      validate: (value) => {
        validations += 1;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 此 fixture 用公开 JSON Schema 约束输入形状。
        return { value: value as Readonly<{ readonly id: string }> };
      },
      jsonSchema: {
        input: () => schema,
        output: () => schema,
      },
    },
  };
  const cli = define({
    root: "inspect",
    help: helpCapability({
      wording: {
        choices: "(choices: {choices})",
        default: "(default: {value})",
      },
    }),
    schema: schemaCapability({ description: text.line("查询输入契约。") }),
    usageFailureExitCode: 64,
    commands: {
      inspect: {
        kind: "rootCommand",
        name: "inspect",
        description: "检查对象。",
        fields: { id: { kind: "positional", description: "对象标识。" } },
        input,
        outputs: define.outputModes("inspect", input, (mode) => ({
          default: "json",
          modes: {
            json: mode.atomic({
              description: "结构化结果。",
              format: "structured",
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => {
                handlerRuns += 1;
                return outcome.completion();
              },
            }),
          },
        })),
      },
    },
  });

  const capture = await runCliScenario({
    cliContract: cli,
    argv: ["--schema=input"],
    dependencies: undefined,
  });

  assert.equal(capture.termination.kind, "schema");
  assert.equal(capture.writes.length, 1);
  assert.equal(capture.writes[0]?.destination, "stdout");
  assert.equal(JSON.parse(capture.stdout).kind, "input");
  assert.equal(capture.stderr, "");
  assert.deepEqual(
    { validations, handlerRuns },
    { validations: 0, handlerRuns: 0 },
  );
});
