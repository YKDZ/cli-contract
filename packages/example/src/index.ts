import {
  defineCli,
  helpCapability,
  schemaCapability,
  text,
  versionCapability,
} from "@boringparts/cli-contract";
import coreMetadata from "@boringparts/cli-contract/package.json" with { type: "json" };
import { z } from "zod";

const users = new Map([["alice", { name: "Alice" }]]);
const logSchema = z.object({ message: z.string() });
const userSchema = z.object({ name: z.string() });
const unavailableUserSchema = z.object({ id: z.string() });
const emailMismatchSchema = z.object({
  email: z.email(),
  domain: z.string().min(1),
});

export interface Dependencies {
  readLogs: () => AsyncIterable<z.infer<typeof logSchema>>;
}

const define = defineCli<Dependencies>();

const lookup = define.command("lookup")({
  kind: "command",
  parent: "users",
  name: "get",
  description: "Look up a user",
  fields: { id: { kind: "positional", description: "User identifier" } },
  input: z.object({ id: z.string().min(1) }),
  examples: [
    { input: { id: "alice" } },
    { input: { id: "alice" }, outputMode: "structured" },
  ],
  outputs: ({ atomic }) => {
    const lookupUser = atomic({
      success: {
        kind: "data",
        variants: {
          found: {
            description: "User found",
            schema: userSchema,
            exitCode: 0,
          },
        },
      },
      failures: {
        notFound: {
          description: "User not found",
          schema: unavailableUserSchema,
          exitCode: 1,
        },
      },
      handler({ input, outcome }) {
        const user = users.get(input.id);
        return user
          ? outcome.data.found(user)
          : outcome.failure.notFound({ id: input.id });
      },
    });
    return {
      default: "text",
      modes: {
        structured: lookupUser.structured({
          description: "User profile for programmatic consumption",
        }),
        text: lookupUser.text({
          description: "User profile for human reading",
          success: {
            found: (user) => text.lines(["User profile", user.name]),
          },
          failures: {
            notFound: ({ id }) =>
              text.lines([
                `User ${id} not found`,
                "",
                "Check the user identifier",
              ]),
          },
        }),
      },
    };
  },
});

const logs = define.command("logs")({
  kind: "command",
  parent: "users",
  name: "logs",
  description: "Stream logs in real time",
  fields: {},
  input: z.object({}),
  outputs: ({ stream }) => {
    const readLogs = stream({
      records: {
        entry: {
          description: "Log entry",
          schema: logSchema,
        },
      },
      failures: {},
      async *handler({ dependencies, outcome }) {
        for await (const entry of dependencies.readLogs()) {
          yield outcome.record.entry(entry);
        }
        return outcome.streamSuccess();
      },
    });
    return {
      default: "text",
      modes: {
        structured: readLogs.structured({
          description: "Emit log records and terminal state as NDJSON",
        }),
        text: readLogs.text({
          description: "Emit log text line by line",
          records: {
            entry: ({ message }) => text.fragment(`${message}\n`),
          },
          failures: {},
          terminal: () => text.silent,
        }),
      },
    };
  },
});

const validate = define.command("validate")({
  kind: "command",
  parent: "users",
  name: "validate",
  description: "Validate user identifier format and email domain",
  fields: {
    id: {
      kind: "valueOption",
      longOption: "--id",
      description: "User identifier",
    },
    email: {
      kind: "valueOption",
      longOption: "--email",
      description: "Email address",
    },
    domain: {
      kind: "valueOption",
      longOption: "--domain",
      description: "Email domain",
    },
  },
  input: z.object({
    id: z.string().min(1).optional(),
    email: z.email().optional(),
    domain: z.string().min(1).optional(),
  }),
  usageConstraints: [
    { kind: "count", fields: ["id", "email"], min: 1, max: 1 },
    {
      kind: "when",
      all: [{ kind: "present", field: "domain" }],
      onMatch: { require: ["email"] },
    },
  ],
  outputs: ({ atomic }) => {
    const validation = atomic({
      success: { kind: "completion" },
      failures: {
        emailDomainMismatch: {
          description: "Email does not belong to the specified domain",
          schema: emailMismatchSchema,
          exitCode: 1,
        },
      },
      handler({ input: { email, domain }, outcome }) {
        if (email !== undefined && domain !== undefined) {
          const emailDomain = email.slice(email.lastIndexOf("@") + 1);
          if (emailDomain.toLowerCase() !== domain.toLowerCase()) {
            return outcome.failure.emailDomainMismatch({ email, domain });
          }
        }
        return outcome.completion();
      },
    });
    return {
      default: "text",
      modes: {
        structured: validation.structured({
          description: "Validation failures for programmatic consumption",
        }),
        text: validation.text({
          description: "Validation results for direct reading",
          success: () => text.silent,
          failures: {
            emailDomainMismatch: ({ email, domain }) =>
              text.lines([
                `Email ${email} does not belong to domain ${domain}`,
              ]),
          },
        }),
      },
    };
  },
});

export const cli = define({
  root: "users",
  help: helpCapability({
    shortAlias: "-h",
    headings: {
      usage: "Usage",
      commands: "Commands",
      arguments: "Arguments",
      options: "Options",
      schema: "Contract discovery",
      examples: "Examples",
    },
    wording: {
      commandPlaceholder: "command",
      outputModePlaceholder: "mode",
      choicesAndDefault: "{usage} (choices: {choices}; default: {value})",
      list: "{left}, {right}",
      countExactly: "{fields} exactly {count}",
      whenOnMatch: "when all of {facts}, {onMatch}",
      require: "require {fields}",
      present: "{field} is present",
    },
  }),
  version: versionCapability({ value: text.line(coreMetadata.version) }),
  schema: schemaCapability({
    description: text.line(
      "Query command inputs, result contracts, and wire formats.",
    ),
  }),
  usageFailureExitCode: 64,
  commands: {
    users: {
      kind: "rootGroup",
      name: "user",
      description: "User lookup, identifier validation, and logs",
    },
    ...lookup,
    ...logs,
    ...validate,
  },
});
