import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const input = z.object({});
const payload = z.object({ message: z.string() });
const base = {
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
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
      // @ts-expect-error 每个 stream record 都必须声明 text presenter。
      success: {
        kind: "stream",
        text: () => text.silent,
        records: { item: { description: "记录", schema: payload } },
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
      // @ts-expect-error stream success 必须声明 text presenter。
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
    },
  },
});
