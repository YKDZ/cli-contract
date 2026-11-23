import {
  getCompiledCli,
  isCompiledExecutable,
  type CliContractRawInput,
  type CliContractRoot,
  type AnyCliContract,
  type CliContractUsageFacts,
  type FieldDefinitions,
  type RuntimeCompiledExecutable,
  type WhenUsageConstraint,
  type UsageFact,
} from "#/cli-contract";
import {
  canonicalCommandPath,
  queryCliContract,
  type ContractQueryDocument,
  type ContractQueryFailureReason,
} from "#/contract-discovery";
import { ContractExecutionError } from "#/contract-execution-error";
import { evaluateUsageConstraints } from "#/usage-constraint";

const cliInvocationType = Symbol("CliInvocation.type");
const invocationContracts = new WeakMap<object, object>();

/**
 * Raw input that has passed invocation syntax checks; the contract schema has
 * not validated, transformed, or defaulted it yet. Business handlers should
 * consume the validated input delivered by the execution kernel, not the input
 * here.
 */
export interface ParsedInvocation<Command extends string, Input = unknown> {
  readonly kind: "parsed";
  readonly command: Command;
  readonly input: Input;
  readonly outputMode: string;
}

export interface HelpRequest<Command extends string> {
  readonly kind: "help";
  readonly command: Command;
}

export interface VersionRequest<Command extends string> {
  readonly kind: "version";
  readonly command: Command;
}

export interface SchemaRequest<Command extends string> {
  readonly kind: "schema";
  readonly command: Command;
  readonly document: ContractQueryDocument;
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
  readonly suggestedOption?: string;
}

