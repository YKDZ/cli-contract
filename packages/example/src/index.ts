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
      description: "找到用户",
      schema: userSchema,
      exitCode: 0,
    },
  },
};
const lookupFailures = {
  notFound: {
    description: "用户不存在",
    schema: unavailableUserSchema,
    exitCode: 1,
  },
};
const lookup = define.command("lookup")({
  kind: "command",
  parent: "users",
  name: "get",
  description: "查询用户",
  fields: { id: { kind: "positional", description: "用户标识" } },
  input: lookupInput,
  examples: [
    { input: { id: "alice" } },
    { input: { id: "alice" }, outputMode: "structured" },
  ],
  outputs: define.outputModes("lookup", lookupInput, (mode) => ({
    default: "text",
    modes: {
      structured: mode.atomic({
        description: "供程序读取的用户资料",
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
        description: "供人阅读的用户资料",
        format: "text",
        success: {
          kind: "data",
          variants: {
            found: {
              ...lookupSuccess.variants.found,
              text: (user) => text.lines(["用户信息", user.name]),
            },
          },
        },
        failures: {
          notFound: {
            ...lookupFailures.notFound,
            text: ({ id }) =>
              text.lines([`用户 ${id} 不存在`, "", "请检查用户标识"]),
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
  description: "实时输出日志",
  fields: {},
  input: logsInput,
  outputs: define.outputModes("logs", logsInput, (mode) => ({
    default: "text",
    modes: {
      structured: mode.stream({
        description: "按 NDJSON 输出日志记录与终态",
        format: "structured",
        success: {
          kind: "stream",
          records: {
            entry: {
              description: "日志记录",
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
        description: "逐行输出日志文本",
        format: "text",
        success: {
          kind: "stream",
          records: {
            entry: {
              description: "日志记录",
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
    description: "邮箱不属于指定域",
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
  description: "校验用户标识格式与邮箱域",
  fields: {
    id: { kind: "valueOption", longOption: "--id", description: "用户标识" },
    email: {
      kind: "valueOption",
      longOption: "--email",
      description: "电子邮箱",
    },
    domain: {
      kind: "valueOption",
      longOption: "--domain",
      description: "邮箱域名",
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
        description: "提供可由程序读取的校验失败",
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
        description: "提供可直接阅读的校验结果",
        format: "text",
        success: {
          kind: "completion",
          text: () => text.silent,
        },
        failures: {
          emailDomainMismatch: {
            ...validateFailures.emailDomainMismatch,
            text: ({ email, domain }) =>
              text.lines([`邮箱 ${email} 不属于指定域 ${domain}`]),
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
      usage: "用法",
      commands: "命令",
      arguments: "参数",
      options: "选项",
      schema: "契约查询",
      examples: "调用示例",
    },
    wording: {
      commandPlaceholder: "命令",
      choices: "（候选：{choices}）",
      default: "（默认：{value}）",
      countExactly: "{fields} 恰好出现 {count} 项",
      whenOnMatch: "当全部满足 {facts} 时，{onMatch}",
      require: "必须提供 {fields}",
      present: "{field} 已提供",
    },
  }),
  version: versionCapability({ value: text.line(coreMetadata.version) }),
  schema: schemaCapability({
    description: text.line("查询命令输入、结果契约与线格式。"),
  }),
  usageFailureExitCode: 64,
  commands: {
    users: {
      kind: "rootGroup",
      name: "user",
      description: "用户查询、标识校验与日志",
    },
    ...lookup,
    ...logs,
    ...validate,
  },
});
