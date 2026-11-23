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
      description: "Invalid record identity",
      input: sharedInput0,

      outputs({ stream }) {
        const operation = stream({
          // @ts-expect-error Stream record names must use lowerCamelCase.
          records: {
            bad_name: {
              description: "Invalid record",
              schema: payload,
            },
          },
          failures: {
            unavailable: {
              description: "Unavailable",
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
            structured: operation.structured({
              description: "Structured output",
            }),
          },
        };
      },
    },
  },
});
