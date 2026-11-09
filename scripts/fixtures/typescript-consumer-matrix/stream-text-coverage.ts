import { defineCli, helpCapability, text } from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({});
const payload = z.object({ message: z.string() });
const base = {
  help: helpCapability(),

  usageFailureExitCode: 64,
};

const complete = defineCli()({
  root: "completeStream",
  ...base,
  commands: {
    completeStream: {
      kind: "rootCommand",
      name: "complete-stream",
      description: "完整流",
      input,

      outputs: defineCli().outputModes("completeStream", input, (mode) => ({
        default: "text",
        modes: {
          text: mode.stream({
            description: "文本输出",
            format: "text",
            success: {
              kind: "stream",
              text: () => text.silent,
              records: {
                item: {
                  description: "记录",
                  schema: payload,
                  text: (value) => text.line(value.message),
                },
              },
            },
            failures: {
              unavailable: {
                description: "不可用",
                schema: payload,
                exitCode: 9,
                text: (value) => text.line(value.message),
              },
            },
            async *handler({ outcome }) {
              yield outcome.record.item({ message: "one" });
              return outcome.failure.unavailable({ message: "nope" });
            },
          }),
        },
      })),
    },
  },
});
void complete;

defineCli()({
  root: "missingRecord",
  ...base,
  commands: {
    missingRecord: {
      kind: "rootCommand",
      name: "missing-record",
      description: "遗漏记录",
      input,

      outputs: defineCli().outputModes("missingRecord", input, (mode) => ({
        default: "text",
        modes: {
          // @ts-expect-error 文本流缺少记录呈现器。
          text: mode.stream({
            description: "文本输出",
            format: "text",
            success: {
              kind: "stream",
              text: () => text.silent,
              records: {
                item: { description: "记录", schema: payload },
              },
            },
            failures: {
              unavailable: {
                description: "不可用",
                schema: payload,
                exitCode: 9,
                text: (value) => text.line(value.message),
              },
            },
            async *handler({ outcome }) {
              yield outcome.record.item({ message: "one" });
              return outcome.streamSuccess();
            },
          }),
        },
      })),
    },
  },
});

defineCli()({
  root: "missingSuccess",
  ...base,
  commands: {
    missingSuccess: {
      kind: "rootCommand",
      name: "missing-success",
      description: "遗漏成功",
      input,

      outputs: defineCli().outputModes("missingSuccess", input, (mode) => ({
        default: "text",
        modes: {
          // @ts-expect-error 文本流缺少终态呈现器。
          text: mode.stream({
            description: "文本输出",
            format: "text",
            success: {
              kind: "stream",
              records: {
                item: {
                  description: "记录",
                  schema: payload,
                  text: (value) => text.line(value.message),
                },
              },
            },
            failures: {
              unavailable: {
                description: "不可用",
                schema: payload,
                exitCode: 9,
                text: (value) => text.line(value.message),
              },
            },
            async *handler({ outcome }) {
              yield outcome.record.item({ message: "one" });
              return outcome.streamSuccess();
            },
          }),
        },
      })),
    },
  },
});
