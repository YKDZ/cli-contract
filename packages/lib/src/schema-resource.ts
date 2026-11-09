import type { JsonObject } from "#/contract-schema";

const schemaObjectKeywords = [
  "$defs",
  "definitions",
  "dependentSchemas",
  "patternProperties",
  "properties",
] as const;

const schemaSingleKeywords = [
  "additionalProperties",
  "contentSchema",
  "contains",
  "else",
  "if",
  "items",
  "not",
  "propertyNames",
  "then",
  "unevaluatedItems",
  "unevaluatedProperties",
] as const;

const schemaArrayKeywords = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;

type ReferenceKeyword = "$ref" | "$dynamicRef";

interface SchemaResource {
  readonly id: string;
  readonly root: Readonly<Record<string, unknown>>;
  readonly index: number;
  readonly anchors: Set<string>;
}

interface SchemaReference {
  readonly reference: string;
  readonly resource: SchemaResource;
  readonly keyword: ReferenceKeyword;
  target?: SchemaResource;
  fragmentReference?: string;
}

interface SchemaResourceGraph {
  readonly resources: readonly SchemaResource[];
  readonly resourceByNode: WeakMap<object, SchemaResource>;
  readonly referencesByNode: WeakMap<
    object,
    Map<ReferenceKeyword, SchemaReference>
  >;
  readonly unresolvedReferences: readonly string[];
}

export function embedSchemaResource(
  schema: JsonObject,
  identity: string,
): JsonObject {
  const graph = createSchemaResourceGraph(schema, identity);
  const resourceIds = new Map(
    graph.resources.map((resource) => [
      resource,
      createEmbeddedResourceId(identity, resource.index),
    ]),
  );

  const rewrite = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const mapped = mapSchemaChildren(value, rewrite);
    let result: Record<string, unknown> | undefined;
    const resource = graph.resourceByNode.get(value);
    const hasInvalidRootId =
      value === schema &&
      Object.hasOwn(value, "$id") &&
      typeof value.$id !== "string";
    if (resource !== undefined && !hasInvalidRootId) {
      result = { ...mapped, $id: resourceIds.get(resource) };
    }

    for (const reference of graph.referencesByNode.get(value)?.values() ?? []) {
      if (reference.target === undefined) continue;
      const rewritten = relocateReference(reference, resourceIds);
      if (rewritten === reference.reference) continue;
      result ??= { ...mapped };
      result[reference.keyword] = rewritten;
    }
    return result ?? mapped;
  };

  const embedded = rewrite(schema);
  return isJsonObject(embedded) ? embedded : schema;
}

export function findUnresolvedSchemaReferences(
  schema: JsonObject,
  identity: string,
): readonly string[] {
  return createSchemaResourceGraph(schema, identity).unresolvedReferences;
}

function createSchemaResourceGraph(
  schema: JsonObject,
  identity: string,
): SchemaResourceGraph {
  const resources: SchemaResource[] = [];
  const resourcesById = new Map<string, SchemaResource[]>();
  const resourceByNode = new WeakMap<object, SchemaResource>();
  const referencesByNode = new WeakMap<
    object,
    Map<ReferenceKeyword, SchemaReference>
  >();
  const references: SchemaReference[] = [];
  const unresolvedReferences: string[] = [];
  const fallbackId = createSchemaResourceId(identity);
  const resolvedRootId =
    typeof schema.$id === "string"
      ? resolveIdentifier(schema.$id, fallbackId)
      : fallbackId;
  if (resolvedRootId === undefined && typeof schema.$id === "string") {
    unresolvedReferences.push(schema.$id);
  }
  const root = createResource(
    resolvedRootId ?? fallbackId,
    schema,
    resources,
    resourcesById,
    resourceByNode,
  );

  visitSchema(schema, root, true);
  for (const reference of references) {
    const resolved = resolveReference(
      reference.reference,
      reference.resource.id,
    );
    const targets =
      resolved === undefined
        ? undefined
        : resourcesById.get(resolved.resourceId);
    const target = targets?.length === 1 ? targets[0] : undefined;
    if (
      resolved === undefined ||
      target === undefined ||
      !referenceTargetExists(target, resolved.fragment)
    ) {
      unresolvedReferences.push(reference.reference);
      continue;
    }
    reference.target = target;
    reference.fragmentReference = resolved.fragmentReference;
  }

  return {
    resources,
    resourceByNode,
    referencesByNode,
    unresolvedReferences: [...new Set(unresolvedReferences)],
  };

  function visitSchema(
    value: unknown,
    inheritedResource: SchemaResource,
    rootNode = false,
  ): void {
    if (!isRecord(value)) return;
    let resource = inheritedResource;
    if (!rootNode && typeof value.$id === "string") {
      const id = resolveIdentifier(value.$id, inheritedResource.id);
      if (id === undefined) {
        unresolvedReferences.push(value.$id);
      } else {
        resource = createResource(
          id,
          value,
          resources,
          resourcesById,
          resourceByNode,
        );
      }
    }
    if (rootNode) resourceByNode.set(value, resource);
    for (const anchorKey of ["$anchor", "$dynamicAnchor"] as const) {
      const anchor = value[anchorKey];
      if (typeof anchor === "string") resource.anchors.add(anchor);
    }
    for (const keyword of ["$ref", "$dynamicRef"] as const) {
      const reference = value[keyword];
      if (typeof reference !== "string") continue;
      const parsed: SchemaReference = { reference, resource, keyword };
      references.push(parsed);
      const current = referencesByNode.get(value) ?? new Map();
      current.set(keyword, parsed);
      referencesByNode.set(value, current);
    }
    mapSchemaChildren(value, (child) => {
      visitSchema(child, resource);
      return child;
    });
  }
}

