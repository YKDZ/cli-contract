import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import * as v from "valibot";

export const stopReasons = [
  "end_turn",
  "cancelled",
  "failed",
  "killed",
] as const;

const attachInput = toStandardJsonSchema(
  v.object({
    daemonDisconnected: v.optional(v.boolean()),
    exitOn: v.optional(v.array(v.picklist(stopReasons)), []),
    sessionId: v.pipe(v.string(), v.minLength(1)),
  }),
);

const notification = toStandardJsonSchema(
  v.object({
    event: v.literal("turn.completed"),
    exitOn: v.array(v.picklist(stopReasons)),
    sessionId: v.string(),
    worker: v.literal("worker"),
  }),
);

const daemonDisconnected = toStandardJsonSchema(
  v.object({ code: v.literal("daemon_disconnected") }),
);

const define = defineCli();
const attach = define.command("attach")({
  kind: "command",
  parent: "reins",
  name: "attach",
  description: "Attach to a session event stream.",
  fields: {
    daemonDisconnected: {
      kind: "flag",
      longOption: "--daemon-disconnected",
      description: "Emit the closed daemon disconnect failure.",
    },
    exitOn: {
      kind: "repeatableOption",
      longOption: "--exit-on",
      description: "Stop reason that ends attachment.",
    },
    sessionId: {
      kind: "positional",
      description: "Session identifier.",
    },
  },
  input: attachInput,
  success: {
    kind: "stream",
    records: {
      notification: {
        description: "A completed worker turn.",
        schema: notification,
      },
    },
  },
  failures: {
    daemonDisconnected: {
      description: "The Reins daemon disconnected.",
      exitCode: 65,
      schema: daemonDisconnected,
    },
  },
  async *handler({ input, outcome }) {
    yield outcome.record.notification({
      event: "turn.completed",
      exitOn: input.exitOn,
      sessionId: input.sessionId,
      worker: "worker",
    });
    if (input.daemonDisconnected === true) {
      return outcome.failure.daemonDisconnected({
        code: "daemon_disconnected",
      });
    }
    return outcome.streamSuccess();
  },
});

export const reinsCli = define({
  root: "reins",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    reins: {
      kind: "rootGroup",
      name: "reins",
      description: "Reins control plane.",
    },
    ...attach,
  },
});
