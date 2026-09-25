import {
  defineCli,
  helpCapability,
  outputCapability,
} from "@ykdz/cli-contract";
import { z } from "zod";

const define = defineCli();

define({
  root: "workspace",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    workspace: {
      kind: "rootGroup",
      name: "workspace",
      description: "工作区",
    },
    ...define.command("deploy")({
      kind: "command",
      parent: "workspace",
      name: "deploy",
      description: "部署",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: z.object({ auth: z.boolean().optional() }),
      usageConstraints: [
        { kind: "requires", field: "auth", requires: "token" },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    }),
  },
});

defineCli()({
  root: "rootDeploy",
  help: helpCapability(),
  output: outputCapability({ defaultFormat: "structured" }),
  usageFailureExitCode: 64,
  commands: {
    rootDeploy: {
      kind: "rootCommand",
      name: "root-deploy",
      description: "根部署",
      fields: {
        auth: { kind: "flag", longOption: "--auth", description: "认证" },
      },
      input: z.object({ auth: z.boolean().optional() }),
      usageConstraints: [
        { kind: "requires", field: "auth", requires: "token" },
      ],
      success: { kind: "completion" },
      failures: {},
      handler: ({ outcome }) => outcome.completion(),
    },
  },
});
