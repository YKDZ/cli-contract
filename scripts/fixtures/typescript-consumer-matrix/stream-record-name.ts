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

      outputs: defineCli().outputModes(
        "invalidRecordName",
        sharedInput0,
        (mode) => ({
          default: "structured",
          modes: {
            structured: mode.stream({
              description: "结构化输出",
              format: "structured",
              success: {
                kind: "stream",
                // @ts-expect-error 流记录名称必须使用 lowerCamelCase。
                records: {
                  bad_name: {
                    description: "非法记录",
                    schema: payload,
                  },
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
            }),
          },
        }),
      ),
    },
  },
});
