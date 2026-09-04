import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
  versionCapability,
  type CliContract,
  type CliContractResult,
  type CliInvocation,
  type CanonicalLongOption,
  type CompletionRootCliDefinition,
  type CompletionRootCommandDefinition,
  type ContractSchema,
  type ContractSchemaInput,
  type ContractSchemaOutput,
  type EmptyCliInput,
  type FieldDefinition,
  type DataVariantDefinition,
  type OutputCapability,
  type StreamRootCommandDefinition,
  type StreamRecordDefinition,
  type ShortOptionAlias,
  type TextLines,
  type UsageConstraint,
} from "@cli-contract/lib";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { z } from "zod";

const realZodSchema = z
  .object({ name: z.string() })
  .transform(({ name }) => ({ normalizedName: name.toUpperCase() }))
  .pipe(z.object({ normalizedName: z.string() }));
const zodInput: ContractSchemaInput<typeof realZodSchema> = { name: "Ada" };
const zodOutput: ContractSchemaOutput<typeof realZodSchema> = {
  normalizedName: "ADA",
};

const realValibotSchema = toStandardJsonSchema(v.object({ name: v.string() }));
const valibotInput: ContractSchemaInput<typeof realValibotSchema> = {
  name: "Grace",
};
const valibotOutput: ContractSchemaOutput<typeof realValibotSchema> = {
  name: "Grace",
};

void zodInput;
void zodOutput;
void valibotInput;
void valibotOutput;

declare const emptyInput: ContractSchema<EmptyCliInput>;
declare const namedInput: ContractSchema<
  Readonly<{ readonly name: string }>,
  Readonly<{ readonly normalizedName: string }>
>;
declare const greetingData: ContractSchema<
  Readonly<{ readonly message: string }>
>;

type UsageFixtureFields = Readonly<{
  readonly format: {
    readonly kind: "valueOption";
    readonly longOption: "--format";
    readonly description: "格式";
  };
  readonly quiet: {
    readonly kind: "flag";
    readonly longOption: "--quiet";
    readonly description: "静默";
  };
  readonly tags: {
    readonly kind: "repeatableOption";
    readonly longOption: "--tag";
    readonly description: "标签";
  };
}>;

const validUsageConstraint: UsageConstraint<UsageFixtureFields> = {
  kind: "forbiddenCombination",
  values: [
    { field: "format", value: "json" },
    { field: "quiet", value: true },
  ],
};
void validUsageConstraint;

const explicitTextLines: TextLines = text.lines(["第一行", "", "最后一行"]);
void explicitTextLines;

const shortHelp = helpCapability({ shortAlias: "-h" });
void shortHelp;

// @ts-expect-error 帮助短别名只能显式选择 -h。
helpCapability({ shortAlias: "-x" });

// @ts-expect-error TextLines 只能由受控构造器签发。
const forgedTextLines: TextLines = { kind: "lines", lines: ["伪造"] };
void forgedTextLines;

const cli = defineCli()({
  root: "fixture",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    fixture: {
      kind: "rootCommand",
      name: "fixture",
      description: "演示最小 CLI",
      helpSupplement: explicitTextLines,
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler({ input, dependencies, outcome }) {
        input satisfies EmptyCliInput;
        dependencies satisfies undefined;
        return outcome.completion();
      },
    },
  },
});

const invalidHelpSupplement: CompletionRootCommandDefinition<
  "invalidSupplement",
  undefined
> = {
  kind: "rootCommand",
  name: "invalid-supplement",
  description: "无效帮助补充",
  // @ts-expect-error 帮助补充只能使用受控 TextLines。
  helpSupplement: "任意文本",
  input: emptyInput,
  success: { kind: "completion" },
  failures: {},
  handler: ({ outcome }) => outcome.completion(),
};
void invalidHelpSupplement;

const dataCli = defineCli()({
  root: "greet",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    greet: {
      kind: "rootCommand",
      name: "greet",
      description: "生成问候",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "问候对象",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          greeting: {
            description: "生成的问候",
            schema: greetingData,
            exitCode: 0,
          },
        },
      },
      failures: {
        unavailable: {
          description: "服务不可用",
          schema: greetingData,
          exitCode: 9,
        },
      },
      handler({ input, outcome }) {
        input satisfies Readonly<{ readonly normalizedName: string }>;
        // @ts-expect-error data handler 不拥有 completion 构造器。
        outcome.completion();
        // @ts-expect-error 未声明的 data 变体不可构造。
        outcome.data.other({ message: "nope" });
        // @ts-expect-error data payload 必须符合对应变体模式。
        outcome.data.greeting({ message: 1 });
        // @ts-expect-error 未声明的失败变体不可构造。
        outcome.failure.other({ message: "nope" });
        // @ts-expect-error 失败 payload 必须符合对应变体模式。
        outcome.failure.unavailable({ message: 1 });
        // @ts-expect-error 不存在万能 default 失败分支。
        outcome.failure.default({ message: "nope" });
        if (input.normalizedName === "unavailable") {
          return outcome.failure.unavailable({ message: "稍后重试" });
        }
        return outcome.data.greeting({ message: input.normalizedName });
      },
    },
  },
});

