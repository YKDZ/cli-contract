import { executeCli, parseCliInvocation } from "@ykdz/cli-contract";
import { nodeCliOutput } from "@ykdz/cli-contract/node";

import { reinsCli } from "./contract.ts";

const invocation = parseCliInvocation(reinsCli, process.argv.slice(2));
const termination = await executeCli(reinsCli, {
  dependencies: undefined,
  invocation,
  write: nodeCliOutput({ stdout: process.stdout, stderr: process.stderr }),
});

// Reins 的宿主拥有进程状态；公共 core 不调用 process.exit().
process.exitCode = termination.exitCode;
