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
      description: "Complete stream",
      input,

      outputs({ stream }) {
        const operation = stream({
          records: {
            item: {
              description: "Record",
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
            yield outcome.record.item({ message: "one" });
            return outcome.failure.unavailable({ message: "nope" });
          },
        });
        return {
          default: "text",
          modes: {
            text: operation.text({
              description: "Text output",
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
      description: "Missing record",
      input,

      outputs({ stream }) {
        const operation = stream({
          records: {
            item: { description: "Record", schema: payload },
          },
          failures: {
            unavailable: {
              description: "Unavailable",
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
            // @ts-expect-error The text stream is missing a record presenter.
            text: operation.text({
              description: "Text output",
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
      description: "Missing success",
      input,

      outputs({ stream }) {
        const operation = stream({
          records: {
            item: {
              description: "Record",
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
            yield outcome.record.item({ message: "one" });
            return outcome.streamSuccess();
          },
        });
        return {
          default: "text",
          modes: {
            // @ts-expect-error The text stream is missing a terminal presenter.
            text: operation.text({
              description: "Text output",
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
