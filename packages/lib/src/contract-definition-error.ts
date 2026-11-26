import type { SchemaIssueEvidence, UsageIssue } from "./cli-invocation.ts";
import type { JsonValue } from "./contract-schema.ts";
import type { HelpTemplateSlot } from "./help-projection.ts";

export type SchemaDefinitionTarget =
  | Readonly<{ readonly command: string; readonly location: "input" }>
  | Readonly<{
      readonly command: string;
      readonly location: "data" | "record";
      readonly variant: string;
    }>
  | Readonly<{
      readonly command: string;
      readonly location: "failure";
      readonly variant: string;
    }>;

export type ContractDefinitionIssue =
  | Readonly<{
      readonly code: "unknownDefinitionProperty";
      readonly path: readonly string[];
    }>
  | Readonly<{
      readonly code: "invalidPresenterTable";
      readonly path: readonly string[];
    }>
  | Readonly<{
      readonly code: "missingHelpFactTemplate";
      readonly command: string;
      readonly slot: HelpTemplateSlot;
    }>
  | Readonly<{
      readonly code: "invalidHelpFactTemplate";
      readonly path: readonly string[];
      readonly slot: string;
      readonly received: unknown;
      readonly reason: "singleLine" | "empty" | "placeholder";
    }>
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "missingSchemaCapability";
        readonly capability: "standard" | "validation" | "jsonSchema";
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaDialectMismatch";
        readonly projection: "input" | "output";
        readonly received: string | null;
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaExportFailed";
        readonly projection: "input" | "output";
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaReferenceNotSelfContained";
        readonly projection: "input" | "output";
        readonly reference: string;
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "invalidSchemaProjection";
        readonly projection: "input" | "output";
      }
    >
  | Readonly<{
      readonly code: "schemaFieldSetMismatch";
      readonly command: string;
      readonly location: "input";
      readonly missingFields: readonly string[];
      readonly unexpectedFields: readonly string[];
    }>
  | Readonly<{
      readonly code: "schemaFieldDoesNotAcceptRawValue";
      readonly command: string;
      readonly location: "input";
      readonly fields: readonly Readonly<{
        readonly field: string;
        /** Points at the corresponding input schema property in the command declaration. */
        readonly path: readonly string[];
        /** The raw value shape produced by the CLI field parser. */
        readonly expected: "boolean" | "string" | "stringArray";
        /** The actual JSON Schema Input projection, not the Standard Schema TypeScript Input. */
        readonly received: JsonValue;
      }>[];
    }>
  | Readonly<{
      readonly code: "invalidInputSchemaShape";
      readonly command: string;
      readonly location: "input";
      readonly aspect: "properties" | "required" | "type";
    }>
  | Readonly<{
      readonly code: "missingInputDefault";
      readonly command: string;
      readonly location: "input";
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "invalidOutputSchemaShape";
      readonly command: string;
      readonly location: "input";
      readonly aspect: "properties" | "required";
    }>
  | Readonly<{
      readonly code: "outputRequiredFieldMissingFromInput";
      readonly command: string;
      readonly location: "input";
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "invalidVariantName";
      readonly command: string;
      readonly location: "data" | "failure" | "record";
      readonly variant: string;
    }>
  | Readonly<{
      readonly code: "invalidDescription";
      readonly command: string;
      readonly location: "command" | "field" | "data" | "failure" | "record";
      readonly field?: string;
      readonly variant?: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidVariantExitCode";
      readonly command: string;
      readonly location: "data" | "failure";
      readonly variant: string;
      readonly received: number | null;
      readonly minimum: 0 | 1;
      readonly maximum: 255;
    }>
  | Readonly<{
      readonly code: "invalidResultDefinition";
      readonly command: string;
      readonly mode: string;
      readonly location: "data" | "failure" | "record";
      readonly variant?: string;
      readonly reason: "missingTable" | "invalidEntry";
    }>
  | Readonly<{
      readonly code: "missingStreamRecord";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCapability";
      readonly capability: "help" | "version" | "schema";
    }>
  | Readonly<{
      readonly code: "invalidOutputModes";
      readonly command: string;
      readonly reason:
        | "notFactoryOutputModes"
        | "emptyModes"
        | "mismatchedCommand"
        | "mismatchedInput"
        | "mismatchedBinding";
    }>
  | Readonly<{
      readonly code: "invalidDefaultOutputMode";
      readonly command: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidOutputMode";
      readonly command: string;
      readonly mode: string;
      readonly reason:
        | "invalidName"
        | "invalidDescription"
        | "invalidDelivery"
        | "invalidFormat"
        | "missingHandler"
        | "invalidSuccess"
        | "invalidFailures"
        | "mismatchedBinding";
    }>
  | Readonly<{
      readonly code: "missingTextPresenter";
      readonly command: string;
      readonly location:
        | "completion"
        | "data"
        | "failure"
        | "record"
        | "streamSuccess";
      readonly variant?: string;
    }>
  | Readonly<{
      readonly code: "unexpectedTextPresenter";
      readonly command: string;
      readonly location:
        | "completion"
        | "data"
        | "failure"
        | "record"
        | "streamSuccess";
      readonly variant?: string;
    }>
  | Readonly<{
      readonly code: "invalidUsageFailureExitCode";
      readonly received: number | null;
      readonly minimum: 1;
      readonly maximum: 255;
    }>
  | Readonly<{
      readonly code: "invalidRootCommandSet";
      readonly root: string;
      readonly receivedCommands: readonly string[];
    }>
  | Readonly<{
      readonly code: "invalidRootCommandKind";
      readonly command: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidCommandIdentity";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCommandNodeKind";
      readonly command: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidCommandHandler";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCommandParent";
      readonly command: string;
      readonly parent: string | null;
    }>
  | Readonly<{
      readonly code: "invalidCommandSpelling";
      readonly command: string;
      readonly spelling: string;
    }>
  | Readonly<{
      readonly code: "rootGroupWithoutChildren";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "commandHierarchyCycle";
      readonly commands: readonly string[];
    }>
  | Readonly<{
      readonly code: "duplicateCommandSpelling";
      readonly parent: string;
      readonly spelling: string;
      readonly commands: readonly string[];
    }>
  | Readonly<{
      readonly code: "missingCommandText";
      readonly command: string;
      readonly field: "name";
    }>
  | Readonly<{
      readonly code: "invalidHelpSupplement";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidFieldLongOption";
      readonly command: string;
      readonly field: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidFieldIdentity";
      readonly command: string;
      readonly field: string;
      readonly reason: "lowerCamelCase" | "reservedName";
    }>
  | Readonly<{
      readonly code: "invalidFieldKind";
      readonly command: string;
      readonly field: string;
      readonly expected: readonly [
        "positional",
        "variadicPositional",
        "flag",
        "valueOption",
        "repeatableOption",
      ];
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidFieldShortAlias";
      readonly command: string;
      readonly field: string;
      readonly received: string | null;
    }>
  | Readonly<{
      readonly code: "invalidFieldPlaceholder";
      readonly command: string;
      readonly field: string;
      readonly received: unknown;
      readonly reason: "singleLine" | "empty" | "placeholder";
    }>
  | Readonly<{
      readonly code: "duplicateFieldOptionSpelling";
      readonly command: string;
      readonly spelling: string;
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "fieldOptionConflictsWithControl";
      readonly command: string;
      readonly field: string;
      readonly spelling: string;
      readonly control: "help" | "outputMode" | "version" | "schema";
    }>
  | Readonly<{
      readonly code: "requiredPositionalAfterOptional";
      readonly command: string;
      readonly field: string;
      readonly precedingOptionalField: string;
    }>
  | Readonly<{
      readonly code: "positionalAfterVariadic";
      readonly command: string;
      readonly field: string;
      readonly variadicField: string;
    }>
  | Readonly<{
      readonly code: "duplicateFieldLongOption";
      readonly command: string;
      readonly longOption: string;
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "missingDataVariant";
      readonly command: string;
    }>
  | Readonly<{
      readonly code: "invalidCommandExample";
      readonly command: string;
      readonly index: number;
      readonly reason:
        | "invalidShape"
        | "unknownField"
        | "unencodableFieldValue"
        | "invalidOutputMode"
        | "parseDidNotComplete"
        | "wrongCommand"
        | "wrongOutputMode"
        | "rawInputMismatch"
        | "inputRejected";
      readonly field?: string;
      readonly received?: string;
      readonly expected?: string;
      readonly usageIssues?: readonly UsageIssue[];
      readonly evidence?: readonly SchemaIssueEvidence[];
      readonly mismatchedFields?: readonly string[];
    }>
  | Readonly<{
      readonly code: "invalidUsageConstraint";
      readonly command: string;
      readonly index: number | null;
      readonly aspect: "collection" | "entry" | "kind" | "members";
      readonly received: unknown;
      readonly member?: string;
      readonly path?: readonly (string | number)[];
      readonly expected?: string;
    }>
  | Readonly<{
      readonly code: "invalidCountConstraint";
      readonly command: string;
      readonly index: number;
      readonly member: "fields" | "min" | "max";
      readonly reason:
        | "nonEmpty"
        | "fieldName"
        | "duplicateFields"
        | "endpointRequired"
        | "finite"
        | "integer"
        | "nonNegative"
        | "fieldCount"
        | "ordered";
      readonly actual?: number;
      readonly maximum?: number;
      readonly fields?: readonly string[];
    }>
  | Readonly<{
      readonly code: "unknownUsageConstraintField";
      readonly command: string;
      readonly constraint: "count" | "forbiddenCombination" | "when";
      readonly index: number;
      readonly member:
        | "fields"
        | "all.field"
        | "onMatch.require"
        | "onMatch.forbid"
        | "otherwise.require"
        | "otherwise.forbid";
      readonly field: string;
    }>
  | Readonly<{
      readonly code: "inapplicableUsageConstraintField";
      readonly command: string;
      readonly constraint: "forbiddenCombination" | "when";
      readonly index?: number;
      readonly member?: "all.field";
      readonly field: string;
      readonly kind: FieldKind;
    }>
  | Readonly<{
      readonly code: "invalidUsageConstraintValue";
      readonly command: string;
      readonly constraint: "forbiddenCombination" | "when";
      readonly index: number;
      readonly member: "all.value";
      readonly field: string;
      readonly actual: unknown;
      readonly expected: boolean | string | readonly string[];
    }>
  | Readonly<{
      readonly code: "contradictoryUsageConstraint";
      readonly command: string;
      readonly constraint: "forbiddenCombination" | "when";
      readonly index?: number;
      readonly member?: "all" | "onMatch" | "otherwise";
      readonly fields: readonly string[];
    }>;

