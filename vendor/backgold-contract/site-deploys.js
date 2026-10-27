// src/site-deploys.ts
var SITE_DEPLOY_TOKEN_SCOPES = ["deploy", "promote"];
var SITE_DEPLOY_TOKEN_PREFIX = "bg_deploy_";
var SITE_DEPLOY_SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
var SITE_DEPLOY_INJECTED_BINDING_NAMES = [
  "BACKGOLD_API",
  "BACKGOLD_SITE_ID",
  "BACKGOLD_SITE_TOKEN",
  "BACKGOLD_API_ORIGIN",
  "ENVIRONMENT",
  "ASSETS"
];
var SITE_DEPLOY_RESERVED_SECRET_NAMES = {
  prefix: "BACKGOLD_",
  exact: SITE_DEPLOY_INJECTED_BINDING_NAMES
};
function isReservedDeploySecretName(name) {
  return name.startsWith(SITE_DEPLOY_RESERVED_SECRET_NAMES.prefix) || SITE_DEPLOY_RESERVED_SECRET_NAMES.exact.includes(name);
}
var MiB = 1024 * 1024;
var SITE_DEPLOY_LIMITS = {
  /** The Worker bundle (the zip of its modules); brief decision D2 owns the number. */
  BUNDLE_MAX_BYTES: 10 * MiB,
  /** Static asset files in one deploy; brief decision D2 owns the number. */
  ASSET_FILES_MAX: 2e4,
  /** One static asset file; brief decision D2 owns the number. */
  ASSET_FILE_MAX_BYTES: 25 * MiB,
  /** All of one deploy's static assets together; brief decision D2 owns the number. */
  ASSETS_MAX_BYTES: 250 * MiB,
  /** Deploys a site may create in a day; brief decision D2 owns the number. */
  DEPLOYS_PER_DAY: 30,
  /** Deploys kept per site before the oldest unreferenced ones go; brief decision D2 owns the number. */
  KEPT_DEPLOYS: 10,
  /** Named aliases (previews) a site may hold; brief decision D2 owns the number. */
  ALIASES_MAX: 20,
  /** Customer secrets a site may hold; brief decision D2 owns the number. */
  SECRETS_MAX: 32,
  /** One secret's value, in UTF-8 bytes; brief decision D2 owns the number. */
  SECRET_MAX_BYTES: 5120,
  /** CPU milliseconds a deploy's Worker may spend per request; brief decision D2 owns the number. */
  CPU_MS: 100,
  /** Days an uploaded bundle is kept in R2; brief decision D2 owns the number. */
  BUNDLE_RETENTION_DAYS: 30,
  /** The compatibility flags a deploy may ask for; brief decision D2 owns the list. */
  COMPAT_FLAGS_ALLOWED: ["nodejs_compat", "global_fetch_strictly_public"],
  /** Plain-text vars (the customer's `vars`) one deploy may carry. */
  VARS_MAX: 64,
  /** One var's value, in UTF-8 bytes. */
  VAR_MAX_BYTES: 5120,
  /** The `_headers` text and the `_redirects` text, each, in UTF-8 bytes. */
  ASSETS_CONFIG_MAX_BYTES: 64 * 1024,
  /** Worker modules in one deploy. */
  MODULES_MAX: 500,
  /** One static asset's path, in characters. */
  ASSET_PATH_MAX_CHARS: 1024,
  /** The manifest's `template_manifest`, as JSON, in UTF-8 bytes. */
  TEMPLATE_MANIFEST_MAX_BYTES: 262144
};
var SITE_DEPLOY_PREVIEW_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
function isDeployPreviewName(name) {
  return SITE_DEPLOY_PREVIEW_NAME_PATTERN.test(name) && name !== "live";
}
var SITE_DEPLOY_BUNDLE_MANIFEST = "manifest.json";
var SITE_DEPLOY_METADATA_PART = "metadata";
function isDeployModulePath(name) {
  if (name.length === 0 || name.length > 256 || name === SITE_DEPLOY_BUNDLE_MANIFEST) return false;
  if (name.toLowerCase() === SITE_DEPLOY_METADATA_PART) return false;
  return name.split("/").every((segment) => /^[A-Za-z0-9._@+-]+$/.test(segment) && segment !== "." && segment !== "..");
}
var SITE_DEPLOY_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
var SITE_PREVIEW_SITE_ID_CHARS = 12;
var SITE_PREVIEW_SITE_PART = /^[0-9a-f]{12}$/;
var DEPLOY_ID_PATTERN = /^[0-9a-f]{32}$/;
var HOST_LABEL_MAX_CHARS = 63;
function isHostLabel(label) {
  return label.length <= HOST_LABEL_MAX_CHARS && !label.endsWith("-");
}
function previewHostFor(siteId, target, suffix) {
  if (!suffix) return null;
  const prefix = siteId.slice(0, SITE_PREVIEW_SITE_ID_CHARS);
  if (!SITE_PREVIEW_SITE_PART.test(prefix)) return null;
  let rest;
  if ("alias" in target) {
    if (!isDeployPreviewName(target.alias)) return null;
    rest = target.alias;
  } else {
    if (!DEPLOY_ID_PATTERN.test(target.deployId)) return null;
    rest = `d-${target.deployId}`;
  }
  const label = `${prefix}-${rest}`;
  return isHostLabel(label) ? `${label}.${suffix}` : null;
}
function parsePreviewLabel(label) {
  if (!isHostLabel(label)) return null;
  const siteIdPrefix = label.slice(0, SITE_PREVIEW_SITE_ID_CHARS);
  if (!SITE_PREVIEW_SITE_PART.test(siteIdPrefix) || label[SITE_PREVIEW_SITE_ID_CHARS] !== "-") return null;
  const rest = label.slice(SITE_PREVIEW_SITE_ID_CHARS + 1);
  if (rest.startsWith("d-") && DEPLOY_ID_PATTERN.test(rest.slice(2))) {
    return { siteIdPrefix, target: { deployId: rest.slice(2) } };
  }
  return isDeployPreviewName(rest) ? { siteIdPrefix, target: { alias: rest } } : null;
}

export { SITE_DEPLOY_BUNDLE_MANIFEST, SITE_DEPLOY_INJECTED_BINDING_NAMES, SITE_DEPLOY_LIMITS, SITE_DEPLOY_METADATA_PART, SITE_DEPLOY_PREVIEW_NAME_PATTERN, SITE_DEPLOY_RESERVED_SECRET_NAMES, SITE_DEPLOY_SECRET_NAME_PATTERN, SITE_DEPLOY_TOKEN_PREFIX, SITE_DEPLOY_TOKEN_SCOPES, SITE_DEPLOY_VAR_NAME_PATTERN, isDeployModulePath, isDeployPreviewName, isReservedDeploySecretName, parsePreviewLabel, previewHostFor };
