import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const users = new Map([["alice", { name: "Alice" }]]);

export const cli = defineCli()({
  root: "lookup",
  help: helpCapability({
    shortAlias: "-h",
    headings: { usage: "用法", arguments: "参数", options: "选项" },
  }),
  // 启用 text 会要求每个结果变体都有呈现器，新增变体时也会检查。
  output: outputCapability({
    defaultFormat: "text",
    compatibilityFlags: { "--json": "structured" },
  }),
  usageFailureExitCode: 64,
  commands: {
    lookup: {
      kind: "rootCommand",
      name: "user",
      description: "查询用户",
      fields: { id: { kind: "positional", description: "用户标识" } },
      input: z.object({ id: z.string().min(1) }),
      success: {
        kind: "data",
        variants: {
          found: {
            description: "找到用户",
            schema: z.object({ name: z.string() }),
            exitCode: 0,
            text: (user) => text.line(user.name),
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
          text: ({ id }) => text.line(`用户 ${id} 不存在`),
        },
      },
      handler({ input, outcome }) {
        const user = users.get(input.id);
        return user
          ? outcome.data.found(user)
          : outcome.failure.notFound({ id: input.id });
      },
    },
  },
});
