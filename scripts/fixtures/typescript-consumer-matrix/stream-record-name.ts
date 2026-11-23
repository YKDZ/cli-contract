import { defineCli, helpCapability } from "@ykdz/cli-contract";
import { z } from "zod";

const payload = z.object({ message: z.string() });

const sharedInput0 = z.object({});
defineCli()({
  root: "invalidRecordName",
  help: helpCapability(),

  usageFailureExitCode: 64,
  commands: {
    invalidRecordName: {
      kind: "rootCommand",
      name: "invalid-record-name",
      description: "非法 record 身份",
      input: sharedInput0,

      outputs({ stream }) {
        const operation = stream({
          // @ts-expect-error 流记录名称必须使用 lowerCamelCase。
          records: {
            bad_name: {
              description: "非法记录",
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
            yield outcome.record.bad_name({ message: "one" });
            return outcome.streamSuccess();
          },
        });
        return {
          default: "structured",
          modes: {
            structured: operation.structured({ description: "结构化输出" }),
          },
        };
      },
    },
  },
});
