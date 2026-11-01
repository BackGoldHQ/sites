/** One path or query parameter of an operation; a boolean is sent as `true` or `false`. */
interface ParamSpec {
    name: string;
    in: 'path' | 'query';
    required: boolean;
    type: 'string' | 'integer' | 'boolean';
    enum?: readonly string[];
    min?: number;
    max?: number;
    default?: number;
    /** An OpenAPI format hint (`date-time`); the value is still passed through as the string given. */
    format?: 'date-time';
    /** Rendered as a $ref to the document's components.parameters entry of this name. */
    component?: string;
    description?: string;
}
/** One GET operation: its path under the API's prefix (`{name}` for a path parameter) and its MCP tool. */
interface ApiOperation {
    path: string;
    tool: string;
    summary: string;
    description?: string;
    params: readonly ParamSpec[];
}
/**
 * The header a sign-in token names its organization in, per request: at
 * /api/v1, the content reads and the MCP tools that dispatch to them.
 */
declare const ORG_HEADER = "X-BackGold-Org";
/**
 * The header a request names the site it reads in: for a sign-in, the site's
 * domain or id; for a first-party read, the site's id.
 */
declare const SITE_HEADER = "X-BackGold-Site";
/**
 * The header a custom site's Worker proves the site it names in SITE_HEADER
 * with: the BACKGOLD_SITE_TOKEN its deploy was given, sent on every read
 * through its BACKGOLD_API binding.
 */
declare const SITE_TOKEN_HEADER = "X-BackGold-Site-Token";
/**
 * A published document as served from `apiOrigin`: its description gains
 * where its key works over MCP. With `signIn` (the /api/v1 reference) it
 * says instead that a person connects by signing in and picking their
 * organizations, and that a key still works there for scripts. Built per request, so each environment
 * names its own /mcp.
 */
declare function withMcpNote<T extends {
    info: {
        description: string;
    };
}>(spec: T, apiOrigin: string, opts?: {
    signIn: boolean;
}): T;

export { type ApiOperation, ORG_HEADER, type ParamSpec, SITE_HEADER, SITE_TOKEN_HEADER, withMcpNote };
