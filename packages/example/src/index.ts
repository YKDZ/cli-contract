import {
  defineCli,
  helpCapability,
  schemaCapability,
  text,
  versionCapability,
} from "@ykdz/cli-contract";
import coreMetadata from "@ykdz/cli-contract/package.json" with { type: "json" };
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

const lookupInput = z.object({ id: z.string().min(1) });
const lookupSuccess = {
  kind: "data" as const,
  variants: {
    found: {
      description: "User found",
      schema: userSchema,
      exitCode: 0,
    },
  },
};
const lookupFailures = {
  notFound: {
    description: "User not found",
    schema: unavailableUserSchema,
    exitCode: 1,
  },
};
const lookup = define.command("lookup")({
  kind: "command",
  parent: "users",
  name: "get",
  description: "Look up a user",
  fields: { id: { kind: "positional", description: "User identifier" } },
  input: lookupInput,
  examples: [
    { input: { id: "alice" } },
    { input: { id: "alice" }, outputMode: "structured" },
  ],
  outputs: define.outputModes("lookup", lookupInput, (mode) => ({
    default: "text",
    modes: {
      structured: mode.atomic({
        description: "User profile for programmatic consumption",
        format: "structured",
        success: lookupSuccess,
        failures: lookupFailures,
        handler({ input, outcome }) {
          const user = users.get(input.id);
          return user
            ? outcome.data.found(user)
            : outcome.failure.notFound({ id: input.id });
        },
      }),
      text: mode.atomic({
        description: "User profile for human reading",
        format: "text",
        success: {
          kind: "data",
          variants: {
            found: {
              ...lookupSuccess.variants.found,
              text: (user) => text.lines(["User profile", user.name]),
            },
          },
        },
        failures: {
          notFound: {
            ...lookupFailures.notFound,
            text: ({ id }) =>
              text.lines([
                `User ${id} not found`,
                "",
                "Check the user identifier",
              ]),
          },
        },
        handler({ input, outcome }) {
          const user = users.get(input.id);
          return user
            ? outcome.data.found(user)
            : outcome.failure.notFound({ id: input.id });
        },
      }),
    },
  })),
});

const logsInput = z.object({});
const logs = define.command("logs")({
  kind: "command",
  parent: "users",
  name: "logs",
  description: "Stream logs in real time",
  fields: {},
  input: logsInput,
  outputs: define.outputModes("logs", logsInput, (mode) => ({
    default: "text",
    modes: {
      structured: mode.stream({
        description: "Emit log records and terminal state as NDJSON",
        format: "structured",
        success: {
          kind: "stream",
          records: {
            entry: {
              description: "Log entry",
              schema: logSchema,
            },
          },
        },
        failures: {},
        async *handler({ dependencies, outcome }) {
          for await (const entry of dependencies.readLogs()) {
            yield outcome.record.entry(entry);
          }
          return outcome.streamSuccess();
        },
      }),
      text: mode.stream({
        description: "Emit log text line by line",
        format: "text",
        success: {
          kind: "stream",
          records: {
            entry: {
              description: "Log entry",
              schema: logSchema,
              text: ({ message }) => text.fragment(`${message}\n`),
            },
          },
          text: () => text.silent,
        },
        failures: {},
        async *handler({ dependencies, outcome }) {
          for await (const entry of dependencies.readLogs()) {
            yield outcome.record.entry(entry);
          }
          return outcome.streamSuccess();
        },
      }),
    },
  })),
});

const validateInput = z.object({
  id: z.string().min(1).optional(),
  email: z.email().optional(),
  domain: z.string().min(1).optional(),
});
const validateFailures = {
  emailDomainMismatch: {
    description: "Email does not belong to the specified domain",
    schema: emailMismatchSchema,
    exitCode: 1,
  },
};
function validateUser(input: z.output<typeof validateInput>) {
  if (input.email !== undefined && input.domain !== undefined) {
    const emailDomain = input.email.slice(input.email.lastIndexOf("@") + 1);
    if (emailDomain.toLowerCase() !== input.domain.toLowerCase()) {
      return {
        kind: "emailDomainMismatch" as const,
        email: input.email,
        domain: input.domain,
      };
    }
  }
  return { kind: "valid" as const };
}
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
  input: validateInput,
  usageConstraints: [
    { kind: "count", fields: ["id", "email"], min: 1, max: 1 },
    {
      kind: "when",
      all: [{ kind: "present", field: "domain" }],
      onMatch: { require: ["email"] },
    },
  ],
  outputs: define.outputModes("validate", validateInput, (mode) => ({
    default: "text",
    modes: {
      structured: mode.atomic({
        description: "Validation failures for programmatic consumption",
        format: "structured",
        success: { kind: "completion" },
        failures: validateFailures,
        handler({ input, outcome }) {
          const result = validateUser(input);
          return result.kind === "valid"
            ? outcome.completion()
            : outcome.failure.emailDomainMismatch(result);
        },
      }),
      text: mode.atomic({
        description: "Validation results for direct reading",
        format: "text",
        success: {
          kind: "completion",
          text: () => text.silent,
        },
        failures: {
          emailDomainMismatch: {
            ...validateFailures.emailDomainMismatch,
            text: ({ email, domain }) =>
              text.lines([
                `Email ${email} does not belong to domain ${domain}`,
              ]),
          },
        },
        handler({ input, outcome }) {
          const result = validateUser(input);
          return result.kind === "valid"
            ? outcome.completion()
            : outcome.failure.emailDomainMismatch(result);
        },
      }),
    },
  })),
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
      choices: "(choices: {choices})",
      default: "(default: {value})",
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
