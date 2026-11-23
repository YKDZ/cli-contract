import type { Writable } from "node:stream";

import { nodeCliOutput } from "@ykdz/cli-contract/node";

void nodeCliOutput({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The cross-package compile matrix deliberately uses type-check-only Writable placeholders.
  stdout: null as unknown as Writable,
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The cross-package compile matrix deliberately uses type-check-only Writable placeholders.
  stderr: null as unknown as Writable,
});
