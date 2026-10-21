import { z } from 'zod';
import { n as BuiltInContentTypeKey, o as ContentTypeIcon, p as BuiltInTaxonomyKey, C as ContentFieldKind, q as ContentReferenceTarget } from './constants-3dFHOvY5.js';

/**
 * Content objects (W31) — the shared primitives every content surface
 * imports: kind/status vocabularies, write-path LIMITS + strict zod schemas, the
 * ONE markdown renderer (SSR page and frontend preview both call it), and the
 * default promo cadence rule seeded onto the "Content / Show" mission type (as a
 * new immutable version — see migration 0171).
 *
 * A content_item is an article / podcast / vlog with a raw-markdown body stored
 * in content_items.body_md (cap 100KB). Kinds:
 *   - article  → text only; NO media_url.
 *   - podcast  → media_url is the audio file URL (→ <audio controls>).
 *   - vlog     → media_url is a video URL (YouTube → nocookie embed; other https
 *                video → <video>).
 * Backs migration 0171_content_items.sql; mirrors the strict-write-path culture
 * of site/collections.ts (unknown keys rejected, string caps, https-only URLs).
 */

/** The three content kinds. `media_url` is required for podcast/vlog, absent for article. */
declare const CONTENT_KINDS: readonly ["article", "podcast", "vlog"];
type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * Sites CMS content model (migrations 0372, 0375): content types with a fixed
 * shelf of named field kinds, taxonomies and their terms, and bylines.
 *
 * A content type's custom field values live in content_items.data_json; the
 * schema that validates them is built from the type's live fields by
 * buildEntryDataSchema. Field kinds carry no configurable limits — the caps
 * below are the only ones, and they are not options (§55.3).
 */

declare const CONTENT_TYPE_LIMITS: {
    readonly LABEL_MAX: 60;
    readonly KEY_MAX: 40;
    readonly URL_BASE_MAX: 40;
    readonly FIELD_LABEL_MAX: 80;
    readonly HELP_MAX: 280;
    readonly CHOICES_MAX: 50;
    readonly CHOICE_MAX: 60;
    readonly SHORT_TEXT_MAX: 200;
    readonly LONG_TEXT_MAX: 5000;
    readonly RICH_TEXT_MAX: 20000;
    readonly LIST_MAX: 50;
    readonly LINK_MAX: 2048;
    readonly ID_MAX: 64;
    readonly TERM_LABEL_MAX: 80;
    readonly SLUG_MAX: 80;
    readonly BYLINE_NAME_MAX: 120;
    readonly BIO_MAX: 1000;
    readonly REORDER_MAX: 500;
};
interface BuiltInContentType {
    key: BuiltInContentTypeKey;
    singular_label: string;
    plural_label: string;
    icon: ContentTypeIcon;
    /**
     * Blog types have pages at the org's blog base (`/<base>/:slug`), the
     * newsletter at its own url_base (builtInUrlBase); the party types have none.
     */
    routable: boolean;
    url_base: string | null;
    /** Entries keep an operator-set order (content_items.position) instead of newest-first. */
    ordered: boolean;
    position: number;
    /** The content_items.kind its entries are stored with. */
    kind: ContentKind;
}
/**
 * The built-in types a new org is given (lib/content-types.ts
 * seedBuiltInContentTypes). Migrations 0372 (blog), 0375 (party), 0453
 * (newsletter) and 0552 (course) seeded the same rows for the orgs that existed then, with one
 * difference: the post row's url_base — the org's blog base — was `blog`
 * (BLOG_URL_BASE_LEGACY) there and is `news` for a new org.
 */
declare const BUILT_IN_CONTENT_TYPES: readonly BuiltInContentType[];
/** True for one of the built-in blog types (post, podcast, video). */
declare function isBlogContentType(type: {
    key: string;
    built_in: boolean | number;
}): boolean;
/** True for one of the built-in party types (plank, team_member, open_role): baked into pages, no pages of their own. */
declare function isPartyContentType(type: {
    key: string;
    built_in: boolean | number;
}): boolean;
/** True for the built-in newsletter type. */
declare function isNewsletterContentType(type: {
    key: string;
    built_in: boolean | number;
}): boolean;
/**
 * The org's blog base — the address its blog types (post, podcast, video)
 * list under, together: its post built-in's url_base, among `types` (the
 * org's rows), or BLOG_URL_BASE_LEGACY for an org with no post row. A new org
 * starts on `news`; an org seeded before keeps `blog` until it changes the
 * post type's address.
 */
