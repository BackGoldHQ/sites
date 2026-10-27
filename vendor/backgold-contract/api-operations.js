// src/api-operations.ts
var ORG_HEADER = "X-BackGold-Org";
var SITE_HEADER = "X-BackGold-Site";
var SITE_TOKEN_HEADER = "X-BackGold-Site-Token";
function withMcpNote(spec, apiOrigin, opts = { signIn: false }) {
  const mcp = `\`${apiOrigin}/mcp\``;
  const note = opts.signIn ? `A person connects any MCP client at ${mcp} by signing in to BackGold and picking their organizations; an API key still works there for scripts (read-only).` : `The same key works in any MCP client at ${mcp} (read-only).`;
  return { ...spec, info: { ...spec.info, description: `${spec.info.description} ${note}` } };
}

export { ORG_HEADER, SITE_HEADER, SITE_TOKEN_HEADER, withMcpNote };