export interface UnknownCommandIssue {
  readonly code: "unknownCommand";
  readonly position: number;
  readonly command: string;
  readonly suggestedCommand?: string;
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

/** One failed count rule, splitting raw-input fields into present and absent in field declaration order. */
export interface CountConstraintViolationIssue {
  readonly code: "countConstraintViolation";
  readonly min: number;
  readonly max: number;
  readonly presentFields: readonly string[];
  readonly absentFields: readonly string[];
}

/** A single usage issue emitted when every fact in a forbidden combination holds in the raw argv. */
export interface ForbiddenCombinationViolationIssue {
  readonly code: "forbiddenCombinationViolation";
  readonly facts: readonly [UsageFact, ...UsageFact[]];
}

/** The raw argv observation of a present fact reports only the field and whether it occurred. */
export interface PresentUsageObservation<Field extends string = string> {
  readonly kind: "present";
  readonly field: Field;
  readonly present: boolean;
}

/** An equals observation omits actual when the field is absent; when present, actual stays in the raw primitive scalar domain. */
export type EqualsUsageObservation<
  Field extends string = string,
  Expected extends boolean | string = boolean | string,
> =
  | Readonly<{
      readonly kind: "equals";
      readonly field: Field;
      readonly expected: Expected;
      readonly present: false;
    }>
  | Readonly<{
      readonly kind: "equals";
      readonly field: Field;
      readonly expected: Expected;
      readonly present: true;
      readonly actual: boolean | string;
    }>;

export type UsageConstraintObservation<Fact = UsageFact> =
  Fact extends Readonly<{
    readonly kind: "present";
    readonly field: infer Field extends string;
  }>
    ? PresentUsageObservation<Field>
    : Fact extends Readonly<{
          readonly kind: "equals";
          readonly field: infer Field extends string;
          readonly value: infer Expected extends boolean | string;
        }>
      ? EqualsUsageObservation<Field, Expected>
      : never;

type UsageConstraintObservationTuple<Facts extends readonly unknown[]> = {
  readonly [Index in keyof Facts]: UsageConstraintObservation<Facts[Index]>;
};

type EffectFields<
  Effect,
  Member extends "require" | "forbid",
> = Effect extends object
  ? Member extends keyof Effect
    ? Exclude<Effect[Member], undefined> extends readonly (infer Field extends
        string)[]
      ? Field
      : never
    : never
  : never;

/** The complete raw observations and branch effect of one conditional rule; each failed rule produces exactly this one issue. */
export interface ConditionalConstraintViolationIssue<
  Conditions extends readonly unknown[] = readonly UsageConstraintObservation[],
  Branch extends "onMatch" | "otherwise" = "onMatch" | "otherwise",
  MissingField extends string = string,
  ForbiddenField extends string = string,
> {
  readonly code: "conditionalConstraintViolation";
  readonly branch: Branch;
  readonly conditions: Conditions;
  readonly missingRequiredFields: readonly MissingField[];
  readonly presentForbiddenFields: readonly ForbiddenField[];
}

type WhenConstraintUnion<Constraints> =
  Constraints extends readonly (infer Constraint)[]
    ? Extract<Constraint, Readonly<{ readonly kind: "when" }>>
    : Extract<Constraints, Readonly<{ readonly kind: "when" }>>;

type ConditionalConstraintEffectFields<
  Constraints,
  Member extends "require" | "forbid",
> =
  WhenConstraintUnion<Constraints> extends infer Constraint
    ? Constraint extends Readonly<{
        readonly kind: "when";
        readonly onMatch?: infer OnMatch;
        readonly otherwise?: infer Otherwise;
      }>
      ? EffectFields<OnMatch, Member> | EffectFields<Otherwise, Member>
      : never
    : never;

type ConditionalConstraintIssueFor<
  Constraint,
  MissingField extends string,
  ForbiddenField extends string,
> =
  Constraint extends WhenUsageConstraint<FieldDefinitions, unknown>
    ? ConditionalConstraintViolationIssue<
        UsageConstraintObservationTuple<Constraint["all"]>,
        "onMatch" | "otherwise",
        MissingField,
        ForbiddenField
      >
    : never;

type ConditionalConstraintIssues<Constraints> =
  WhenConstraintUnion<Constraints> extends infer Constraint
    ? Constraint extends unknown
      ? ConditionalConstraintIssueFor<
          Constraint,
          ConditionalConstraintEffectFields<Constraints, "require">,
          ConditionalConstraintEffectFields<Constraints, "forbid">
        >
      : never
    : never;

type ContractConditionalUsageIssue<
  Contract,
  Command extends string,
> = string extends keyof CliContractUsageFacts<Contract>
  ? ConditionalConstraintViolationIssue
  : CliContractUsageFacts<Contract> extends Readonly<
        Record<Command, infer Constraints>
      >
    ? ConditionalConstraintIssues<Constraints>
    : never;

export type CliUsageIssue<
  Contract extends AnyCliContract = AnyCliContract,
  Command extends string = CliContractRoot<Contract>,
> =
  | Exclude<UsageIssue, { readonly code: "conditionalConstraintViolation" }>
  | ContractConditionalUsageIssue<Contract, Command>;

export type NonEmptyCliUsageIssues<
  Contract extends AnyCliContract = AnyCliContract,
  Command extends string = CliContractRoot<Contract>,
> = readonly [
  CliUsageIssue<Contract, Command>,
  ...CliUsageIssue<Contract, Command>[],
];

type UsageFailuresForContract<Contract extends AnyCliContract> = {
  [Command in CliContractRoot<Contract>]: UsageFailure<
    Command,
    NonEmptyCliUsageIssues<Contract, Command>
  >;
}[CliContractRoot<Contract>];

export interface SchemaIssueEvidence {
  readonly message: string;
  readonly path?: readonly (number | string)[];
}

export interface InputRejectedIssue {
  readonly code: "inputRejected";
  readonly evidence: readonly SchemaIssueEvidence[];
}

export interface InvalidFieldChoiceIssue {
  readonly code: "invalidFieldChoice";
  readonly position: number;
  readonly field: string;
  readonly value: string;
  readonly choices: readonly string[];
}

export interface InvalidOutputModeIssue {
  readonly code: "invalidOutputMode";
  readonly position: number;
  readonly option: string;
  readonly received: string | null;
  readonly available: readonly string[];
}

export interface InvalidSchemaQueryIssue {
  readonly code: "invalidSchemaQuery";
  readonly position: number;
  readonly option: "--schema";
  readonly target: string | null;
  readonly reason:
    | "invalidSyntax"
    | "unknownPart"
    | "unknownOutputMode"
    | "unsupportedPart";
}

export interface ConflictingOutputModeIssue {
  readonly code: "conflictingOutputMode";
  readonly occurrences: readonly [
    Readonly<{
      readonly position: number;
      readonly option: string;
      readonly mode: string;
    }>,
    Readonly<{
      readonly position: number;
      readonly option: string;
      readonly mode: string;
    }>,
    ...Readonly<{
      readonly position: number;
      readonly option: string;
      readonly mode: string;
    }>[],
  ];
}

export type UsageIssue =
  | ConflictingFlagIssue
  | ConflictingOutputModeIssue
  | CountConstraintViolationIssue
  | ForbiddenCombinationViolationIssue
  | ConditionalConstraintViolationIssue
  | InputRejectedIssue
  | InvalidFieldChoiceIssue
  | InvalidOutputModeIssue
  | InvalidSchemaQueryIssue
  | MissingOptionValueIssue
  | MissingRequiredFieldIssue
  | RepeatedOptionIssue
  | UnexpectedOptionValueIssue
  | UnexpectedPositionalIssue
  | UnknownCommandIssue
  | UnknownOptionIssue;
export type NonEmptyUsageIssues = readonly [UsageIssue, ...UsageIssue[]];

export interface CommandUsage<Command extends string> {
  readonly command: Command;
  readonly synopsis: string;
}

export interface UsageFailure<
  Command extends string,
  Issues extends NonEmptyUsageIssues = NonEmptyUsageIssues,
> {
  readonly kind: "usageFailure";
  readonly command: Command;
  readonly issues: Issues;
  readonly usage: CommandUsage<Command>;
}

/** A closed invocation fact issued by the parser; it may only be handed back to the same contract for execution. Do not assemble one yourself. */
export type CliInvocation<Contract extends AnyCliContract = AnyCliContract> =
  UnboundCliInvocation<Contract> & {
    readonly [cliInvocationType]: Contract;
  };

type UnboundCliInvocation<Contract extends AnyCliContract> =
  | ParsedInvocation<CliContractRoot<Contract>, CliContractRawInput<Contract>>
  | HelpRequest<CliContractRoot<Contract>>
  | VersionRequest<CliContractRoot<Contract>>
  | SchemaRequest<CliContractRoot<Contract>>
  | UsageFailuresForContract<Contract>;

/**
 * Parses host-provided argument tokens into an invocation fact of the same
 * contract, synchronously and without side effects. Arguments start at the
 * command path or a field and exclude the Node executable and script path; the
 * host owns argument sourcing and shell word splitting.
 *
 * The parser checks invocation syntax and usage constraints and keeps the
 * closed branches for help, version, discovery, and usage failure; the parsed
 * raw input has not passed contract schema validation yet. It reads no process
 * or environment, runs no handler, and writes no output. Hand the result to
 * {@link executeCli}, which completes validation and projection.
 */
export function parseCliInvocation<const Contract extends AnyCliContract>(
  cliContract: Contract,
  argv: readonly string[],
): CliInvocation<Contract> {
  const compiled = getCompiledCli(cliContract);
  const input: Record<string, boolean | string | string[]> = {};
  const occurrencesByField = new Map<string, ParsedOptionOccurrence[]>();
  const valueOccurrencesByField = new Map<string, FieldValueOccurrence[]>();
  const outputOccurrences: OutputModeOccurrence[] = [];
  let selected = compiled.commands[compiled.root];
  if (selected === undefined)
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  let position = 0;
  while (!isCompiledExecutable(selected)) {
    const token = argv[position];
    if (token === undefined) {
      return bindInvocation(cliContract, {
        kind: "help",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command id comes from the compiled result of the current Contract; the generic identity is restored here.
        command: selected.id as CliContractRoot<Contract>,
      });
    }
    const eager = detectEagerControl(compiled, token);
    if (eager !== undefined) {
      return handleEagerControl(
        cliContract,
        compiled,
        selected,
        eager,
        token,
        position,
      );
    }
    if (token.startsWith("-") && token !== "-") {
      const option = consumeOption(
        compiled,
        [],
        argv,
        position,
        input,
        occurrencesByField,
        valueOccurrencesByField,
      );
      if (option.kind === "issue") {
        return usageFailure(
          cliContract,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command id comes from the compiled result of the current Contract; the generic identity is restored here.
          selected.id as CliContractRoot<Contract>,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- usage was produced together with the same compiled command; the generic identity is restored here.
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
      const selectedId = selected.id;
      const issue: UnknownCommandIssue = {
        code: "unknownCommand",
        position,
        command: token,
        ...suggestionProperty(
          "suggestedCommand",
          selectUniqueNeighbor(
            token,
            Object.values(compiled.commands)
              .filter((candidate) => candidate.parent === selectedId)
              .flatMap((candidate) => [candidate.name, ...candidate.aliases]),
          ),
        ),
      };
      return usageFailure(
        cliContract,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command id comes from the compiled result of the current Contract; the generic identity is restored here.
        selected.id as CliContractRoot<Contract>,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- usage was produced together with the same compiled command; the generic identity is restored here.
        selected.usage as CommandUsage<CliContractRoot<Contract>>,
        issue,
      );
    }
    selected = child;
    position += 1;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command id comes from the compiled result of the current Contract; the generic identity is restored here.
  const command = selected.id as CliContractRoot<Contract>;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- usage was produced together with the same compiled command; the generic identity is restored here.
  const usage = selected.usage as CommandUsage<CliContractRoot<Contract>>;
  const fields = selected.fields;

  const positionals = fields.filter(
    (field) =>
      field.kind === "positional" || field.kind === "variadicPositional",
  );
  let positionalIndex = 0;
  let optionsEnabled = true;
  for (; position < argv.length; position += 1) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- position is bounded by argv.length, and the public type of argv guarantees string elements.
    const token = argv[position] as string;
    if (optionsEnabled && token === "--") {
      optionsEnabled = false;
      continue;
    }
    const eager = optionsEnabled
      ? detectEagerControl(compiled, token)
      : undefined;
    if (eager !== undefined) {
      return handleEagerControl(
        cliContract,
        compiled,
        selected,
        eager,
        token,
        position,
      );
    }
    if (optionsEnabled) {
      const output = consumeOutputControl(
        compiled,
        selected,
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
        compiled,
        fields,
        argv,
        position,
        input,
        occurrencesByField,
        valueOccurrencesByField,
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
    addFieldValueOccurrence(
      valueOccurrencesByField,
      positional.key,
      position,
      token,
    );
  }

  const structuralIssues = collectStructuralIssues(
    fields,
    input,
    occurrencesByField,
    valueOccurrencesByField,
    selected.usageConstraints,
  );
  if (structuralIssues.length > 0) {
    return usageFailureFromIssues(
      cliContract,
      command,
      usage,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- structuralIssues.length was already checked to be positive.
      structuralIssues as [UsageIssue, ...UsageIssue[]],
    );
  }

  return bindInvocation(cliContract, {
    kind: "parsed",
    command,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The raw input was parsed and frozen by this Contract's field grammar; the generic shape is restored here.
    input: freezeRawInput(input) as CliContractRawInput<Contract>,
    outputMode: outputOccurrences[0]?.mode ?? selected.defaultOutputMode,
  });
}

type OutputModeOccurrence = Readonly<{
  readonly position: number;
  readonly option: string;
  readonly mode: string;
}>;

function detectEagerControl(
  compiled: ReturnType<typeof getCompiledCli>,
  token: string,
): "help" | "version" | "schema" | undefined {
  const help = compiled.contract.grammar.controls.help;
  if (token === help.longOption || token === help.shortAlias) {
    return "help";
  }
  const version = compiled.contract.grammar.controls.version;
  if (
    version !== undefined &&
    (token === version.longOption || token === version.shortAlias)
  ) {
    return "version";
  }
  const schema = compiled.contract.grammar.controls.schema;
  return schema !== undefined &&
    (token === schema.longOption || token.startsWith(`${schema.longOption}=`))
    ? "schema"
    : undefined;
}

function handleEagerControl<Contract extends AnyCliContract>(
  cliContract: Contract,
  compiled: ReturnType<typeof getCompiledCli>,
  command: ReturnType<typeof getCompiledCli>["commands"][string],
  control: "help" | "version" | "schema",
  token: string,
  position: number,
): CliInvocation<Contract> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The command comes from the compiled tree of the current Contract.
  const commandId = command.id as CliContractRoot<Contract>;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- usage was produced together with the same compiled command.
  const usage = command.usage as CommandUsage<CliContractRoot<Contract>>;
  if (control !== "schema") {
    return bindInvocation(cliContract, { kind: control, command: commandId });
  }

  const target =
    token === "--schema" ? undefined : token.slice("--schema=".length);
  const document = queryCliContract(
    cliContract,
    canonicalCommandPath(compiled.commands, command.id),
    target,
  );
  if (document.kind === "queryFailure") {
    return usageFailure(cliContract, commandId, usage, {
      code: "invalidSchemaQuery",
      position,
      option: "--schema",
      target: target ?? null,
      reason: schemaQueryFailureReason(document.reason),
    });
  }
  return bindInvocation(cliContract, {
    kind: "schema",
    command: commandId,
    document,
  });
}

function schemaQueryFailureReason(
  reason: ContractQueryFailureReason,
): InvalidSchemaQueryIssue["reason"] {
  switch (reason) {
    case "invalidSyntax":
    case "unknownPart":
    case "unknownOutputMode":
    case "unsupportedPart":
      return reason;
    case "discoveryNotInstalled":
    case "unknownCommandPath":
      return "unsupportedPart";
  }
}

function consumeOutputControl(
  compiled: ReturnType<typeof getCompiledCli>,
  executable: RuntimeCompiledExecutable,
  argv: readonly string[],
  position: number,
  occurrences: OutputModeOccurrence[],
):
  | Readonly<{ readonly kind: "notControl" }>
  | Readonly<{ readonly kind: "consumed"; readonly nextPosition: number }>
  | Readonly<{ readonly kind: "issue"; readonly issue: UsageIssue }> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Every call site passes the argv token at the current position; the public type guarantees a string.
  const token = argv[position] as string;
  const option = readOptionToken(token);
  if (option.spelling === "--output") {
    const nextToken = argv[position + 1];
    if (
      option.value === undefined &&
      nextToken !== undefined &&
      detectEagerControl(compiled, nextToken) !== undefined
    ) {
      return { kind: "consumed", nextPosition: position + 1 };
    }
    const value = option.value ?? argv[position + 1];
    const available = Object.keys(executable.outputModes);
    if (value === undefined || !Object.hasOwn(executable.outputModes, value)) {
      return {
        kind: "issue",
        issue: {
          code: "invalidOutputMode",
          position,
          option: option.spelling,
          received: value ?? null,
          available: Object.freeze(available),
        },
      };
    }
    const nextPosition =
      option.value === undefined ? position + 2 : position + 1;
    return selectOutputMode(
      occurrences,
      {
        position,
        option: option.spelling,
        mode: value,
      },
      nextPosition,
    );
  }
  return { kind: "notControl" };
}

function selectOutputMode(
  occurrences: OutputModeOccurrence[],
  occurrence: OutputModeOccurrence,
  nextPosition: number,
):
  | Readonly<{ readonly kind: "consumed"; readonly nextPosition: number }>
  | Readonly<{
      readonly kind: "issue";
      readonly issue: ConflictingOutputModeIssue;
    }> {
  occurrences.push(occurrence);
  if (occurrences.length === 1) return { kind: "consumed", nextPosition };
  return {
    kind: "issue",
    issue: {
      code: "conflictingOutputMode",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A single occurrence was already excluded, so the conflict evidence has at least two entries.
      occurrences: Object.freeze([
        ...occurrences,
      ]) as ConflictingOutputModeIssue["occurrences"],
    },
  };
}

type ParsedOptionOccurrence = OptionOccurrenceEvidence &
  Readonly<{ readonly polarity: "negative" | "positive" | "value" }>;

type FieldValueOccurrence = Readonly<{
  readonly position: number;
  readonly value: string;
}>;

function consumeOption(
  compiled: ReturnType<typeof getCompiledCli>,
  fields: RuntimeCompiledExecutable["fields"],
  argv: readonly string[],
  position: number,
  input: Record<string, boolean | string | string[]>,
  occurrencesByField: Map<string, ParsedOptionOccurrence[]>,
  valueOccurrencesByField: Map<string, FieldValueOccurrence[]>,
):
  | Readonly<{ readonly kind: "consumed"; readonly nextPosition: number }>
  | Readonly<{ readonly kind: "issue"; readonly issue: UsageIssue }> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Every call site passes the argv token at the current position; the public type guarantees a string.
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
      issue: {
        code: "unknownOption",
        position,
        option: token,
        ...suggestionProperty(
          "suggestedOption",
          token.startsWith("--")
            ? selectUniqueNeighbor(
                option.spelling,
                longOptionsInScope(compiled, fields),
              )
            : undefined,
        ),
      },
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
    addFieldValueOccurrence(
      valueOccurrencesByField,
      field.key,
      position,
      option.value,
    );
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
  if (
    value !== undefined &&
    detectEagerControl(compiled, value) !== undefined
  ) {
    return { kind: "consumed", nextPosition: position + 1 };
  }
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
  addFieldValueOccurrence(
    valueOccurrencesByField,
    field.key,
    position + 1,
    value,
  );
  addOptionOccurrence(
    occurrencesByField,
    field.key,
    position,
    option.spelling,
    "value",
  );
  return { kind: "consumed", nextPosition: position + 2 };
}

function addFieldValueOccurrence(
  valueOccurrencesByField: Map<string, FieldValueOccurrence[]>,
  field: string,
  position: number,
  value: string,
): void {
  const occurrences = valueOccurrencesByField.get(field) ?? [];
  occurrences.push({ position, value });
  valueOccurrencesByField.set(field, occurrences);
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
  fields: RuntimeCompiledExecutable["fields"],
  input: Readonly<Record<string, boolean | string | string[]>>,
  occurrencesByField: ReadonlyMap<string, readonly ParsedOptionOccurrence[]>,
  valueOccurrencesByField: ReadonlyMap<string, readonly FieldValueOccurrence[]>,
  usageConstraints: RuntimeCompiledExecutable["usageConstraints"],
): UsageIssue[] {
  const fieldIssues = fields.flatMap((field): UsageIssue[] => {
    const issues: UsageIssue[] = [];
    if (field.required && !Object.hasOwn(input, field.key)) {
      issues.push({ code: "missingRequiredField", field: field.key });
    }
    const occurrences = occurrencesByField.get(field.key) ?? [];
    if (
      field.kind !== "positional" &&
      field.kind !== "variadicPositional" &&
      field.kind !== "repeatableOption"
    ) {
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
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Both positive and negative occurrence counts were checked to be positive.
            positiveOccurrences: freezeOccurrenceEvidence(
              positiveOccurrences,
            ) as [OptionOccurrenceEvidence, ...OptionOccurrenceEvidence[]],
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Both positive and negative occurrence counts were checked to be positive.
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
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- occurrences.length was already checked to be greater than one.
          occurrences: freezeOccurrenceEvidence(occurrences) as [
            OptionOccurrenceEvidence,
            OptionOccurrenceEvidence,
            ...OptionOccurrenceEvidence[],
          ],
        });
      }
    }
    if (field.choices !== undefined) {
      for (const occurrence of valueOccurrencesByField.get(field.key) ?? []) {
        if (!field.choices.includes(occurrence.value)) {
          issues.push({
            code: "invalidFieldChoice",
            position: occurrence.position,
            field: field.key,
            value: occurrence.value,
            choices: Object.freeze([...field.choices]),
          });
        }
      }
    }
    return issues;
  });
  const constraintIssues = evaluateUsageConstraints(usageConstraints, input);
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
  for (const value of Object.values(input)) {
    if (Array.isArray(value)) Object.freeze(value);
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

function longOptionsInScope(
  compiled: ReturnType<typeof getCompiledCli>,
  fields: RuntimeCompiledExecutable["fields"],
): readonly string[] {
  return [
    ...fields.flatMap((field) =>
      field.kind === "positional" || field.kind === "variadicPositional"
        ? []
        : [
            field.longOption,
            ...(field.kind === "flag" && field.negatedLongOption !== undefined
              ? [field.negatedLongOption]
              : []),
          ],
    ),
    compiled.contract.grammar.controls.help.longOption,
    ...(compiled.contract.grammar.controls.version === undefined
      ? []
      : [compiled.contract.grammar.controls.version.longOption]),
    "--output",
  ];
}

function suggestionProperty(
  key: "suggestedCommand" | "suggestedOption",
  value: string | undefined,
): Readonly<Record<string, string>> {
  return value === undefined ? {} : { [key]: value };
}

function selectUniqueNeighbor(
  received: string,
  candidates: readonly string[],
): string | undefined {
  const receivedBody = visibleBody(received);
  const scored = candidates.map((candidate) => ({
    candidate,
    distance: damerauLevenshteinDistance(receivedBody, visibleBody(candidate)),
  }));
  const nearestDistance = Math.min(...scored.map(({ distance }) => distance));
  const nearest = scored.filter(({ distance }) => distance === nearestDistance);
  if (
    nearest.length !== 1 ||
    nearestDistance >
      (Math.max(
        receivedBody.length,
        visibleBody(nearest[0]!.candidate).length,
      ) <= 4
        ? 1
        : 2)
  ) {
    return undefined;
  }
  return nearest[0]!.candidate;
}

function visibleBody(spelling: string): string {
  return spelling.startsWith("--") ? spelling.slice(2) : spelling;
}

function damerauLevenshteinDistance(left: string, right: string): number {
  const maximumDistance = left.length + right.length;
  const matrix = Array.from({ length: left.length + 2 }, () =>
    Array<number>(right.length + 2).fill(0),
  );
  matrix[0]![0] = maximumDistance;
  for (let index = 0; index <= left.length; index += 1) {
    matrix[index + 1]![0] = maximumDistance;
    matrix[index + 1]![1] = index;
  }
  for (let index = 0; index <= right.length; index += 1) {
    matrix[0]![index + 1] = maximumDistance;
    matrix[1]![index + 1] = index;
  }

  const lastRowByCharacter = new Map<string, number>();
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let lastMatchingColumn = 0;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const matchingRow = lastRowByCharacter.get(right[rightIndex - 1]!) ?? 0;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      if (cost === 0) lastMatchingColumn = rightIndex;
      matrix[leftIndex + 1]![rightIndex + 1] = Math.min(
        matrix[leftIndex]![rightIndex]! + cost,
        matrix[leftIndex + 1]![rightIndex]! + 1,
        matrix[leftIndex]![rightIndex + 1]! + 1,
        matrix[matchingRow]![lastMatchingColumn]! +
          (leftIndex - matchingRow - 1) +
          1 +
          (rightIndex - lastMatchingColumn - 1),
      );
    }
    lastRowByCharacter.set(left[leftIndex - 1]!, leftIndex);
  }
  return matrix[left.length + 1]![right.length + 1]!;
}

