import { OPERATOR_TAG_CATEGORIES, TAG_CATEGORIES, CONTENT_ACCESS_LEVELS, BYLINE_ROLE_LABELS, PARTY_CONTENT_TYPE_KEYS, NEWSLETTER_CONTENT_TYPE_KEY, CONTENT_TYPE_ICONS, CONTENT_FIELD_KINDS, BLOG_CONTENT_TYPE_KEYS, CONTENT_REFERENCE_TARGETS, CONTENT_ENTRY_REFERENCE_PREFIX, TEAM_MEMBER_GROUPS } from './chunk-M4T5UZWC.js';
import { z } from 'zod';
import MarkdownIt from 'markdown-it';

var TAG_NAME_MAX = 80;
var TAG_DESCRIPTION_MAX = 280;
var tagNameSchema = z.string().trim().min(1, "Name the tag").max(TAG_NAME_MAX, `A tag name is at most ${TAG_NAME_MAX} characters`).refine((s) => !s.includes(","), "A tag name cannot contain a comma");
var operatorCategorySchema = z.enum(
  OPERATOR_TAG_CATEGORIES
);
z.enum(TAG_CATEGORIES);
var descriptionSchema = z.string().trim().max(TAG_DESCRIPTION_MAX, `A description is at most ${TAG_DESCRIPTION_MAX} characters`).transform((s) => s.length === 0 ? null : s);
z.object({
  name: tagNameSchema,
  category: operatorCategorySchema,
  description: descriptionSchema.nullish()
});
z.object({
  name: tagNameSchema.optional(),
  category: operatorCategorySchema.optional(),
  description: descriptionSchema.nullish()
}).refine(
  (v) => v.name !== void 0 || v.category !== void 0 || v.description !== void 0,
  "Nothing to change"
);
z.object({
  into_id: z.string().min(1).max(64)
});