const streamCli = defineCli()({
  root: "stream",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    stream: {
      kind: "rootCommand",
      name: "stream",
      description: "流 fixture",
      input: emptyInput,
      success: {
        kind: "stream",
        records: { greeting: { description: "问候", schema: greetingData } },
      },
      failures: {
        unavailable: {
          description: "服务不可用",
          schema: greetingData,
          exitCode: 9,
        },
      },
      async *handler({ outcome }) {
        yield outcome.record.greeting({ message: "hello" });
        return outcome.streamSuccess();
      },
    },
  },
});
void streamCli;

const textStreamCli = defineCli()({
  root: "textStream",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    textStream: {
      kind: "rootCommand",
      name: "text-stream",
      description: "文本流 fixture",
      input: emptyInput,
      success: {
        kind: "stream",
        text: () => text.lines(["流结束", "", "没有更多记录"]),
        records: {
          greeting: {
            description: "问候",
            schema: greetingData,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.line(data.message),
          },
        },
      },
      failures: {},
      async *handler({ outcome }) {
        yield outcome.record.greeting({ message: "hello" });
        return outcome.streamSuccess();
      },
    },
  },
});
void textStreamCli;

const hierarchyStreamDefine = defineCli();
const hierarchyStreamLeaf = hierarchyStreamDefine.command("streamLeaf")({
  kind: "command",
  parent: "workspace",
  name: "stream",
  description: "流 fixture",
  fields: {},
  input: emptyInput,
  success: {
    kind: "stream",
    text: () => text.silent,
    records: {
      greeting: {
        description: "问候",
        schema: greetingData,
        text: (data: Readonly<{ readonly message: string }>) =>
          text.line(data.message),
      },
    },
  },
  failures: {},
  async *handler({ outcome }) {
    yield* [] as Iterable<never>;
    return outcome.streamSuccess();
  },
});
const textStreamHierarchy = hierarchyStreamDefine({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured", text: true }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...hierarchyStreamLeaf,
  },
});
void textStreamHierarchy;

const defineMissingTextStreamHierarchy = defineCli();
defineMissingTextStreamHierarchy({
  root: "missingTextStreamTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingTextStreamTree: {
      // @ts-expect-error text 层级 stream 的终态与每个 record 都必须声明 presenter。
      kind: "rootGroup",
      name: "missing-text-stream-tree",
      description: "缺少文本流 presenter",
    },
    ...defineMissingTextStreamHierarchy.command("list")({
      kind: "command",
      parent: "missingTextStreamTree",
      name: "list",
      description: "列出项目",
      fields: {},
      input: emptyInput,
      success: {
        kind: "stream",
        records: { greeting: { description: "问候", schema: greetingData } },
      },
      failures: {},
      async *handler({ outcome }) {
        yield* [] as Iterable<never>;
        return outcome.streamSuccess();
      },
    }),
  },
});