function createSchemaResourceId(identity: string): string {
  return `https://schemas.cli-contract.invalid/${encodeURIComponent(identity)}`;
}

function createEmbeddedResourceId(identity: string, index: number): string {
  return `https://schemas.cli-contract.invalid/wire/${encodeURIComponent(identity)}/${index}`;
}

function createResource(
  id: string,
  root: Readonly<Record<string, unknown>>,
  resources: SchemaResource[],
  resourcesById: Map<string, SchemaResource[]>,
  resourceByNode: WeakMap<object, SchemaResource>,
): SchemaResource {
  const resourceId = withoutFragment(id);
  const resource: SchemaResource = {
    id: resourceId,
    root,
    index: resources.length,
    anchors: new Set(),
  };
  resources.push(resource);
  const sameIdentity = resourcesById.get(resourceId) ?? [];
  resourcesById.set(resourceId, [...sameIdentity, resource]);
  resourceByNode.set(root, resource);
  return resource;
}

function mapSchemaChildren(
  value: Record<string, unknown>,
  mapChild: (child: unknown) => unknown,
): Record<string, unknown> {
  let mapped: Record<string, unknown> | undefined;
  const set = (key: string, child: unknown): void => {
    if (child === value[key]) return;
    mapped ??= { ...value };
    mapped[key] = child;
  };

  for (const keyword of schemaObjectKeywords) {
    const children = value[keyword];
    if (!isRecord(children)) continue;
    let mappedChildren: Record<string, unknown> | undefined;
    for (const [name, child] of Object.entries(children)) {
      const next = mapChild(child);
      if (next === child) continue;
      mappedChildren ??= { ...children };
      mappedChildren[name] = next;
    }
    if (mappedChildren !== undefined) set(keyword, mappedChildren);
  }
  for (const keyword of schemaSingleKeywords) {
    set(keyword, mapChild(value[keyword]));
  }
  for (const keyword of schemaArrayKeywords) {
    const children = value[keyword];
    if (!Array.isArray(children)) continue;
    let mappedChildren: unknown[] | undefined;
    for (const [index, child] of children.entries()) {
      const next = mapChild(child);
      if (next === child) continue;
      mappedChildren ??= [...children];
      mappedChildren[index] = next;
    }
    if (mappedChildren !== undefined) set(keyword, mappedChildren);
  }
  return mapped ?? value;
}

function resolveIdentifier(
  identifier: string,
  baseId: string,
): string | undefined {
  try {
    return withoutFragment(new URL(identifier, baseId).href);
  } catch {
    return undefined;
  }
}

function resolveReference(
  reference: string,
  baseId: string,
):
  | Readonly<{
      readonly resourceId: string;
      readonly fragment: string;
      readonly fragmentReference: string;
    }>
  | undefined {
  try {
    const resolved = new URL(reference, baseId);
    const fragment = decodeURIComponent(resolved.hash.slice(1));
    const fragmentStart = reference.indexOf("#");
    const fragmentReference =
      fragmentStart < 0 ? "" : reference.slice(fragmentStart);
    resolved.hash = "";
    return {
      resourceId: resolved.href,
      fragment,
      fragmentReference,
    };
  } catch {
    return undefined;
  }
}

function relocateReference(
  reference: SchemaReference,
  resourceIds: ReadonlyMap<SchemaResource, string>,
): string {
  const target = reference.target;
  if (target === undefined) return reference.reference;
  if (target === reference.resource && reference.reference.startsWith("#")) {
    return reference.reference;
  }
  if (target === reference.resource) {
    return reference.fragmentReference || "#";
  }
  const targetId = resourceIds.get(target);
  return targetId === undefined
    ? reference.reference
    : `${targetId}${reference.fragmentReference}`;
}

function withoutFragment(uri: string): string {
  const resolved = new URL(uri);
  resolved.hash = "";
  return resolved.href;
}

function referenceTargetExists(
  resource: SchemaResource,
  fragment: string,
): boolean {
  if (fragment === "") return true;
  if (!fragment.startsWith("/")) return resource.anchors.has(fragment);

  let current: unknown = resource.root;
  for (const encodedSegment of fragment.slice(1).split("/")) {
    const segment = decodePointerSegment(encodedSegment);
    if (segment === undefined) return false;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return false;
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return false;
    }
    if (current === undefined) return false;
  }
  return true;
}

function decodePointerSegment(segment: string): string | undefined {
  let decoded = "";
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (character !== "~") {
      decoded += character;
      continue;
    }
    const escape = segment[index + 1];
    if (escape === "0") decoded += "~";
    else if (escape === "1") decoded += "/";
    else return undefined;
    index += 1;
  }
  return decoded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
