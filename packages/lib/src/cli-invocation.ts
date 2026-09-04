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
  readonly outputFormat: "structured" | "text";
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

export interface UnknownCommandIssue {
  readonly code: "unknownCommand";
  readonly position: number;
  readonly command: string;
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

export interface RequiredByUsageConstraintIssue {
  readonly code: "requiredByUsageConstraint";
  readonly field: string;
  readonly requires: string;
}

export interface ExclusiveUsageConstraintIssue {
  readonly code: "exclusiveUsageConstraint";
  readonly fields: readonly [string, string, ...string[]];
}

export interface ForbiddenUsageCombinationIssue {
  readonly code: "forbiddenUsageCombination";
  readonly values: readonly [
    Readonly<{ readonly field: string; readonly value: boolean | string }>,
    Readonly<{ readonly field: string; readonly value: boolean | string }>,
    ...Readonly<{ readonly field: string; readonly value: boolean | string }>[],
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

export interface InvalidOutputFormatIssue {
  readonly code: "invalidOutputFormat";
  readonly position: number;
  readonly option: string;
  readonly received: string | null;
}

export interface ConflictingOutputFormatIssue {
  readonly code: "conflictingOutputFormat";
  readonly occurrences: readonly [
    Readonly<{
      readonly position: number;
      readonly option: string;
      readonly format: "structured" | "text";
    }>,
    Readonly<{
      readonly position: number;
      readonly option: string;
      readonly format: "structured" | "text";
    }>,
    ...Readonly<{
      readonly position: number;
      readonly option: string;
      readonly format: "structured" | "text";
    }>[],
  ];
}

export type UsageIssue =
  | ConflictingFlagIssue
  | ConflictingOutputFormatIssue
  | ExclusiveUsageConstraintIssue
  | ForbiddenUsageCombinationIssue
  | InputRejectedIssue
  | InvalidOutputFormatIssue
  | MissingOptionValueIssue
  | MissingRequiredFieldIssue
  | RepeatedOptionIssue
  | RequiredByUsageConstraintIssue
  | UnexpectedOptionValueIssue
  | UnexpectedPositionalIssue
  | UnknownCommandIssue
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
  const input: Record<string, boolean | string | string[]> = {};
  const occurrencesByField = new Map<string, ParsedOptionOccurrence[]>();
  const outputOccurrences: OutputFormatOccurrence[] = [];
  let selected = compiled.commands[compiled.root];
  if (selected === undefined)
    throw new Error("compiled root command is missing");
  let position = 0;
  while (selected.kind === "rootGroup" || selected.kind === "commandGroup") {
    const token = argv[position];
    if (
      token === undefined ||
      token === compiled.contract.grammar.controls.help.longOption
    ) {
      return bindInvocation(cliContract, {
        kind: "help",
        command: selected.id as CliContractRoot<Contract>,
      });
    }
    if (
      token === compiled.contract.grammar.controls.output.selector &&
      argv[position + 1] === compiled.contract.grammar.controls.help.longOption
    ) {
      return bindInvocation(cliContract, {
        kind: "help",
        command: selected.id as CliContractRoot<Contract>,
      });
    }
    const output = consumeOutputControl(
      compiled,
      argv,
      position,
      outputOccurrences,
    );
    if (output.kind === "issue") {
      return usageFailure(
        cliContract,
        selected.id as CliContractRoot<Contract>,
        selected.usage as CommandUsage<CliContractRoot<Contract>>,
        output.issue,
      );
    }
    if (output.kind === "consumed") {
      position = output.nextPosition;
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      const option = consumeOption(
        selected.fields,
        argv,
        position,
        input,
        occurrencesByField,
      );
      if (option.kind === "issue") {
        return usageFailure(
          cliContract,
          selected.id as CliContractRoot<Contract>,
          selected.usage as CommandUsage<CliContractRoot<Contract>>,
          option.issue,
        );
      }
      position = option.nextPosition;
      continue;
    }
    const child = Object.values(compiled.commands).find(
      (candidate) =>
        candidate.parent === selected?.id &&
        (candidate.name === token || candidate.aliases.includes(token)),
    );
    if (child === undefined) {
      const issue: UnknownCommandIssue | UnknownOptionIssue =
        token.startsWith("-") && token !== "-"
          ? { code: "unknownOption", position, option: token }
          : { code: "unknownCommand", position, command: token };
      return usageFailure(
        cliContract,
        selected.id as CliContractRoot<Contract>,
        selected.usage as CommandUsage<CliContractRoot<Contract>>,
        issue,
      );
    }
    selected = child;
    position += 1;
  }
  const command = selected.id as CliContractRoot<Contract>;
  const usage = selected.usage as CommandUsage<CliContractRoot<Contract>>;
  const fields = selected.fields;

  const positionals = fields.filter(
    (field) =>
      field.kind === "positional" || field.kind === "variadicPositional",
  );
  let positionalIndex = 0;
  let optionsEnabled = true;
  for (; position < argv.length; position += 1) {
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
        command,
      });
    }
    if (optionsEnabled) {
      if (
        token === compiled.contract.grammar.controls.output.selector &&
        argv[position + 1] ===
          compiled.contract.grammar.controls.help.longOption
      ) {
        return bindInvocation(cliContract, { kind: "help", command });
      }
      const output = consumeOutputControl(
        compiled,
        argv,
        position,
        outputOccurrences,
      );
      if (output.kind === "issue") {
        return usageFailure(cliContract, command, usage, output.issue);
      }
      if (output.kind === "consumed") {
        position = output.nextPosition - 1;
        continue;
      }
    }
    if (optionsEnabled && token.startsWith("-") && token !== "-") {
      const option = consumeOption(
        fields,
        argv,
        position,
        input,
        occurrencesByField,
      );
      if (option.kind === "issue") {
        return usageFailure(cliContract, command, usage, option.issue);
      }
      position = option.nextPosition - 1;
      continue;
    }

