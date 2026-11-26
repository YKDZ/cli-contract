import {
  helpCapability,
  schemaCapability,
  text,
  versionCapability,
} from "@boringparts/cli-contract";

helpCapability({ extra: true });
helpCapability({ shortAlias: "-x" });
helpCapability({ headings: "Usage" });
helpCapability({ headings: { extra: "Extra" } });
helpCapability({ headings: { usage: "" } });
helpCapability({ headings: { commands: "Commands\nLine" } });
helpCapability({ headings: { options: 42 } });
helpCapability({ wording: "mode" });

versionCapability({ value: text.line("1.0.0"), extra: true });
versionCapability({ value: "1.0.0" });
versionCapability({ value: text.line("1.0.0"), description: "" });
versionCapability({ value: text.line("1.0.0"), description: "a\nb" });
versionCapability({ value: text.line("1.0.0"), shortAlias: "-v" });

schemaCapability({ description: text.line("Schema"), extra: true });
schemaCapability({ description: "Schema" });
