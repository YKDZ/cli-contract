import type {
  CommandExampleManifest,
  ContractTypeError,
  FieldGrammar,
  UsageConstraintGrammar,
  WhenUsageConstraint,
} from "./cli-contract.ts";
import type { ContractDefinitionIssue } from "./contract-definition-error.ts";
import { ContractDefinitionError } from "./contract-definition-error.ts";
import type {
  ContractDirectoryQuery,
  ContractSummaryQuery,
} from "./contract-discovery.ts";
import { ContractExecutionError } from "./contract-execution-error.ts";
import { isSingleLineText } from "./description.ts";
import { isPlainRecord } from "./json-value.ts";

const helpCapabilityType = Symbol("HelpCapability.type");
const helpCapabilities = new WeakSet<object>();

const helpCapabilityPropertyKeys = [
  "shortAlias",
  "headings",
  "wording",
] as const;

const helpHeadingKeys = [
  "usage",
  "commands",
  "arguments",
  "options",
  "constraints",
  "schema",
  "examples",
  "supplement",
] as const satisfies readonly (keyof HelpHeadings)[];

export interface HelpCapability {
  readonly kind: "helpCapability";
  readonly longOption: "--help";
  readonly shortAlias?: "-h";
  readonly headings?: HelpHeadings;
  readonly wording?: HelpFactWording;
  readonly [helpCapabilityType]: "help";
}

/**
 * Optional headings for the fixed sections of root help. Omitting a heading keeps
 * the section's mechanical content and indentation; the core writes no default copy.
 */
export interface HelpHeadings {
  readonly usage?: string;
  readonly commands?: string;
  readonly arguments?: string;
  readonly options?: string;
  readonly constraints?: string;
  readonly schema?: string;
  readonly examples?: string;
  readonly supplement?: string;
}

export interface HelpFactWording {
  /** The command-group placeholder word itself; the core adds the angle brackets. */
  readonly commandPlaceholder?: string;
  /** The `--output` placeholder word itself; the core adds the angle brackets. */
  readonly outputModePlaceholder?: string;
  /** A line modifier for a field with choices and no default; must contain `{usage}` and `{choices}`. */
  readonly choices?: string;
  /** A line modifier for a field with a default and no choices; must contain `{usage}` and `{value}`. */
  readonly default?: string;
  /** A line modifier for a field or `--output` with both choices and a default; must contain `{usage}`, `{choices}`, and `{value}`. */
  readonly choicesAndDefault?: string;
  /** Binary joiner for two or more choices or field symbols; must contain `{left}` and `{right}`. */
  readonly list?: string;
  /** Binary joiner for two or more atomic facts in a rule's `all` list; must contain `{left}` and `{right}`. */
  readonly facts?: string;
  /** Binary joiner for a branch with both `require` and `forbid` effects; must contain `{left}` and `{right}`. */
  readonly effects?: string;
  /** A valid match branch; must contain `{facts}` and `{onMatch}`. */
  readonly whenOnMatch?: string;
  /** A valid non-match branch; must contain `{facts}` and `{otherwise}`. */
  readonly whenOtherwise?: string;
  /** A conditional branch valid on both sides; must contain `{facts}`, `{onMatch}` and `{otherwise}`. */
  readonly whenOnMatchOtherwise?: string;
  /** A required field group in an effect; must contain `{fields}`. */
  readonly require?: string;
  /** A forbidden field group in an effect; must contain `{fields}`. */
  readonly forbid?: string;
  /** A field-presence fact; must contain `{field}`. */
  readonly present?: string;
  /** A field-equality fact; must contain `{field}` and `{value}`. */
  readonly equals?: string;
  /** A group of field facts that must not hold together; must contain `{facts}`. */
  readonly forbiddenCombination?: string;
  /** The field count must be exactly `{count}`; contains `{fields}`. */
  readonly countExactly?: string;
  /** The field count must be at least `{min}`; contains `{fields}`. */
  readonly countAtLeast?: string;
  /** The field count must be at most `{max}`; contains `{fields}`. */
  readonly countAtMost?: string;
  /** The field count must be between `{min}` and `{max}`; contains `{fields}`. */
  readonly countBetween?: string;
}

/** The single specification of help fact slots and their required replacement parameters. */
export const helpTemplateSpecifications = {
  commandPlaceholder: { placeholders: [] },
  outputModePlaceholder: { placeholders: [] },
  choices: { placeholders: ["usage", "choices"] },
  default: { placeholders: ["usage", "value"] },
  choicesAndDefault: { placeholders: ["usage", "choices", "value"] },
  list: { placeholders: ["left", "right"] },
  facts: { placeholders: ["left", "right"] },
  effects: { placeholders: ["left", "right"] },
  whenOnMatch: { placeholders: ["facts", "onMatch"] },
  whenOtherwise: { placeholders: ["facts", "otherwise"] },
  whenOnMatchOtherwise: { placeholders: ["facts", "onMatch", "otherwise"] },
  require: { placeholders: ["fields"] },
  forbid: { placeholders: ["fields"] },
  present: { placeholders: ["field"] },
  equals: { placeholders: ["field", "value"] },
  forbiddenCombination: { placeholders: ["facts"] },
  countExactly: { placeholders: ["fields", "count"] },
  countAtLeast: { placeholders: ["fields", "min"] },
  countAtMost: { placeholders: ["fields", "max"] },
  countBetween: { placeholders: ["fields", "min", "max"] },
} as const satisfies Record<
  keyof HelpFactWording,
  Readonly<{ readonly placeholders: readonly string[] }>
