import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defineCli,
  helpCapability,
  schemaCapability,
  text,
  type ContractSchema,
} from "@boringparts/cli-contract";
import { runCliScenario } from "@boringparts/cli-contract/testing";

void test("consumer runner observes schema termination without application input", async () => {
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
      vendor: "@boringparts/cli-contract/testing",
      validate: (value) => {
        validations += 1;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The fixture declares the shape through its public input schema.
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
        outputModePlaceholder: "mode",
        choicesAndDefault: "{usage} (choices: {choices}; default: {value})",
      },
    }),
    schema: schemaCapability({
      description: text.line("Query input contracts."),
    }),
    usageFailureExitCode: 64,
    commands: {
      inspect: {
        kind: "rootCommand",
        name: "inspect",
        description: "Inspect an object",
        fields: {
          id: { kind: "positional", description: "Object identifier" },
        },
        input,
        outputs: ({ atomic }) => ({
          modes: {
            json: atomic({
              success: { kind: "completion" },
              failures: {},
              handler: ({ outcome }) => {
                handlerRuns += 1;
                return outcome.completion();
              },
            }).structured({ description: "Structured result" }),
          },
        }),
      },
    },
  });

  const observation = await runCliScenario(cli, {
    argv: ["--schema=input"],
    dependencies: undefined,
  });

  assert.equal(observation.termination.kind, "schema");
  assert.equal(observation.writes.length, 1);
  assert.equal(observation.writes[0]?.destination, "stdout");
  assert.equal(JSON.parse(observation.stdout).kind, "input");
  assert.equal(observation.stderr, "");
  assert.deepEqual(
    { validations, handlerRuns },
    { validations: 0, handlerRuns: 0 },
  );
});
