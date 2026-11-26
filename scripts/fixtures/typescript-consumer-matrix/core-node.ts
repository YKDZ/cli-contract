import {
  nodeCliOutput,
  type NodeCliOutputOptions,
} from "@boringparts/cli-contract/node";

declare const options: NodeCliOutputOptions;
void nodeCliOutput({ ...options });
