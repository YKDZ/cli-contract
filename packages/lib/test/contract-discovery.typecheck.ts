import {
  defineCli,
  executeCli,
  parseCliInvocation,
  schemaCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

const define = defineCli<Readonly<{ readonly serviceName: string }>>();
const input = z.object({ id: z.string() });
const cli = define({
  root: "inspect",
  help: englishHelpCapability(),
  schema: schemaCapability({ description: text.line("查询契约。") }),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "inspect",
      description: "查询对象。",
      fields: { id: { kind: "positional", description: "对象标识。" } },
      input,
      outputs: define.outputModes("inspect", input, (mode) => ({
        default: "json",
        modes: {
          json: mode.atomic({
            description: "结构化结果。",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ dependencies, outcome }) => {
              dependencies.serviceName satisfies string;
              return outcome.completion();
            },
          }),
        },
      })),
    },
  },
});

const schemaInvocation = parseCliInvocation(cli, ["--schema=input"]);
if (schemaInvocation.kind === "schema") {
  void executeCli(cli, {
    invocation: schemaInvocation,
    write: () => undefined,
  });
}

const applicationInvocation = parseCliInvocation(cli, ["Ada"]);
if (applicationInvocation.kind === "parsed") {
  // @ts-expect-error 应用调用仍然必须提供精确业务依赖。
  void executeCli(cli, {
    invocation: applicationInvocation,
    write: () => undefined,
  });
  void executeCli(cli, {
    invocation: applicationInvocation,
    dependencies: { serviceName: "directory" },
    write: () => undefined,
  });
}