>;

export type HelpTemplateSlot = keyof typeof helpTemplateSpecifications;

/** Closed replacement-parameter shapes derived per help slot. */
export type HelpFactTemplateParameters = {
  readonly [Slot in HelpTemplateSlot]: Readonly<
    Record<
      (typeof helpTemplateSpecifications)[Slot]["placeholders"][number],
      string
    >
  >;
};

/** Help configuration assembled once on the root contract; headings are optional, but every fact that actually appears needs wording. */
export interface HelpCapabilityDefinition {
  readonly shortAlias?: "-h";
  readonly headings?: HelpHeadings;
  readonly wording?: HelpFactWording;
}

type IsAny<Value> = 0 extends 1 & Value ? true : false;

export type IsPlainObjectForTypeCheck<Value> =
  IsAny<Value> extends true
    ? true
    : Value extends object
      ? Value extends readonly unknown[]
        ? false
        : Value extends (...args: infer _Args) => unknown
          ? false
          : true
      : false;

type RemainingCapabilityOptions<Shape, Definition> =
  IsAny<Definition> extends true
    ? Partial<Shape>
    : {
        readonly [Key in Exclude<keyof Shape, keyof Definition>]?: Shape[Key];
      };

// Supplies ContextualShape for contextual property typing and completions while
// omitting already-written keys on invalid objects so ContractTypeError stays unsuppressed.
export type CapabilityParameter<Definition, ContextualShape, Issues> = [
  Issues,
] extends [never]
  ?
      | (Definition & ContextualShape)
      | (undefined extends Definition ? undefined : never)
  : [Exclude<Definition, undefined>] extends [never]
    ? Issues
    : false extends IsPlainObjectForTypeCheck<Exclude<Definition, undefined>>
      ? Issues
      : Definition &
          RemainingCapabilityOptions<ContextualShape, Definition> &
          Issues;

export type IsInvalidSingleLineLiteral<Value extends string> =
  string extends Value
    ? false
    : Value extends ""
      ? true
      : Value extends
            | `${string}\r${string}`
            | `${string}\n${string}`
            | `${string}\0${string}`
        ? true
        : false;

export type CapabilityUnknownPropertyIssues<
  Definition,
  Capability extends "help" | "version" | "schema",
  Allowed extends PropertyKey,
> = Definition extends unknown
  ? IsAny<Definition> extends true
    ? never
    : [Exclude<Extract<keyof Definition, string>, Allowed>] extends [never]
      ? never
      : {
          readonly [
            Property in Exclude<Extract<keyof Definition, string>, Allowed>
          ]: ContractTypeError<
            "unknownDefinitionProperty",
            Readonly<{
              readonly path: readonly [Capability, Property];
              readonly property: Property;
            }>
          >;
        }[Exclude<Extract<keyof Definition, string>, Allowed>]
  : never;

type HelpFactTemplateAllowedPlaceholder<Slot extends HelpTemplateSlot> =
  (typeof helpTemplateSpecifications)[Slot]["placeholders"][number];

type ParsedHelpFactTemplate<
  Template extends string,
  Allowed extends string,
  Seen extends string = never,
> = Template extends `${infer Prefix}{${infer Tail}`
  ? Prefix extends `${string}}${string}`
    ? false
    : Tail extends `${infer Placeholder}}${infer Rest}`
      ? Placeholder extends Allowed
        ? ParsedHelpFactTemplate<Rest, Allowed, Seen | Placeholder>
        : false
      : false
  : Template extends `${string}}${string}`
    ? false
    : Exclude<Allowed, Seen> extends never
      ? true
      : false;

export type HelpTemplateWhitespace =
  | " "
  | "\t"
  | "\v"
  | "\f"
  | "\u00a0"
  | "\u1680"
  | "\u2000"
  | "\u2001"
  | "\u2002"
  | "\u2003"
  | "\u2004"
  | "\u2005"
  | "\u2006"
  | "\u2007"
  | "\u2008"
  | "\u2009"
  | "\u200a"
  | "\u2028"
  | "\u2029"
  | "\u202f"
  | "\u205f"
  | "\u3000"
  | "\ufeff";

export type TrimHelpTemplateWhitespace<Template extends string> =
  Template extends `${HelpTemplateWhitespace}${infer Rest}`
    ? TrimHelpTemplateWhitespace<Rest>
    : Template extends `${infer Rest}${HelpTemplateWhitespace}`
      ? TrimHelpTemplateWhitespace<Rest>
      : Template;

type HelpFactTemplateFailureReason<
  Slot extends HelpTemplateSlot,
  Template extends string,
> = Template extends
  | `${string}\r${string}`
  | `${string}\n${string}`
  | `${string}\0${string}`
  ? "singleLine"
  : TrimHelpTemplateWhitespace<Template> extends ""
    ? "empty"
    : Slot extends "commandPlaceholder" | "outputModePlaceholder"
      ? Template extends `${string}<${string}` | `${string}>${string}`
        ? "placeholder"
        : ParsedHelpFactTemplate<
              Template,
              HelpFactTemplateAllowedPlaceholder<Slot>
            > extends true
          ? never
          : "placeholder"
      : ParsedHelpFactTemplate<
            Template,
            HelpFactTemplateAllowedPlaceholder<Slot>
          > extends true
        ? never
        : "placeholder";

type IsValidStaticHelpFactTemplate<
  Slot extends HelpTemplateSlot,
  Template extends string,
> = HelpFactTemplateFailureReason<Slot, Template> extends never ? true : false;

