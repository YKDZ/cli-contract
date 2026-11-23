import {
  nodeCliOutput,
  type NodeCliOutputOptions,
} from "@ykdz/cli-contract/node";

declare const options: NodeCliOutputOptions;
void nodeCliOutput({ ...options });
