import {
  getCompiledCli,
  type CliContract,
  type CliContractRoot,
} from "#/cli-contract";
import type { EmptyCliInput } from "#/contract-schema";

const cliInvocationType = Symbol("CliInvocation.type");
const invocationContracts = new WeakMap<object, object>();

export interface ParsedInvocation<Command extends string> {
  readonly kind: "parsed";
  readonly command: Command;
  readonly input: EmptyCliInput;
  readonly outputFormat: "structured";
}

export interface HelpRequest<Command extends string> {
  readonly kind: "help";
  readonly command: Command;
}

export interface UnexpectedPositionalIssue {
  readonly code: "unexpectedPositional";
  readonly position: number;
  readonly value: string;
}

export interface CommandUsage<Command extends string> {
  readonly command: Command;
  readonly synopsis: string;
}

export interface UsageFailure<Command extends string> {
  readonly kind: "usageFailure";
  readonly command: Command;
  readonly issues: readonly [UnexpectedPositionalIssue];
  readonly usage: CommandUsage<Command>;
}

export type CliInvocation<Contract extends CliContract = CliContract> =
  UnboundCliInvocation<Contract> & {
    readonly [cliInvocationType]: Contract;
  };

type UnboundCliInvocation<Contract extends CliContract> =
  | ParsedInvocation<CliContractRoot<Contract>>
  | HelpRequest<CliContractRoot<Contract>>
  | UsageFailure<CliContractRoot<Contract>>;

export function parseCliInvocation<const Contract extends CliContract>(
  cliContract: Contract,
  argv: readonly string[],
): CliInvocation<Contract> {
  const compiled = getCompiledCli(cliContract);

  if (argv[0] === compiled.contract.grammar.controls.help.longOption) {
    return bindInvocation(cliContract, {
      kind: "help",
      command: compiled.root,
    });
  }
  if (argv.length === 0) {
    return bindInvocation(cliContract, {
      kind: "parsed",
      command: compiled.root,
      input: Object.freeze({}) as EmptyCliInput,
      outputFormat: "structured",
    });
  }

  return bindInvocation(cliContract, {
    kind: "usageFailure",
    command: compiled.root,
    issues: Object.freeze([
      Object.freeze({
        code: "unexpectedPositional",
        position: 0,
        value: argv[0] ?? "",
      }),
    ]) as readonly [UnexpectedPositionalIssue],
    usage: compiled.usage,
  });
}

export function invocationBelongsTo(
  invocation: object,
  contract: object,
): boolean {
  return invocationContracts.get(invocation) === contract;
}

function bindInvocation<Contract extends CliContract>(
  contract: Contract,
  invocation: UnboundCliInvocation<Contract>,
): CliInvocation<Contract> {
  const bound = Object.freeze(invocation) as CliInvocation<Contract>;
  invocationContracts.set(bound, contract);
  return bound;
}
