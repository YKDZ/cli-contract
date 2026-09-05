import assert from "node:assert/strict";

import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
  type ContractSchemaOutput,
} from "@ykdz/cli-contract";
import { runCliScenario } from "@ykdz/cli-contract-testing";
import * as v from "valibot";

const presets = [
  "ts-cli",
  "ts-lib",
  "rust-bin",
  "vue-app",
  "vue-hono-app",
  "vike-app",
] as const;

const addPackageInput = toStandardJsonSchema(
  v.object({
    preset: v.picklist(presets),
    name: v.string(),
    path: v.optional(v.string()),
    linkFrom: v.optional(v.array(v.string()), []),
    dryRun: v.optional(v.boolean(), false),
  }),
);

const packagePlan = toStandardJsonSchema(
  v.object({
    preset: v.picklist(presets),
    name: v.string(),
    path: v.optional(v.string()),
    linkFrom: v.array(v.string()),
    dryRun: v.boolean(),
  }),
);

const define = defineCli();
const addPackage = define.command("addPackage")({
  kind: "command",
  parent: "add",
  name: "package",
  description: "Add a package from a preset.",
  helpSupplement: text.lines([
    "When --path is omitted, the selected preset derives it from --name.",
  ]),
  fields: {
    preset: {
      kind: "valueOption",
      longOption: "--preset",
      description: "Built-in package preset.",
    },
    name: {
      kind: "valueOption",
      longOption: "--name",
      description: "Package name.",
    },
    path: {
      kind: "valueOption",
      longOption: "--path",
      description: "Optional package path.",
    },
    linkFrom: {
      kind: "repeatableOption",
      longOption: "--link-from",
      description: "Source package to link.",
    },
    dryRun: {
      kind: "flag",
      longOption: "--dry-run",
      description: "Print the plan without writing files.",
    },
  },
  input: addPackageInput,
  success: {
    kind: "data",
    variants: {
      planned: {
        description: "Read-only package addition plan.",
        schema: packagePlan,
        exitCode: 0,
        text: (plan: ContractSchemaOutput<typeof packagePlan>) =>
          text.lines([
            "Planned package addition",
            "",
            `create ${plan.path ?? "<preset-derived-path>"}/package.json`,
          ]),
      },
    },
  },
  failures: {},
  handler: ({ input, outcome }) => outcome.data.planned(input),
});

const cli = define({
  root: "template",
  help: helpCapability({ shortAlias: "-h" }),
  output: outputCapability({
    defaultFormat: "text",
    text: true,
    compatibilityFlags: { "--json": "structured" },
  }),
  usageFailureExitCode: 64,
  commands: {
    template: {
      kind: "rootGroup",
      name: "template",
      description: "Template project generator.",
    },
    add: {
      kind: "commandGroup",
      parent: "template",
      name: "add",
      description: "Add a project resource.",
    },
    ...addPackage,
  },
});

async function scenario(argv: readonly string[]) {
  return runCliScenario({ cliContract: cli, argv, dependencies: undefined });
}

async function verifyHelp(): Promise<void> {
  for (const argv of [
    ["--help"],
    ["add", "--help"],
    ["add", "package", "--help"],
    ["-h"],
    ["add", "-h"],
    ["add", "package", "-h"],
  ]) {
    const observed = await scenario(argv);
    assert.equal(observed.termination.kind, "help");
    assert.equal(observed.termination.exitCode, 0);
    assert.equal(observed.stderr, "");
    assert.match(observed.stdout, /--help, -h/);
    assert.match(observed.stdout, /--json/);
  }

  const leafHelp = await scenario(["add", "package", "--help"]);
  assert.match(
    leafHelp.stdout,
    /When --path is omitted, the selected preset derives it from --name\./,
  );
}

const packageArguments = [
  "--preset",
  "ts-cli",
  "--name",
  "utility",
  "--path",
  "packages/utility",
  "--dry-run",
] as const;

const plannedPackage = {
  preset: "ts-cli",
  name: "utility",
  path: "packages/utility",
  linkFrom: [],
  dryRun: true,
};

async function verifyStructuredOutput(argv: readonly string[]): Promise<void> {
  const observed = await scenario(argv);
  assert.equal(observed.termination.kind, "applicationResult");
  assert.equal(observed.termination.exitCode, 0);
  assert.equal(observed.stderr, "");
  assert.deepEqual(JSON.parse(observed.stdout), {
    schemaVersion: "1",
    command: "addPackage",
    kind: "data",
    variant: "planned",
    data: plannedPackage,
  });
}

async function main(): Promise<void> {
  assert.deepEqual(
    cli.grammar.nodes
      .find((node) => node.id === "addPackage")
      ?.effectiveFields.find((field) => field.key === "preset")?.choices,
    presets,
  );

  await verifyHelp();

  const textSuccess = await scenario(["add", "package", ...packageArguments]);
  assert.equal(textSuccess.termination.kind, "applicationResult");
  assert.equal(textSuccess.termination.exitCode, 0);
  assert.equal(textSuccess.stderr, "");
  assert.equal(
    textSuccess.stdout,
    "Planned package addition\n\ncreate packages/utility/package.json\n",
  );

  await verifyStructuredOutput([
    "--json",
    "add",
    "package",
    ...packageArguments,
  ]);
  await verifyStructuredOutput([
    "add",
    "--json",
    "package",
    ...packageArguments,
  ]);
  await verifyStructuredOutput([
    "add",
    "package",
    ...packageArguments,
    "--json",
  ]);

  const schemaDefaults = await scenario([
    "add",
    "package",
    "--preset",
    "ts-cli",
    "--name",
    "utility",
    "--json",
  ]);
  assert.equal(schemaDefaults.termination.kind, "applicationResult");
  assert.deepEqual(JSON.parse(schemaDefaults.stdout).data, {
    preset: "ts-cli",
    name: "utility",
    linkFrom: [],
    dryRun: false,
  });

  const invalidPreset = await scenario([
    "add",
    "package",
    "--preset",
    "not-a-preset",
    "--name",
    "utility",
    "--json",
  ]);
  assert.equal(invalidPreset.termination.kind, "usageFailure");
  assert.equal(invalidPreset.termination.exitCode, 64);
  assert.equal(invalidPreset.stdout, "");
  assert.deepEqual(JSON.parse(invalidPreset.stderr), {
    schemaVersion: "1",
    command: "addPackage",
    kind: "usageFailure",
    issues: [
      {
        code: "invalidFieldChoice",
        position: 3,
        field: "preset",
        value: "not-a-preset",
        choices: presets,
      },
    ],
    usage:
      "template add package --preset <preset> --name <name> [--path <path>] [--link-from <linkFrom>]... [--dry-run]",
    helpArgv: ["template", "add", "package", "--help"],
  });
}

await main();
