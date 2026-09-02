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

export interface UnknownOptionIssue {
  readonly code: "unknownOption";
  readonly position: number;
  readonly option: string;
}

export interface MissingOptionValueIssue {
  readonly code: "missingOptionValue";
  readonly position: number;
  readonly field: string;
  readonly option: string;
}

export interface UnexpectedOptionValueIssue {
  readonly code: "unexpectedOptionValue";
  readonly position: number;
  readonly field: string;
  readonly option: string;
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

export type UsageIssue =
  | InputRejectedIssue
  | MissingOptionValueIssue
  | UnexpectedOptionValueIssue
  | UnexpectedPositionalIssue
  | UnknownOptionIssue;
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

  const input: Record<string, boolean | string> = {};
  const positionals = compiled.fields.filter(
    (field) => field.kind === "positional",
  );
  let positionalIndex = 0;
  let optionsEnabled = true;
  for (let position = 0; position < argv.length; position += 1) {
    const token = argv[position] as string;
    if (optionsEnabled && token === "--") {
      optionsEnabled = false;
      continue;
    }
    if (
      optionsEnabled &&
      token === compiled.contract.grammar.controls.help.longOption
    ) {
      return bindInvocation(cliContract, {
        kind: "help",
        command: root,
      });
    }
    if (optionsEnabled && token.startsWith("-") && token !== "-") {
      const option = readOptionToken(token);
      const field = compiled.fields.find(
        (candidate) =>
          candidate.kind !== "positional" &&
          (candidate.longOption === option.spelling ||
            candidate.shortAlias === option.spelling),
      );
      if (field === undefined) {
        return usageFailure(cliContract, root, usage, {
          code: "unknownOption",
          position,
          option: token,
        });
      }
      if (field.kind === "flag") {
        if (option.value !== undefined) {
          return usageFailure(cliContract, root, usage, {
            code: "unexpectedOptionValue",
            position,
            field: field.key,
            option: option.spelling,
            value: option.value,
          });
        }
        input[field.key] = true;
        continue;
      }
      if (option.value !== undefined) {
        input[field.key] = option.value;
        continue;
      }
      const value = argv[position + 1];
      if (value === undefined || (value.startsWith("-") && value !== "-")) {
        return usageFailure(cliContract, root, usage, {
          code: "missingOptionValue",
          position,
          field: field.key,
          option: option.spelling,
        });
      }
      input[field.key] = value;
      position += 1;
      continue;
    }

    const positional = positionals[positionalIndex];
    if (positional === undefined) {
      return unexpectedPositional(cliContract, root, usage, position, token);
    }
    input[positional.key] = token;
    positionalIndex += 1;
  }

  return bindInvocation(cliContract, {
    kind: "parsed",
    command: root,
    input: Object.freeze(input) as CliContractRawInput<Contract>,
    outputFormat: "structured",
  });
}

function readOptionToken(token: string): Readonly<{
  spelling: string;
  value?: string;
}> {
  if (!token.startsWith("--")) return { spelling: token };
  const equals = token.indexOf("=");
  return equals === -1
    ? { spelling: token }
    : { spelling: token.slice(0, equals), value: token.slice(equals + 1) };
}

function unexpectedPositional<Contract extends CliContract>(
  contract: Contract,
  command: CliContractRoot<Contract>,
  usage: CommandUsage<CliContractRoot<Contract>>,
  position: number,
  value: string,
): CliInvocation<Contract> {
  return usageFailure(contract, command, usage, {
    code: "unexpectedPositional",
    position,
    value,
  });
}

function usageFailure<Contract extends CliContract>(
  contract: Contract,
  command: CliContractRoot<Contract>,
  usage: CommandUsage<CliContractRoot<Contract>>,
  issue: UsageIssue,
): CliInvocation<Contract> {
  return bindInvocation(contract, {
    kind: "usageFailure",
    command,
    issues: Object.freeze([Object.freeze(issue)]) as readonly [UsageIssue],
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
