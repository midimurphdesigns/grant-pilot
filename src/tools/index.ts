/**
 * Tool registry — MCP-style.
 *
 * The planner agent receives `TOOL_DEFINITIONS` as its tool surface and
 * dispatches calls through `dispatchTool`. The Zod-validated handlers
 * each return a discriminated `{ ok: true, data } | { ok: false, error }`
 * union the planner can pattern-match on.
 *
 * Mirrors the fieldops-mcp tool template so visitors who've read that
 * repo recognize the shape immediately.
 */

import {
  grantsSearch,
  grantsSearchToolDef,
  type GrantsSearchResult,
} from "./grants-search";
import {
  grantDetail,
  grantDetailToolDef,
  type GrantDetailResult,
} from "./grant-detail";
import {
  entityLookup,
  entityLookupToolDef,
  type EntityLookupResult,
} from "./entity-lookup";

export const TOOL_DEFINITIONS = [
  grantsSearchToolDef,
  grantDetailToolDef,
  entityLookupToolDef,
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export type ToolResult =
  | { name: "grants_search"; result: GrantsSearchResult }
  | { name: "grant_detail"; result: GrantDetailResult }
  | { name: "entity_lookup"; result: EntityLookupResult };

export async function dispatchTool(
  name: string,
  input: unknown,
): Promise<ToolResult> {
  switch (name) {
    case "grants_search":
      return { name: "grants_search", result: await grantsSearch(input) };
    case "grant_detail":
      return { name: "grant_detail", result: await grantDetail(input) };
    case "entity_lookup":
      return { name: "entity_lookup", result: await entityLookup(input) };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export {
  grantsSearch,
  grantDetail,
  entityLookup,
};
