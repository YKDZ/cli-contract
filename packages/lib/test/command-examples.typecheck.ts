import {
  defineCli,
  helpCapability,
  text,
  type CommandExampleManifest,
  type OutputExecutionFactory,
} from "@ykdz/cli-contract";
import { z } from "zod";

const exampleInput = z.object({
  count: z.string().transform(Number).pipe(z.number().int()),
  channel: z.enum(["fast", "safe"]),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  first: z.string().optional(),
  second: z.string().optional(),
  paths: z.array(z.string()),
});
const exampleFields = {
  count: {
    kind: "valueOption",
    longOption: "--count",
    description: "Count",
  },
  channel: {
    kind: "valueOption",
    longOption: "--channel",
    description: "Channel",
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
    description: "Tag",
  },
  first: { kind: "positional", description: "First item" },
  second: { kind: "positional", description: "Second item" },
  paths: { kind: "variadicPositional", description: "Paths" },
} as const;

const define = defineCli();
const outputs = ({
  atomic,
}: OutputExecutionFactory<"inspect", undefined, typeof exampleInput>) => {
  const completion = atomic({
    success: { kind: "completion" },
    failures: {},
    handler: ({ outcome }) => outcome.completion(),
  });
  return {
    default: "structured",
    modes: {
      structured: completion.structured({
        description: "Machine-readable result",
      }),
      text: completion.text({
        description: "Human-readable result",
        success: () => text.silent,
        failures: {},
      }),
    },
  } as const;
};

const root = define({
  root: "inspect",
  help: helpCapability({
    wording: {
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "tool",
      description: "Inspect input",
      fields: exampleFields,
      input: exampleInput,
      outputs,
      examples: [
        {
          input: {
            count: "4",
            channel: "fast",
            enabled: false,
            tags: ["one", "two"],
            paths: ["first", "second"],
          },
        },
        {
          input: {
            count: "5",
            channel: "safe",
            enabled: true,
            tags: ["three"],
            first: "left",
            second: "right",
            paths: ["tail"],
          },
          outputMode: "text",
        },
      ],
    },
  },
});

const leafCommand = define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: false,
        tags: ["one"],
        paths: ["first"],
      },
    },
  ],
});
const leaf = define({
  root: "workspace",
  help: helpCapability({
    wording: {
      commandPlaceholder: "command",
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
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

const manifestExample: CommandExampleManifest = {
  argv: ["inspect", "--count=4"],
  shell: "'workspace' 'inspect' '--count=4'",
};

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error Input enum values come from the contract schema
  examples: [
    {
      input: {
        count: "4",
        channel: "turbo",
        enabled: true,
        tags: ["one"],
        paths: ["first"],
      },
    },
  ],
});

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error A pinned output mode must come from this command's closed mode set
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: ["one"],
        paths: ["first"],
      },
      outputMode: "json",
    },
  ],
});

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error Required schema Input fields must also appear in the sample
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: ["one"],
      },
    },
  ],
});

const inputWithExtraField = {
  count: "4",
  channel: "fast" as const,
  enabled: true,
  tags: ["one"],
  paths: ["first"] as [string, ...string[]],
  extra: "not declared",
};
define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error Extracted inputs must use declared field keys.
  examples: [{ input: inputWithExtraField }],
});

define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error Example members must use their declared spellings.
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        tags: ["one"],
        paths: ["first"],
      },
      outputmode: "text",
    },
  ],
});

const readonlyTags = ["readonly"] as const;
define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: exampleFields,
  input: exampleInput,
  outputs,
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: true,
        // @ts-expect-error The raw schema expects a mutable array.
        tags: readonlyTags,
        paths: ["first"],
      },
    },
  ],
});

const unnegatedFlagFields = {
  ...exampleFields,
  enabled: {
    kind: "flag",
    longOption: "--enabled",
    description: "Enabled",
  },
} as const;
define.command("inspect")({
  kind: "command",
  parent: "workspace",
  name: "inspect",
  description: "Inspect input",
  fields: unnegatedFlagFields,
  input: exampleInput,
  outputs,
  // @ts-expect-error A flag without a negated spelling cannot use false as a raw sample
  examples: [
    {
      input: {
        count: "4",
        channel: "fast",
        enabled: false,
        tags: ["one"],
        paths: ["first"],
      },
    },
  ],
});

const rootGroupWithExamples = {
  kind: "rootGroup",
  name: "workspace",
  description: "Workspace",
  examples: [{ input: {} }],
} as const;
define({
  root: "workspace",
  help: helpCapability({
    wording: {
      commandPlaceholder: "command",
      choices: "(choices: {choices})",
      default: "(default: {value})",
    },
  }),
  usageFailureExitCode: 64,
  commands: {
    // @ts-expect-error A command group is not executable and cannot declare invocation examples
    workspace: {
      ...rootGroupWithExamples,
    },
    ...leafCommand,
  },
});

void manifestExample;
void root;
void leaf;
