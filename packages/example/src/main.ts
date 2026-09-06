import { executeCli, parseCliInvocation } from "@ykdz/cli-contract";
import { nodeCliOutput } from "@ykdz/cli-contract/node";

import { cli } from "./index.ts";

// 换运行环境时替换 write 即可；这里用 Node 辅助函数处理流的背压和写入错误。
const result = await executeCli(cli, {
  invocation: parseCliInvocation(cli, process.argv.slice(2)),
  dependencies: { readLogs },
  write: nodeCliOutput({ stdout: process.stdout, stderr: process.stderr }),
});

// process.exit() 可能截断流写入；设置 exitCode 让 Node 自然退出。
process.exitCode = result.exitCode;

// 此处从 stdin 接收日志，也可以接入返回 AsyncIterable 的事件订阅。
async function* readLogs() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const message of lines) yield { message };
  } finally {
    lines.close();
  }
}
import { createInterface } from "node:readline";
