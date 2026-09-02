import {
  defineCli,
  helpCapability,
  outputCapability,
  type CliContract,
  type CliContractResult,
  type CliInvocation,
  type CanonicalLongOption,
  type CompletionRootCliDefinition,
  type ContractSchema,
  type ContractSchemaInput,
  type ContractSchemaOutput,
  type EmptyCliInput,
  type ShortOptionAlias,
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

function verifyTypeErrors() {
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
          // @ts-expect-error short alias 必须是单个 ASCII 字母或数字。
          "bad-field": {
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
void verifyTypeErrors;
