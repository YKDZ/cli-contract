import {
  defineCli,
  helpCapability,
  outputCapability,
  text,
} from "@ykdz/cli-contract";
import { z } from "zod";

const payload = z.object({ message: z.string() });

defineCli()({
  root: "invalidRecordName",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "text" }),
  usageFailureExitCode: 64,
  commands: {
    invalidRecordName: {
      kind: "rootCommand",
      name: "invalid-record-name",
      description: "非法 record 身份",
      input: z.object({}),
      success: {
        kind: "stream",
        text: () => text.silent,
        // @ts-expect-error stream record identity 必须是 lowerCamelCase。
        records: {
          bad_name: {
            description: "非法记录",
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
        yield outcome.record.bad_name({ message: "one" });
        return outcome.streamSuccess();
      },
    },
  },
});
