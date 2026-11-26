import {
  defineCli,
  executeCli,
  parseCliInvocation,
  schemaCapability,
  text,
} from "@boringparts/cli-contract";
import { z } from "zod";

import { englishHelpCapability } from "./english-help.ts";

const define = defineCli<Readonly<{ readonly serviceName: string }>>();
const input = z.object({ id: z.string() });
const cli = define({
  root: "inspect",
  help: englishHelpCapability(),
  schema: schemaCapability({ description: text.line("Query the contract.") }),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "inspect",
      description: "Query an object.",
      fields: { id: { kind: "positional", description: "Object identifier." } },
      input,
      outputs: (mode) => ({
        default: "json",
        modes: {
          json: mode
            .atomic({
              success: {
                kind: "completion",
              },
              failures: {},
              handler: ({ dependencies, outcome }) => {
                dependencies.serviceName satisfies string;
                return outcome.completion();
              },
            })
            .structured({
              description: "Structured result.",
            }),
        },
      }),
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
  // @ts-expect-error Application invocations still require the exact business dependencies.
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
