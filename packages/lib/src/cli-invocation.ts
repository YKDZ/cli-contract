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

export interface OptionOccurrenceEvidence {
  readonly position: number;
  readonly option: string;
}

export interface MissingRequiredFieldIssue {
  readonly code: "missingRequiredField";
  readonly field: string;
}

export interface RepeatedOptionIssue {
  readonly code: "repeatedOption";
  readonly field: string;
  readonly occurrences: readonly [
    OptionOccurrenceEvidence,
    OptionOccurrenceEvidence,
    ...OptionOccurrenceEvidence[],
  ];
}

export interface ConflictingFlagIssue {
  readonly code: "conflictingFlag";
  readonly field: string;
  readonly positiveOccurrences: readonly [
    OptionOccurrenceEvidence,
    ...OptionOccurrenceEvidence[],
  ];
  readonly negativeOccurrences: readonly [
    OptionOccurrenceEvidence,
    ...OptionOccurrenceEvidence[],
  ];
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
  | ConflictingFlagIssue
  | InputRejectedIssue
  | MissingOptionValueIssue
  | MissingRequiredFieldIssue
  | RepeatedOptionIssue
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

  const input: Record<string, boolean | string | string[]> = {};
  const occurrencesByField = new Map<string, ParsedOptionOccurrence[]>();
  const positionals = compiled.fields.filter(
    (field) =>
      field.kind === "positional" || field.kind === "variadicPositional",
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
        (
          candidate,
        ): candidate is Extract<
          (typeof compiled.fields)[number],
          { readonly kind: "flag" | "repeatableOption" | "valueOption" }
        > =>
          candidate.kind !== "positional" &&
          candidate.kind !== "variadicPositional" &&
          (candidate.longOption === option.spelling ||
            candidate.shortAlias === option.spelling ||
            (candidate.kind === "flag" &&
              candidate.negatedLongOption === option.spelling)),
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
        const polarity =
          option.spelling === field.negatedLongOption ? "negative" : "positive";
        input[field.key] = polarity === "positive";
        addOptionOccurrence(
          occurrencesByField,
          field.key,
          position,
          option.spelling,
          polarity,
        );
        continue;
      }
      if (option.value !== undefined) {
        addOptionValue(input, field.key, option.value, field.kind);
        addOptionOccurrence(
          occurrencesByField,
          field.key,
          position,
          option.spelling,
          "value",
        );
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
      addOptionValue(input, field.key, value, field.kind);
      addOptionOccurrence(
        occurrencesByField,
        field.key,
        position,
        option.spelling,
        "value",
      );
      position += 1;
      continue;
    }

    const positional = positionals[positionalIndex];
    if (positional === undefined) {
      return unexpectedPositional(cliContract, root, usage, position, token);
    }
    if (positional.kind === "variadicPositional") {
      const values = input[positional.key];
      input[positional.key] = Array.isArray(values)
        ? [...values, token]
        : [token];
    } else {
      input[positional.key] = token;
      positionalIndex += 1;
    }
  }

  const structuralIssues = collectStructuralIssues(
    compiled.fields,
    input,
    occurrencesByField,
  );
  if (structuralIssues.length > 0) {
    return usageFailureFromIssues(
      cliContract,
      root,
      usage,
      structuralIssues as [UsageIssue, ...UsageIssue[]],
    );
  }

  return bindInvocation(cliContract, {
    kind: "parsed",
    command: root,
    input: freezeRawInput(input) as CliContractRawInput<Contract>,
    outputFormat: "structured",
  });
}

type ParsedOptionOccurrence = OptionOccurrenceEvidence &
  Readonly<{ readonly polarity: "negative" | "positive" | "value" }>;

function addOptionOccurrence(
  occurrencesByField: Map<string, ParsedOptionOccurrence[]>,
  field: string,
  position: number,
  option: string,
  polarity: ParsedOptionOccurrence["polarity"],
): void {
  const occurrences = occurrencesByField.get(field) ?? [];
  occurrences.push({ position, option, polarity });
  occurrencesByField.set(field, occurrences);
}

function collectStructuralIssues(
  fields: ReturnType<typeof getCompiledCli>["fields"],
  input: Readonly<Record<string, boolean | string | string[]>>,
  occurrencesByField: ReadonlyMap<string, readonly ParsedOptionOccurrence[]>,
): UsageIssue[] {
  return fields.flatMap((field): UsageIssue[] => {
    const issues: UsageIssue[] = [];
    if (field.required && !Object.hasOwn(input, field.key)) {
      issues.push({ code: "missingRequiredField", field: field.key });
    }
    if (
      field.kind === "positional" ||
      field.kind === "variadicPositional" ||
      field.kind === "repeatableOption"
    ) {
      return issues;
    }
    const occurrences = occurrencesByField.get(field.key) ?? [];
    if (field.kind === "flag") {
      const positiveOccurrences = occurrences.filter(
        ({ polarity }) => polarity === "positive",
      );
      const negativeOccurrences = occurrences.filter(
        ({ polarity }) => polarity === "negative",
      );
      if (positiveOccurrences.length > 0 && negativeOccurrences.length > 0) {
        issues.push({
          code: "conflictingFlag",
          field: field.key,
          positiveOccurrences: freezeOccurrenceEvidence(
            positiveOccurrences,
          ) as [OptionOccurrenceEvidence, ...OptionOccurrenceEvidence[]],
          negativeOccurrences: freezeOccurrenceEvidence(
            negativeOccurrences,
          ) as [OptionOccurrenceEvidence, ...OptionOccurrenceEvidence[]],
        });
        return issues;
      }
    }
    if (occurrences.length > 1) {
      issues.push({
        code: "repeatedOption",
        field: field.key,
        occurrences: freezeOccurrenceEvidence(occurrences) as [
          OptionOccurrenceEvidence,
          OptionOccurrenceEvidence,
          ...OptionOccurrenceEvidence[],
        ],
      });
    }
    return issues;
  });
}

function freezeOccurrenceEvidence(
  occurrences: readonly ParsedOptionOccurrence[],
): readonly OptionOccurrenceEvidence[] {
  return Object.freeze(
    occurrences.map(({ position, option }) =>
      Object.freeze({ position, option }),
    ),
  );
}

function freezeRawInput(
  input: Record<string, boolean | string | string[]>,
): Readonly<Record<string, boolean | string | readonly string[]>> {
  for (const [field, value] of Object.entries(input)) {
    if (Array.isArray(value)) input[field] = Object.freeze(value) as string[];
  }
  return Object.freeze(input);
}

function addOptionValue(
  input: Record<string, boolean | string | string[]>,
  field: string,
  value: string,
  kind: "repeatableOption" | "valueOption",
): void {
  if (kind === "valueOption") {
    input[field] = value;
    return;
  }
  const values = input[field];
  input[field] = Array.isArray(values) ? [...values, value] : [value];
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
  return usageFailureFromIssues(contract, command, usage, [issue]);
}

function usageFailureFromIssues<Contract extends CliContract>(
  contract: Contract,
  command: CliContractRoot<Contract>,
  usage: CommandUsage<CliContractRoot<Contract>>,
  issues: readonly [UsageIssue, ...UsageIssue[]],
): CliInvocation<Contract> {
  return bindInvocation(contract, {
    kind: "usageFailure",
    command,
    issues: Object.freeze(
      issues.map((issue) => Object.freeze(issue)),
    ) as NonEmptyUsageIssues,
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
