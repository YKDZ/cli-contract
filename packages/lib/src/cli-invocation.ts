import {
  getCompiledCli,
  type CliContract,
  type CliContractRawInput,
  type CliContractRoot,
} from "#/cli-contract";

const cliInvocationType = Symbol("CliInvocation.type");
const invocationContracts = new WeakMap<object, object>();

export interface ParsedInvocation<Command extends string, Input = unknown> {
  readonly kind: "parsed";
  readonly command: Command;
  readonly input: Input;
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

export interface SchemaIssueEvidence {
  readonly message: string;
  readonly path?: readonly (number | string)[];
}

export interface InputRejectedIssue {
  readonly code: "inputRejected";
  readonly evidence: readonly SchemaIssueEvidence[];
}

export type UsageIssue = InputRejectedIssue | UnexpectedPositionalIssue;
export type NonEmptyUsageIssues = readonly [UsageIssue, ...UsageIssue[]];

export interface CommandUsage<Command extends string> {
  readonly command: Command;
  readonly synopsis: string;
}

export interface UsageFailure<Command extends string> {
  readonly kind: "usageFailure";
  readonly command: Command;
  readonly issues: NonEmptyUsageIssues;
  readonly usage: CommandUsage<Command>;
}

export type CliInvocation<Contract extends CliContract = CliContract> =
  UnboundCliInvocation<Contract> & {
    readonly [cliInvocationType]: Contract;
  };

type UnboundCliInvocation<Contract extends CliContract> =
  | ParsedInvocation<CliContractRoot<Contract>, CliContractRawInput<Contract>>
  | HelpRequest<CliContractRoot<Contract>>
  | UsageFailure<CliContractRoot<Contract>>;

export function parseCliInvocation<const Contract extends CliContract>(
  cliContract: Contract,
  argv: readonly string[],
): CliInvocation<Contract> {
  const compiled = getCompiledCli(cliContract);
  const root = compiled.root as CliContractRoot<Contract>;
  const usage = compiled.usage as CommandUsage<CliContractRoot<Contract>>;

  if (argv[0] === compiled.contract.grammar.controls.help.longOption) {
    return bindInvocation(cliContract, {
      kind: "help",
      command: root,
    });
  }
  const input: Record<string, string> = {};
  for (let position = 0; position < argv.length; position += 1) {
    const token = argv[position] as string;
    const field = compiled.fields.find(
      ({ longOption }) =>
        token === longOption || token.startsWith(`${longOption}=`),
    );
    if (field === undefined) {
      return unexpectedPositional(cliContract, root, usage, position, token);
    }

    if (token === field.longOption) {
      const value = argv[position + 1];
      if (value === undefined) {
        return unexpectedPositional(cliContract, root, usage, position, token);
      }
      input[field.key] = value;
      position += 1;
    } else {
      input[field.key] = token.slice(field.longOption.length + 1);
    }
  }

  if (argv.length === 0 || Object.keys(input).length > 0) {
    return bindInvocation(cliContract, {
      kind: "parsed",
      command: root,
      input: Object.freeze(input) as CliContractRawInput<Contract>,
      outputFormat: "structured",
    });
  }

  return unexpectedPositional(cliContract, root, usage, 0, argv[0] ?? "");
}

function unexpectedPositional<Contract extends CliContract>(
  contract: Contract,
  command: CliContractRoot<Contract>,
  usage: CommandUsage<CliContractRoot<Contract>>,
  position: number,
  value: string,
): CliInvocation<Contract> {
  return bindInvocation(contract, {
    kind: "usageFailure",
    command,
    issues: Object.freeze([
      Object.freeze({
        code: "unexpectedPositional",
        position,
        value,
      }),
    ]) as readonly [UnexpectedPositionalIssue],
    usage,
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
