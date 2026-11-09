import {
  getCompiledCli,
  isCompiledExecutable,
  type AnyCliContract,
  type CommandGroupManifest,
  type CommandSuccessManifest,
  type CommandWireManifest,
  type CommandExampleManifest,
  type ExecutableCommandManifest,
  type FailureVariantManifest,
  type FieldGrammar,
  type OutputModeWireManifest,
  type RootCommandManifest,
  type UsageConstraintGrammar,
} from "#/cli-contract";
import type { CommandUsage } from "#/cli-invocation";
import type { JsonObject } from "#/contract-schema";
import { deepFreeze } from "#/json-value";
import type { StreamRecordManifest } from "#/stream-variant-compiler";

type RuntimeCommand = ReturnType<typeof getCompiledCli>["commands"][string];
type RuntimeExecutable = Extract<
  RuntimeCommand,
  { readonly kind: "command" | "rootCommand" }
>;
type RuntimeGroup = Extract<
  RuntimeCommand,
  { readonly kind: "commandGroup" | "rootGroup" }
>;
type CommandManifest =
  | RootCommandManifest
  | CommandGroupManifest
  | ExecutableCommandManifest;

export interface ContractDirectoryChild {
  readonly command: string;
  readonly kind: "group" | "command";
  readonly name: string;
  readonly description: string;
  readonly path: readonly string[];
  readonly nextArgv: readonly string[];
}

export interface ContractQueryNext {
  readonly target: string;
  readonly argv: readonly string[];
}

export interface ContractDirectoryQuery {
  readonly kind: "directory";
  readonly schemaVersion: string;
  readonly command: string;
  readonly path: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly children: readonly ContractDirectoryChild[];
}

export interface ContractSummaryMode {
  readonly description: string;
  readonly delivery: "atomic" | "stream";
  readonly format: "structured" | "text";
}

export interface ContractSummaryQuery {
  readonly kind: "summary";
  readonly schemaVersion: string;
  readonly command: string;
  readonly path: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly usage: CommandUsage<string>;
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints: readonly UsageConstraintGrammar[];
  readonly outputs: Readonly<{
    readonly default: string;
    readonly modes: Readonly<Record<string, ContractSummaryMode>>;
  }>;
  readonly examples: readonly CommandExampleManifest[];
  readonly next: readonly ContractQueryNext[];
}

export interface ContractInputQuery {
  readonly kind: "input";
  readonly schemaVersion: string;
  readonly command: string;
  readonly path: readonly string[];
  readonly fields: readonly FieldGrammar[];
  readonly usageConstraints: readonly UsageConstraintGrammar[];
  readonly usage: CommandUsage<string>;
  readonly input: Readonly<{
    readonly inputSchema: JsonObject;
    readonly outputSchema: JsonObject;
  }>;
}

export type ContractSuccessManifest =
  | Readonly<{ readonly kind: "completion" }>
  | Readonly<{
      readonly kind: "data";
      readonly variants: Readonly<Record<string, FailureVariantManifest>>;
    }>
  | Readonly<{
      readonly kind: "stream";
      readonly text?: Readonly<{ readonly recordFraming: "fragment" }>;
    }>;

interface ModeQueryBase {
  readonly schemaVersion: string;
  readonly command: string;
  readonly path: readonly string[];
  readonly mode: string;
}

export interface ContractSuccessQuery extends ModeQueryBase {
  readonly kind: "success";
  readonly success: ContractSuccessManifest;
}

export interface ContractFailuresQuery extends ModeQueryBase {
  readonly kind: "failures";
  readonly failures: Readonly<Record<string, FailureVariantManifest>>;
}

export interface ContractRecordsQuery extends ModeQueryBase {
  readonly kind: "records";
  readonly records: Readonly<Record<string, StreamRecordManifest>>;
}

export interface ContractWireQuery extends ModeQueryBase {
  readonly kind: "wire";
  readonly wire: OutputModeWireManifest;
}

export type ContractQueryDocument =
  | ContractDirectoryQuery
  | ContractSummaryQuery
  | ContractInputQuery
  | ContractSuccessQuery
  | ContractFailuresQuery
  | ContractRecordsQuery
  | ContractWireQuery;

export type ContractQueryFailureReason =
  | "discoveryNotInstalled"
  | "unknownCommandPath"
  | "invalidSyntax"
  | "unknownPart"
  | "unknownOutputMode"
  | "unsupportedPart";

export interface ContractQueryFailure {
  readonly kind: "queryFailure";
  readonly path: readonly string[];
  readonly target?: string;
  readonly reason: ContractQueryFailureReason;
}

export type ContractQueryResult = ContractQueryDocument | ContractQueryFailure;

