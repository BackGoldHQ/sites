/**
 * A public shift's signup state as the Content API reports it (GET /shifts,
 * GET /shifts/live). `open`: there is room, or no capacity. `full`: at
 * capacity with nobody waiting yet, so a signup joins the waitlist.
 * `waitlist`: at capacity with people already waiting; a signup joins the
 * back of the line. `closed`: the floor is closed or the shift is over, so the
 * signup card takes no one.
 */
declare const SHIFT_PUBLIC_STATES: readonly ["open", "full", "waitlist", "closed"];
type ShiftPublicState = (typeof SHIFT_PUBLIC_STATES)[number];
/** What a public shift belongs to, as the Content API names it: a public event (by its slug), or nothing it lists. */
declare const SHIFT_PUBLIC_SUBJECT_KINDS: readonly ["event", "standalone"];
type ShiftPublicSubjectKind = (typeof SHIFT_PUBLIC_SUBJECT_KINDS)[number];
/** The statuses GET /live answers with a stream. */
declare const LIVE_STREAM_STATUSES: readonly ["live", "upcoming"];
type LiveStreamStatus = (typeof LIVE_STREAM_STATUSES)[number];
declare const SITE_NAV_ITEM_TYPES: readonly ["page", "section", "external", "campaign_forms", "group", "entry", "term", "blog", "content_list", "donate", "events", "store"];
type SiteNavItemType = (typeof SITE_NAV_ITEM_TYPES)[number];
declare const SITE_NAV_SHOWS_ON: readonly ["every_page", "only_pages", "except_pages", "donation_pages"];
type SiteNavShowsOn = (typeof SITE_NAV_SHOWS_ON)[number];
declare const SITE_MENU_KEYS: readonly ["primary", "footer", "utility"];
type SiteMenuKey = (typeof SITE_MENU_KEYS)[number];
declare const SITE_SECTION_KINDS: readonly ["announcement", "pre_footer", "sidebar", "custom"];
type SiteSectionKind = (typeof SITE_SECTION_KINDS)[number];
declare const SITE_SECTION_ROLES: readonly ["header", "footer"];
type SiteSectionRole = (typeof SITE_SECTION_ROLES)[number];
declare const SITE_PAGE_MODULE_KINDS: readonly ["donation_form", "form", "signup", "petition", "poll", "event", "store", "advocacy"];
type SitePageModuleKind = (typeof SITE_PAGE_MODULE_KINDS)[number];
declare const PRODUCT_SHIP_TO: readonly ["buyer", "store", "third_party"];
type ProductShipTo = (typeof PRODUCT_SHIP_TO)[number];
declare const STORE_ATTRIBUTE_KINDS: readonly ["short_text", "long_text", "number", "boolean", "choice", "choices", "link", "date"];
type StoreAttributeKind = (typeof STORE_ATTRIBUTE_KINDS)[number];
declare const PRODUCT_AVAILABILITY: readonly ["in_stock", "low", "out", "preorder"];
type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number];
declare const SITEMAP_URL_KINDS: readonly ["page", "type_index", "entry", "store", "department", "product", "collection"];
type SitemapUrlKind = (typeof SITEMAP_URL_KINDS)[number];
declare const ITEM_QUESTION_SCOPES: readonly ["order", "unit"];
type ItemQuestionScope = (typeof ITEM_QUESTION_SCOPES)[number];
declare const CONTENT_FIELD_KINDS: readonly ["short_text", "long_text", "rich_text", "image", "pdf", "link", "date", "datetime", "boolean", "choice", "choices", "list", "reference"];
type ContentFieldKind = (typeof CONTENT_FIELD_KINDS)[number];
declare const CONTENT_REFERENCE_TARGETS: readonly ["event", "campaign", "candidate", "petition", "form", "fund", "seat"];
type ContentReferenceTarget = (typeof CONTENT_REFERENCE_TARGETS)[number];
declare const CONTENT_ACCESS_LEVELS: readonly ["public", "signed_in", "members", "tag"];
type ContentAccessLevel = (typeof CONTENT_ACCESS_LEVELS)[number];
declare const BYLINE_ROLE_LABELS: readonly ["Written by", "Edited by", "Photos by", "Interview by"];
type BylineRoleLabel = (typeof BYLINE_ROLE_LABELS)[number];
declare const CONTENT_TYPE_ICONS: readonly ["doc", "star", "mega", "flag", "users", "cal", "mic", "video", "shield", "tag"];
type ContentTypeIcon = (typeof CONTENT_TYPE_ICONS)[number];
declare const BUILT_IN_CONTENT_TYPE_KEYS: readonly ["post", "podcast", "video", "plank", "team_member", "open_role", "newsletter", "course", "collection"];
type BuiltInContentTypeKey = (typeof BUILT_IN_CONTENT_TYPE_KEYS)[number];
declare const BUILT_IN_TAXONOMY_KEYS: readonly ["category", "tag", "department"];
type BuiltInTaxonomyKey = (typeof BUILT_IN_TAXONOMY_KEYS)[number];
declare const SITE_MODES: readonly ["hosted", "headless", "template", "custom"];
type SiteMode = (typeof SITE_MODES)[number];
declare const SITE_API_KEY_KINDS: readonly ["publishable", "secret"];
type SiteApiKeyKind = (typeof SITE_API_KEY_KINDS)[number];
declare const SITE_KEY_PREFIXES: {
    readonly publishable: "bg_site_pk_";
    readonly secret: "bg_site_sk_";
};
declare const CONTENT_WEBHOOK_EVENTS: readonly ["site.published", "content.published", "content.unpublished", "menu.updated", "redirects.updated", "site.content.product.updated", "site.content.collection.updated"];
type ContentWebhookEvent = (typeof CONTENT_WEBHOOK_EVENTS)[number];
declare const BACKGOLD_SURFACE_PATHS: readonly ["donate", "join", "store", "events", "blog", "petition", "form", "poll", "frame", "run", "privacy", "sms-terms"];
type BackgoldSurfacePath = (typeof BACKGOLD_SURFACE_PATHS)[number];

export { type BackgoldSurfacePath as B, type ContentFieldKind as C, type ItemQuestionScope as I, type LiveStreamStatus as L, type ProductAvailability as P, type SiteNavItemType as S, type ContentAccessLevel as a, type BylineRoleLabel as b, type SiteNavShowsOn as c, type SiteMenuKey as d, type StoreAttributeKind as e, type ProductShipTo as f, type SiteSectionKind as g, type SiteSectionRole as h, type ShiftPublicState as i, type ShiftPublicSubjectKind as j, type SiteMode as k, type SitemapUrlKind as l, type SiteApiKeyKind as m, type ContentWebhookEvent as n, SITE_KEY_PREFIXES as o, type SitePageModuleKind as p, type BuiltInContentTypeKey as q, type ContentTypeIcon as r, type BuiltInTaxonomyKey as s, type ContentReferenceTarget as t };
