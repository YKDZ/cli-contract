import type { Writable } from "node:stream";

import { nodeCliOutput } from "@ykdz/cli-contract/node";

void nodeCliOutput({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 跨包编译矩阵故意使用仅供类型检查的 Writable 占位。
  stdout: null as unknown as Writable,
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 跨包编译矩阵故意使用仅供类型检查的 Writable 占位。
  stderr: null as unknown as Writable,
});
