import type { CommandUsage } from "#/cli-invocation";
import { createCompletionWireSchema } from "#/completion-wire";
import type {
  ContractSchema,
  EmptyCliInput,
  JsonObject,
  JsonValue,
} from "#/contract-schema";

const cliContractType = Symbol("CliContract.type");
const completionFactType = Symbol("CompletionFact.type");
const helpCapabilities = new WeakSet<object>();
const outputCapabilities = new WeakSet<object>();
const compiledCliContracts = new WeakMap<object, object>();

export interface HelpCapability {
  readonly kind: "helpCapability";
  readonly longOption: "--help";
  readonly [cliContractType]: "help";
}

export interface OutputCapability {
  readonly kind: "outputCapability";
  readonly defaultFormat: "structured";
  readonly formats: readonly ["structured"];
  readonly [cliContractType]: "output";
}

export interface CompletionFact<Command extends string = string> {
  readonly kind: "completion";
  readonly command: Command;
  readonly [completionFactType]: true;
}

export interface CompletionOutcome<Command extends string> {
  completion(): CompletionFact<Command>;
}

export interface CompletionHandlerContext<
  Command extends string,
  Dependencies,
> {
  readonly input: EmptyCliInput;
  readonly dependencies: Dependencies;
  readonly outcome: CompletionOutcome<Command>;
}

export interface RootCommandDefinition<Command extends string, Dependencies> {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly input: ContractSchema<EmptyCliInput>;
  readonly success: Readonly<{ readonly kind: "completion" }>;
  readonly failures: Readonly<Record<string, never>>;
  readonly handler: (
    context: CompletionHandlerContext<Command, Dependencies>,
  ) => CompletionFact<Command> | Promise<CompletionFact<Command>>;
}

export interface RootCliDefinition<Root extends string, Dependencies> {
  readonly root: Root;
  readonly help: HelpCapability;
  readonly output: OutputCapability;
  readonly usageFailureExitCode: number;
  readonly commands: Readonly<{
    readonly [Command in Root]: RootCommandDefinition<Command, Dependencies>;
  }>;
}

export interface RootCommandGrammar<Root extends string> {
  readonly kind: "rootCommand";
  readonly id: Root;
  readonly name: string;
  readonly description: string;
  readonly fields: readonly [];
  readonly usage: CommandUsage<Root>;
}

export interface CliGrammar<Root extends string> {
  readonly root: RootCommandGrammar<Root>;
  readonly nodes: readonly [];
  readonly controls: Readonly<{
    readonly help: Readonly<{ readonly longOption: "--help" }>;
    readonly output: Readonly<{
      readonly defaultFormat: "structured";
      readonly formats: readonly ["structured"];
    }>;
  }>;
}

export interface RootCommandManifest {
  readonly kind: "rootCommand";
  readonly name: string;
  readonly description: string;
  readonly input: Readonly<{
    readonly inputSchema: JsonObject;
    readonly outputSchema: JsonObject;
  }>;
  readonly success: Readonly<{ readonly kind: "completion" }>;
  readonly failures: Readonly<Record<string, never>>;
}

export interface CliManifest<Root extends string> {
  readonly schemaVersion: "1";
  readonly root: Root;
  readonly commands: Readonly<Record<Root, RootCommandManifest>>;
  readonly controls: CliGrammar<Root>["controls"];
  readonly usageFailure: Readonly<{ readonly exitCode: number }>;
  readonly wire: Readonly<{ readonly completion: JsonObject }>;
}

export interface CliContract<
  Root extends string = string,
  Dependencies = unknown,
> {
  readonly grammar: CliGrammar<Root>;
  readonly manifest: CliManifest<Root>;
  readonly [cliContractType]: Readonly<{
    readonly dependencies: Dependencies;
    readonly root: Root;
  }>;
}

export type CliContractDependencies<Contract> =
  Contract extends CliContract<string, infer Dependencies>
    ? Dependencies
    : never;

export type CliContractRoot<Contract> =
  Contract extends CliContract<infer Root, unknown> ? Root : never;

export interface CompiledCli<Root extends string, Dependencies> {
  readonly contract: CliContract<Root, Dependencies>;
  readonly root: Root;
  readonly description: string;
  readonly usage: CommandUsage<Root>;
  readonly usageFailureExitCode: number;
  readonly input: ContractSchema<EmptyCliInput>;
  readonly handler: RootCommandDefinition<Root, Dependencies>["handler"];
}

export function helpCapability(): HelpCapability {
  const capability = Object.freeze({
    kind: "helpCapability" as const,
    longOption: "--help" as const,
  }) as HelpCapability;
  helpCapabilities.add(capability);
  return capability;
}

export function outputCapability(
  definition: Readonly<{ readonly defaultFormat: "structured" }>,
): OutputCapability {
  const capability = Object.freeze({
    kind: "outputCapability" as const,
    defaultFormat: definition.defaultFormat,
    formats: Object.freeze(["structured"] as const),
  }) as OutputCapability;
  outputCapabilities.add(capability);
  return capability;
}

