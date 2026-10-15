import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const users = new Map([["alice", { name: "Alice" }]]);
const logSchema = z.object({ message: z.string() });

export interface Dependencies {
  readLogs: () => AsyncIterable<z.infer<typeof logSchema>>;
}

const define = defineCli<Dependencies>();

const lookup = define.command("lookup")({
  kind: "command",
  parent: "users",
  name: "get",
  description: "查询用户",
  fields: { id: { kind: "positional", description: "用户标识" } },
  input: z.object({ id: z.string().min(1) }),
  // 业务判断集中在 handler，便于文本和 JSON 保持一致；呈现器的措辞仍需核对。
  success: {
    kind: "data",
    variants: {
      found: {
        description: "找到用户",
        schema: z.object({ name: z.string() }),
        exitCode: 0,
        text: (user) => text.lines(["用户信息", user.name]),
      },
    },
  },
  failures: {
    // 按调用方需要采取的处理方式区分失败，保留判断所需的证据。
    // 类型检查能约束已声明的失败；业务上还缺哪些失败，需要作者判断。
    notFound: {
      description: "用户不存在",
      schema: z.object({ id: z.string() }),
      exitCode: 1,
      text: ({ id }) => text.lines([`用户 ${id} 不存在`, "", "请检查用户标识"]),
    },
  },
  handler({ input, outcome }) {
    const user = users.get(input.id);
    return user
      ? outcome.data.found(user)
      : outcome.failure.notFound({ id: input.id });
  },
});

const logs = define.command("logs")({
  kind: "command",
  parent: "users",
  name: "logs",
  description: "实时输出日志",
  fields: {},
  input: z.object({}),
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
    // NDJSON 读取方收到成功终态后，才能确认日志流已完整结束。
    return outcome.streamSuccess();
  },
});

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
  input: z.object({
    id: z.string().min(1).optional(),
    email: z.string().email().optional(),
    domain: z.string().min(1).optional(),
  }),
  // 模式分别校验字段格式；数量约束选择一种标识，域名条件只允许用于邮箱。
  usageConstraints: [
    { kind: "count", fields: ["id", "email"], min: 1, max: 1 },
    {
      kind: "when",
      all: [{ kind: "present", field: "domain" }],
      onMatch: { require: ["email"] },
    },
  ],
  success: { kind: "completion", text: () => text.silent },
  failures: {
    emailDomainMismatch: {
      description: "邮箱不属于指定域",
      schema: z.object({
        email: z.string().email(),
        domain: z.string().min(1),
      }),
      exitCode: 1,
      text: ({ email, domain }) =>
        text.lines([`邮箱 ${email} 不属于指定域 ${domain}`]),
    },
  },
  handler({ input, outcome }) {
    if (input.email !== undefined && input.domain !== undefined) {
      const emailDomain = input.email.slice(input.email.lastIndexOf("@") + 1);
      if (emailDomain.toLowerCase() !== input.domain.toLowerCase()) {
        return outcome.failure.emailDomainMismatch({
          email: input.email,
          domain: input.domain,
        });
      }
    }
    return outcome.completion();
  },
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
  // 启用 text 会要求每个结果变体都有呈现器，新增变体时也会检查。
  output: outputCapability({
    defaultFormat: "text",
    compatibilityFlags: { "--json": "structured" },
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