function verifyTypeErrors() {
  // @ts-expect-error 版本能力必须显式提供受控单行值。
  versionCapability({ value: "1.2.3" });

  const missingCompletionText: CompletionRootCommandDefinition<
    "fixture",
    undefined,
    Readonly<Record<never, never>>,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    true
  > = {
    kind: "rootCommand",
    name: "fixture",
    description: "fixture",
    input: emptyInput,
    // @ts-expect-error 启用 text 的 completion 必须同位声明 presenter。
    success: { kind: "completion" },
    failures: {},
    handler: ({ outcome }) => outcome.completion(),
  };
  void missingCompletionText;

  const incompleteStream: StreamRootCommandDefinition<
    "stream",
    undefined,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    Readonly<{
      readonly greeting: {
        readonly description: "问候";
        readonly schema: typeof greetingData;
      };
    }>,
    Readonly<Record<never, never>>
  > = {
    kind: "rootCommand",
    name: "stream",
    description: "流 fixture",
    input: emptyInput,
    success: {
      kind: "stream",
      records: { greeting: { description: "问候", schema: greetingData } },
    },
    failures: {},
    // @ts-expect-error 普通 EOF 不是 stream 成功终态。
    async *handler({ outcome }) {
      yield outcome.record.greeting({ message: "hello" });
    },
  };
  void incompleteStream;

  const missingTextStream: StreamRootCommandDefinition<
    "textStream",
    undefined,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    Readonly<{
      readonly greeting: {
        readonly description: "问候";
        readonly schema: typeof greetingData;
      };
    }>,
    Readonly<Record<never, never>>,
    true
  > = {
    kind: "rootCommand",
    name: "text-stream",
    description: "文本流 fixture",
    input: emptyInput,
    success: {
      kind: "stream",
      // @ts-expect-error 启用 text 的 stream 成功终态与每个 record 都必须同位声明 presenter。
      records: { greeting: { description: "问候", schema: greetingData } },
    },
    failures: {},
    async *handler({ outcome }) {
      yield* [] as Iterable<never>;
      return outcome.streamSuccess();
    },
  };
  void missingTextStream;

  const silentStreamRecord: StreamRecordDefinition<
    Readonly<{ readonly message: string }>,
    true
  > = {
    description: "问候",
    schema: greetingData,
    // @ts-expect-error stream record presenter 不能伪造 silent。
    text: () => text.silent,
  };
  void silentStreamRecord;

  const textLinesStreamRecord: StreamRecordDefinition<
    Readonly<{ readonly message: string }>,
    true
  > = {
    description: "问候",
    schema: greetingData,
    // @ts-expect-error stream record presenter 不能返回文本行组。
    text: () => text.lines(["一行", "二行"]),
  };
  void textLinesStreamRecord;

  // @ts-expect-error 文本行组在类型层至少包含一项。
  text.lines([]);

  const invalidStreamFacts: StreamRootCommandDefinition<
    "stream",
    undefined,
    Readonly<Record<never, never>>,
    ContractSchema<EmptyCliInput>,
    Readonly<{
      readonly greeting: {
        readonly description: "问候";
        readonly schema: typeof greetingData;
      };
    }>,
    Readonly<{
      readonly unavailable: {
        readonly description: "不可用";
        readonly schema: typeof greetingData;
        readonly exitCode: 9;
      };
    }>
  > = {
    kind: "rootCommand",
    name: "stream",
    description: "流 fixture",
    input: emptyInput,
    success: {
      kind: "stream",
      records: { greeting: { description: "问候", schema: greetingData } },
    },
    failures: {
      unavailable: { description: "不可用", schema: greetingData, exitCode: 9 },
    },
    // @ts-expect-error stream 的 yield/return 位置分别只接受 record 与终态或 failure。
    async *handler({ outcome }) {
      yield outcome.failure.unavailable({ message: "nope" });
      return outcome.record.greeting({ message: "nope" });
    },
  };
  void invalidStreamFacts;

  // @ts-expect-error text data 变体必须同位声明 presenter。
  const missingDataText: DataVariantDefinition<
    Readonly<{ readonly message: string }>,
    true
  > = { description: "问候", schema: greetingData, exitCode: 0 };
  void missingDataText;

  const structuredData: DataVariantDefinition<
    Readonly<{ readonly message: string }>,
    false
  > = {
    description: "问候",
    schema: greetingData,
    exitCode: 0,
    // @ts-expect-error structured-only 变体不能声明 presenter。
    text: () => text.line("问候"),
  };
  void structuredData;
  const invalidUsageConstraint: UsageConstraint<UsageFixtureFields> = {
    kind: "forbiddenCombination",
    values: [
      // @ts-expect-error repeatable option 不能成为离散组合值。
      { field: "tags", value: "nightly" },
      { field: "quiet", value: true },
    ],
  };
  void invalidUsageConstraint;

  const variadicValueOption: FieldDefinition = {
    // @ts-expect-error 核心不提供单次 occurrence 消费多个值的 variadic option。
    kind: "variadicOption",
    longOption: "--values",
    description: "多个值",
  };
  void variadicValueOption;

  // @ts-expect-error 应用结果只能由作用域 outcome 构造器签发。
  const rawFailure: CliContractResult<typeof dataCli> = {
    kind: "failure",
    command: "greet",
    variant: "unavailable",
    data: { message: "nope" },
  };
  void rawFailure;

  const invalidZodOutput: ContractSchemaOutput<typeof realZodSchema> = {
    // @ts-expect-error Zod 变换后的 Output 不再是 raw Input 形状。
    name: "Ada",
  };
  void invalidZodOutput;

  // @ts-expect-error canonical long option 必须是小写 kebab-case。
  const invalidLongOption: CanonicalLongOption<"--foo_bar"> = "--foo_bar";
  void invalidLongOption;

  // @ts-expect-error short alias 必须是单个 ASCII 字母或数字。
  const invalidShortAlias: ShortOptionAlias<"--f"> = "--f";
  void invalidShortAlias;

  // @ts-expect-error 命令身份必须是 lower camel case。
  const invalidCommandIdentity: CompletionRootCliDefinition<
    "bad-root",
    undefined
  > = {
    root: "bad-root",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      "bad-root": {
        kind: "rootCommand",
        name: "bad-root",
        description: "非法命令身份",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  };
  void invalidCommandIdentity;

  // @ts-expect-error 根契约必须显式装配帮助能力。
  const missingHelpDefinition: CompletionRootCliDefinition<
    "fixture",
    undefined
  > = {
    root: "fixture",
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      fixture: {
        kind: "rootCommand",
        name: "fixture",
        description: "演示最小 CLI",
        input: emptyInput,
        success: { kind: "completion" },
        failures: {},
        handler: ({ outcome }) => outcome.completion(),
      },
    },
  };
  void missingHelpDefinition;

  // @ts-expect-error CLI 契约不能由普通对象字面量伪造。
  const forgedContract: CliContract = { grammar: {}, manifest: {} };
  void forgedContract;

  // @ts-expect-error CLI 调用不能由普通对象字面量伪造。
  const forgedInvocation: CliInvocation<typeof cli> = {
    kind: "parsed",
    command: "fixture",
    input: {},
    outputFormat: "structured",
  };
  void forgedInvocation;

  defineCli()({
    root: "invalidVariant",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidVariant: {
        kind: "rootCommand",
        name: "invalid-variant",
        description: "错误变体",
        fields: {
          name: {
            kind: "valueOption",
            longOption: "--name",
            description: "问候对象",
          },
        },
        input: namedInput,
        success: {
          kind: "data",
          // @ts-expect-error data 变体身份必须是 lower camel case。
          variants: {
            "1greeting": {
              description: "错误变体",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        // @ts-expect-error failure 变体身份必须是 lower camel case。
        failures: {
          "1failure": {
            description: "错误失败",
            schema: greetingData,
            exitCode: 9,
          },
        },
        handler: ({ outcome }) =>
          outcome.data["1greeting"]({ message: "nope" }),
      },
    },
  });

  defineCli()({
    root: "mismatch",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      mismatch: {
        kind: "rootCommand",
        name: "mismatch",
        description: "错误字段",
        // @ts-expect-error 字段 key 必须与契约模式 Input 属性完全一致。
        fields: {
          other: {
            kind: "valueOption",
            longOption: "--other",
            description: "错误字段",
          },
        },
        input: namedInput,
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ outcome }) => outcome.data.greeting({ message: "nope" }),
      },
    },
  });

  defineCli()({
    root: "invalidFields",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidFields: {
        kind: "rootCommand",
        name: "invalid-fields",
        description: "非法字段声明",
        fields: {
          "bad-field": {
            // @ts-expect-error short alias 必须是单个 ASCII 字母或数字。
            kind: "valueOption",
            longOption: "--bad-field",
            shortAlias: "-bad",
            description: "非法字段",
          },
        },
        input: namedInput,
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ outcome }) => outcome.data.greeting({ message: "nope" }),
      },
    },
  });

  defineCli()({
    root: "invalidIdentity",
    help: helpCapability(),
    output: outputCapability({ defaultFormat: "structured" }),
    usageFailureExitCode: 64,
    commands: {
      invalidIdentity: {
        kind: "rootCommand",
        name: "invalid-identity",
        description: "非法字段身份",
        // @ts-expect-error 字段身份必须是 lower camel case。
        fields: {
          "bad-field": {
            kind: "positional",
            description: "非法字段",
          },
        },
        input: z.object({ "bad-field": z.string() }),
        success: {
          kind: "data",
          variants: {
            greeting: {
              description: "问候",
              schema: greetingData,
              exitCode: 0,
            },
          },
        },
        failures: {},
        handler: ({ outcome }) => outcome.data.greeting({ message: "nope" }),
      },
    },
  });
}