    const positional = positionals[positionalIndex];
    if (positional === undefined) {
      return unexpectedPositional(cliContract, command, usage, position, token);
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
    fields,
    input,
    occurrencesByField,
    selected.usageConstraints,
  );
  if (structuralIssues.length > 0) {
    return usageFailureFromIssues(
      cliContract,
      command,
      usage,
      structuralIssues as [UsageIssue, ...UsageIssue[]],
    );
  }

  return bindInvocation(cliContract, {
    kind: "parsed",
    command,
    input: freezeRawInput(input) as CliContractRawInput<Contract>,
    outputFormat:
      outputOccurrences[0]?.format ??
      compiled.contract.grammar.controls.output.defaultFormat,
  });
}

type OutputFormatOccurrence = Readonly<{
  readonly position: number;
  readonly option: string;
  readonly format: "structured" | "text";
}>;

function consumeOutputControl(
  compiled: ReturnType<typeof getCompiledCli>,
  argv: readonly string[],
  position: number,
  occurrences: OutputFormatOccurrence[],
):
  | Readonly<{ readonly kind: "notControl" }>
  | Readonly<{ readonly kind: "consumed"; readonly nextPosition: number }>
  | Readonly<{ readonly kind: "issue"; readonly issue: UsageIssue }> {
  const token = argv[position] as string;
  const option = readOptionToken(token);
  const output = compiled.contract.grammar.controls.output;
  if (output.selector === option.spelling) {
    const value = option.value ?? argv[position + 1];
    if (
      value === undefined ||
      !output.formats.includes(value as "structured" | "text")
    ) {
      return {
        kind: "issue",
        issue: {
          code: "invalidOutputFormat",
          position,
          option: option.spelling,
          received: value ?? null,
        },
      };
    }
    const nextPosition =
      option.value === undefined ? position + 2 : position + 1;
    return selectOutputFormat(
      occurrences,
      {
        position,
        option: option.spelling,
        format: value as "structured" | "text",
      },
      nextPosition,
    );
  }
  const format = output.compatibilityFlags?.[option.spelling];
  if (format === undefined) return { kind: "notControl" };
  if (option.value !== undefined) {
    return {
      kind: "issue",
      issue: {
        code: "invalidOutputFormat",
        position,
        option: option.spelling,
        received: option.value,
      },
    };
  }
  return selectOutputFormat(
    occurrences,
    { position, option: option.spelling, format },
    position + 1,
  );
}