type HelpFactTemplateValueContract<Slot extends HelpTemplateSlot, Value> = [
  Exclude<Value, undefined>,
] extends [never]
  ? never
  : [Exclude<Value, undefined>] extends [string]
    ? string extends Exclude<Value, undefined>
      ? never
      : IsValidStaticHelpFactTemplate<
            Slot,
            Extract<Exclude<Value, undefined>, string>
          > extends true
        ? never
        : ContractTypeError<
            "invalidHelpFactTemplate",
            Readonly<{
              readonly slot: Slot;
              readonly received: Extract<Exclude<Value, undefined>, string>;
              readonly reason: HelpFactTemplateFailureReason<
                Slot,
                Extract<Exclude<Value, undefined>, string>
              >;
            }>
          >
    : ContractTypeError<
        "invalidHelpFactTemplate",
        Readonly<{
          readonly slot: Slot;
          readonly received: Value;
          readonly reason: "singleLine";
        }>
      >;

type HelpFactWordingMemberIssues<Wording> =
  | {
      [Slot in keyof Wording & HelpTemplateSlot]: HelpFactTemplateValueContract<
        Slot,
        Wording[Slot]
      >;
    }[keyof Wording & HelpTemplateSlot]
  | HelpFactWordingUnknownPropertyIssues<Wording>;

type HelpFactWordingUnknownPropertyIssues<Wording> = {
  [
    Property in Exclude<Extract<keyof Wording, string>, HelpTemplateSlot>
  ]: ContractTypeError<
    "unknownDefinitionProperty",
    Readonly<{
      readonly path: readonly ["help", "wording", Property];
      readonly property: Property;
    }>
  >;
}[Exclude<Extract<keyof Wording, string>, HelpTemplateSlot>];

type HelpCapabilityWording<Definition> = Definition extends unknown
  ? IsAny<Definition> extends true
    ? never
    : "wording" extends keyof Definition
      ? Exclude<Definition["wording"], undefined>
      : never
  : never;

type HelpCapabilityShortAliasIssues<Definition> = Definition extends unknown
  ? IsAny<Definition> extends true
    ? never
    : "shortAlias" extends keyof Definition
      ? [Exclude<Definition["shortAlias"], undefined>] extends [never]
        ? never
        : [Exclude<Definition["shortAlias"], undefined>] extends ["-h"]
          ? never
          : ContractTypeError<
              "invalidCapabilityShortAlias",
              Readonly<{
                readonly capability: "help";
                readonly expected: "-h";
                readonly received: Exclude<Definition["shortAlias"], undefined>;
              }>
            >
      : never
  : never;

type HelpHeadingMemberIssues<Headings> =
  | {
      [
        Property in Exclude<Extract<keyof Headings, string>, keyof HelpHeadings>
      ]: ContractTypeError<
        "unknownDefinitionProperty",
        Readonly<{
          readonly path: readonly ["help", "headings", Property];
          readonly property: Property;
        }>
      >;
    }[Exclude<Extract<keyof Headings, string>, keyof HelpHeadings>]
  | {
      [Heading in keyof Headings & keyof HelpHeadings]: [
        Exclude<Headings[Heading], undefined>,
      ] extends [never]
        ? never
        : [Exclude<Headings[Heading], undefined>] extends [string]
          ? Exclude<Headings[Heading], undefined> extends infer Literal extends
              string
            ? Literal extends unknown
              ? IsInvalidSingleLineLiteral<Literal> extends true
                ? ContractTypeError<
                    "invalidHelpHeading",
                    Readonly<{
                      readonly path: readonly ["help", "headings", Heading];
                      readonly heading: Heading;
                      readonly received: Literal;
                    }>
                  >
                : never
              : never
            : never
          : ContractTypeError<
              "invalidHelpHeading",
              Readonly<{
                readonly path: readonly ["help", "headings", Heading];
                readonly heading: Heading;
                readonly received: Exclude<Headings[Heading], undefined>;
              }>
            >;
    }[keyof Headings & keyof HelpHeadings];

type HelpCapabilityHeadingsValue<Definition> = Definition extends unknown
  ? IsAny<Definition> extends true
    ? never
    : "headings" extends keyof Definition
      ? Exclude<Definition["headings"], undefined>
      : never
  : never;

type HelpCapabilityHeadingsIssues<Definition> =
  HelpCapabilityHeadingsValue<Definition> extends infer Headings
    ? Headings extends unknown
      ? IsPlainObjectForTypeCheck<Headings> extends true
        ? HelpHeadingMemberIssues<Headings>
        : ContractTypeError<
            "invalidHelpHeadings",
            Readonly<{
              readonly path: readonly ["help", "headings"];
              readonly received: Headings;
            }>
          >
      : never
    : never;

type HelpCapabilityWordingIssues<Definition> =
  HelpCapabilityWording<Definition> extends infer Wording
    ? Wording extends unknown
      ? IsPlainObjectForTypeCheck<Wording> extends true
        ? HelpFactWordingMemberIssues<Wording>
        : ContractTypeError<
            "invalidHelpWording",
            Readonly<{
              readonly path: readonly ["help", "wording"];
              readonly received: Wording;
            }>
          >
      : never
    : never;

type HelpCapabilityIssuesForObject<Definition> =
  | CapabilityUnknownPropertyIssues<
      Definition,
      "help",
      (typeof helpCapabilityPropertyKeys)[number]
    >
  | HelpCapabilityShortAliasIssues<Definition>
  | HelpCapabilityHeadingsIssues<Definition>
  | HelpCapabilityWordingIssues<Definition>;

