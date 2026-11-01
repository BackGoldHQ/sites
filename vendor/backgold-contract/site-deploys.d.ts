/**
 * What a deploy token may do on its one site. `deploy`: create, upload,
 * finish, read and list deploys and previews, read and write the site's
 * secrets. `promote`: promote (and so roll back), delete, and finish with
 * promote. A token never reaches the token routes: those take a session.
 */
declare const SITE_DEPLOY_TOKEN_SCOPES: readonly ["deploy", "promote"];
type SiteDeployTokenScope = (typeof SITE_DEPLOY_TOKEN_SCOPES)[number];
/** What every deploy token starts with; the rest is 32 base62 characters. */
declare const SITE_DEPLOY_TOKEN_PREFIX = "bg_deploy_";
/**
 * A customer secret's name: an upper-case environment-variable name, the way
 * the Worker reads it from `env`.
 */
declare const SITE_DEPLOY_SECRET_NAME_PATTERN: RegExp;
/**
 * The bindings the deploy job gives every custom site's Worker
 * (lib/deploy-custom-site.ts in the api): the api's service binding, the
 * site's id and identity token, the api origin, the environment and the
 * static assets.
 */
declare const SITE_DEPLOY_INJECTED_BINDING_NAMES: readonly ["BACKGOLD_API", "BACKGOLD_SITE_ID", "BACKGOLD_SITE_TOKEN", "BACKGOLD_API_ORIGIN", "ENVIRONMENT", "ASSETS"];
/**
 * The names a customer's var or secret may not take: every BACKGOLD_ name
 * (the injected ones, and BACKGOLD_CACHE, which no deploy is given and no
 * customer may bind), and the other injected names.
 */
declare const SITE_DEPLOY_RESERVED_SECRET_NAMES: {
    readonly prefix: "BACKGOLD_";
    readonly exact: readonly ["BACKGOLD_API", "BACKGOLD_SITE_ID", "BACKGOLD_SITE_TOKEN", "BACKGOLD_API_ORIGIN", "ENVIRONMENT", "ASSETS"];
};
/** True when `name` is one a customer may not bind: a BACKGOLD_ name, or a name the deploy job injects. */
declare function isReservedDeploySecretName(name: string): boolean;
/** What one site's deploys are held to. */
declare const SITE_DEPLOY_LIMITS: {
    /** The Worker bundle (the zip of its modules); brief decision D2 owns the number. */
    readonly BUNDLE_MAX_BYTES: number;
    /** Static asset files in one deploy; brief decision D2 owns the number. */
    readonly ASSET_FILES_MAX: 20000;
    /** One static asset file; brief decision D2 owns the number. */
    readonly ASSET_FILE_MAX_BYTES: number;
    /** All of one deploy's static assets together; brief decision D2 owns the number. */
    readonly ASSETS_MAX_BYTES: number;
    /** Deploys a site may create in a day; brief decision D2 owns the number. */
    readonly DEPLOYS_PER_DAY: 30;
    /** Deploys kept per site before the oldest unreferenced ones go; brief decision D2 owns the number. */
    readonly KEPT_DEPLOYS: 10;
    /** Named aliases (previews) a site may hold; brief decision D2 owns the number. */
    readonly ALIASES_MAX: 20;
    /** Customer secrets a site may hold; brief decision D2 owns the number. */
    readonly SECRETS_MAX: 32;
    /** One secret's value, in UTF-8 bytes; brief decision D2 owns the number. */
    readonly SECRET_MAX_BYTES: 5120;
    /** CPU milliseconds a deploy's Worker may spend per request; brief decision D2 owns the number. */
    readonly CPU_MS: 100;
    /** Days an uploaded bundle is kept in R2; brief decision D2 owns the number. */
    readonly BUNDLE_RETENTION_DAYS: 30;
    /** The compatibility flags a deploy may ask for; brief decision D2 owns the list. */
    readonly COMPAT_FLAGS_ALLOWED: readonly ["nodejs_compat", "global_fetch_strictly_public"];
    /** Plain-text vars (the customer's `vars`) one deploy may carry. */
    readonly VARS_MAX: 64;
    /** One var's value, in UTF-8 bytes. */
    readonly VAR_MAX_BYTES: 5120;
    /** The `_headers` text and the `_redirects` text, each, in UTF-8 bytes. */
    readonly ASSETS_CONFIG_MAX_BYTES: number;
    /** Worker modules in one deploy. */
    readonly MODULES_MAX: 500;
    /** One static asset's path, in characters. */
    readonly ASSET_PATH_MAX_CHARS: 1024;
    /** The manifest's `template_manifest`, as JSON, in UTF-8 bytes. */
    readonly TEMPLATE_MANIFEST_MAX_BYTES: 262144;
};
/**
 * A preview alias's name: a branch name made safe for a host label, lower
 * case, at most 63 characters. `live` is not one: it names the live deploy.
 */
