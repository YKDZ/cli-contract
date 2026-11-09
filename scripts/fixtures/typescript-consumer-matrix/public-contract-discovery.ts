import {
  defineCli,
  executeCli,
  helpCapability,
  parseCliInvocation,
  queryCliContract,
  schemaCapability,
  text,
  type ContractQueryFailureReason,
  type ContractQueryResult,
  type ContractSummaryQuery,
} from "@ykdz/cli-contract";
import { z } from "zod";

const define = defineCli<Readonly<{ readonly directory: string }>>();
const input = z.object({ id: z.string() });
const contract = define({
  root: "inspect",
  help: helpCapability(),
  schema: schemaCapability({ description: text.line("查询契约。") }),
  usageFailureExitCode: 64,
  commands: {
    inspect: {
      kind: "rootCommand",
      name: "inspect",
      description: "查询对象。",
      fields: { id: { kind: "positional", description: "对象标识。" } },
      input,
      examples: [{ input: { id: "alice" } }],
      outputs: define.outputModes("inspect", input, (mode) => ({
        default: "json",
        modes: {
          json: mode.atomic({
            description: "结构化对象。",
            format: "structured",
            success: { kind: "completion" },
            failures: {},
            handler: ({ dependencies, outcome }) => {
              const directory: string = dependencies.directory;
              void directory;
              return outcome.completion();
            },
          }),
        },
      })),
    },
  },
});

const summary: ContractQueryResult = queryCliContract(contract, []);
if (summary.kind === "summary") {
  const publicSummary: ContractSummaryQuery = summary;
  const nextArgv: readonly string[] = publicSummary.next[0]!.argv;
  const exampleArgv: readonly string[] = publicSummary.examples[0]!.argv;
  const defaultMode: string = publicSummary.outputs.default;
  void nextArgv;
  void exampleArgv;
  void defaultMode;

  // @ts-expect-error 目录的 children 不属于命令摘要。
  const invalidChildren: unknown = publicSummary.children;
  void invalidChildren;
}

const success = queryCliContract(contract, [], "success:json");
if (success.kind === "success") {
  const mode: string = success.mode;
  void mode;
}

const failure = queryCliContract(contract, ["missing"]);
if (failure.kind === "queryFailure") {
  const reason: ContractQueryFailureReason = failure.reason;
  void reason;
}

const schemaInvocation = parseCliInvocation(contract, [
  "--schema=success:json",
]);
if (schemaInvocation.kind === "schema") {
  void executeCli(contract, {
    invocation: schemaInvocation,
    write: () => undefined,
  });
}

const applicationInvocation = parseCliInvocation(contract, ["alice"]);
if (applicationInvocation.kind === "parsed") {
  // @ts-expect-error 应用执行仍要求真实消费者依赖。
  void executeCli(contract, {
    invocation: applicationInvocation,
    write: () => undefined,
  });
  void executeCli(contract, {
    invocation: applicationInvocation,
    dependencies: { directory: "people" },
    write: () => undefined,
  });
}