type HelpCapabilityIssues<Definition> =
  IsAny<Definition> extends true
    ? never
    : [Exclude<Definition, undefined>] extends [never]
      ? never
      : Exclude<Definition, undefined> extends infer Defined
        ? Defined extends unknown
          ? IsPlainObjectForTypeCheck<Defined> extends true
            ? HelpCapabilityIssuesForObject<Defined>
            : ContractTypeError<
                "invalidCapability",
                Readonly<{ readonly capability: "help" }>
              >
          : never
        : never;

export type FieldPlaceholderFailureReason<Placeholder extends string> =
  Placeholder extends
    | `${string}\r${string}`
    | `${string}\n${string}`
    | `${string}\0${string}`
    ? "singleLine"
    : TrimHelpTemplateWhitespace<Placeholder> extends ""
      ? "empty"
      : Placeholder extends `${string}<${string}` | `${string}>${string}`
        ? "placeholder"
        : never;

export type FieldPlaceholderPropertyContract<
  Command extends string,
  Key extends PropertyKey,
  Definition,
> =
  Definition extends Readonly<{ readonly placeholder?: infer Placeholder }>
    ? [Exclude<Placeholder, undefined>] extends [never]
      ? unknown
      : [Exclude<Placeholder, undefined>] extends [string]
        ? string extends Exclude<Placeholder, undefined>
          ? unknown
          : FieldPlaceholderFailureReason<
                Extract<Exclude<Placeholder, undefined>, string>
              > extends never
            ? unknown
            : Readonly<{
                readonly placeholder: ContractTypeError<
                  "invalidFieldPlaceholder",
                  Readonly<{
                    readonly command: Command;
                    readonly field: Extract<Key, string>;
                    readonly received: Extract<
                      Exclude<Placeholder, undefined>,
                      string
                    >;
                    readonly reason: FieldPlaceholderFailureReason<
                      Extract<Exclude<Placeholder, undefined>, string>
                    >;
                  }>
                >;
              }>
        : Readonly<{
            readonly placeholder: ContractTypeError<
              "invalidFieldPlaceholder",
              Readonly<{
                readonly command: Command;
                readonly field: Extract<Key, string>;
                readonly received: Exclude<Placeholder, undefined>;
                readonly reason: "singleLine";
              }>
            >;
          }>
    : unknown;

export function validateFieldPlaceholder(
  command: string,
  field: string,
  raw: unknown,
): ContractDefinitionIssue | undefined {
  if (raw === undefined) return undefined;
  let reason: "singleLine" | "empty" | "placeholder" | undefined;
  if (
    typeof raw !== "string" ||
    raw.includes("\r") ||
    raw.includes("\n") ||
    raw.includes("\0")
  ) {
    reason = "singleLine";
  } else if (raw.trim().length === 0) {
    reason = "empty";
  } else if (raw.includes("<") || raw.includes(">")) {
    reason = "placeholder";
  }
  if (reason === undefined) return undefined;
  return {
    code: "invalidFieldPlaceholder",
    command,
    field,
    received: raw,
    reason,
  };
}

export function isHelpCapability(value: unknown): value is HelpCapability {
  return (
    typeof value === "object" && value !== null && helpCapabilities.has(value)
  );
}

/**
 * Assemble help for the whole tree explicitly. `headings` are optional section
 * titles; `wording` supplies the templates required by the help facts that actually
 * appear, with completeness checked by defineCli. The core generates no default
 * natural language.
 */
// Separate the zero-argument call from the parameterized overload so passing a
// union argument binds `Definition` to the full union instead of splitting across `| undefined`.
export function helpCapability(): HelpCapability;
/**
 * Assemble help for the whole tree explicitly. `headings` are optional section
 * titles; `wording` supplies the templates required by the help facts that actually
 * appear, with completeness checked by defineCli. The core generates no default
 * natural language.
 */
export function helpCapability<const Definition>(
  definition: CapabilityParameter<
    Definition,
    HelpCapabilityDefinition,
    HelpCapabilityIssues<Definition>
  >,
): HelpCapability;
export function helpCapability(
  definition: HelpCapabilityDefinition = {},
): HelpCapability {
  if (!isPlainRecord(definition)) {
    throw new ContractDefinitionError([
      { code: "invalidCapability", capability: "help" },
    ]);
  }
  const issues: ContractDefinitionIssue[] = [];
  for (const property of Reflect.ownKeys(definition)) {
    const name = String(property);
    if (!(helpCapabilityPropertyKeys as readonly string[]).includes(name)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: ["help", name],
      });
    }
  }
  if (definition.shortAlias !== undefined && definition.shortAlias !== "-h") {
    issues.push({
      code: "invalidCapabilityShortAlias",
      capability: "help",
      expected: "-h",
      received: definition.shortAlias,
    });
  }
  const headings =
    definition.headings === undefined
      ? undefined
      : copyHelpHeadings(definition.headings, issues);
  const wording =
    definition.wording === undefined
      ? undefined
      : copyHelpFactWording(definition.wording, issues);
  const [firstIssue, ...otherIssues] = issues;
  if (firstIssue !== undefined) {
    throw new ContractDefinitionError([firstIssue, ...otherIssues]);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- helpCapability is issued by this factory and registered in the WeakSet; the type brand is not emitted at runtime.
  const capability = Object.freeze({
    kind: "helpCapability" as const,
    longOption: "--help" as const,
    ...(definition.shortAlias === undefined
      ? {}
      : { shortAlias: definition.shortAlias }),
    ...(headings === undefined ? {} : { headings }),
    ...(wording === undefined ? {} : { wording }),
  }) as HelpCapability;
  helpCapabilities.add(capability);
  return capability;
}

