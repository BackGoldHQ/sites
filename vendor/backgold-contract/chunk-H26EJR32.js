// src/constants.ts
var MAP_REGION_STATUSES = ["lit", "dark", "starting"];
var SITE_NAV_ITEM_TYPES = [
  "page",
  "section",
  "external",
  "campaign_forms",
  "group",
  "entry",
  "term",
  "blog",
  "content_list",
  "donate",
  "events",
  "store"
];
var SITE_NAV_SHOWS_ON = ["every_page", "only_pages", "except_pages", "donation_pages"];
var SITE_SECTION_KINDS = ["announcement", "pre_footer", "sidebar", "custom"];
var SITE_AREA_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
var SITE_SECTION_RULE_SHOWS_ON = [
  "every_page",
  "every_page_except",
  "pages",
  "pages_holding",
  "entry_types",
  "entries",
  "type_lists",
  "events",
  "store"
];
var SITE_PAGE_MODULE_KINDS = [
  "donation_form",
  "form",
  "signup",
  "petition",
  "poll",
  "event",
  "store",
  "advocacy"
];
var CONTENT_FIELD_KINDS = [
  "short_text",
  "long_text",
  "rich_text",
  "image",
  "pdf",
  "link",
  "date",
  "datetime",
  "boolean",
  "choice",
  "choices",
  "list",
  "reference"
];
var CONTENT_REFERENCE_TARGETS = ["event", "campaign", "candidate", "petition", "form", "fund", "seat"];
var CONTENT_ENTRY_REFERENCE_PREFIX = "content_type:";
var BYLINE_ROLE_LABELS = ["Written by", "Edited by", "Photos by", "Interview by"];
var CONTENT_TYPE_ICONS = ["doc", "star", "mega", "flag", "users", "cal", "mic", "video", "shield", "tag"];
var BLOG_CONTENT_TYPE_KEYS = ["post", "podcast", "video"];
var PARTY_CONTENT_TYPE_KEYS = ["plank", "team_member", "open_role"];
var NEWSLETTER_CONTENT_TYPE_KEY = "newsletter";
var BUILT_IN_CONTENT_TYPE_KEYS = [
  ...BLOG_CONTENT_TYPE_KEYS,
  ...PARTY_CONTENT_TYPE_KEYS,
  NEWSLETTER_CONTENT_TYPE_KEY
];
var TEAM_MEMBER_GROUPS = ["Leadership", "Staff"];
var TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
var SITE_KEY_PREFIXES = {
  publishable: "bg_site_pk_",
  secret: "bg_site_sk_"
};
var BACKGOLD_SURFACE_PATHS = [
  "donate",
  "join",
  "store",
  "events",
  "blog",
  "petition",
  "form",
  "poll",
  "frame",
  "privacy",
  "sms-terms"
];

export { BACKGOLD_SURFACE_PATHS, BLOG_CONTENT_TYPE_KEYS, BUILT_IN_CONTENT_TYPE_KEYS, BYLINE_ROLE_LABELS, CONTENT_ENTRY_REFERENCE_PREFIX, CONTENT_FIELD_KINDS, CONTENT_REFERENCE_TARGETS, CONTENT_TYPE_ICONS, MAP_REGION_STATUSES, NEWSLETTER_CONTENT_TYPE_KEY, PARTY_CONTENT_TYPE_KEYS, SITE_AREA_KEY_RE, SITE_KEY_PREFIXES, SITE_NAV_ITEM_TYPES, SITE_NAV_SHOWS_ON, SITE_PAGE_MODULE_KINDS, SITE_SECTION_KINDS, SITE_SECTION_RULE_SHOWS_ON, TEAM_MEMBER_GROUPS, TEMPLATE_KEY_PATTERN };