// src/content.ts
var CONTENT_KINDS = ["article", "podcast", "vlog"];
var CONTENT_STATUSES = ["draft", "published"];
var CONTENT_DIRECTIVE_LABELS = {
  petition: "Petition",
  donate: "Donate",
  form: "Form",
  ticker: "Movement ticker"
};
var CONTENT_LIMITS = {
  TITLE_MAX: 200,
  SUMMARY_MAX: 500,
  SLUG_MAX: 80,
  BODY_MD_MAX: 1e5,
  MEDIA_URL_MAX: 2048,
  /** Id length bound for a site (custom_domains) reference — a generateId(). */
  SITE_ID_MAX: 64,
  /** How many sites one item may be cross-published to beyond its home. */
  ALSO_SITES_MAX: 50,
  /** Id length bound for a content type / term / byline reference. */
  REF_ID_MAX: 64,
  /** How many terms one entry may carry. */
  TERMS_MAX: 100,
  /** How many bylines one entry may carry. */
  BYLINES_MAX: 20,
  /** A video's running time cap, in seconds (24 hours). */
  DURATION_SECONDS_MAX: 86400
};
var BLOG_URL_BASE_LEGACY = "blog";
var RESERVED_ORG_HOST_PATHS = [
  BLOG_URL_BASE_LEGACY,
  "store",
  "donate",
  "events",
  "volunteer",
  "form",
  "poll",
  "petition",
  "frame",
  "run",
  "join",
  "member",
  "rss",
  "api"
];
var SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function isHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:";
}
var mediaUrl = z.string().max(CONTENT_LIMITS.MEDIA_URL_MAX).refine(isHttpsUrl, { message: "media_url must be an https URL" });
function refineMedia(data, ctx, partial) {
  const { kind, media_url } = data;
  if (kind === void 0) return;
  if (kind === "article") {
    if (media_url != null) {
      ctx.addIssue({ code: "custom", message: "article content cannot have a media_url", path: ["media_url"] });
    }
    return;
  }
  if (partial) {
    if (media_url === null || media_url === "") {
      ctx.addIssue({ code: "custom", message: `${kind} content requires a media_url`, path: ["media_url"] });
    }
  } else if (media_url == null) {
    ctx.addIssue({ code: "custom", message: `${kind} content requires a media_url`, path: ["media_url"] });
  }
}
var contentShape = {
  /**
   * The storage kind of a built-in entry. On create it may be left out when
   * `content_type_id` names the type; a custom type's entries are prose.
   */
  kind: z.enum(CONTENT_KINDS),
  slug: z.string().min(1).max(CONTENT_LIMITS.SLUG_MAX).regex(SLUG_RE, "slug must be kebab-case (lowercase alphanumerics joined by single hyphens)"),
  title: z.string().min(1).max(CONTENT_LIMITS.TITLE_MAX),
  summary: z.string().max(CONTENT_LIMITS.SUMMARY_MAX).nullable().optional(),
  body_md: z.string().max(CONTENT_LIMITS.BODY_MD_MAX),
  media_url: mediaUrl.nullable().optional(),
  publish_at: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(CONTENT_STATUSES).default("draft"),
  /**
   * The item's HOME site — a custom_domains id belonging to THIS org (0281).
   * null (or absent) homes the item on the org's platform host. The id itself is
   * only shape-checked here; the route proves it belongs to the org (a
   * cross-org id is a 422, never a write).
   */
  site_domain_id: z.string().min(1).max(CONTENT_LIMITS.SITE_ID_MAX).nullable().optional(),
  /**
   * "Also publish to": the org's other sites this item appears on. A REFERENCE
   * set, never a second home — sending the list replaces it wholesale. Same
   * org-ownership proof at the route layer.
   */
  also_site_ids: z.array(z.string().min(1).max(CONTENT_LIMITS.SITE_ID_MAX)).max(CONTENT_LIMITS.ALSO_SITES_MAX).optional(),
  /**
   * The entry's content type (0372) — an id of THIS org's live type, proven by
   * the route. Absent on create = the built-in type matching `kind`.
   */
  content_type_id: z.string().min(1).max(CONTENT_LIMITS.REF_ID_MAX).optional(),
  /**
   * The type's custom field values. Shape-checked only here; the route
   * validates it against the type's fields (buildEntryDataSchema) and keeps
   * only the type's field keys. Sending it replaces the stored values.
   */
  data: z.record(z.string(), z.unknown()).optional(),
  /** The entry's terms (any taxonomy). Sending the list replaces the set. */
  term_ids: z.array(z.string().min(1).max(CONTENT_LIMITS.REF_ID_MAX)).max(CONTENT_LIMITS.TERMS_MAX).optional(),
  /** The entry's bylines, in credit order. Sending the list replaces the set. */
  bylines: z.array(
    z.strictObject({
      byline_id: z.string().min(1).max(CONTENT_LIMITS.REF_ID_MAX),
      role_label: z.enum(BYLINE_ROLE_LABELS).default("Written by")
    })
  ).max(CONTENT_LIMITS.BYLINES_MAX).optional(),
  /**
   * Who may open the entry (CONTENT_ACCESS_LEVELS, 0547); null = follows (a
   * lesson follows its course, any other entry is public). Absent on create =
   * the type's default_access.
   */
  access: z.enum(CONTENT_ACCESS_LEVELS).nullable().optional(),
  /**
   * The tag a reader must carry when `access` is 'tag', else null. The route
   * proves the tag is in the org's vocabulary and stores its current name.
   */
  access_tag: tagNameSchema.nullable().optional(),
  /** A video's running time in whole seconds; null when unknown. */
  duration_seconds: z.number().int().min(0).max(CONTENT_LIMITS.DURATION_SECONDS_MAX).nullable().optional()
};
var contentBaseSchema = z.strictObject(contentShape);
function refineAccess(data, ctx) {
  const { access, access_tag } = data;
  if (access === void 0) {
    if (access_tag !== void 0) {
      ctx.addIssue({ code: "custom", message: "Send access with access_tag", path: ["access"] });
    }
    return;
  }
  if (access === "tag" && access_tag == null) {
    ctx.addIssue({ code: "custom", message: "Pick the tag a reader must carry", path: ["access_tag"] });
  } else if (access !== "tag" && access_tag != null) {
    ctx.addIssue({ code: "custom", message: "A tag is named only when access is tag", path: ["access_tag"] });
  }
}
contentBaseSchema.extend({ kind: z.enum(CONTENT_KINDS).optional() }).superRefine((data, ctx) => {
  if (!data.kind && !data.content_type_id) {
    ctx.addIssue({ code: "custom", message: "kind or content_type_id is required", path: ["kind"] });
  }
  refineMedia(data, ctx, false);
  refineAccess(data, ctx);
});
contentBaseSchema.partial().extend({ status: z.enum(CONTENT_STATUSES).optional() }).superRefine((data, ctx) => {
  refineMedia(data, ctx, true);
  refineAccess(data, ctx);
});
contentBaseSchema.pick({ title: true, summary: true, body_md: true, media_url: true, data: true }).partial();
var COURSE_LESSONS_MAX = 200;
z.strictObject({
  ids: z.array(z.string().min(1).max(CONTENT_LIMITS.REF_ID_MAX)).max(COURSE_LESSONS_MAX).refine((ids) => new Set(ids).size === ids.length, { message: "A lesson is listed once" })
});
z.strictObject({
  publish_at: z.string().datetime({ offset: true }).nullable().optional()
});
var DIRECTIVE_LINE_RE = /^::([a-z][a-z0-9-]*)(?:\{([^}]*)\})?[ \t]*$/;
var DIRECTIVE_ARG_SRC = /([a-z][a-zA-Z0-9_-]*)=(?:"([^"]*)"|([^\s"'{}=]+))/y;
var DIRECTIVE_REF_RE = /^[A-Za-z0-9_-]{1,128}$/;
function parseDirectiveArgs(raw) {
  const args = {};
  const pair = new RegExp(DIRECTIVE_ARG_SRC.source, "y");
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && (raw[i] === " " || raw[i] === "	")) i++;
    if (i >= raw.length) break;
    pair.lastIndex = i;
    const m = pair.exec(raw);
    if (!m) return null;
    const key = m[1];
    if (key in args) return null;
    args[key] = m[2] ?? m[3] ?? "";
    i = pair.lastIndex;
    if (i < raw.length && raw[i] !== " " && raw[i] !== "	") return null;
  }
  return args;
}
function onlyKeys(args, allowed) {
  return Object.keys(args).every((k) => allowed.includes(k));
}
function parseContentDirective(module, args) {
  switch (module) {
    case "petition": {
      if (!onlyKeys(args, ["slug"])) return null;
      const slug2 = args.slug ?? "";
      return DIRECTIVE_REF_RE.test(slug2) ? { module: "petition", slug: slug2 } : null;
    }
    case "donate": {
      if (!onlyKeys(args, ["campaign", "form"])) return null;
      const campaign = args.campaign ?? "";
      const form = args.form ?? "";
      if (!!campaign === !!form) return null;
      const ref = campaign || form;
      if (!DIRECTIVE_REF_RE.test(ref)) return null;
      return { module: "donate", target: campaign ? "campaign" : "form", ref };
    }
    case "form": {
      if (!onlyKeys(args, ["page", "block"])) return null;
      const page = args.page ?? "";
      const block = args.block ?? "";
      if (!DIRECTIVE_REF_RE.test(page) || !DIRECTIVE_REF_RE.test(block)) return null;
      return { module: "form", page, block };
    }
    // `map` deliberately falls through to the default and renders nothing —
    // see CONTENT_DIRECTIVE_MODULES for why (no way to author coverage rows
    // from a directive; the future shape is `::map{page=… block=…}`).
    case "ticker": {
      return Object.keys(args).length === 0 ? { module: "ticker" } : null;
    }
    default:
      return null;
  }
}
function contentDirectivePlugin(md) {
  md.block.ruler.before(
    "paragraph",
    "gg_content_directive",
    (state, startLine, _endLine, silent) => {
      if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false;
      const pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const max = state.eMarks[startLine] ?? 0;
      const m = DIRECTIVE_LINE_RE.exec(state.src.slice(pos, max));
      if (!m) return false;
      const args = parseDirectiveArgs(m[2] ?? "");
      if (!args) return false;
      if (silent) return true;
      state.line = startLine + 1;
      const token = state.push("gg_content_directive", "", 0);
      token.block = true;
      token.map = [startLine, state.line];
      token.meta = {
        module: m[1],
        args,
        source: m[0].trimEnd()
      };
      return true;
    },
    // Registered as a paragraph/list/blockquote terminator so a directive on
    // the line right after prose is still its own block, not trailing text.
    { alt: ["paragraph", "reference", "blockquote", "list"] }
  );
  md.renderer.rules.gg_content_directive = (tokens, idx, _options, env) => {
    const meta = tokens[idx]?.meta;
    if (!meta) return "";
    const directive = parseContentDirective(meta.module, meta.args);
    if (!directive) return "";
    const resolve = env?.resolveDirective;
    if (!resolve) return "";
    return resolve(directive) ?? "";
  };
}
new MarkdownIt({ html: false, linkify: true }).use(contentDirectivePlugin);
var proseCanvasMarkdown = new MarkdownIt("zero").enable(["heading", "list", "blockquote"]).enable(["emphasis", "link", "image", "escape", "newline", "entity"]).use(contentDirectivePlugin);
proseCanvasMarkdown.renderer.rules.gg_content_directive = (tokens, idx) => {
  const meta = tokens[idx]?.meta;
  if (!meta) return "";
  const directive = parseContentDirective(meta.module, meta.args);
  const text = directive ? `${CONTENT_DIRECTIVE_LABELS[directive.module]} module \u2014 shows live on your published post.` : "Unknown module \u2014 not shown on your published post.";
  const esc = proseCanvasMarkdown.utils.escapeHtml;
  return `<div class="gg-md-directive" contenteditable="false" data-gg-directive="${esc(meta.source)}">${esc(text)}</div>
`;
};