function isHelpHeadingKey(key: string): key is keyof HelpHeadings {
  return (helpHeadingKeys as readonly string[]).includes(key);
}

function copyHelpHeadings(
  value: unknown,
  issues: ContractDefinitionIssue[],
): HelpHeadings | undefined {
  if (!isPlainRecord(value)) {
    issues.push({
      code: "invalidHelpHeadings",
      path: ["help", "headings"],
      received: value,
    });
    return undefined;
  }
  const headings: Record<string, string> = {};
  for (const property of Reflect.ownKeys(value)) {
    const key = String(property);
    if (!isHelpHeadingKey(key)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: ["help", "headings", key],
      });
      continue;
    }
    const heading = value[key];
    if (heading === undefined) {
      continue;
    }
    if (!isSingleLineText(heading)) {
      issues.push({
        code: "invalidHelpHeading",
        path: ["help", "headings", key],
        heading: key,
        received: heading,
      });
      continue;
    }
    headings[key] = heading;
  }
  return Object.freeze(headings);
}

function copyHelpFactWording(
  value: unknown,
  issues: ContractDefinitionIssue[],
): HelpFactWording | undefined {
  if (!isPlainRecord(value)) {
    issues.push({
      code: "invalidHelpWording",
      path: ["help", "wording"],
      received: value,
    });
    return undefined;
  }
  const wording: Record<string, string> = {};
  for (const property of Reflect.ownKeys(value)) {
    const slot = String(property);
    if (!isHelpTemplateSlot(slot)) {
      issues.push({
        code: "unknownDefinitionProperty",
        path: ["help", "wording", slot],
      });
      continue;
    }
    const raw = value[slot];
    if (raw === undefined) {
      continue;
    }
    const reason = validateHelpFactTemplate(slot, raw);
    if (reason !== undefined) {
      issues.push({
        code: "invalidHelpFactTemplate",
        path: ["help", "wording", slot],
        slot,
        received: raw,
        reason,
      });
      continue;
    }
    if (typeof raw === "string") {
      wording[slot] = raw;
    }
  }
  return Object.freeze(wording);
}

function isHelpTemplateSlot(slot: string): slot is HelpTemplateSlot {
  return Object.hasOwn(helpTemplateSpecifications, slot);
}

function validateHelpFactTemplate(
  slot: HelpTemplateSlot,
  template: unknown,
): "singleLine" | "empty" | "placeholder" | undefined {
  if (
    typeof template !== "string" ||
    template.includes("\r") ||
    template.includes("\n") ||
    template.includes("\0")
  ) {
    return "singleLine";
  }
  if (template.trim().length === 0) {
    return "empty";
  }
  const allowed = new Set<string>(
    helpTemplateSpecifications[slot].placeholders,
  );
  const placeholders = [
    ...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g),
  ].map((match) => match[1] ?? "");
  const outside = template.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, "");
  if (
    outside.includes("{") ||
    outside.includes("}") ||
    placeholders.some((placeholder) => !allowed.has(placeholder)) ||
    [...allowed].some((placeholder) => !placeholders.includes(placeholder)) ||
    ((slot === "commandPlaceholder" || slot === "outputModePlaceholder") &&
      (template.includes("<") || template.includes(">")))
  ) {
    return "placeholder";
  }
  return undefined;
}

export function collectExecutableRequiredHelpSlots(
  facts: Readonly<{
    readonly fields: readonly FieldGrammar[];
    readonly usageConstraints: readonly UsageConstraintGrammar[];
    readonly outputModeIds: readonly string[];
  }>,
): readonly HelpTemplateSlot[] {
  const slots = new Set<HelpTemplateSlot>();
  const hasOutputs = facts.outputModeIds.length > 0;
  if (hasOutputs) {
    slots.add("outputModePlaceholder");
  }
  if (
    facts.fields.some(
      (field) => field.choices !== undefined && field.default === undefined,
    )
  ) {
    slots.add("choices");
  }
  if (
    facts.fields.some(
      (field) => field.choices === undefined && field.default !== undefined,
    )
  ) {
    slots.add("default");
  }
  if (
    hasOutputs ||
    facts.fields.some(
      (field) => field.choices !== undefined && field.default !== undefined,
    )
  ) {
    slots.add("choicesAndDefault");
  }
  if (
    facts.outputModeIds.length >= 2 ||
    facts.fields.some(
      (field) => field.choices !== undefined && field.choices.length >= 2,
    )
  ) {
    slots.add("list");
  }
  for (const constraint of facts.usageConstraints) {
    collectConstraintRequiredSlots(constraint, slots);
  }
  return Object.freeze([...slots]);
}

