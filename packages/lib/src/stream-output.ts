import type { WriteCliOutput } from "#/cli-execution";

export interface StreamOutput {
  write: WriteCliOutput;
  finish(): Promise<void>;
  pull<Step>(next: () => Promise<Step>): Promise<Step>;
}

export const streamOutputs = new WeakMap<WriteCliOutput, () => StreamOutput>();