declare const SITE_DEPLOY_PREVIEW_NAME_PATTERN: RegExp;
/** True when `name` may name a preview alias. */
declare function isDeployPreviewName(name: string): boolean;
/**
 * The name the deploy bundle keeps for its copy of the manifest; no Worker
 * module may take it.
 */
declare const SITE_DEPLOY_BUNDLE_MANIFEST = "manifest.json";
/**
 * The multipart part the script upload carries its metadata in; no Worker
 * module may take the name, in any case.
 */
declare const SITE_DEPLOY_METADATA_PART = "metadata";
/**
 * True when `name` may name a Worker module in a deploy: a relative path of
 * `/`-separated segments of letters, digits and `._@+-`, none of them `.` or
 * `..`, at most 256 characters, not the bundle's own manifest, and not
 * `metadata` in any case (the script upload's metadata part).
 */
declare function isDeployModulePath(name: string): boolean;
/**
 * A var's name, as the Worker reads it from `env`: letters, digits and
 * underscores, not starting with a digit.
 */
declare const SITE_DEPLOY_VAR_NAME_PATTERN: RegExp;
/** What a preview label names: an alias of the site, or one of its deploys by id. */
type SitePreviewTarget = {
    alias: string;
} | {
    deployId: string;
};
/** A preview label, read: the site id's first 12 characters and what it names. */
interface SitePreviewLabel {
    siteIdPrefix: string;
    target: SitePreviewTarget;
}
/**
 * The preview host of `target` on site `siteId` under `suffix` (the
 * environment's SITE_PREVIEW_HOST_SUFFIX), or null when there is none: no
 * suffix, a site id that does not start with 12 lower-case hex characters,
 * an alias that is no preview name, a deploy id that is not one, or a label
 * no host may carry (past 63 characters — an alias longer than 50 — or
 * ending in a hyphen).
 */
declare function previewHostFor(siteId: string, target: SitePreviewTarget, suffix: string | null | undefined): string | null;
/**
 * Read a preview host's single label (the host less `.<suffix>`), or null
 * when it is not one: 12 lower-case hex characters, `-`, then `d-` and a
 * deploy id, or an alias name (isDeployPreviewName), in a host label (at
 * most 63 characters, no trailing hyphen). An alias named `d-` and 32 hex
 * characters reads as that deploy.
 */
declare function parsePreviewLabel(label: string): SitePreviewLabel | null;

export { SITE_DEPLOY_BUNDLE_MANIFEST, SITE_DEPLOY_INJECTED_BINDING_NAMES, SITE_DEPLOY_LIMITS, SITE_DEPLOY_METADATA_PART, SITE_DEPLOY_PREVIEW_NAME_PATTERN, SITE_DEPLOY_RESERVED_SECRET_NAMES, SITE_DEPLOY_SECRET_NAME_PATTERN, SITE_DEPLOY_TOKEN_PREFIX, SITE_DEPLOY_TOKEN_SCOPES, SITE_DEPLOY_VAR_NAME_PATTERN, type SiteDeployTokenScope, type SitePreviewLabel, type SitePreviewTarget, isDeployModulePath, isDeployPreviewName, isReservedDeploySecretName, parsePreviewLabel, previewHostFor };