function collectConstraintRequiredSlots(
  constraint: UsageConstraintGrammar,
  slots: Set<HelpTemplateSlot>,
): void {
  if (constraint.kind === "count") {
    if (constraint.min === constraint.max) slots.add("countExactly");
    else if (constraint.max === constraint.fields.length) {
      slots.add("countAtLeast");
    } else if (constraint.min === 0) slots.add("countAtMost");
    else slots.add("countBetween");
    if (constraint.fields.length >= 2) slots.add("list");
    return;
  }

  if (constraint.kind === "forbiddenCombination") {
    slots.add("forbiddenCombination");
    if (constraint.all.length >= 2) slots.add("facts");
    for (const fact of constraint.all) {
      slots.add(fact.kind === "present" ? "present" : "equals");
    }
    return;
  }

  const onMatchRequired = constraint.onMatch?.require ?? [];
  const onMatchForbidden = constraint.onMatch?.forbid ?? [];
  const otherwiseRequired = constraint.otherwise?.require ?? [];
  const otherwiseForbidden = constraint.otherwise?.forbid ?? [];
  const hasOnMatch = onMatchRequired.length > 0 || onMatchForbidden.length > 0;
  const hasOtherwise =
    otherwiseRequired.length > 0 || otherwiseForbidden.length > 0;
  slots.add(
    hasOnMatch
      ? hasOtherwise
        ? "whenOnMatchOtherwise"
        : "whenOnMatch"
      : "whenOtherwise",
  );
  if (constraint.all.length >= 2) slots.add("facts");
  for (const fact of constraint.all) {
    slots.add(fact.kind === "present" ? "present" : "equals");
  }
  if (onMatchRequired.length > 0 || otherwiseRequired.length > 0) {
    slots.add("require");
  }
  if (onMatchForbidden.length > 0 || otherwiseForbidden.length > 0) {
    slots.add("forbid");
  }
  if (
    (onMatchRequired.length > 0 && onMatchForbidden.length > 0) ||
    (otherwiseRequired.length > 0 && otherwiseForbidden.length > 0)
  ) {
    slots.add("effects");
  }
  if (
    onMatchRequired.length >= 2 ||
    onMatchForbidden.length >= 2 ||
    otherwiseRequired.length >= 2 ||
    otherwiseForbidden.length >= 2
  ) {
    slots.add("list");
  }
}

export function formatGroupUsageSynopsis(
  commandPath: string,
  wording: HelpFactWording | undefined,
): string {
  const placeholder = wording?.commandPlaceholder ?? "";
  return `${commandPath} <${placeholder}>`;
}

export function formatExecutableUsageSynopsis(
  commandPath: string,
  fields: readonly FieldGrammar[],
  wording: HelpFactWording | undefined,
): string {
  const outputPlaceholder = wording?.outputModePlaceholder ?? "";
  return [
    commandPath,
    `[--output <${outputPlaceholder}>]`,
    ...fields.map((field) => formatFieldUsage(field)),
  ].join(" ");
}

function formatFieldUsage(
  field: FieldGrammar,
  includeShortAlias = false,
): string {
  const placeholder =
    field.kind === "flag" ? undefined : (field.placeholder ?? field.key);
  const value =
    field.kind === "positional"
      ? `<${placeholder}>`
      : field.kind === "variadicPositional"
        ? `<${placeholder}...>`
        : field.kind === "flag"
          ? [
              field.longOption,
              ...(includeShortAlias && field.shortAlias !== undefined
                ? [field.shortAlias]
                : []),
              field.negatedLongOption,
            ]
              .filter((spelling) => spelling !== undefined)
              .join(includeShortAlias ? ", " : "|")
          : `${[
              field.longOption,
              ...(includeShortAlias && field.shortAlias !== undefined
                ? [field.shortAlias]
                : []),
            ].join(", ")} <${placeholder}>`;
  if (field.kind === "repeatableOption") {
    return field.required ? `(${value})...` : `[${value}]...`;
  }
  return field.required ? value : `[${value}]`;
}

export interface HelpProjectionOutputMode {
  readonly id: string;
  readonly description: string;
}

export interface HelpProjectionChild {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly isGroup: boolean;
  readonly description: string;
}

export type HelpProjectionInput = Readonly<{
  readonly command: Readonly<{
    readonly description: string;
    readonly synopsis: string;
    readonly helpSupplement?: readonly string[];
    readonly fields: readonly FieldGrammar[];
    readonly usageConstraints: readonly UsageConstraintGrammar[];
    readonly outputModes?: Readonly<{
      readonly defaultMode: string;
      readonly modes: readonly HelpProjectionOutputMode[];
    }>;
    readonly examples: readonly CommandExampleManifest[];
  }>;
  readonly children: readonly HelpProjectionChild[];
  readonly controls: Readonly<{
    readonly help: Readonly<{
      readonly longOption: "--help";
      readonly shortAlias?: "-h";
      readonly headings?: HelpHeadings;
      readonly wording?: HelpFactWording;
    }>;
    readonly version?: Readonly<{
      readonly longOption: "--version";
      readonly shortAlias?: "-V";
      readonly description?: string;
    }>;
    readonly schema?: Readonly<{
      readonly longOption: "--schema";
      readonly description: string;
    }>;
  }>;
  readonly schemaQuery?: ContractDirectoryQuery | ContractSummaryQuery;
}>;

