import type { WriteCliOutput } from "./cli-execution.ts";

export interface StreamOutput {
  write: WriteCliOutput;
  finish(): Promise<void>;
  pull<Step>(next: () => Promise<Step>): Promise<Step>;
}

export const streamOutputs = new WeakMap<WriteCliOutput, () => StreamOutput>();
