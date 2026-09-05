import type { Writable } from "node:stream";

import { nodeCliOutput } from "@ykdz/cli-contract/node";

void nodeCliOutput({
  stdout: null as unknown as Writable,
  stderr: null as unknown as Writable,
});