export function renderCommandHelp(input: HelpProjectionInput): string {
  const headings = input.controls.help.headings;
  const wording = input.controls.help.wording;
  const segments = [input.command.description];
  const positionalFields = input.command.fields.filter(
    (field) =>
      field.kind === "positional" || field.kind === "variadicPositional",
  );
  const optionFields = input.command.fields.filter(
    (field) =>
      field.kind !== "positional" && field.kind !== "variadicPositional",
  );
  const options = [
    ...optionFields.map((field) => formatHelpField(field, wording)),
    ...formatCoreControls(input),
  ];

  appendHelpSegment(segments, headings?.usage, [
    helpLine(input.command.synopsis),
  ]);
  appendHelpSegment(
    segments,
    headings?.commands,
    input.children.map((child) =>
      helpDetail(
        `${[child.name, ...child.aliases].join(", ")}${child.isGroup ? ` <${requireHelpFactWording(wording, "commandPlaceholder")}>` : ""}`,
        child.description,
      ),
    ),
  );
  appendHelpSegment(
    segments,
    headings?.arguments,
    positionalFields.map((field) => formatHelpField(field, wording)),
  );
  appendHelpSegment(segments, headings?.options, options);
  const fieldByKey = new Map(
    input.command.fields.map((field) => [field.key, field]),
  );
  appendHelpSegment(
    segments,
    headings?.constraints,
    input.command.usageConstraints.map((constraint) =>
      helpLine(formatUsageConstraint(constraint, wording, fieldByKey)),
    ),
  );
  appendHelpSegment(
    segments,
    headings?.schema,
    createSchemaHelpEntries(input.schemaQuery),
  );
  appendHelpSegment(
    segments,
    headings?.examples,
    input.command.examples.map((example) => helpLine(example.shell)),
  );
  appendHelpSegment(
    segments,
    headings?.supplement,
    input.command.helpSupplement === undefined
      ? []
      : [{ kind: "lines" as const, lines: input.command.helpSupplement }],
  );
  return `${segments.join("\n\n")}\n`;
}

type HelpEntry =
  | Readonly<{
      readonly kind: "detail";
      readonly summary: string;
      readonly detail: string;
    }>
  | Readonly<{ readonly kind: "line"; readonly value: string }>
  | Readonly<{ readonly kind: "lines"; readonly lines: readonly string[] }>;

function helpLine(value: string): HelpEntry {
  return { kind: "line", value };
}

function helpDetail(summary: string, detail: string): HelpEntry {
  return { kind: "detail", summary, detail };
}

function appendHelpSegment(
  segments: string[],
  heading: string | undefined,
  entries: readonly HelpEntry[],
): void {
  if (entries.length === 0) return;
  const lines = heading === undefined ? [] : [heading];
  for (const entry of entries) {
    if (entry.kind === "line") lines.push(`  ${entry.value}`);
    else if (entry.kind === "detail")
      lines.push(`  ${entry.summary}`, `    ${entry.detail}`);
    else
      lines.push(
        ...entry.lines.map((line) => (line === "" ? "" : `  ${line}`)),
      );
  }
  segments.push(lines.join("\n"));
}

function formatCoreControls(input: HelpProjectionInput): readonly HelpEntry[] {
  const { help, version, schema } = input.controls;
  const wording = help.wording;
  const versionEntry: HelpEntry | undefined =
    version === undefined
      ? undefined
      : version.description === undefined
        ? helpLine(
            [version.longOption, version.shortAlias]
              .filter((spelling) => spelling !== undefined)
              .join(", "),
          )
        : helpDetail(
            [version.longOption, version.shortAlias]
              .filter((spelling) => spelling !== undefined)
              .join(", "),
            version.description,
          );
  const outputModes = input.command.outputModes;
  return [
    helpLine(
      [help.longOption, help.shortAlias]
        .filter((spelling) => spelling !== undefined)
        .join(", "),
    ),
    ...(versionEntry === undefined ? [] : [versionEntry]),
    ...(schema === undefined
      ? []
      : [helpDetail(schema.longOption, schema.description)]),
    ...(outputModes === undefined
      ? []
      : [
          helpLine(
            renderHelpFactTemplate(wording, "choicesAndDefault", {
              usage: `--output <${requireHelpFactWording(wording, "outputModePlaceholder")}>`,
              choices: foldHelpBinary(
                outputModes.modes.map((mode) => JSON.stringify(mode.id)),
                wording,
                "list",
              ),
              value: JSON.stringify(outputModes.defaultMode),
            }),
          ),
          ...outputModes.modes.map((mode) =>
            helpDetail(mode.id, mode.description),
          ),
        ]),
  ];
}

function createSchemaHelpEntries(
  query: ContractDirectoryQuery | ContractSummaryQuery | undefined,
): readonly HelpEntry[] {
  if (query === undefined) return [];
  if (query.kind === "directory") {
    return query.children.map((child) =>
      helpDetail(JSON.stringify(child.nextArgv), child.description),
    );
  }
  return query.next.map((next) =>
    helpDetail(`--schema=${next.target}`, JSON.stringify(next.argv)),
  );
}

function formatHelpField(
  field: FieldGrammar,
  wording: HelpFactWording | undefined,
): HelpEntry {
  const baseUsage = formatFieldUsage(field, true);
  let usage = baseUsage;
  if (field.choices !== undefined && field.default !== undefined) {
    usage = renderHelpFactTemplate(wording, "choicesAndDefault", {
      usage: baseUsage,
      choices: foldHelpBinary(
        field.choices.map((choice) => JSON.stringify(choice)),
        wording,
        "list",
      ),
      value: JSON.stringify(field.default),
    });
  } else if (field.choices !== undefined) {
    usage = renderHelpFactTemplate(wording, "choices", {
      usage: baseUsage,
      choices: foldHelpBinary(
        field.choices.map((choice) => JSON.stringify(choice)),
        wording,
        "list",
      ),
    });
  } else if (field.default !== undefined) {
    usage = renderHelpFactTemplate(wording, "default", {
      usage: baseUsage,
      value: JSON.stringify(field.default),
    });
  }
  return helpDetail(usage, field.description);
}