/** 以根之后的规范命令名路径查询发现事实；不接受内部 id 或 alias。 */
export function queryCliContract(
  contract: AnyCliContract,
  path: readonly string[],
  target?: string,
): ContractQueryResult {
  const compiled = getCompiledCli(contract);
  const canonicalPath = Object.freeze([...path]);
  if (compiled.contract.grammar.controls.schema === undefined) {
    return queryFailure(canonicalPath, target, "discoveryNotInstalled");
  }
  const command = resolveCommandPath(compiled.commands, compiled.root, path);
  if (command === undefined) {
    return queryFailure(canonicalPath, target, "unknownCommandPath");
  }
  const commandPath = canonicalCommandPath(compiled.commands, command.id);
  const manifest = getCommandManifest(
    compiled.contract.manifest.commands,
    command.id,
  );
  if (manifest === undefined) {
    return queryFailure(canonicalPath, target, "unknownCommandPath");
  }
  const schemaVersion = compiled.contract.manifest.schemaVersion;

  if (target === undefined) {
    return isCompiledExecutable(command)
      ? createSummaryQuery(schemaVersion, command, manifest, commandPath)
      : createDirectoryQuery(
          schemaVersion,
          command,
          commandPath,
          compiled.commands,
        );
  }

  if (!isCompiledExecutable(command) || !isExecutableManifest(manifest)) {
    return queryFailure(canonicalPath, target, "unsupportedPart");
  }
  if (target === "input") {
    return deepFreeze({
      kind: "input" as const,
      schemaVersion,
      command: command.id,
      path: commandPath,
      fields: manifest.fields,
      usageConstraints: manifest.usageConstraints ?? [],
      usage: command.usage,
      input: manifest.input,
    });
  }

  const parsedTarget = parseSchemaTarget(target);
  if (parsedTarget.kind === "failure") {
    return queryFailure(canonicalPath, target, parsedTarget.reason);
  }
  const { part, mode: modeId } = parsedTarget;
  if (
    !Object.hasOwn(command.outputModes, modeId) ||
    !Object.hasOwn(manifest.outputs.modes, modeId)
  ) {
    return queryFailure(canonicalPath, target, "unknownOutputMode");
  }
  const outputMode = command.outputModes[modeId];
  const modeManifest = manifest.outputs.modes[modeId];
  if (outputMode === undefined || modeManifest === undefined) {
    return queryFailure(canonicalPath, target, "unknownOutputMode");
  }
  const base: ModeQueryBase = {
    schemaVersion,
    command: command.id,
    path: commandPath,
    mode: modeId,
  };

  switch (part) {
    case "success":
      return deepFreeze({
        ...base,
        kind: "success" as const,
        success: projectSuccess(modeManifest.success),
      });
    case "failures":
      return deepFreeze({
        ...base,
        kind: "failures" as const,
        failures: modeManifest.failures,
      });
    case "records":
      if (modeManifest.success.kind !== "stream") {
        return queryFailure(canonicalPath, target, "unsupportedPart");
      }
      return deepFreeze({
        ...base,
        kind: "records" as const,
        records: modeManifest.success.records,
      });
    case "wire": {
      if (outputMode.format !== "structured") {
        return queryFailure(canonicalPath, target, "unsupportedPart");
      }
      const wire = commandWireManifest(compiled, command.id)?.[modeId];
      return wire === undefined
        ? queryFailure(canonicalPath, target, "unsupportedPart")
        : deepFreeze({ ...base, kind: "wire" as const, wire });
    }
  }
}

export function canonicalCommandPath(
  commands: Readonly<Record<string, RuntimeCommand>>,
  commandId: string,
): readonly string[] {
  const path: string[] = [];
  let current = commands[commandId];
  while (current?.parent !== undefined) {
    path.unshift(current.name);
    current = commands[current.parent];
  }
  return Object.freeze(path);
}

function createDirectoryQuery(
  schemaVersion: string,
  command: RuntimeGroup,
  path: readonly string[],
  commands: Readonly<Record<string, RuntimeCommand>>,
): ContractDirectoryQuery {
  const children = Object.values(commands)
    .filter((candidate) => candidate.parent === command.id)
    .map((candidate) => {
      const childPath = canonicalCommandPath(commands, candidate.id);
      return {
        command: candidate.id,
        kind: isCompiledExecutable(candidate)
          ? ("command" as const)
          : ("group" as const),
        name: candidate.name,
        description: candidate.description,
        path: childPath,
        nextArgv: [...childPath, "--schema"],
      };
    });
  return deepFreeze({
    kind: "directory" as const,
    schemaVersion,
    command: command.id,
    path,
    name: command.name,
    description: command.description,
    children,
  });
}