// src/content-types.ts
var CONTENT_TYPE_LIMITS = {
  LABEL_MAX: 60,
  KEY_MAX: 40,
  URL_BASE_MAX: 40,
  FIELD_LABEL_MAX: 80,
  HELP_MAX: 280,
  CHOICES_MAX: 50,
  CHOICE_MAX: 60,
  SHORT_TEXT_MAX: 200,
  LONG_TEXT_MAX: 5e3,
  RICH_TEXT_MAX: 2e4,
  LIST_MAX: 50,
  LINK_MAX: 2048,
  ID_MAX: 64,
  TERM_LABEL_MAX: 80,
  SLUG_MAX: 80,
  BYLINE_NAME_MAX: 120,
  BIO_MAX: 1e3,
  REORDER_MAX: 500
};
var BUILT_IN_CONTENT_TYPES = [
  { key: "post", singular_label: "Post", plural_label: "Posts", icon: "doc", routable: true, url_base: "news", ordered: false, position: 0, kind: "article" },
  { key: "podcast", singular_label: "Episode", plural_label: "Podcast", icon: "mic", routable: true, url_base: "podcast", ordered: false, position: 1, kind: "podcast" },
  { key: "video", singular_label: "Video", plural_label: "Videos", icon: "video", routable: true, url_base: "videos", ordered: false, position: 2, kind: "vlog" },
  { key: "plank", singular_label: "Plank", plural_label: "Platform planks", icon: "flag", routable: false, url_base: null, ordered: true, position: 3, kind: "article" },
  { key: "team_member", singular_label: "Team member", plural_label: "Team", icon: "users", routable: false, url_base: null, ordered: true, position: 4, kind: "article" },
  { key: "open_role", singular_label: "Open role", plural_label: "Open roles", icon: "star", routable: false, url_base: null, ordered: true, position: 5, kind: "article" },
  { key: "newsletter", singular_label: "Newsletter", plural_label: "Newsletters", icon: "mega", routable: true, url_base: "newsletters", ordered: false, position: 6, kind: "article" },
  { key: "course", singular_label: "Course", plural_label: "Courses", icon: "star", routable: true, url_base: "courses", ordered: false, position: 7, kind: "article" }
];
function isBlogContentType(type) {
  return !!type.built_in && BLOG_CONTENT_TYPE_KEYS.includes(type.key);
}
function isPartyContentType(type) {
  return !!type.built_in && PARTY_CONTENT_TYPE_KEYS.includes(type.key);
}
function isNewsletterContentType(type) {
  return !!type.built_in && type.key === NEWSLETTER_CONTENT_TYPE_KEY;
}
function blogUrlBase(types) {
  for (const t of types) {
    if (t.key === "post" && isBlogContentType(t) && t.url_base) return t.url_base;
  }
  return BLOG_URL_BASE_LEGACY;
}
var SEEDED_BLOG_BASE = blogUrlBase(BUILT_IN_CONTENT_TYPES.map((t) => ({ ...t, built_in: true })));
function builtInUrlBase(type, blogBase) {
  if (!type.routable) return null;
  if (isBlogContentType(type)) return blogBase;
  return type.url_base;
}
var BLOG_CONTENT_TYPES = BUILT_IN_CONTENT_TYPES.filter(
  (t) => isBlogContentType({ key: t.key, built_in: true })
);
var FIELDED_BUILT_IN_CONTENT_TYPE_KEYS = [...PARTY_CONTENT_TYPE_KEYS, NEWSLETTER_CONTENT_TYPE_KEY];
var BUILT_IN_TYPE_FIELDS = {
  plank: [
    { key: "section", label: "Section", kind: "short_text", required: true, help: "The heading this plank sits under", choices: null, ref_target: null }
  ],
  team_member: [
    { key: "role_title", label: "Role", kind: "short_text", required: true, help: null, choices: null, ref_target: null },
    { key: "group", label: "Group", kind: "choice", required: true, help: null, choices: TEAM_MEMBER_GROUPS, ref_target: null },
    { key: "department", label: "Department", kind: "short_text", required: false, help: "Staff are listed under their department", choices: null, ref_target: null },
    { key: "link", label: "Link", kind: "link", required: false, help: null, choices: null, ref_target: null },
    {
      key: "seat",
      label: "Seat",
      kind: "reference",
      required: false,
      help: "The seat this person holds: the page shows its holder\u2019s name and term, this entry adds the photo, bio and link",
      choices: null,
      ref_target: "seat"
    }
  ],
  open_role: [
    { key: "department", label: "Department", kind: "short_text", required: false, help: null, choices: null, ref_target: null },
    { key: "link", label: "Link", kind: "link", required: false, help: "Where to apply", choices: null, ref_target: null }
  ],
  newsletter: [
    { key: "issue", label: "Issue", kind: "short_text", required: false, help: "The line above the title, like \u201COctober 2026\u201D", choices: null, ref_target: null }
  ]
};
var BUILT_IN_TAXONOMIES = [
  { key: "category", label: "Categories", hierarchical: true },
  { key: "tag", label: "Tags", hierarchical: false }
];
function builtInTypeKeyForKind(kind) {
  return BLOG_CONTENT_TYPES.find((t) => t.kind === kind).key;
}
function entryKindForType(type) {
  if (!isBlogContentType(type)) return "entry";
  return BLOG_CONTENT_TYPES.find((t) => t.key === type.key)?.kind ?? "entry";
}
var CONTENT_TYPE_RESERVED_URL_BASES = [
  .../* @__PURE__ */ new Set([
    ...RESERVED_ORG_HOST_PATHS,
    BLOG_URL_BASE_LEGACY,
    "events",
    "store",
    "donate",
    "join",
    "petition",
    "poll",
    "form",
    "frame",
    "privacy",
    "sms-terms",
    "p",
    "api",
    "embed",
    "s",
    "q",
    "f",
    "lp-runtime",
    "health",
    "campaigns",
    "preview",
    "newsletters",
    "courses"
  ])
];
var KEY_RE = /^[a-z][a-z0-9_]*$/;
var SLUG_RE2 = /^[a-z0-9]+(-[a-z0-9]+)*$/;
function contentKeyFromLabel(label2) {
  let key = label2.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, CONTENT_TYPE_LIMITS.KEY_MAX - 4).replace(/_+$/g, "");
  if (!/^[a-z]/.test(key)) key = `k_${key}`.replace(/_+$/g, "");
  return key;
}
function contentSlugFromLabel(label2) {
  return label2.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, CONTENT_TYPE_LIMITS.SLUG_MAX - 4).replace(/-+$/g, "");
}
var label = z.string().trim().min(1).max(CONTENT_TYPE_LIMITS.LABEL_MAX);
var slug = z.string().min(1).max(CONTENT_TYPE_LIMITS.SLUG_MAX).regex(SLUG_RE2, "slug must be kebab-case (lowercase alphanumerics joined by single hyphens)");
var id = z.string().min(1).max(CONTENT_TYPE_LIMITS.ID_MAX);
var urlBaseSlug = z.string().min(1).max(CONTENT_TYPE_LIMITS.URL_BASE_MAX).regex(SLUG_RE2, "url_base must be a lowercase slug");
var urlBase = urlBaseSlug.refine((v) => !CONTENT_TYPE_RESERVED_URL_BASES.includes(v), {
  message: "That address is reserved"
});
var urlBaseUpdate = urlBaseSlug.refine(
  (v) => v === BLOG_URL_BASE_LEGACY || !CONTENT_TYPE_RESERVED_URL_BASES.includes(v),
  { message: "That address is reserved" }
);
var contentTypeCreateSchema = z.strictObject({
  singular_label: label,
  plural_label: label,
  icon: z.enum(CONTENT_TYPE_ICONS).default("doc"),
  routable: z.boolean().default(false),
  url_base: urlBase.nullable().optional()
}).superRefine((d, ctx) => {
  if (d.routable && !d.url_base) {
    ctx.addIssue({ code: "custom", message: "A type with its own pages needs an address", path: ["url_base"] });
  }
});
var contentTypeUpdateSchema = z.strictObject({
  singular_label: label.optional(),
  plural_label: label.optional(),
  icon: z.enum(CONTENT_TYPE_ICONS).optional(),
  routable: z.boolean().optional(),
  url_base: urlBaseUpdate.nullable().optional(),
  /** The access rule a new entry of the type starts with (0547); null = new entries follow. */
  default_access: z.enum(CONTENT_ACCESS_LEVELS).nullable().optional()
});
function isContentReferenceTarget(value) {
  if (CONTENT_REFERENCE_TARGETS.includes(value)) return true;
  return value.startsWith(CONTENT_ENTRY_REFERENCE_PREFIX) && KEY_RE.test(value.slice(CONTENT_ENTRY_REFERENCE_PREFIX.length));
}
var choice = z.string().trim().min(1).max(CONTENT_TYPE_LIMITS.CHOICE_MAX);
var choices = z.array(choice).min(1).max(CONTENT_TYPE_LIMITS.CHOICES_MAX).refine((list) => new Set(list).size === list.length, { message: "Choices must be different from each other" });
var help = z.string().max(CONTENT_TYPE_LIMITS.HELP_MAX).nullable().optional();
var contentFieldCreateSchema = z.strictObject({
  label: z.string().trim().min(1).max(CONTENT_TYPE_LIMITS.FIELD_LABEL_MAX),
  kind: z.enum(CONTENT_FIELD_KINDS),
  required: z.boolean().default(false),
  help,
  choices: choices.optional(),
  ref_target: z.string().refine(isContentReferenceTarget, { message: "Unknown reference target" }).optional()
}).superRefine((d, ctx) => {
  const wantsChoices = d.kind === "choice" || d.kind === "choices";
  if (wantsChoices && !d.choices) {
    ctx.addIssue({ code: "custom", message: "A choice field needs its choices", path: ["choices"] });
  }
  if (!wantsChoices && d.choices) {
    ctx.addIssue({ code: "custom", message: "Only a choice field has choices", path: ["choices"] });
  }
  if (d.kind === "reference" && !d.ref_target) {
    ctx.addIssue({ code: "custom", message: "A reference field needs what it points at", path: ["ref_target"] });
  }
  if (d.kind !== "reference" && d.ref_target) {
    ctx.addIssue({ code: "custom", message: "Only a reference field points at something", path: ["ref_target"] });
  }
});
var contentFieldUpdateSchema = z.strictObject({
  label: z.string().trim().min(1).max(CONTENT_TYPE_LIMITS.FIELD_LABEL_MAX).optional(),
  required: z.boolean().optional(),
  help,
  choices: choices.optional()
});
var contentReorderSchema = z.strictObject({
  ids: z.array(id).min(1).max(CONTENT_TYPE_LIMITS.REORDER_MAX)
});
var contentEntryReorderSchema = z.strictObject({
  type_key: z.string().min(1).max(CONTENT_TYPE_LIMITS.KEY_MAX),
  ids: z.array(id).min(1).max(CONTENT_TYPE_LIMITS.REORDER_MAX).refine((list) => new Set(list).size === list.length, { message: "An entry is listed twice" })
});
function referenceKindForTarget(target) {
  return target.startsWith(CONTENT_ENTRY_REFERENCE_PREFIX) ? "entry" : target;
}
function isSafeLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" || url.protocol === "mailto:";
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function valueSchema(field, sanitizeRichText) {
  const L = CONTENT_TYPE_LIMITS;
  switch (field.kind) {
    case "short_text":
      return z.string().trim().max(L.SHORT_TEXT_MAX);
    case "long_text":
      return z.string().max(L.LONG_TEXT_MAX);
    case "rich_text": {
      const base = z.string().max(L.RICH_TEXT_MAX);
      return sanitizeRichText ? base.transform((v) => sanitizeRichText(v)) : base;
    }
    case "image":
    case "pdf":
      return id;
    case "link":
      return z.string().max(L.LINK_MAX).refine(isSafeLink, { message: "A link must be an https or mailto address" });
    case "date":
      return z.string().refine(isCalendarDate, { message: "A date is YYYY-MM-DD" });
    case "datetime":
      return z.string().datetime({ offset: true });
    case "boolean":
      return z.boolean();
    case "choice":
      return z.string().refine((v) => (field.choices ?? []).includes(v), { message: "Not one of the choices" });
    case "choices":
      return z.array(z.string()).max(L.CHOICES_MAX).refine((list) => list.every((v) => (field.choices ?? []).includes(v)), { message: "Not one of the choices" }).refine((list) => new Set(list).size === list.length, { message: "A choice is listed twice" });
    case "list":
      return z.array(z.string().trim().min(1).max(L.SHORT_TEXT_MAX)).max(L.LIST_MAX);
    case "reference": {
      const expected = referenceKindForTarget(field.ref_target ?? "");
      return z.strictObject({ kind: z.string(), id }).refine((v) => v.kind === expected, { message: `This field points at ${expected}` });
    }
  }
}
function isEmpty(value) {
  return value === void 0 || value === null || typeof value === "string" && value.trim() === "" || Array.isArray(value) && value.length === 0;
}
function buildEntryDataSchema(fields, opts = {}) {
  const shape = {};
  for (const field of fields) {
    shape[field.key] = valueSchema(field, opts.sanitizeRichText).nullable().optional();
  }
  return z.object(shape).superRefine((data, ctx) => {
    if (!opts.enforceRequired) return;
    for (const field of fields) {
      if (field.required && isEmpty(data[field.key])) {
        ctx.addIssue({ code: "custom", message: "This field is required", path: [field.key] });
      }
    }
  });
}
var taxonomyCreateSchema = z.strictObject({
  label,
  hierarchical: z.boolean().default(false)
});
var taxonomyUpdateSchema = z.strictObject({ label });
var termLabel = z.string().trim().min(1).max(CONTENT_TYPE_LIMITS.TERM_LABEL_MAX);
var termCreateSchema = z.strictObject({
  label: termLabel,
  slug: slug.optional(),
  parent_id: id.nullable().optional()
});
var termUpdateSchema = z.strictObject({
  label: termLabel.optional(),
  slug: slug.optional(),
  parent_id: id.nullable().optional()
});
var bylineShape = {
  display_name: z.string().trim().min(1).max(CONTENT_TYPE_LIMITS.BYLINE_NAME_MAX).optional(),
  slug: slug.optional(),
  bio: z.string().max(CONTENT_TYPE_LIMITS.BIO_MAX).nullable().optional(),
  avatar_media_id: id.nullable().optional(),
  link_url: z.string().max(CONTENT_TYPE_LIMITS.LINK_MAX).refine(isSafeLink, { message: "A link must be an https or mailto address" }).nullable().optional(),
  user_id: id.nullable().optional(),
  contact_id: id.nullable().optional()
};
var bylineCreateSchema = z.strictObject(bylineShape).superRefine((d, ctx) => {
  if (!d.display_name && !d.user_id && !d.contact_id) {
    ctx.addIssue({ code: "custom", message: "Give the author a name or link a person", path: ["display_name"] });
  }
  if (d.user_id && d.contact_id) {
    ctx.addIssue({ code: "custom", message: "Link a teammate or a contact, not both", path: ["contact_id"] });
  }
});
var bylineUpdateSchema = z.strictObject(bylineShape).superRefine((d, ctx) => {
  if (d.user_id && d.contact_id) {
    ctx.addIssue({ code: "custom", message: "Link a teammate or a contact, not both", path: ["contact_id"] });
  }
});

export { BLOG_CONTENT_TYPES, BUILT_IN_CONTENT_TYPES, BUILT_IN_TAXONOMIES, BUILT_IN_TYPE_FIELDS, CONTENT_TYPE_LIMITS, CONTENT_TYPE_RESERVED_URL_BASES, FIELDED_BUILT_IN_CONTENT_TYPE_KEYS, SEEDED_BLOG_BASE, blogUrlBase, buildEntryDataSchema, builtInTypeKeyForKind, builtInUrlBase, bylineCreateSchema, bylineUpdateSchema, contentEntryReorderSchema, contentFieldCreateSchema, contentFieldUpdateSchema, contentKeyFromLabel, contentReorderSchema, contentSlugFromLabel, contentTypeCreateSchema, contentTypeUpdateSchema, entryKindForType, isBlogContentType, isContentReferenceTarget, isNewsletterContentType, isPartyContentType, referenceKindForTarget, taxonomyCreateSchema, taxonomyUpdateSchema, termCreateSchema, termUpdateSchema };