export function defineCli<Dependencies = undefined>() {
  return function <const Root extends string>(
    definition: RootCliDefinition<Root, Dependencies>,
  ): CliContract<Root, Dependencies> {
    if (!helpCapabilities.has(definition.help)) {
      throw new TypeError("help 必须由 helpCapability 创建");
    }
    if (!outputCapabilities.has(definition.output)) {
      throw new TypeError("output 必须由 outputCapability 创建");
    }
    if (!Number.isInteger(definition.usageFailureExitCode)) {
      throw new TypeError("用法失败退出码必须是整数");
    }
    if (
      definition.usageFailureExitCode < 1 ||
      definition.usageFailureExitCode > 255
    ) {
      throw new RangeError("用法失败退出码必须在 1 到 255 之间");
    }

    const command = definition.commands[definition.root];
    if (command === undefined) {
      throw new TypeError("根命令必须存在");
    }
    if (Object.keys(definition.commands).length !== 1) {
      throw new TypeError("RootCommand CLI 必须且只能包含一个命令");
    }
    if (command.kind !== "rootCommand") {
      throw new TypeError("根命令 kind 必须是 rootCommand");
    }
    if (command.name.length === 0 || command.description.length === 0) {
      throw new TypeError("根命令名称和描述不能为空");
    }
    if (command.success.kind !== "completion") {
      throw new TypeError("根命令 success 必须是 completion");
    }
    if (Object.keys(command.failures).length !== 0) {
      throw new TypeError("最小 completion 切片不支持应用失败");
    }

    const inputSchema = copyJsonObject(
      command.input["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      }),
    );
    const outputSchema = copyJsonObject(
      command.input["~standard"].jsonSchema.output({
        target: "draft-2020-12",
      }),
    );
    const usage = deepFreeze({
      command: definition.root,
      synopsis: command.name,
    });
    const controls = deepFreeze({
      help: { longOption: definition.help.longOption },
      output: {
        defaultFormat: definition.output.defaultFormat,
        formats: definition.output.formats,
      },
    });
    const grammar = deepFreeze({
      root: {
        kind: "rootCommand" as const,
        id: definition.root,
        name: command.name,
        description: command.description,
        fields: [] as const,
        usage,
      },
      nodes: [] as const,
      controls,
    });
    const completionWireSchema = copyJsonObject(
      createCompletionWireSchema(definition.root),
    );
    const manifest = deepFreeze({
      schemaVersion: "1" as const,
      root: definition.root,
      commands: {
        [definition.root]: {
          kind: "rootCommand" as const,
          name: command.name,
          description: command.description,
          input: { inputSchema, outputSchema },
          success: { kind: "completion" as const },
          failures: {},
        },
      } as Record<Root, RootCommandManifest>,
      controls,
      usageFailure: { exitCode: definition.usageFailureExitCode },
      wire: { completion: completionWireSchema },
    });
    const contract = Object.freeze({ grammar, manifest }) as CliContract<
      Root,
      Dependencies
    >;

    compiledCliContracts.set(contract, {
      contract,
      root: definition.root,
      description: command.description,
      usage,
      usageFailureExitCode: definition.usageFailureExitCode,
      input: command.input,
      handler: command.handler,
    });

    return contract;
  };
}

export function getCompiledCli<const Contract extends CliContract>(
  contract: Contract,
): CompiledCli<CliContractRoot<Contract>, CliContractDependencies<Contract>> {
  const compiled = compiledCliContracts.get(contract);
  if (compiled === undefined) {
    throw new TypeError("CLI 契约必须由 defineCli 创建");
  }
  return compiled as CompiledCli<
    CliContractRoot<Contract>,
    CliContractDependencies<Contract>
  >;
}

export function createCompletionFact<Command extends string>(
  command: Command,
  issuedCompletionFacts: WeakSet<object>,
): CompletionFact<Command> {
  const fact = Object.freeze({ kind: "completion" as const, command });
  issuedCompletionFacts.add(fact);
  return fact as CompletionFact<Command>;
}

export function isCompletionFact(
  value: unknown,
  issuedCompletionFacts: WeakSet<object>,
): value is CompletionFact {
  return (
    typeof value === "object" &&
    value !== null &&
    issuedCompletionFacts.has(value)
  );
}

function copyJsonObject(value: Record<string, unknown>): JsonObject {
  const copy = copyJsonValue(value, new WeakSet<object>());
  if (typeof copy !== "object" || copy === null || Array.isArray(copy)) {
    throw new TypeError("JSON Schema 必须是对象");
  }
  return copy as JsonObject;
}

function copyJsonValue(value: unknown, ancestors: WeakSet<object>): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JSON 数值必须是有限数");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("值无法表示为 JSON");
  }
  if (ancestors.has(value)) {
    throw new TypeError("JSON 值不能包含循环引用");
  }

  ancestors.add(value);
  const copy: JsonValue = Array.isArray(value)
    ? value.map((item) => copyJsonValue(item, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          copyJsonValue(item, ancestors),
        ]),
      );
  ancestors.delete(value);
  return deepFreeze(copy);
}

function deepFreeze<const Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) {
    deepFreeze(item);
  }
  return Object.freeze(value);
}
