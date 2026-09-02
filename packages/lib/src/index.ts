export {
  defineCli,
  helpCapability,
  outputCapability,
  type CliContract,
  type CliContractDependencies,
  type CliContractRoot,
  type CliGrammar,
  type CliManifest,
  type CompletionFact,
  type CompletionHandlerContext,
  type CompletionOutcome,
  type HelpCapability,
  type OutputCapability,
  type RootCliDefinition,
  type RootCommandDefinition,
  type RootCommandGrammar,
  type RootCommandManifest,
} from "#/cli-contract";
export {
  executeCli,
  type CliOutput,
  type CliOutputDestination,
  type CliTermination,
  type ExecuteCliOptions,
  type WriteCliOutput,
} from "#/cli-execution";
export {
  parseCliInvocation,
  type CliInvocation,
  type CommandUsage,
  type HelpRequest,
  type ParsedInvocation,
  type UnexpectedPositionalIssue,
  type UsageFailure,
} from "#/cli-invocation";
export type {
  ContractSchema,
  EmptyCliInput,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "#/contract-schema";
