import { executeCli, parseCliInvocation } from "@ykdz/cli-contract";
import { nodeCliOutput } from "@ykdz/cli-contract/node";

import { cli } from "./index.ts";

// Swap `write` to target another runtime; the Node helper handles stream backpressure and write errors.
const invocation = parseCliInvocation(cli, process.argv.slice(2));
const write = nodeCliOutput({ stdout: process.stdout, stderr: process.stderr });
const result =
  invocation.kind === "parsed"
    ? await executeCli(cli, {
        invocation,
        dependencies: { readLogs },
        write,
      })
    : await executeCli(cli, { invocation, write });

// process.exit() can truncate pending stream writes; set exitCode and let Node exit naturally.
process.exitCode = result.exitCode;

// Reads log lines from stdin; any AsyncIterable event subscription can replace this.
async function* readLogs() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const message of lines) yield { message };
  } finally {
    lines.close();
  }
}
import { createInterface } from "node:readline";