type FieldKind =
  | "positional"
  | "variadicPositional"
  | "flag"
  | "valueOption"
  | "repeatableOption";

/**
 * A closed set of issues thrown when a dynamic declaration violates the
 * contract at definition time, locating the invalid declaration before any
 * handler runs. It helps authors fix their contract and does not represent a
 * usage failure of a command invocation; the core never writes it to CLI
 * diagnostic output automatically.
 */
export class ContractDefinitionError extends Error {
  readonly issues: readonly [
    ContractDefinitionIssue,
    ...ContractDefinitionIssue[],
  ];

  constructor(
    issues: readonly [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
  ) {
    super(issues.map(formatContractDefinitionIssue).join("; "));
    this.name = "ContractDefinitionError";
    const [first, ...rest] = issues;
    this.issues = Object.freeze([
      Object.freeze(first),
      ...rest.map((issue) => Object.freeze(issue)),
    ] as const);
  }
}

// oxlint-disable-next-line typescript/consistent-return -- Every closed definition issue code is returned by the switch.
function formatContractDefinitionIssue(issue: ContractDefinitionIssue): string {
  switch (issue.code) {
    case "unknownDefinitionProperty":
      return `CLI declaration contains unknown property ${issue.path.join(".")}`;
    case "invalidPresenterTable":
      return `The presenter table at ${issue.path.join(".")} must be a plain object`;
    case "missingHelpFactTemplate":
      return `Help facts of command ${issue.command} are missing the ${issue.slot} template`;
    case "invalidHelpFactTemplate":
      return `Help fact template ${issue.slot} is invalid: ${issue.reason}`;
    case "missingSchemaCapability":
      return `${formatSchemaTarget(issue)} is missing the ${issue.capability} capability`;
    case "schemaDialectMismatch":
      return `The ${issue.projection} projection of ${formatSchemaTarget(issue)} is not Draft 2020-12`;
    case "schemaExportFailed":
      return `Cannot export the ${issue.projection} projection of ${formatSchemaTarget(issue)}`;
    case "schemaReferenceNotSelfContained":
      return `The ${issue.projection} projection of ${formatSchemaTarget(issue)} references ${issue.reference}, which cannot be resolved offline`;
    case "invalidSchemaProjection":
      return `The ${issue.projection} projection of ${formatSchemaTarget(issue)} is not a JSON object`;
    case "schemaFieldSetMismatch":
      return `Fields of command ${issue.command} do not match the input schema properties`;
    case "schemaFieldDoesNotAcceptRawValue":
      return `Input fields of command ${issue.command}: ${issue.fields.map(({ field, path, expected, received }) => `${field} (${path.join(".")}) requires raw ${expected}, but the input schema property is ${JSON.stringify(received)}`).join(", ")}`;
    case "invalidInputSchemaShape":
      return `The input schema ${issue.aspect} of command ${issue.command} is invalid`;
    case "missingInputDefault":
      return `Input field ${issue.field} of command ${issue.command} is missing a default annotation`;
    case "invalidOutputSchemaShape":
      return `The output schema ${issue.aspect} of command ${issue.command} is invalid`;
    case "outputRequiredFieldMissingFromInput":
      return `Required output field ${issue.field} of command ${issue.command} is not an input schema property`;
    case "invalidVariantName":
      return `The ${issue.location} variant name ${issue.variant} of command ${issue.command} is invalid`;
    case "invalidDescription":
      return issue.location === "command"
        ? `The description of command ${issue.command} must be valid single-line text`
        : issue.location === "field"
          ? `The description of field ${issue.field} in command ${issue.command} must be valid single-line text`
          : `The description of ${issue.location} variant ${issue.variant} in command ${issue.command} must be valid single-line text`;
    case "invalidVariantExitCode":
      return `The exit code of ${issue.location} variant ${issue.variant} in command ${issue.command} is invalid`;
    case "invalidResultDefinition":
      return issue.reason === "missingTable"
        ? `The ${issue.location} result table of output mode ${issue.mode} in command ${issue.command} must be a plain object`
        : `The ${issue.location} variant ${issue.variant} of output mode ${issue.mode} in command ${issue.command} must be a plain object`;
    case "missingStreamRecord":
      return `The stream of command ${issue.command} must declare at least one record`;
    case "invalidCapability":
      return `The ${issue.capability} capability of the CLI is invalid`;
    case "invalidOutputModes":
      return `The output mode set of command ${issue.command} is invalid (${issue.reason})`;
    case "invalidDefaultOutputMode":
      return `The default output mode ${issue.received ?? "missing"} of command ${issue.command} is invalid`;
    case "invalidOutputMode":
      return `Output mode ${issue.mode} of command ${issue.command} is invalid (${issue.reason})`;
    case "missingTextPresenter":
      return `The ${issue.location}${issue.variant === undefined ? "" : ` variant ${issue.variant}`} of command ${issue.command} is missing a text presenter`;
    case "unexpectedTextPresenter":
      return `The ${issue.location}${issue.variant === undefined ? "" : ` variant ${issue.variant}`} of command ${issue.command} must not declare a text presenter`;
    case "invalidUsageFailureExitCode":
      return "The usage failure exit code of the CLI is invalid";
    case "invalidRootCommandSet":
      return `CLI root ${issue.root} must map to exactly one root command`;
    case "invalidRootCommandKind":
      return `The kind of command ${issue.command} is invalid`;
    case "invalidCommandIdentity":
      return `Command identity ${issue.command} is invalid`;
    case "invalidCommandNodeKind":
      return `The node kind of command ${issue.command} is invalid`;
    case "invalidCommandHandler":
      return `The handler declaration of command ${issue.command} is invalid`;
    case "invalidCommandParent":
      return `The parent ${issue.parent ?? "missing"} of command ${issue.command} is invalid`;
    case "invalidCommandSpelling":
      return `The spelling ${issue.spelling} of command ${issue.command} is invalid`;
    case "rootGroupWithoutChildren":
      return `Root command group ${issue.command} has no child commands`;
    case "commandHierarchyCycle":
      return `Command hierarchy contains a cycle: ${issue.commands.join(", ")}`;
    case "duplicateCommandSpelling":
      return `Commands ${issue.commands.join(", ")} reuse spelling ${issue.spelling} under ${issue.parent}`;
    case "missingCommandText":
      return `Command ${issue.command} is missing ${issue.field}`;
    case "invalidHelpSupplement":
      return `The help supplement of command ${issue.command} must be a valid group of text lines`;
    case "invalidFieldLongOption":
      return `The long option of field ${issue.field} in command ${issue.command} is invalid`;
    case "invalidFieldIdentity":
      return issue.reason === "reservedName"
        ? `Field identity ${issue.field} of command ${issue.command} is a reserved name; rename the field key and update the schema Input key and its references; the CLI spelling may stay unchanged`
        : `Field identity ${issue.field} of command ${issue.command} must be lowerCamelCase (start with a lowercase letter, letters and digits only)`;
    case "invalidFieldKind":
      return `The kind of field ${issue.field} in command ${issue.command} is invalid`;
    case "invalidFieldShortAlias":
      return `The short alias of field ${issue.field} in command ${issue.command} is invalid`;
    case "invalidFieldPlaceholder":
      return `The placeholder of field ${issue.field} in command ${issue.command} is invalid: ${issue.reason}`;
    case "duplicateFieldOptionSpelling":
      return `Fields ${issue.fields.join(", ")} of command ${issue.command} reuse option spelling ${issue.spelling}`;
    case "fieldOptionConflictsWithControl":
      return `Field ${issue.field} of command ${issue.command} conflicts with the ${issue.control} control spelling ${issue.spelling}`;
    case "requiredPositionalAfterOptional":
      return `Required positional ${issue.field} of command ${issue.command} follows optional positional ${issue.precedingOptionalField}`;
    case "positionalAfterVariadic":
      return `Positional ${issue.field} of command ${issue.command} follows variadic positional ${issue.variadicField}`;
    case "duplicateFieldLongOption":
      return `Fields ${issue.fields.join(", ")} of command ${issue.command} reuse long option ${issue.longOption}`;
    case "missingDataVariant":
      return `Command ${issue.command} must declare at least one data variant`;
    case "invalidCommandExample":
      return formatCommandExampleIssue(issue);
    case "invalidUsageConstraint":
      return `Usage constraint${issue.index === null ? "" : `[${issue.index}]`}${issue.member === undefined ? "" : ` ${issue.member}`} of command ${issue.command} is invalid: ${formatIssueValue(issue.received)}${issue.expected === undefined ? "" : `; expected ${issue.expected}`}${issue.path === undefined ? "" : ` (${issue.path.join(".")})`}`;
    case "invalidCountConstraint":
      return `The count ${issue.member} of command ${issue.command} is invalid (${issue.reason})`;
    case "unknownUsageConstraintField":
      return `Usage constraint[${issue.index}] ${issue.constraint}.${issue.member} of command ${issue.command} references unknown field ${issue.field}`;
    case "inapplicableUsageConstraintField":
      return `The ${issue.constraint} usage constraint${issue.member === undefined ? "" : ` ${issue.member}`} of command ${issue.command} does not apply to field ${issue.field} (${issue.kind})`;
    case "invalidUsageConstraintValue":
      return `The ${issue.constraint} equality fact ${issue.field}=${formatIssueValue(issue.actual)} of command ${issue.command} is not among the accepted values ${JSON.stringify(issue.expected)}`;
    case "contradictoryUsageConstraint":
      return `The ${issue.constraint} usage constraint${issue.member === undefined ? "" : ` ${issue.member}`} of command ${issue.command} is self-contradictory: ${issue.fields.join(", ")}`;
  }
}

// oxlint-disable-next-line typescript/consistent-return -- The reason union is closed; every branch returns diagnostic text.
function formatCommandExampleIssue(
  issue: Extract<
    ContractDefinitionIssue,
    { readonly code: "invalidCommandExample" }
  >,
): string {
  const location = `Example[${issue.index}] of command ${issue.command}`;
  switch (issue.reason) {
    case "invalidShape":
      return `${location} must contain an object-shaped input`;
    case "unknownField":
      return `${location} references undeclared field ${issue.field ?? "<unknown>"}`;
    case "unencodableFieldValue":
      return `${location} field ${issue.field ?? "<unknown>"} does not match an encodable raw field shape`;
    case "invalidOutputMode":
      return `${location} specifies output mode ${issue.received ?? "<invalid>"}, which does not exist on command ${issue.command}`;
    case "parseDidNotComplete":
      return issue.usageIssues === undefined
        ? `${location} canonical argv did not parse into a complete invocation`
        : `${location} has invalid invocation syntax: ${formatIssueValue(issue.usageIssues)}`;
    case "wrongCommand":
      return `${location} parsed to command ${issue.received ?? "<unknown>"}, expected ${issue.expected ?? issue.command}`;
    case "wrongOutputMode":
      return `${location} parsed to output mode ${issue.received ?? "<unknown>"}, expected ${issue.expected ?? "<unknown>"}`;
    case "rawInputMismatch":
      return `${location} raw input cannot round-trip through the canonical argv${issue.mismatchedFields === undefined ? "" : `: ${issue.mismatchedFields.join(", ")}`}`;
    case "inputRejected":
      return `${location} failed input schema validation: ${(issue.evidence ?? []).map(({ message, path }) => `${message}${path === undefined ? "" : ` (${path.join(".")})`}`).join("; ")}`;
  }
}

function formatIssueValue(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "<unprintable>";
    }
  }
}

function formatSchemaTarget(target: SchemaDefinitionTarget): string {
  return target.location === "input"
    ? `input of command ${target.command}`
    : `${target.location} variant ${target.variant} of command ${target.command}`;
}