function createSummaryQuery(
  schemaVersion: string,
  command: RuntimeExecutable,
  manifest: CommandManifest,
  path: readonly string[],
): ContractSummaryQuery {
  if (!isExecutableManifest(manifest)) {
    throw new TypeError("已编译命令清单与运行时命令不一致");
  }
  const modes = Object.fromEntries(
    Object.entries(manifest.outputs.modes).map(([mode, output]) => [
      mode,
      {
        description: output.description,
        delivery: output.delivery,
        format: output.format,
      },
    ]),
  );
  const next: ContractQueryNext[] = [
    {
      target: "input",
      argv: [...path, "--schema=input"],
    },
  ];
  for (const [mode, output] of Object.entries(modes)) {
    next.push({
      target: `success:${mode}`,
      argv: [...path, `--schema=success:${mode}`],
    });
    next.push({
      target: `failures:${mode}`,
      argv: [...path, `--schema=failures:${mode}`],
    });
    if (output.delivery === "stream") {
      next.push({
        target: `records:${mode}`,
        argv: [...path, `--schema=records:${mode}`],
      });
    }
    if (output.format === "structured") {
      next.push({
        target: `wire:${mode}`,
        argv: [...path, `--schema=wire:${mode}`],
      });
    }
  }
  return deepFreeze({
    kind: "summary" as const,
    schemaVersion,
    command: command.id,
    path,
    name: command.name,
    description: command.description,
    usage: command.usage,
    fields: manifest.fields,
    usageConstraints: manifest.usageConstraints ?? [],
    outputs: { default: manifest.outputs.default, modes },
    examples: manifest.examples ?? [],
    next,
  });
}

function projectSuccess(
  success: CommandSuccessManifest,
): ContractSuccessManifest {
  if (success.kind !== "stream") return success;
  return {
    kind: "stream",
    ...(success.text === undefined ? {} : { text: success.text }),
  };
}

function parseSchemaTarget(target: string):
  | Readonly<{
      readonly kind: "selected";
      readonly part: "success" | "failures" | "records" | "wire";
      readonly mode: string;
    }>
  | Readonly<{
      readonly kind: "failure";
      readonly reason: "invalidSyntax" | "unknownPart";
    }> {
  if (target.length === 0) {
    return { kind: "failure", reason: "invalidSyntax" };
  }
  const separator = target.indexOf(":");
  if (separator < 0) {
    return {
      kind: "failure",
      reason: ["input", "success", "failures", "records", "wire"].includes(
        target,
      )
        ? "invalidSyntax"
        : "unknownPart",
    };
  }
  if (separator === 0 || separator !== target.lastIndexOf(":")) {
    return { kind: "failure", reason: "invalidSyntax" };
  }
  const part = target.slice(0, separator);
  const mode = target.slice(separator + 1);
  if (
    ["input", "success", "failures", "records", "wire"].includes(part) &&
    mode.length === 0
  ) {
    return { kind: "failure", reason: "invalidSyntax" };
  }
  if (mode.length === 0) return { kind: "failure", reason: "invalidSyntax" };
  if (part === "input") return { kind: "failure", reason: "invalidSyntax" };
  if (
    part !== "success" &&
    part !== "failures" &&
    part !== "records" &&
    part !== "wire"
  ) {
    return { kind: "failure", reason: "unknownPart" };
  }
  return { kind: "selected", part, mode };
}

function resolveCommandPath(
  commands: Readonly<Record<string, RuntimeCommand>>,
  root: string,
  path: readonly string[],
): RuntimeCommand | undefined {
  let current = commands[root];
  for (const name of path) {
    if (current === undefined || isCompiledExecutable(current))
      return undefined;
    current = Object.values(commands).find(
      (candidate) =>
        candidate.parent === current?.id && candidate.name === name,
    );
  }
  return current;
}

function getCommandManifest(
  commands:
    | Readonly<Record<string, CommandManifest>>
    | Readonly<Record<string, never>>,
  command: string,
): CommandManifest | undefined {
  return (commands as Readonly<Record<string, CommandManifest>>)[command];
}

function isExecutableManifest(
  manifest: CommandManifest,
): manifest is RootCommandManifest | ExecutableCommandManifest {
  return manifest.kind === "rootCommand" || manifest.kind === "command";
}

function commandWireManifest(
  compiled: ReturnType<typeof getCompiledCli>,
  command: string,
): CommandWireManifest | undefined {
  const root = compiled.commands[compiled.root];
  if (root === undefined) return undefined;
  const wire = compiled.contract.manifest.wire;
  return isCompiledExecutable(root)
    ? (wire as CommandWireManifest)
    : (wire as Readonly<Record<string, CommandWireManifest>>)[command];
}

function queryFailure(
  path: readonly string[],
  target: string | undefined,
  reason: ContractQueryFailureReason,
): ContractQueryFailure {
  return deepFreeze({
    kind: "queryFailure" as const,
    path,
    ...(target === undefined ? {} : { target }),
    reason,
  });
}
