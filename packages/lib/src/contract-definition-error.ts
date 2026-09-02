export type SchemaDefinitionTarget =
  | Readonly<{ readonly command: string; readonly location: "input" }>
  | Readonly<{
      readonly command: string;
      readonly location: "data";
      readonly variant: string;
    }>
  | Readonly<{
      readonly command: string;
      readonly location: "failure";
      readonly variant: string;
    }>;

export type ContractDefinitionIssue =
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "missingSchemaCapability";
        readonly capability: "standard" | "validation" | "jsonSchema";
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaDialectMismatch";
        readonly projection: "input" | "output";
        readonly received: string | null;
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "schemaExportFailed";
        readonly projection: "input" | "output";
      }
    >
  | Readonly<
      SchemaDefinitionTarget & {
        readonly code: "invalidSchemaProjection";
        readonly projection: "input" | "output";
      }
    >
  | Readonly<{
      readonly code: "schemaFieldSetMismatch";
      readonly command: string;
      readonly location: "input";
      readonly missingFields: readonly string[];
      readonly unexpectedFields: readonly string[];
    }>
  | Readonly<{
      readonly code: "schemaFieldDoesNotAcceptRawString";
      readonly command: string;
      readonly location: "input";
      readonly fields: readonly string[];
    }>
  | Readonly<{
      readonly code: "invalidInputSchemaShape";
      readonly command: string;
      readonly location: "input";
      readonly aspect: "properties" | "required" | "type";
    }>
  | Readonly<{
      readonly code: "invalidVariantName";
      readonly command: string;
      readonly location: "data" | "failure";
      readonly variant: string;
    }>
  | Readonly<{
      readonly code: "missingVariantDescription";
      readonly command: string;
      readonly location: "data" | "failure";
      readonly variant: string;
    }>
  | Readonly<{
      readonly code: "invalidVariantExitCode";
      readonly command: string;
      readonly location: "data" | "failure";
      readonly variant: string;
      readonly received: number | null;
      readonly minimum: 0 | 1;
      readonly maximum: 255;
    }>;

export class ContractDefinitionError extends Error {
  readonly issues: readonly [
    ContractDefinitionIssue,
    ...ContractDefinitionIssue[],
  ];

  constructor(
    issues: readonly [ContractDefinitionIssue, ...ContractDefinitionIssue[]],
  ) {
    super("CLI 契约定义无效");
    this.name = "ContractDefinitionError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze(issue)),
    ) as unknown as readonly [
      ContractDefinitionIssue,
      ...ContractDefinitionIssue[],
    ];
  }
}