void cli;
void dataCli;

const defineScopedCli = defineCli();
defineScopedCli({
  root: "scoped",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    scoped: {
      // @ts-expect-error 叶输入必须覆盖祖先声明的 shared option。
      kind: "rootGroup",
      name: "scoped",
      description: "测试共享选项",
      sharedOptions: {
        verbose: {
          kind: "flag",
          longOption: "--verbose",
          description: "详细输出",
        },
      },
    },
    ...defineScopedCli.command("run")({
      kind: "command",
      parent: "scoped",
      name: "run",
      description: "运行",
      input: z.object({}),
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineTextHierarchy = defineCli();
const textHierarchy = defineTextHierarchy({
  root: "textTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    textTree: {
      kind: "rootGroup",
      name: "text-tree",
      description: "文本层级命令",
    },
    ...defineTextHierarchy.command("completeText")({
      kind: "command",
      parent: "textTree",
      name: "complete",
      description: "文本完成",
      input: emptyInput,
      success: {
        kind: "completion",
        text: () => text.lines(["完成", "", "下一步"]),
      },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
          text: () => text.lines(["不可用", "稍后重试"]),
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
    ...defineTextHierarchy.command("dataText")({
      kind: "command",
      parent: "textTree",
      name: "data",
      description: "文本数据",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "问候对象",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          greeting: {
            description: "问候",
            schema: greetingData,
            exitCode: 0,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.lines([data.message, "", "完成"]),
          },
        },
      },
      failures: {},
      handler: ({ outcome }) => outcome.data.greeting({ message: "你好" }),
    }),
  },
});
void textHierarchy;

const widenedTextOutput: OutputCapability = outputCapability({
  defaultFormat: "text",
});
const defineWidenedTextHierarchy = defineCli();
const widenedTextHierarchy = defineWidenedTextHierarchy({
  root: "widenedTextTree",
  help: helpCapability(),
  output: widenedTextOutput,
  usageFailureExitCode: 64,
  commands: {
    widenedTextTree: {
      kind: "rootGroup",
      name: "widened-text-tree",
      description: "宽化输出能力的文本层级命令",
    },
    ...defineWidenedTextHierarchy.command("widenedCompletion")({
      kind: "command",
      parent: "widenedTextTree",
      name: "complete",
      description: "文本完成",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
          text: () => text.line("不可用"),
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
    ...defineWidenedTextHierarchy.command("widenedData")({
      kind: "command",
      parent: "widenedTextTree",
      name: "data",
      description: "文本数据",
      fields: {
        name: {
          kind: "valueOption",
          longOption: "--name",
          description: "问候对象",
        },
      },
      input: namedInput,
      success: {
        kind: "data",
        variants: {
          greeting: {
            description: "问候",
            schema: greetingData,
            exitCode: 0,
            text: (data: Readonly<{ readonly message: string }>) =>
              text.line(data.message),
          },
        },
      },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
          text: () => text.line("不可用"),
        },
      },
      handler: ({ outcome }) => outcome.data.greeting({ message: "你好" }),
    }),
  },
});
void widenedTextHierarchy;

const defineInvalidTextHierarchy = defineCli();
defineInvalidTextHierarchy({
  root: "missingCompletionTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingCompletionTree: {
      // @ts-expect-error text hierarchy 的 completion 必须声明 presenter。
      kind: "rootGroup",
      name: "missing-completion-tree",
      description: "缺少完成 presenter",
    },
    ...defineInvalidTextHierarchy.command("missingCompletion")({
      kind: "command",
      parent: "missingCompletionTree",
      name: "run",
      description: "运行",
      input: emptyInput,
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineInvalidFailureHierarchy = defineCli();
defineInvalidFailureHierarchy({
  root: "missingFailureTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    missingFailureTree: {
      // @ts-expect-error text hierarchy 的 failure 必须声明 presenter。
      kind: "rootGroup",
      name: "missing-failure-tree",
      description: "缺少失败 presenter",
    },
    ...defineInvalidFailureHierarchy.command("missingFailure")({
      kind: "command",
      parent: "missingFailureTree",
      name: "run",
      description: "运行",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {
        unavailable: {
          description: "不可用",
          schema: greetingData,
          exitCode: 9,
        },
      },
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

const defineStructuredHierarchy = defineCli();
defineStructuredHierarchy({
  root: "structuredTree",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    structuredTree: {
      // @ts-expect-error structured-only hierarchy 禁止声明 presenter。
      kind: "rootGroup",
      name: "structured-tree",
      description: "结构化层级命令",
    },
    ...defineStructuredHierarchy.command("unexpectedText")({
      kind: "command",
      parent: "structuredTree",
      name: "run",
      description: "运行",
      input: emptyInput,
      success: { kind: "completion", text: () => text.silent },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});
void verifyTypeErrors;