declare function blogUrlBase(types: Iterable<{
    key: string;
    built_in: boolean | number;
    url_base: string | null;
}>): string;
/** The blog base a new organization starts on: its seeded post row's url_base (BUILT_IN_CONTENT_TYPES). */
declare const SEEDED_BLOG_BASE: string;
/**
 * The address a type's entries live under — THE routing rule for content
 * types. A blog built-in (post, podcast, video) lives under the org's blog
 * base (`blogBase`, blogUrlBase: the post row's url_base) whatever its own
 * row's url_base says; every other routable type, built-in (the newsletter) or
 * custom, lives under its own url_base; a type with no pages has none (null).
 *
 * The api reads it in content-public.ts entryHref (an entry's `/<base>/:slug`),
 * landing-pages-ssr.ts collectionMoreHref (a Collection's "See all"), the
 * site menus (lib/site-nav.ts) and the headless Content API's GET /types
 * url_base and sitemap indexes (lib/content-api/entries.ts).
 */
declare function builtInUrlBase(type: {
    key: string;
    built_in: boolean | number;
    routable: boolean | number;
    url_base: string | null;
}, blogBase: string): string | null;
/** The blog types: what the org's blog base lists, and what the Blog block and ContentPost place. */
declare const BLOG_CONTENT_TYPES: readonly BuiltInContentType[];
/** A locked field of a built-in type, as the seed writes it. */
interface BuiltInFieldDef {
    key: string;
    label: string;
    kind: ContentFieldKind;
    required: boolean;
    help: string | null;
    choices: readonly string[] | null;
    /** What a reference field points at; null for every other kind. */
    ref_target: ContentReferenceTarget | null;
}
/** The built-in types that carry locked fields: the party types and the newsletter. */
declare const FIELDED_BUILT_IN_CONTENT_TYPE_KEYS: readonly ["plank", "team_member", "open_role", "newsletter"];
type FieldedBuiltInContentTypeKey = (typeof FIELDED_BUILT_IN_CONTENT_TYPE_KEYS)[number];
/**
 * The locked fields of the built-in types that have them — seeded by 0375
 * (party types), 0453 (newsletter) and ensureBuiltInContentTypes, read by the
 * party-data move, the page bake and the entry pages. Their key, kind,
 * required flag and choices never change; label and help do.
 *
 *   plank:        title = the plank's headline, summary = its plain text,
 *                 body = its full text; `section` = the heading it sits under.
 *   team_member:  title = name, hero = photo, summary = one line, body = bio;
 *                 `seat` = the party seat whose current holder this entry
 *                 adds the photo, bio and link to (the TeamGrid roster reads
 *                 the name and term from the seat).
 *   open_role:    title = the role, body = its description.
 *   newsletter:   title = the issue's headline, summary = its preheader,
 *                 body = the issue; `issue` = the line above the title.
 */
declare const BUILT_IN_TYPE_FIELDS: {
    readonly plank: readonly [{
        readonly key: "section";
        readonly label: "Section";
        readonly kind: "short_text";
        readonly required: true;
        readonly help: "The heading this plank sits under";
        readonly choices: null;
        readonly ref_target: null;
    }];
    readonly team_member: readonly [{
        readonly key: "role_title";
        readonly label: "Role";
        readonly kind: "short_text";
        readonly required: true;
        readonly help: null;
        readonly choices: null;
        readonly ref_target: null;
    }, {
        readonly key: "group";
        readonly label: "Group";
        readonly kind: "choice";
        readonly required: true;
        readonly help: null;
        readonly choices: readonly ["Leadership", "Staff"];
        readonly ref_target: null;
    }, {
        readonly key: "department";
        readonly label: "Department";
        readonly kind: "short_text";
        readonly required: false;
        readonly help: "Staff are listed under their department";
        readonly choices: null;
        readonly ref_target: null;
    }, {
        readonly key: "link";
        readonly label: "Link";
        readonly kind: "link";
        readonly required: false;
        readonly help: null;
        readonly choices: null;
        readonly ref_target: null;
    }, {
        readonly key: "seat";
        readonly label: "Seat";
        readonly kind: "reference";
        readonly required: false;
        readonly help: "The seat this person holds: the page shows its holder’s name and term, this entry adds the photo, bio and link";
        readonly choices: null;
        readonly ref_target: "seat";
    }];
    readonly open_role: readonly [{
        readonly key: "department";
        readonly label: "Department";
        readonly kind: "short_text";
        readonly required: false;
        readonly help: null;
        readonly choices: null;
        readonly ref_target: null;
    }, {
        readonly key: "link";
        readonly label: "Link";
        readonly kind: "link";
        readonly required: false;
        readonly help: "Where to apply";
        readonly choices: null;
        readonly ref_target: null;
    }];
    readonly newsletter: readonly [{
        readonly key: "issue";
        readonly label: "Issue";
        readonly kind: "short_text";
        readonly required: false;
        readonly help: "The line above the title, like “October 2026”";
        readonly choices: null;
        readonly ref_target: null;
    }];
};
interface BuiltInTaxonomy {
    key: BuiltInTaxonomyKey;
    label: string;
    hierarchical: boolean;
}
/** The built-in taxonomies, exactly as migration 0372 seeds them. */
declare const BUILT_IN_TAXONOMIES: readonly BuiltInTaxonomy[];
/** The blog type key whose entries are stored with `kind`. */
declare function builtInTypeKeyForKind(kind: ContentKind): BuiltInContentTypeKey;
/**
 * The `kind` an API row reports for an entry of a type: a blog type's storage
 * kind ('article' | 'podcast' | 'vlog'), or 'entry' for every other type.
 */