function selectOutputFormat(
  occurrences: OutputFormatOccurrence[],
  occurrence: OutputFormatOccurrence,
  nextPosition: number,
):
  | Readonly<{ readonly kind: "consumed"; readonly nextPosition: number }>
  | Readonly<{
      readonly kind: "issue";
      readonly issue: ConflictingOutputFormatIssue;
    }> {
  occurrences.push(occurrence);
  if (occurrences.length === 1) return { kind: "consumed", nextPosition };
  return {
    kind: "issue",
    issue: {
      code: "conflictingOutputFormat",
      occurrences: Object.freeze([
        ...occurrences,
      ]) as ConflictingOutputFormatIssue["occurrences"],
    },
  };
}

type ParsedOptionOccurrence = OptionOccurrenceEvidence &
  Readonly<{ readonly polarity: "negative" | "positive" | "value" }>;

function consumeOption(
  fields: ReturnType<typeof getCompiledCli>["fields"],
  argv: readonly string[],
  position: number,
  input: Record<string, boolean | string | string[]>,
  occurrencesByField: Map<string, ParsedOptionOccurrence[]>,
):
  | Readonly<{ readonly kind: "consumed"; readonly nextPosition: number }>
  | Readonly<{ readonly kind: "issue"; readonly issue: UsageIssue }> {
  const token = argv[position] as string;
  const option = readOptionToken(token);
  const field = fields.find(
    (
      candidate,
    ): candidate is Extract<
      (typeof fields)[number],
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
    return {
      kind: "issue",
      issue: { code: "unknownOption", position, option: token },
    };
  }
  if (field.kind === "flag") {
    if (option.value !== undefined) {
      return {
        kind: "issue",
        issue: {
          code: "unexpectedOptionValue",
          position,
          field: field.key,
          option: option.spelling,
          value: option.value,
        },
      };
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
    return { kind: "consumed", nextPosition: position + 1 };
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
    return { kind: "consumed", nextPosition: position + 1 };
  }
  const value = argv[position + 1];
  if (value === undefined || (value.startsWith("-") && value !== "-")) {
    return {
      kind: "issue",
      issue: {
        code: "missingOptionValue",
        position,
        field: field.key,
        option: option.spelling,
      },
    };
  }
  addOptionValue(input, field.key, value, field.kind);
  addOptionOccurrence(
    occurrencesByField,
    field.key,
    position,
    option.spelling,
    "value",
  );
  return { kind: "consumed", nextPosition: position + 2 };
}

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
  usageConstraints: ReturnType<
    typeof getCompiledCli
  >["commands"][string]["usageConstraints"],
): UsageIssue[] {
  const fieldIssues = fields.flatMap((field): UsageIssue[] => {
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
  const constraintIssues = usageConstraints.flatMap(
    (constraint): UsageIssue[] => {
      if (constraint.kind === "requires") {
        return Object.hasOwn(input, constraint.field) &&
          !Object.hasOwn(input, constraint.requires)
          ? [
              {
                code: "requiredByUsageConstraint",
                field: constraint.field,
                requires: constraint.requires,
              },
            ]
          : [];
      }
      if (constraint.kind === "exclusive") {
        const present = constraint.fields.filter((field) =>
          Object.hasOwn(input, field),
        );
        return present.length > 1
          ? [
              {
                code: "exclusiveUsageConstraint",
                fields: Object.freeze(present) as [string, string, ...string[]],
              },
            ]
          : [];
      }
      return constraint.values.every(
        ({ field, value }) => input[field] === value,
      )
        ? [
            {
              code: "forbiddenUsageCombination",
              values: constraint.values,
            },
          ]
        : [];
    },
  );
  return [...fieldIssues, ...constraintIssues];
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