// oxlint-disable-next-line typescript/consistent-return -- Every closed field kind returns its CLI symbol.
function formatConstraintFieldSymbol(
  key: string,
  fieldByKey: ReadonlyMap<string, FieldGrammar>,
): string {
  const field = fieldByKey.get(key);
  if (field === undefined) return key;
  switch (field.kind) {
    case "flag":
    case "valueOption":
    case "repeatableOption":
      return field.longOption;
    case "positional":
      return `<${field.placeholder ?? field.key}>`;
    case "variadicPositional":
      return `<${field.placeholder ?? field.key}...>`;
  }
}

function formatUsageConstraint(
  constraint: UsageConstraintGrammar,
  wording: HelpFactWording | undefined,
  fieldByKey: ReadonlyMap<string, FieldGrammar>,
): string {
  if (constraint.kind === "count") {
    const fields = foldHelpBinary(
      constraint.fields.map((key) =>
        formatConstraintFieldSymbol(key, fieldByKey),
      ),
      wording,
      "list",
    );
    if (constraint.min === constraint.max) {
      return renderHelpFactTemplate(wording, "countExactly", {
        fields,
        count: String(constraint.min),
      });
    }
    if (constraint.max === constraint.fields.length) {
      return renderHelpFactTemplate(wording, "countAtLeast", {
        fields,
        min: String(constraint.min),
      });
    }
    if (constraint.min === 0) {
      return renderHelpFactTemplate(wording, "countAtMost", {
        fields,
        max: String(constraint.max),
      });
    }
    return renderHelpFactTemplate(wording, "countBetween", {
      fields,
      min: String(constraint.min),
      max: String(constraint.max),
    });
  }

  const facts = foldHelpBinary(
    constraint.all.map((fact) => {
      const symbol = formatConstraintFieldSymbol(fact.field, fieldByKey);
      return fact.kind === "present"
        ? renderHelpFactTemplate(wording, "present", { field: symbol })
        : renderHelpFactTemplate(wording, "equals", {
            field: symbol,
            value: JSON.stringify(fact.value),
          });
    }),
    wording,
    "facts",
  );
  if (constraint.kind === "forbiddenCombination") {
    return renderHelpFactTemplate(wording, "forbiddenCombination", { facts });
  }

  const onMatchText = formatUsageEffect(
    constraint.onMatch,
    wording,
    fieldByKey,
  );
  const otherwiseText = formatUsageEffect(
    constraint.otherwise,
    wording,
    fieldByKey,
  );
  if (onMatchText !== undefined && otherwiseText !== undefined) {
    return renderHelpFactTemplate(wording, "whenOnMatchOtherwise", {
      facts,
      onMatch: onMatchText,
      otherwise: otherwiseText,
    });
  }
  if (onMatchText !== undefined) {
    return renderHelpFactTemplate(wording, "whenOnMatch", {
      facts,
      onMatch: onMatchText,
    });
  }
  return renderHelpFactTemplate(wording, "whenOtherwise", {
    facts,
    otherwise: otherwiseText ?? "",
  });
}

function formatUsageEffect(
  effect: WhenUsageConstraint["onMatch"] | undefined,
  wording: HelpFactWording | undefined,
  fieldByKey: ReadonlyMap<string, FieldGrammar>,
): string | undefined {
  if (effect === undefined) return undefined;
  const required = effect.require ?? [];
  const forbidden = effect.forbid ?? [];
  const renderedRequire =
    required.length > 0
      ? renderHelpFactTemplate(wording, "require", {
          fields: foldHelpBinary(
            required.map((key) => formatConstraintFieldSymbol(key, fieldByKey)),
            wording,
            "list",
          ),
        })
      : undefined;
  const renderedForbid =
    forbidden.length > 0
      ? renderHelpFactTemplate(wording, "forbid", {
          fields: foldHelpBinary(
            forbidden.map((key) =>
              formatConstraintFieldSymbol(key, fieldByKey),
            ),
            wording,
            "list",
          ),
        })
      : undefined;
  if (renderedRequire !== undefined && renderedForbid !== undefined) {
    return renderHelpFactTemplate(wording, "effects", {
      left: renderedRequire,
      right: renderedForbid,
    });
  }
  return renderedRequire ?? renderedForbid;
}

function foldHelpBinary(
  items: readonly string[],
  wording: HelpFactWording | undefined,
  slot: "list" | "facts" | "effects",
): string {
  const [first, ...rest] = items;
  if (first === undefined) return "";
  return rest.reduce(
    (left, right) => renderHelpFactTemplate(wording, slot, { left, right }),
    first,
  );
}

function renderHelpFactTemplate<Slot extends HelpTemplateSlot>(
  wording: HelpFactWording | undefined,
  slot: Slot,
  parameters: HelpFactTemplateParameters[Slot],
): string {
  const template = requireHelpFactWording(wording, slot);
  const values = parameters as Readonly<Record<string, string>>;
  const allowed = helpTemplateSpecifications[slot].placeholders;
  for (const placeholder of allowed) {
    if (typeof values[placeholder] !== "string") {
      throw new ContractExecutionError([{ code: "invalidCliContract" }]);
    }
  }
  return template.replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/g,
    (_match, key: string) => {
      const value = values[key];
      if (typeof value !== "string") {
        throw new ContractExecutionError([{ code: "invalidCliContract" }]);
      }
      return value;
    },
  );
}

function requireHelpFactWording(
  wording: HelpFactWording | undefined,
  slot: HelpTemplateSlot,
): string {
  const value = wording?.[slot];
  if (value === undefined) {
    throw new ContractExecutionError([{ code: "invalidCliContract" }]);
  }
  return value;
}