type ContentEntryKind = ContentKind | 'entry';
declare function entryKindForType(type: {
    key: string;
    built_in: boolean | number;
}): ContentEntryKind;
/**
 * Addresses a routable type may not take: every fixed org-host route (the
 * legacy blog address among them, which only the post built-in may return
 * to), `preview` (a template site's Worker answers its drafts there), and the
 * newsletter built-in's `newsletters` and the course built-in's `courses`, so
 * a custom type can never shadow either.
 * The org's blog base is held by its post row (unique among live routable
 * types), not by this list.
 */
declare const CONTENT_TYPE_RESERVED_URL_BASES: readonly string[];
/** A snake_case key derived from a label ("Press releases" → press_releases). */
declare function contentKeyFromLabel(label: string): string;
/** A kebab slug derived from a label ("Tax Policy" → tax-policy); '' when nothing survives. */
declare function contentSlugFromLabel(label: string): string;
declare const contentTypeCreateSchema: z.ZodObject<{
    singular_label: z.ZodString;
    plural_label: z.ZodString;
    icon: z.ZodDefault<z.ZodEnum<{
        tag: "tag";
        video: "video";
        doc: "doc";
        star: "star";
        mega: "mega";
        flag: "flag";
        users: "users";
        cal: "cal";
        mic: "mic";
        shield: "shield";
    }>>;
    routable: z.ZodDefault<z.ZodBoolean>;
    url_base: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
type ContentTypeCreateInput = z.infer<typeof contentTypeCreateSchema>;
/**
 * Labels, icon, routing and the default access rule. The key never changes.
 * `url_base` may be the legacy blog address here (urlBaseUpdate); the route
 * takes it for the post built-in only.
 */
declare const contentTypeUpdateSchema: z.ZodObject<{
    singular_label: z.ZodOptional<z.ZodString>;
    plural_label: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodEnum<{
        tag: "tag";
        video: "video";
        doc: "doc";
        star: "star";
        mega: "mega";
        flag: "flag";
        users: "users";
        cal: "cal";
        mic: "mic";
        shield: "shield";
    }>>;
    routable: z.ZodOptional<z.ZodBoolean>;
    url_base: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    default_access: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        tag: "tag";
        public: "public";
        signed_in: "signed_in";
        members: "members";
    }>>>;
}, z.core.$strict>;
type ContentTypeUpdateInput = z.infer<typeof contentTypeUpdateSchema>;
/** A reference target: one of CONTENT_REFERENCE_TARGETS, or `content_type:<key>`. */
declare function isContentReferenceTarget(value: string): boolean;
declare const contentFieldCreateSchema: z.ZodObject<{
    label: z.ZodString;
    kind: z.ZodEnum<{
        boolean: "boolean";
        long_text: "long_text";
        short_text: "short_text";
        rich_text: "rich_text";
        image: "image";
        pdf: "pdf";
        link: "link";
        date: "date";
        datetime: "datetime";
        choice: "choice";
        choices: "choices";
        list: "list";
        reference: "reference";
    }>;
    required: z.ZodDefault<z.ZodBoolean>;
    help: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    choices: z.ZodOptional<z.ZodArray<z.ZodString>>;
    ref_target: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
type ContentFieldCreateInput = z.infer<typeof contentFieldCreateSchema>;
/** Label, required, help and choices. Key, kind and reference target never change. */
declare const contentFieldUpdateSchema: z.ZodObject<{
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    help: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    choices: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
type ContentFieldUpdateInput = z.infer<typeof contentFieldUpdateSchema>;
/** A new order for a type's fields, a taxonomy's terms: every id, in order. */
declare const contentReorderSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
/** A new order for the entries of an ordered type: the type's key and entry ids, in order. */
declare const contentEntryReorderSchema: z.ZodObject<{
    type_key: z.ZodString;
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
type ContentEntryReorderInput = z.infer<typeof contentEntryReorderSchema>;
/** A field as the entry-data schema needs it. */
interface ContentFieldDef {
    key: string;
    kind: ContentFieldKind;
    required: boolean;
    choices: readonly string[] | null;
    ref_target: string | null;
}
/** A Reference value: `{ kind, id }`; an entry reference's kind is 'entry'. */
interface ContentReferenceValue {
    kind: string;
    id: string;
}
/** The `kind` a Reference value to `target` carries. */
declare function referenceKindForTarget(target: string): string;
/**
 * The zod schema for an entry's data_json, built from its type's live fields.
 * Keys that are not live fields are stripped. Every field accepts null (no
 * value). `enforceRequired` makes a required field refuse an empty value —
 * the write path sets it for a published entry, so a draft can be saved
 * half-filled. `sanitizeRichText` normalizes rich_text values to the prose
 * allowlist (the api passes @givegold/site's sanitizeRichHtml at its prose level).
 */
declare function buildEntryDataSchema(fields: readonly ContentFieldDef[], opts?: {
    enforceRequired?: boolean;
    sanitizeRichText?: (html: string) => string;
}): z.ZodObject<{
    [x: string]: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}, z.core.$strip>;
declare const taxonomyCreateSchema: z.ZodObject<{
    label: z.ZodString;
    hierarchical: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
declare const taxonomyUpdateSchema: z.ZodObject<{
    label: z.ZodString;
}, z.core.$strict>;
declare const termCreateSchema: z.ZodObject<{
    label: z.ZodString;
    slug: z.ZodOptional<z.ZodString>;
    parent_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
declare const termUpdateSchema: z.ZodObject<{
    label: z.ZodOptional<z.ZodString>;
    slug: z.ZodOptional<z.ZodString>;
    parent_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
/** A byline names someone: typed, or taken from the linked teammate or contact. */
declare const bylineCreateSchema: z.ZodObject<{
    display_name: z.ZodOptional<z.ZodString>;
    slug: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar_media_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    link_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    user_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contact_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
declare const bylineUpdateSchema: z.ZodObject<{
    display_name: z.ZodOptional<z.ZodString>;
    slug: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar_media_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    link_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    user_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contact_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;

export { BLOG_CONTENT_TYPES, BUILT_IN_CONTENT_TYPES, BUILT_IN_TAXONOMIES, BUILT_IN_TYPE_FIELDS, type BuiltInContentType, type BuiltInFieldDef, type BuiltInTaxonomy, CONTENT_TYPE_LIMITS, CONTENT_TYPE_RESERVED_URL_BASES, type ContentEntryKind, type ContentEntryReorderInput, type ContentFieldCreateInput, type ContentFieldDef, type ContentFieldUpdateInput, type ContentReferenceValue, type ContentTypeCreateInput, type ContentTypeUpdateInput, FIELDED_BUILT_IN_CONTENT_TYPE_KEYS, type FieldedBuiltInContentTypeKey, SEEDED_BLOG_BASE, blogUrlBase, buildEntryDataSchema, builtInTypeKeyForKind, builtInUrlBase, bylineCreateSchema, bylineUpdateSchema, contentEntryReorderSchema, contentFieldCreateSchema, contentFieldUpdateSchema, contentKeyFromLabel, contentReorderSchema, contentSlugFromLabel, contentTypeCreateSchema, contentTypeUpdateSchema, entryKindForType, isBlogContentType, isContentReferenceTarget, isNewsletterContentType, isPartyContentType, referenceKindForTarget, taxonomyCreateSchema, taxonomyUpdateSchema, termCreateSchema, termUpdateSchema };
