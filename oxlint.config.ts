import lintConfiguration from "@cli-contract/tooling-config/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({ extends: [lintConfiguration] });
