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

      outputs({ stream }) {
        const operation = stream({
          records: {
            item: {
              description: "记录",
              schema: payload,
            },
          },
          failures: {
            unavailable: {
              description: "不可用",
              schema: payload,
              exitCode: 9,
            },
          },
          async *handler({ outcome }) {
            yield outcome.record.item({ message: "one" });
            return outcome.failure.unavailable({ message: "nope" });
          },
        });
        return {
          default: "text",
          modes: {
            text: operation.text({
              description: "文本输出",
              records: {
                item: (value) => text.line(value.message),
              },
              failures: {
                unavailable: (value) => text.line(value.message),
              },
              terminal: () => text.silent,
            }),
          },
        };
      },
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

      outputs({ stream }) {
        const operation = stream({
          records: {
            item: { description: "记录", schema: payload },
          },
          failures: {
            unavailable: {
              description: "不可用",
              schema: payload,
              exitCode: 9,
            },
          },
          async *handler({ outcome }) {
            yield outcome.record.item({ message: "one" });
            return outcome.streamSuccess();
          },
        });
        return {
          default: "text",
          modes: {
            // @ts-expect-error 文本流缺少记录呈现器。
            text: operation.text({
              description: "文本输出",
              records: {},
              failures: {
                unavailable: (value) => text.line(value.message),
              },
              terminal: () => text.silent,
            }),
          },
        };
      },
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

      outputs({ stream }) {
        const operation = stream({
          records: {
            item: {
              description: "记录",
              schema: payload,
            },
          },
          failures: {
            unavailable: {
              description: "不可用",
              schema: payload,
              exitCode: 9,
            },
          },
          async *handler({ outcome }) {
            yield outcome.record.item({ message: "one" });
            return outcome.streamSuccess();
          },
        });
        return {
          default: "text",
          modes: {
            // @ts-expect-error 文本流缺少终态呈现器。
            text: operation.text({
              description: "文本输出",
              records: {
                item: (value) => text.line(value.message),
              },
              failures: {
                unavailable: (value) => text.line(value.message),
              },
            }),
          },
        };
      },
    },
  },
});
