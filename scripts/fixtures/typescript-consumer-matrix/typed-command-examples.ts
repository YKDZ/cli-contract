import {
  defineCli,
  helpCapability,
  type CommandExampleManifest,
} from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({
  channel: z.enum(["fast", "safe"]),
  count: z.string().transform(Number).pipe(z.number().int()),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  target: z.string(),
  paths: z.array(z.string()),
});
const fields = {
  channel: {
    kind: "valueOption",
    longOption: "--channel",
    description: "Channel",
  },
  count: {
    kind: "valueOption",
    longOption: "--count",
    description: "Count",
  },
  enabled: {
    kind: "flag",
    longOption: "--enabled",
    negatedLongOption: "--no-enabled",
    description: "Enabled",
  },
  tags: {
    kind: "repeatableOption",
    longOption: "--tag",
    description: "Tags",
  },
  target: { kind: "positional", description: "Target" },
  paths: { kind: "variadicPositional", description: "Paths" },
} as const;
const define = defineCli();

const root = define({
  root: "inspect",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "inspect",
      description: "Root command example",
      fields,
      input,
      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
      examples: [
        {
          input: {
            channel: "fast",
            count: "3",
            enabled: false,
            tags: ["one", "two"],
            target: "build",
            paths: ["src", "test"],
          },
        },
        {
          input: {
            channel: "safe",
            count: "4",
            enabled: true,
            tags: ["release"],
            target: "publish",
            paths: ["dist"],
          },
          outputMode: "structured",
        },
      ],
    },
  },
});

const leafCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Leaf command example",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  examples: [
    {
      input: {
        channel: "fast",
        count: "5",
        enabled: false,
        tags: ["leaf"],
        target: "build",
        paths: ["packages", "lib"],
      },
    },
  ],
});
const leaf = define({
  root: "workspace",
  help: helpCapability({ wording: { commandPlaceholder: "command" } }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "Workspace",
    },
    ...leafCommand,
  },
});

const invalidEnumCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Enum negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  // @ts-expect-error The input schema's enum constraint also applies to raw examples.
  examples: [
    {
      input: {
        channel: "turbo",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const invalidModeCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Mode negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  // @ts-expect-error A fixed output mode must belong to the command's closed mode set.
  examples: [
    {
      input: {
        channel: "safe",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
      outputMode: "text",
    },
  ],
});

const invalidRootModeCommand = define({
  root: "inspect",
  help: helpCapability(),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "inspect",
      description: "Root mode negative",
      fields,
      input,
      outputs({ atomic }) {
        const operation = atomic({
          success: { kind: "completion" },
          failures: {},
          handler: ({ outcome }) => outcome.completion(),
        });
        return {
          modes: {
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
      // @ts-expect-error A root example cannot select a mode outside its own closed table.
      examples: [
        {
          input: {
            channel: "safe",
            count: "3",
            enabled: true,
            tags: ["one"],
            target: "build",
            paths: ["src"],
          },
          outputMode: "text",
        },
      ],
    },
  },
});

const missingInputCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Required negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  // @ts-expect-error Required input schema fields cannot be omitted from an example.
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
      },
    },
  ],
});

const inputWithExtra = {
  channel: "fast" as const,
  count: "3",
  enabled: true,
  tags: ["one"],
  target: "build",
  paths: ["src"] as [string, ...string[]],
  extra: "not declared",
};
const extraInputCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Extra field negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  // @ts-expect-error Extra fields in an extracted variable are still subject to the closed input check.
  examples: [{ input: inputWithExtra }],
});

const misspelledMemberCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Misspelled member negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  examples: [
    {
      input: {
        channel: "safe",
        count: "3",
        enabled: true,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
      // @ts-expect-error Example members use closed spelling.
      outputmode: "structured",
    },
  ],
});

const readonlyTags = ["read-only"] as const;
const readonlyArrayCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Readonly array negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: true,
        // @ts-expect-error A readonly array cannot satisfy the schema's mutable array Input.
        tags: readonlyTags,
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const emptyRepeatableCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Empty repeatable array negative",
  fields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: true,
        // @ts-expect-error A repeatable field must contain at least one raw value.
        tags: [],
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const unnegatedFlagFields = {
  ...fields,
  enabled: {
    kind: "flag",
    longOption: "--enabled",
    description: "Enabled",
  },
} as const;
const unnegatedFalseFlagCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Non-negatable flag negative",
  fields: unnegatedFlagFields,
  input,
  outputs({ atomic }) {
    const operation = atomic({
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    });
    return {
      modes: {
        structured: operation.structured({ description: "Structured output" }),
      },
    };
  },
  // @ts-expect-error A flag without a negated spelling cannot use a false raw value.
  examples: [
    {
      input: {
        channel: "fast",
        count: "3",
        enabled: false,
        tags: ["one"],
        target: "build",
        paths: ["src"],
      },
    },
  ],
});

const manifestExample: CommandExampleManifest = {
  argv: ["inspect", "--count=3"],
  shell: "'tool' 'inspect' '--count=3'",
};

void root;
void leaf;
void invalidEnumCommand;
void invalidModeCommand;
void invalidRootModeCommand;
void missingInputCommand;
void extraInputCommand;
void misspelledMemberCommand;
void readonlyArrayCommand;
void emptyRepeatableCommand;
void unnegatedFalseFlagCommand;
void manifestExample;