function unexpectedPositional<Contract extends AnyCliContract>(
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

function usageFailure<Contract extends AnyCliContract>(
  contract: Contract,
  command: CliContractRoot<Contract>,
  usage: CommandUsage<CliContractRoot<Contract>>,
  issue: UsageIssue,
): CliInvocation<Contract> {
  return usageFailureFromIssues(contract, command, usage, [issue]);
}

function usageFailureFromIssues<Contract extends AnyCliContract>(
  contract: Contract,
  command: CliContractRoot<Contract>,
  usage: CommandUsage<CliContractRoot<Contract>>,
  issues: readonly [UsageIssue, ...UsageIssue[]],
): CliInvocation<Contract> {
  return bindInvocation(contract, {
    kind: "usageFailure",
    command,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Every conditional issue is generated from raw field facts of the same compiled contract.
    issues: Object.freeze(
      issues.map((issue) => Object.freeze(issue)),
    ) as NonEmptyCliUsageIssues<Contract>,
    usage,
  } as unknown as UnboundCliInvocation<Contract>);
}

export function invocationBelongsTo(
  invocation: object,
  contract: object,
): boolean {
  return invocationContracts.get(invocation) === contract;
}

function bindInvocation<Contract extends AnyCliContract>(
  contract: Contract,
  invocation: UnboundCliInvocation<Contract>,
): CliInvocation<Contract> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The invocation fact is issued by this factory and registered in invocationContracts.
  const bound = Object.freeze(invocation) as CliInvocation<Contract>;
  invocationContracts.set(bound, contract);
  return bound;
}
