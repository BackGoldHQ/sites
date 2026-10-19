import { B as BackgoldSurfacePath, C as ContentFieldKind, a as ContentAccessLevel, b as BylineRoleLabel, S as SiteNavItemType, c as SiteNavShowsOn, d as SiteMenuKey, e as SiteSectionKind, f as SiteSectionRole, g as SiteMode, h as SiteApiKeyKind } from './constants-BgQMMyNq.js';
export { i as ContentWebhookEvent, j as SITE_KEY_PREFIXES, k as SitePageModuleKind } from './constants-BgQMMyNq.js';

/**
 * Whether an authored href may be handed to a partner as a link: a same-page
 * anchor, a same-origin path, or an http(s) or mailto URL — never
 * javascript:, data:, vbscript: or anything unparseable. A copy of
 * isSafeLinkHref in packages/site/src/urls.ts (shared cannot import the block
 * library); the api's content-api tests hold the two to the same answers.
 *
 * Its own module so the Map region parser (map-status.ts) and the Content API
 * projection (content-api.ts, which re-exports it) read one rule.
 */
declare function isSafeContentHref(href: string): boolean;

/**
 * The headless Content API contract — `/api/content/v1`, read with a per-site
 * key by a partner-built website (Sites CMS W6).
 *
 * One source for the api routes and the OpenAPI text: every response shape,
 * the site-key helpers, the entry-list cursor, and `projectDocument`, the pure
 * projection of a page's baked Puck document into the ordered `Section`s the
 * API returns.
 *
 * Responses are top-level named objects (no `{ data }` wrapper); an error is
 * `{ error, code }`. Every link carries its typed target and a resolved `url`
 * (absolute for an external address, path-absolute for the site's own).
 *
 * Money and consent never pass through partner code: a compliance module
 * (donate, form, poll, petition, store, event, calendar, signup, advocacy,
 * frames)
 * projects to an embed of the module BackGold renders, never to its fields,
 * form ids, consent copy or amounts.
 */

/** The Content API mount. */
declare const CONTENT_API_PREFIX = "/api/content/v1";
/** The most days a GET /events window spans, first and last included: six weeks, a month grid's whole face. */
declare const EVENTS_WINDOW_MAX_DAYS = 42;
/** Every error the Content API answers with. */
interface ContentApiError {
    error: string;
    code: string;
}
/** The legal line a partner site must show. `required` is always true. */
interface ContentApiLegal {
    disclaimer: string | null;
    required: true;
}
interface SiteResponse {
    site: {
        id: string;
        name: string | null;
        /** The site's host: its domain, or the organization's platform host for the org-host site. */
        domain: string;
        mode: SiteMode;
        favicon_url: string | null;
        pack: string | null;
        style: string | null;
        /** The saved theme the site wears, resolved; null when it wears its palette. */
        theme: SiteTheme | null;
        brand: {
            logo_url: string | null;
            primary_color: string | null;
            secondary_color: string | null;
            accent_color: string | null;
            palette_id: string | null;
        };
        social: Array<{
            platform: string;
            url: string;
        }>;
        seo: {
            title: string | null;
            description: string | null;
        };
        /** The site's header and footer as its operator set them up (its header and footer sections). */
        chrome: SiteChromeResponse;
    };
    /** The site's areas in Areas-screen order (0458). */
    areas: SiteArea[];
    legal: ContentApiLegal;
    version: number;
    /** The organization's name, for the words a site draws around a members or tag rule ("Members of <org>"). */
    org_name: string;
}
/** One link on the footer's bottom row (privacy, terms, bylaws). */
interface SiteChromeLink {
    label: string;
    url: string;
}
/**
 * The footer's closing call (its `closing` layout): a band over the columns
 * with a headline, a line, an italic tagline, up to two buttons and a photo
 * behind. Null unless the layout is `closing` and a headline was written.
 */
interface SiteChromeClosing {
    headline: string;
    body: string | null;
    tagline: string | null;
    image_url: string | null;
    /** The buttons that have both a label and an address, in order. */
    buttons: SiteChromeLink[];
}
/**
 * The header and footer as the operator set them up in BackGold. The menus
 * they hold come from `/menus/primary`, `/menus/footer` and `/menus/utility`,
 * the social links and the legal line from `/site`; this is the rest: each
 * part's layout (one of SITE_CHROME_LAYOUTS, the stored choice when it is
 * one, else the first) and the footer's own words.
 */
interface SiteChromeResponse {
    header: {
        layout: SiteHeaderLayout;
    };
    footer: {
        layout: SiteFooterLayout;
        /** The short line under the organization's name. */
        blurb: string | null;
        /** The postal address; newlines break lines. */
        address: string | null;
        /**
         * The phone line. The footer's contact email never leaves BackGold: the
         * Content API answers with no email address at all.
         */
        phone: string | null;
        /** The bottom row's links, in order; every address safe to follow. */
        legal_links: SiteChromeLink[];
        /** The copyright line as written; null leaves it to the site ("© year name"). */
        copyright: string | null;
        closing: SiteChromeClosing | null;
    };
}
/** One of a site's areas: its name, and its key (the name in code, which never changes). */
interface SiteArea {
    key: string;
    name: string;
}
/**
 * One reusable section meant for an area of the page, entry or list it came
 * with. `from` and `until` are UTC instants (null when unset): show the item
 * between them, decided when the page is viewed. An item whose `until` has
 * passed is never sent; one whose `from` is ahead is.
 */
interface AreaItem {
    key: string;
    label: string;
    from: string | null;
    until: string | null;
    sections: Section[];
}
/** Every area of the site by its key, each an ordered list (empty when nothing shows there). */
type Areas = Record<string, AreaItem[]>;
/** GET /areas?holds= — the areas for a route of yours with no BackGold page, described by the modules it holds. */
interface AreasResponse {
    areas: Areas;
}
/** A theme mode's five seed colours (`#rrggbb`; the four optional ones may be null). */
interface SiteThemeColors {
    primary: string;
    secondary: string | null;
    accent: string | null;
    bg: string | null;
    backdrop: string | null;
}
/**
 * A theme mode's resolved palette tokens, every value a `#rrggbb` or
 * `#rrggbbaa` hex: the values a baked page's CSS custom properties carry
 * (`accent_text` is `--accent-text`).
 */
interface SiteThemeTokens {
    bg: string;
    surface: string;
    surface_2: string;
    ink: string;
    muted: string;
    faint: string;
    line: string;
    line_strong: string;
    accent_1: string;
    accent_2: string;
    accent_text: string;
    accent_ink: string;
    accent_soft: string;
    accent_line: string;
    hero_1: string;
    hero_2: string;
    map_open: string;
    map_open_h: string;
    map_stroke: string;
}
/** One of a theme's two faces: what to name in CSS and the woff2 files to load. */
interface SiteThemeFont {
    /** The family name as the face's @font-face rules declare it. */
    family: string;
    /** The full CSS font-family stack, fallbacks included. */
    stack: string;
    /** builtin: a BackGold face; fontsource: an imported family; system: no download. */
    source: 'builtin' | 'fontsource' | 'system';
    /** Absolute woff2 addresses by weight; empty for a system face. */
    files: Array<{
        weight: number;
        url: string;
    }>;
}
/** A saved theme, resolved: what a baked page of the site wears. */
interface SiteTheme {
    id: string;
    name: string;
    heading_transform: 'none' | 'uppercase';
    /** The heading weight actually used (snapped to one the face ships). */
    heading_weight: number;
    radius_px: number;
    light: {
        colors: SiteThemeColors;
        tokens: SiteThemeTokens;
    };
    dark: {
        colors: SiteThemeColors;
        tokens: SiteThemeTokens;
    };
    fonts: {
        heading: SiteThemeFont;
        body: SiteThemeFont;
    };
    /** Absolute address of GET /site/theme.css: the @font-face rules and both modes' custom properties. */
    css_url: string;
}
/**
 * Where a menu item points, by kind; only the fields its kind uses are set.
 * `content_list` carries `type_key`; `entry` carries `type_key` and
 * `entry_slug`; `term` carries `taxonomy` (`category`, `tag`, …) and
 * `term_slug`; `blog`, `donate`, `events`, `store` and `group` carry only
 * `kind`.
 */
interface MenuTarget {
    kind: SiteNavItemType;
    page_id?: string;
    slug?: string;
    url?: string;
    anchor?: string;
    entry_slug?: string;
    type_key?: string;
    term_slug?: string;
    taxonomy?: string;
}
/** One page a Shows on rule names: its id and its address on the site. */
interface MenuShowsOnPage {
    id: string;
    url: string;
}
/**
 * Where the site's owner wants a link to show, as data for whoever draws the
 * page to follow, bend or ignore: on every page; only on (or on every page
 * but) the pages listed; or only on pages that take donations (each page
 * response's `takes_donations`). A group, and a campaign's form under its
 * dropdown, always read `every_page`.
 */
type MenuShowsOn = {
    rule: Extract<SiteNavShowsOn, 'every_page' | 'donation_pages'>;
} | {
    rule: Extract<SiteNavShowsOn, 'only_pages' | 'except_pages'>;
    pages: MenuShowsOnPage[];
};
interface MenuItem {
    id: string;
    label: string;
    kind: SiteNavItemType;
    target: MenuTarget;
    /**
     * Resolved address; null for a group without a page of its own. A
     * donate/events/store link is the site's own page of that kind when it holds
     * one, else the home site's, else the organization's door.
     */
    url: string | null;
    external: boolean;
    /** True on the one link the header draws as its button. */
    header_button: boolean;
    shows_on: MenuShowsOn;
    children: MenuItem[];
}
interface MenuResponse {
    menu: {
        key: SiteMenuKey;
    };
    items: MenuItem[];
}
interface PageSummary {
    id: string;
    slug: string;
    title: string | null;
    url: string;
    is_home: boolean;
    published_at: string | null;
    updated_at: string;
    /** Whether the page holds a section that takes donations (a `donation_pages` link shows on it). */
    takes_donations: boolean;
}
interface PagesResponse {
    pages: PageSummary[];
}
interface PageResponse {
    page: {
        id: string;
        slug: string;
        title: string | null;
        url: string;
        is_home: boolean;
        published_at: string | null;
        /** Whether the page holds a section that takes donations (a `donation_pages` link shows on it). */
        takes_donations: boolean;
        meta: {
            title: string | null;
            description: string | null;
            image_url: string | null;
        };
    };
    sections: Section[];
    areas: Areas;
    legal: ContentApiLegal;
}
/** A section's ground role (the §56 band vocabulary of packages/site). */
declare const SECTION_BANDS: readonly ["plain", "tint", "panel", "wash", "contrast"];
type SectionBand = (typeof SECTION_BANDS)[number];
/** A section's geometry. */
declare const SECTION_BLEEDS: readonly ["full", "contained"];
type SectionBleed = (typeof SECTION_BLEEDS)[number];
/**
 * The layouts CONTRACT.md §2 names for every section type with a variant key
 * (the prop CONTENT_API_BLOCKS names as its `variant`), in §2's order. A
 * template draws the one it was given; BackGold's hosted renderer draws the
 * ones it has and its default for the rest. The site's page schema accepts
 * exactly these values and its editor offers them, so a stored layout the
 * contract names is never refused.
 */
declare const SECTION_LAYOUTS: {
    readonly Hero: readonly ["centered", "split", "overlap", "cover", "statement", "donate", "video", "rotating", "portrait"];
    readonly About: readonly ["right", "left", "letter", "portrait", "books"];
    readonly Issues: readonly ["cards", "steps", "numbered", "rows", "checklist", "tabs", "drawer"];
    readonly StatCards: readonly ["row", "ribbon", "feature", "wall"];
    readonly Cta: readonly ["card", "banner", "strip", "photo"];
    readonly QuoteStrip: readonly ["row", "single", "ticker", "logos", "carousel", "wall"];
    readonly Map: readonly ["directory", "map", "bar"];
    readonly VideoEmbed: readonly ["auto", "landscape", "portrait", "square"];
    readonly PdfEmbed: readonly ["short", "medium", "tall", "card"];
    readonly QuickDonate: readonly ["grid", "hero", "bar", "jar", "band", "ladder"];
    readonly VoterTools: readonly ["register", "polling", "dates"];
    readonly SampleBallot: readonly ["slate", "cards", "measures"];
    readonly Scorecard: readonly ["table", "grades", "promise"];
    readonly Faq: readonly ["accordion", "topics", "cards"];
    readonly Comparison: readonly ["table", "cards", "spectrum"];
    readonly Stories: readonly ["spotlight", "cards", "timeline"];
    readonly ShareKit: readonly ["cards", "strip", "compact"];
    readonly Financials: readonly ["bars", "donut", "table"];
    readonly Services: readonly ["packages", "list", "compare"];
    readonly CaseStudies: readonly ["featured", "grid", "beforeafter"];
    readonly Resources: readonly ["library", "featured", "band"];
    readonly Pathways: readonly ["doors", "tabs", "quiz"];
    readonly Portfolio: readonly ["grid", "featured", "strip"];
    readonly MediaKit: readonly ["kit", "speaker", "press"];
    readonly Progress: readonly ["bar", "ring", "compact", "match"];
    readonly Countdown: readonly ["banner", "tiles", "inline"];
    readonly EventsList: readonly ["list", "cards", "agenda", "compact", "calendar", "shifts", "week", "cohorts", "map"];
    readonly Blog: readonly ["cards", "list", "feature"];
    readonly Collection: readonly ["cards", "list", "compact", "feature", "library", "shelves", "outline"];
    readonly ContentPost: readonly ["card", "banner", "player", "theater"];
    readonly PlatformPlanks: readonly ["numbered", "columns", "longread"];
    readonly CandidateRoster: readonly ["cards", "ballot", "compact"];
    readonly TeamGrid: readonly ["grid", "board", "list"];
    readonly Membership: readonly ["card", "tiers", "compare"];
    readonly Booking: readonly ["cards", "list"];
    readonly Classroom: readonly ["grid", "list"];
    readonly Course: readonly ["syllabus", "outline"];
    readonly Lesson: readonly ["player", "reading"];
    readonly Donate: readonly ["form", "story"];
    readonly SignupCapture: readonly ["card", "band", "inline"];
    readonly FormBlock: readonly ["card", "wide"];
    readonly PollBlock: readonly ["card"];
    readonly Petition: readonly ["none", "image", "map", "coverage"];
    readonly Store: readonly ["grid", "featured"];
    readonly Event: readonly ["detail", "card"];
    readonly Calendar: readonly ["month", "agenda"];
    readonly SocialFrame: readonly ["ring", "lower_third", "corner", "countdown"];
    readonly Advocacy: readonly ["full", "compact"];
};
type SectionLayoutType = keyof typeof SECTION_LAYOUTS;
/**
 * The section types a template draws and BackGold's hosted renderer does not
 * (CONTRACT §2: the political sections, added 2026-10-13, the services
 * sections, added 2026-10-14, and ShareKit and Financials, sections batch 3,
 * added 2026-10-14). The hosted page
 * draws each as one plain section (packages/site TemplateSection.tsx), and the
 * builder offers them only on a site drawn by a template or built elsewhere.
 */
declare const TEMPLATE_SECTION_TYPES: readonly ["QuickDonate", "VoterTools", "SampleBallot", "Scorecard", "Membership", "Faq", "Comparison", "Stories", "ShareKit", "Financials", "Services", "CaseStudies", "Resources", "Pathways", "Portfolio", "MediaKit", "Booking", "Classroom", "Course", "Lesson"];
type TemplateSectionType = (typeof TEMPLATE_SECTION_TYPES)[number];
type SectionLayout<T extends SectionLayoutType> = (typeof SECTION_LAYOUTS)[T][number];
/**
 * The layouts of the two site parts every site has (CONTRACT.md §2 Chrome,
 * the A12 board's site parts), default first: the header (`SiteNav`, the
 * site's header section) and the footer (`Footer`, its footer section). The
 * choice is stored on the chrome block's `layout` and carried to a template
 * as `/site`'s `chrome`; a template draws the ones its manifest lists and its
 * own default for the rest, BackGold's hosted renderer draws `bar` and the
 * three footers it has (`giving` is template-drawn: the columns with a donate
 * strip across the top). The Above-the-footer area always draws above the
 * footer, as board A1 draws it; no footer layout takes it in.
 */
declare const SITE_CHROME_LAYOUTS: {
    readonly header: readonly ["bar", "centered"];
    readonly footer: readonly ["columns", "closing", "compact", "giving"];
};
type SiteHeaderLayout = (typeof SITE_CHROME_LAYOUTS.header)[number];
type SiteFooterLayout = (typeof SITE_CHROME_LAYOUTS.footer)[number];
/**
 * Where a section's link points. 'surface' is a surface BackGold serves itself
 * (donate, join, store, events, …), and `path` is the path as authored. A bare
 * surface path resolves per site (ProjectDocumentContext.surfaceUrls): the
 * site's own page of that kind when it holds one, else the home site's, else
 * the organization's door; `/join` is always the membership checkout. A deeper
 * path (`/donate/give`, `/events/<slug>`) is on the org's platform host.
 */
interface SectionLinkTarget {
    kind: 'page' | 'section' | 'external' | 'surface';
    slug?: string;
    anchor?: string;
    /**
     * An external target's address; on a page or surface link, the address as
     * the author wrote it when that was absolute on the site's own host.
     */
    url?: string;
    surface?: BackgoldSurfacePath;
    path?: string;
}
interface SectionLink {
    label: string;
    target: SectionLinkTarget;
    url: string;
    /** The button treatment the author picked for a link in a list (Issues: primary, outline, ghost). */
    style?: string;
}
/** One authored choice of a section: an enum value as stored, a number or a switch. */
type SectionOption = string | number | boolean;
interface SectionMedia {
    url: string;
    alt?: string;
}
/** A data-bound section's rows: what the module lists, ids and public fields only. */
interface SectionData {
    source: string;
    items: unknown[];
}
/**
 * How a compliance module renders on a partner site: the iframe of the module
 * BackGold serves, and the loader script for a partner who lets BackGold
 * build the frame — the script fills `data-backgold-*` containers present
 * when it loads and sizes the frames it built. An iframe the partner places
 * itself is never touched by the script; the partner's page sizes it from
 * the frame's `givegold:resize` message ({ type, height }). A script-only
 * module (Advocacy) has no iframe; `mount` is the container its script fills.
 */
interface SectionEmbed {
    iframe: string | null;
    script: string;
    mount?: Record<string, string>;
}
interface Section {
    /** The block's Puck id. */
    id: string;
    type: string;
    band: SectionBand;
    bleed: SectionBleed;
    variant: string | null;
    /**
     * Authored words by key. An empty string is a word hidden on purpose; an
     * absent key was never set, and the renderer chooses.
     */
    copy: Record<string, string>;
    media: Record<string, SectionMedia>;
    links: SectionLink[];
    /**
     * The block's other authored choices (columns, counts, switches, its anchor
     * id), as stored: never an id, a slug of an internal record, a url or a secret.
     * projectDocument sets it on every section; a section built elsewhere may
     * leave it out.
     */
    options?: Record<string, SectionOption>;
    data?: SectionData;
    embed?: SectionEmbed;
    /** Set when the block came from a synced site section placed on the page. */
    section_ref?: {
        key: string;
        label: string;
    };
}
interface SectionsResponse {
    section: {
        key: string;
        label: string;
        kind: SiteSectionKind | null;
        role: SiteSectionRole | null;
    };
    sections: Section[];
}
interface ContentTypeField {
    key: string;
    label: string;
    kind: ContentFieldKind;
    required: boolean;
    choices?: string[];
}
interface ContentTypeSummary {
    key: string;
    singular_label: string;
    plural_label: string;
    routable: boolean;
    /**
     * Where the type's entries live on the site (`/<url_base>/<slug>`): the
     * org's blog base for the three blog built-ins (post, podcast and video
     * share it), the type's own address for any other routable type, null for
     * a type with no pages.
     */
    url_base: string | null;
    built_in: boolean;
    /**
     * The list the type's entries are listed in together with other types':
     * `blog` for the three blog built-ins, which list together at their shared
     * url_base; null for every other type, which lists alone.
     */
    index: 'blog' | null;
    fields: ContentTypeField[];
}
interface TypesResponse {
    types: ContentTypeSummary[];
}
interface EntryTerm {
    taxonomy: string;
    slug: string;
    label: string;
}
interface EntryAuthor {
    slug: string;
    display_name: string;
    avatar_url: string | null;
    link_url: string | null;
    role: BylineRoleLabel;
}
interface Entry {
    id: string;
    slug: string;
    type: string;
    title: string;
    summary: string | null;
    url: string | null;
    hero: {
        url: string;
    } | null;
    media_url: string | null;
    publish_at: string | null;
    updated_at: string;
    terms: EntryTerm[];
    authors: EntryAuthor[];
    /** Preview only: the entry's state ('draft' or 'published'). */
    status?: string;
    /**
     * Who may open the entry (0547): its own rule, or the one it follows. Read
     * through a course, a lesson with no rule of its own follows the course;
     * read anywhere else, an entry with no rule of its own that sits in
     * published courses opens for a reader who qualifies for one of them (and
     * reports the rule that opened it, else the strictest), and any other is
     * public.
     */
    access: ContentAccessLevel;
    /**
     * True when this reader may not open the entry: the media (and on a detail
     * the body and fields) are withheld and `lock` says why. A public entry is
     * never locked, and neither is a preview.
     */
    locked: boolean;
    lock: EntryLock | null;
    /** A video's running time in seconds, when the upload or the author said. */
    duration_seconds: number | null;
    /**
     * The copies of an uploaded video (media-renditions.ts), each the media
     * file's address with `?size=`: 720p for a narrow viewport, 1080p for a wide
     * one; a size the source was too small for is null. Null when the entry's
     * media is not an uploaded file, the copies are not ready, or the entry is
     * locked for this reader. The original stays at `media_url`.
     */
    renditions: EntryRenditions | null;
}
interface EntryRenditions {
    '720': string | null;
    '1080': string | null;
}
interface EntryDetail extends Entry {
    /** Empty markdown when the entry is locked for this reader. */
    body: {
        markdown: string;
    };
    /** `{}` when the entry is locked for this reader. */
    fields: Record<string, unknown>;
}
/** Why an entry is locked for this reader: the door the site draws. */
interface EntryLock {
    reason: Exclude<ContentAccessLevel, 'public'>;
    /** The tag's name when the reason is `tag`, else null. */
    tag_label: string | null;
    /** The org's name, for "Join <org> to watch" and "members of <org>". */
    org_name: string;
}
interface EntriesResponse {
    entries: Entry[];
    next_cursor: string | null;
    /** The areas of the type's list page. */
    areas: Areas;
}
interface EntryResponse {
    entry: EntryDetail;
    areas: Areas;
}
declare const VISITOR_COOKIE = "bg_visitor";
declare const VISITOR_HEADER = "X-BackGold-Visitor";
declare const VISITOR_RENEW_HEADER = "X-BackGold-Visitor-Renew";
declare const VISITOR_TOKEN_TTL_SECONDS: number;
declare const VISITOR_RENEW_WINDOW_SECONDS: number;
/** The path on the site's own host that redeems the portal's hand-off code. */
declare const VISITOR_RETURN_PATH = "/_backgold/visitor";
/** The path on the site's own host that signs the visitor out of the site. */
declare const VISITOR_SIGN_OUT_PATH = "/_backgold/sign-out";
/** The path on the site's own host that sends the visitor to the portal's door. */
declare const VISITOR_SIGN_IN_PATH = "/_backgold/sign-in";
/** The path on the site's own host the lesson page posts progress to. */
declare const VISITOR_PROGRESS_PATH = "/_backgold/progress";
interface Visitor {
    first_name: string | null;
    email: string;
    /** An active membership of the site's org. */
    member: boolean;
}
/** GET /visitor: who the token is; `visitor: null` without a valid token. */
interface VisitorResponse {
    visitor: Visitor | null;
}
/** POST /visitor/exchange { code } (first-party, or a secret key from a server): the hand-off code the portal minted for this site. */
interface VisitorExchangeRequest {
    code: string;
}
interface VisitorExchangeResponse {
    token: string;
    expires_at: string;
    visitor: Visitor;
}
/** This visitor's place in a course; null for a reader with no visitor. */
interface CourseProgress {
    /** Lessons this visitor finished. */
    completed: number;
    /** Lessons in the course. */
    total: number;
    /** Lessons this visitor can open (a members lesson counts for members only). "Finished" means completed === openable. */
    openable: number;
    /** Seconds left in the openable lessons not yet finished; null when no lesson carries a length. */
    seconds_left: number | null;
    /** The next unfinished lesson this visitor can open, or null. */
    next_lesson_slug: string | null;
}
interface CourseSummary {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    url: string;
    hero: {
        url: string;
    } | null;
    publish_at: string | null;
    updated_at: string;
    access: ContentAccessLevel;
    locked: boolean;
    lock: EntryLock | null;
    lesson_count: number;
    /** The lessons' lengths added up; null when none carries one. */
    total_seconds: number | null;
    progress: CourseProgress | null;
}
interface CourseLesson {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    /** The lesson's address under its course: /<courses base>/<course>/<lesson>. */
    url: string;
    hero: {
        url: string;
    } | null;
    duration_seconds: number | null;
    position: number;
    access: ContentAccessLevel;
    locked: boolean;
    lock: EntryLock | null;
    /** This visitor finished it; false without a visitor. */
    completed: boolean;
    /** When this visitor finished it; null when they have not, or without a visitor. */
    completed_at: string | null;
    /** Where this visitor stopped, in seconds; null without a visitor or a saved place. */
    position_seconds: number | null;
}
interface CourseDetail extends CourseSummary {
    body: {
        markdown: string;
    };
    lessons: CourseLesson[];
}
interface CoursesResponse {
    courses: CourseSummary[];
    next_cursor: string | null;
    areas: Areas;
}
interface CourseResponse {
    course: CourseDetail;
    areas: Areas;
}
/** GET /courses/:slug/:lesson: the lesson as this reader may see it, in its course. */
interface LessonResponse {
    /** The video entry: the teaser when locked (empty body, no media_url, `lock` set), else whole. */
    lesson: EntryDetail;
    course: CourseDetail;
    previous: Pick<CourseLesson, 'slug' | 'title' | 'url'> | null;
    next: Pick<CourseLesson, 'slug' | 'title' | 'url'> | null;
    areas: Areas;
}
/** POST /courses/:slug/:lesson/progress with a visitor: the upsert. Either field alone is fine. */
interface LessonProgressRequest {
    completed?: boolean;
    position_seconds?: number;
}
interface LessonProgressResponse {
    progress: {
        completed: boolean;
        completed_at: string | null;
        position_seconds: number | null;
    };
    course: CourseProgress;
}
/**
 * One upcoming event as an EventsList section's data row carries it (the
 * block's row fields in CONTENT_API_BLOCKS), and as GET /events lists it.
 * `url` and `tickets_url` are the event's own page on BackGold.
 */
interface EventsListRow {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    /** The event's IANA zone; null when it has none. */
    timezone: string | null;
    location: string | null;
    is_virtual: boolean;
    /** The event's type key (`rally`, `convention`, `fundraiser`, `blank`). */
    type: string | null;
    registration_closed: boolean;
    url: string | null;
    /** True when the event has a live ticket type priced above zero and its registration is open. */
    sells_tickets: boolean;
    /** The event's own page when it sells tickets; null when it does not. */
    tickets_url: string | null;
    /** The event's pinned location, for a map; null when it has none (sections batch 3, 2026-10-14). */
    lat: number | null;
    lng: number | null;
}
/** An event type with at least one upcoming event (in a window: one event in it), and how many. */
interface EventTypeSummary {
    key: string;
    label: string;
    upcoming: number;
}
/**
 * GET /events — the org's upcoming public events, soonest first, one page at
 * a time. `types` counts every upcoming event by type, whatever `?type=`
 * narrowed the page to. With `?from=&to=` (a window of at most 42 days) the
 * list is instead every public event starting inside the window, ended ones
 * included, and `types` counts those.
 */
interface EventsResponse {
    events: EventsListRow[];
    types: EventTypeSummary[];
    next_cursor: string | null;
}
/** One event's live counts: confirmed seats, and seats left (null without a capacity). */
interface EventLiveCounts {
    id: string;
    going: number;
    seats_left: number | null;
}
/** GET /events/live?ids= — live counts for the named events; an id the site cannot read is omitted. Never versioned. */
interface EventsLiveResponse {
    events: EventLiveCounts[];
}
/**
 * One event by its slug, for a site that draws the event's own page at
 * `/events/<slug>`: its list row, and what the page shows around BackGold's
 * RSVP and tickets. Unlisted events open from their link, and ended events
 * stay readable (their page outlives them).
 */
interface EventDetail extends EventsListRow {
    slug: string;
    /** Sanitized rich text (prose HTML) or plain paragraphs, as the operator wrote it; null when empty. */
    description: string | null;
    /** The venue's name; null when it has none. */
    venue: string | null;
    /** The street address on one line ("14 Rail Street, Fenwick, WM 80412"); null when it has none. */
    address: string | null;
    /** The cover picture's absolute address; null when it has none. */
    image_url: string | null;
    /** Directions to the venue (a maps link out), from the coordinates or the address; null when there is neither. */
    directions_url: string | null;
    /** BackGold's RSVP and tickets for the event, as a compliance section's embed. */
    embed: SectionEmbed;
}
interface EventResponse {
    event: EventDetail;
    /** The areas for a route that holds an event module. */
    areas: Areas;
}
interface TermsResponse {
    taxonomy: {
        key: string;
        label: string;
        hierarchical: boolean;
    };
    terms: Array<{
        id: string;
        slug: string;
        label: string;
        parent_id: string | null;
        position: number;
    }>;
}
/** A byline's public face; the user/contact it may stand for never leaves the server. */
interface Author {
    slug: string;
    display_name: string;
    bio: string | null;
    avatar_url: string | null;
    link_url: string | null;
}
interface AuthorsResponse {
    authors: Author[];
}
interface AuthorResponse {
    author: Author;
}
interface RedirectsResponse {
    redirects: Array<{
        source: string;
        destination: string | null;
        status_code: number;
    }>;
}
interface SitemapResponse {
    urls: Array<{
        url: string;
        kind: 'page' | 'entry' | 'type_index';
        updated_at: string | null;
    }>;
}
/** A key's kind from its prefix, or null when it is not a site key. */
declare function siteKeyKind(key: string): SiteApiKeyKind | null;
/** A secret key as it is shown after creation: prefix, eight dots, its last four. */
declare function maskSiteKey(last4: string): string;
/**
 * The keyset position of the last row a page returned: an entry list's
 * (newest first, by publish_at) or the events list's (soonest first, by
 * starts_at, carried in `publish_at`).
 */
interface EntryCursor {
    publish_at: string;
    id: string;
}
/** base64url of `<publish_at>|<id>`. */
declare function encodeEntryCursor(cursor: EntryCursor): string;
/** The cursor `encodeEntryCursor` wrote, or null for anything else. */
declare function decodeEntryCursor(value: string): EntryCursor | null;
/**
 * The embed address of each compliance module, from the embed envelopes the
 * operator snippets mint (packages/frontend/app/utils/embed-envelope.ts):
 * the donor host serves the donation form, petition, event and store frames;
 * the api worker serves the standalone form/poll page (`/f`), the framed
 * signup, the events list, the calendar and the advocacy widget.
 */
interface ContentApiEmbedUrls {
    donate(formId: string): string;
    form(pageId: string, blockId: string): string;
    poll(pageId: string, blockId: string): string;
    /** A SignupCapture's (or a Hero's) supporter capture, framed. */
    signup(pageId: string, blockId: string): string;
    /** The same capture in a reusable site section, framed by the section's id
     *  (an area item has no page of its own). */
    signupSection(sectionId: string, blockId: string): string;
    petition(orgSlug: string, slug: string): string;
    /** A page's Petition block framed under its map or coverage header: the
     *  hosted sheet with the band the block's own data source, legend, asks and
     *  stat tiles draw (api routes/form-embed.ts petitionEmbed). */
    petitionBlock(pageId: string, blockId: string): string;
    /** A page's MovementMap block framed: the live map its visitors can zoom
     *  and explore, with the block's legend, count badge and stat tiles (api
     *  routes/form-embed.ts movementMapEmbed). */
    movementMapBlock(pageId: string, blockId: string): string;
    /** A page's MovementTicker block framed: the live feed of the people
     *  signing, giving and RSVPing, with its count and stat tiles (api
     *  routes/form-embed.ts movementTickerEmbed). */
    movementTickerBlock(pageId: string, blockId: string): string;
    event(orgSlug: string, slug: string): string;
    events(orgSlug: string): string;
    calendar(orgSlug: string): string;
    store(orgSlug: string): string;
    /** The embed loader script (public/embed.js on the donor host): builds and sizes frames in the `data-backgold-*` containers on the page when it loads. */
    loaderScript: string;
    /** The advocacy widget script. */
    advocacyScript: string;
}
/** The embed addresses for one environment's donor and api origins. */
declare function contentApiEmbedUrls(origins: {
    apiOrigin: string;
    donateOrigin: string;
}): ContentApiEmbedUrls;
/** What the projection needs to know about where it is serving. */
interface ProjectDocumentContext {
    /** The api worker origin; relative asset paths are made absolute against it. */
    apiOrigin: string;
    /** The donor host origin. */
    donateOrigin: string;
    /** The site's own public origin (`https://<domain>`); a link to it is the site's own. */
    siteUrl: string;
    /**
     * The org's platform host origin (api lib/org-host.ts orgHostUrl), where a
     * link to a BackGold surface is sent; null where the environment has none,
     * and then the site's own origin stands in.
     */
    orgHostUrl: string | null;
    /**
     * The resolved address of each BackGold surface for THIS site, which a bare
     * surface link (`/donate`, `/events`, `/join`, …) takes: the site's own page
     * of that kind when it holds one, else the home site's, else the
     * organization's door; `/join` is always the membership checkout. A surface
     * with no entry goes to `orgHostUrl` as a deeper surface path does.
     */
    surfaceUrls?: Partial<Record<BackgoldSurfacePath, string>>;
    /** The org's slug, which the org-keyed embeds are addressed by. */
    orgSlug: string;
    embedUrls: ContentApiEmbedUrls;
    /**
     * The synced sections inlined into the document (api loadRenderDocument):
     * a block whose id is listed carries `section_ref`.
     */
    sectionRefs?: ReadonlyArray<{
        key: string;
        label: string;
        blockIds: readonly string[];
    }>;
    /**
     * Who reads the sections. 'api' (the default) is a site built elsewhere:
     * data rows lose contact details (mailto:/tel:/sms: values, email/phone/
     * address keys) and asset paths are made absolute. 'hosted' is BackGold's
     * own renderer, which shows those contact links on the page exactly as the
     * block stores them, so its rows are left as they are.
     */
    audience?: 'api' | 'hosted';
    /**
     * True when projecting the sections of an area item: the blocks of
     * CONTENT_API_AREA_BLOCKS (the TakeoverBanner) are projected there and
     * nowhere else.
     */
    areaItem?: boolean;
    /**
     * The reusable section (site_sections id) an area item's blocks come from.
     * A SignupCapture or Hero capture there is framed by this section
     * (`embedUrls.signupSection`) rather than by a page. Unset, or on any other
     * read, the capture is framed by the page the bake names.
     */
    areaSectionId?: string;
}
/** What a block is to the Content API. */
type ContentApiBlockRole = 'compliance' | 'data' | 'chrome' | 'presentational';
/**
 * A link the block authors: the label prop and the href prop (inside `list`
 * when it is an array prop; `style` names the list entry's button treatment).
 * A link in a list comes after the block's single links.
 */
interface ContentApiLinkSpec {
    label: string;
    href: string;
    list?: string;
    style?: string;
}
type Props = Record<string, unknown>;
/**
 * How one field of a data row reads its block prop: the prop's name (its
 * string; blank reads as null), or a typed reading of it. Each reading has an
 * exact way back to the prop (sectionProps).
 */
type ContentApiRowField = string
/** True only when the prop is true. */
 | {
    prop: string;
    as: 'flag';
}
/** The prop's string entries. */
 | {
    prop: string;
    as: 'strings';
}
/** The prop when it is a finite number, else null. */
 | {
    prop: string;
    as: 'number';
}
/** The prop's string, else one derived from the row's place. */
 | {
    prop: string;
    fallback: (index: number) => string;
}
/** A nested list, field by field. */
 | {
    prop: string;
    rows: ContentApiRowFields;
};
type ContentApiRowFields = Readonly<Record<string, ContentApiRowField>>;
/** A list prop whose entries are a data block's rows. */
interface ContentApiRowList {
    prop: string;
    /** Stamped on each row as `group` when several list props feed one section. */
    group?: string;
    /** The row's fields by API key; '*' passes each entry through as stored. */
    fields: ContentApiRowFields | '*';
}
/** The rows a data-bound (or list-authoring) block shows, from its baked props. */
interface ContentApiDataSpec {
    source: string | ((props: Props) => string);
    /** The list props the rows come from, in order. */
    lists?: readonly ContentApiRowList[];
    /** The most rows the block shows; every row when absent. */
    cap?: (props: Props) => number;
    /** Rows computed from the block's scalar props, and the props they come back to. */
    rows?: {
        read: (props: Props) => Props[];
        write: (items: Props[]) => Props;
    };
}
interface ContentApiBlockSpec {
    role: ContentApiBlockRole;
    /** Authored string props that are copy. A compliance block lists only its frame's words: `heading` (and Donate's story, a sign-up's kicker and lede, a petition's addressed-to, goal and volunteer lines). */
    copy?: readonly string[];
    /** Image / video / document URL props. */
    media?: readonly string[];
    links?: readonly ContentApiLinkSpec[];
    /** The block's one presentational choice. */
    variant?: string;
    /** Its other authored choices: enum, number and switch props (`Section.options`). */
    options?: readonly string[];
    /**
     * Props only a page BackGold serves reads: the ids and slugs its islands are
     * wired with. Never projected; the hosted bake carries them from the block.
     */
    hosted?: readonly string[];
    data?: ContentApiDataSpec;
    /** A compliance module's embed (or a Hero's framed capture); null when the
     *  block names nothing to embed. */
    embed?: (props: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
}
/** Region rows written back as the `rows` lines the parser reads them from. */
declare function mapRows(items: Props[]): Props;
/**
 * What a Progress block shows: the raised and goal figures, or no row when
 * the hosted block shows nothing (no goal and nothing raised — an unwired
 * block, or a source with nothing counted yet). A goal of zero is no goal.
 */
declare function progressRows(p: Props): Props[];
/** The framed capture form of a SignupCapture, or of a Hero with its capture
 *  on: only the frame's address, never the consent copy, fields or campaign.
 *  In an area item it is addressed by the reusable section it comes from. */
declare function signupEmbed(p: Props, ctx: ProjectDocumentContext): SectionEmbed | null;
/**
 * Every block type of packages/site COMPONENT_TYPES, and what the Content API
 * makes of it. content-api.test.ts fails when a type is missing or extra, and
 * packages/site's projection-parity test renders every presentational and
 * data block both from its props and from `sectionProps` of its projection
 * and fails unless the two are byte-identical.
 *
 *   compliance     → `embed` (+ `copy.heading`, and the few words a site
 *                    draws around the frame: Donate's story, SignupCapture's
 *                    kicker and lede); never fields, form ids, consent copy,
 *                    amounts or a form's switches (SignupCapture's
 *                    `collectZip` stays in the frame). Petition alone also
 *                    carries its frame's options and its authored asks and
 *                    stat tiles as `data`.
 *   data           → `data: { source, items }` from the baked props (and,
 *                    for EventsList, its list frame as an `embed` as well).
 *   presentational → copy, media, links, options (+ data for an authored
 *                    list; + the framed capture as an `embed` for a Hero with
 *                    it on).
 *   chrome         → dropped from page sections; the header and footer are
 *                    `/sections/header|footer` and the legal line `/site.legal`.
 *
 * A single link's label prop is copy as well, so a button hidden on purpose
 * ('') and one left to the renderer (absent) read apart.
 *
 * `hosted` props never leave BackGold: Hero (showSignup, signupHeading,
 * signupButtonText, campaignId, pageId, issue, consentOrgName, consentUseCase
 * — its capture form, which a partner gets only as the framed embed), Progress (campaignId,
 * fundDesignationId), Leaderboard and SocialFeed (campaignId), TeamGrid
 * (campaignId, pageId — its interest form), MovementTicker (orgSlug,
 * petitionSlug, eventSlug, pageId — its frame's address), Blog and
 * Collection (orgSlug, siteId), MovementMap (datasetPath, the same-origin
 * dataset proxy).
 *                    A TakeoverBanner reaches the API only inside an area
 *                    item's sections (CONTENT_API_AREA_BLOCKS).
 */
declare const CONTENT_API_BLOCKS: {
    readonly Navbar: {
        readonly role: "chrome";
    };
    readonly SiteNav: {
        readonly role: "chrome";
    };
    readonly TakeoverBanner: {
        readonly role: "chrome";
    };
    readonly Footer: {
        readonly role: "chrome";
    };
    readonly Disclaimer: {
        readonly role: "chrome";
    };
    readonly SectionRef: {
        readonly role: "chrome";
    };
    readonly Hero: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "headline", "subheadline", "ctaText", "secondaryText", "monthlyLabel", "note", "caption", "imageAlt"];
        readonly media: readonly ["imageUrl", "photoUrl", "videoUrl", "videoPosterUrl"];
        readonly links: readonly [{
            readonly label: "ctaText";
            readonly href: "donateHref";
        }, {
            readonly label: "secondaryText";
            readonly href: "secondaryHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["photoTint", "photoStyle", "amounts", "defaultAmount", "monthly"];
        readonly hosted: readonly ["showSignup", "signupHeading", "signupButtonText", "campaignId", "pageId", "issue", "consentOrgName", "consentUseCase"];
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
        readonly data: {
            readonly source: "words";
            readonly lists: readonly [{
                readonly prop: "words";
                readonly fields: {
                    readonly title: "title";
                };
            }];
        };
    };
    readonly About: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "role", "signature", "body", "quote", "quoteSource", "buttonLabel"];
        readonly media: readonly ["photoUrl"];
        readonly links: readonly [{
            readonly label: "buttonLabel";
            readonly href: "buttonHref";
        }];
        readonly variant: "photoSide";
        readonly options: readonly ["photoStyle", "anchorId"];
        readonly data: {
            readonly source: "credentials";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly kind: "kind";
                    readonly label: "label";
                    readonly detail: "detail";
                    readonly year: "year";
                    readonly href: "href";
                    readonly imageUrl: "imageUrl";
                };
            }];
        };
    };
    readonly Issues: {
        readonly role: "presentational";
        readonly copy: readonly ["heading", "kicker", "lead"];
        readonly links: readonly [{
            readonly list: "ctas";
            readonly label: "label";
            readonly href: "href";
            readonly style: "style";
        }];
        readonly variant: "style";
        readonly options: readonly ["columns", "anchorId"];
        readonly data: {
            readonly source: "issues";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly title: "title";
                    readonly body: "body";
                    readonly icon: "icon";
                    readonly imageUrl: "imageUrl";
                    readonly note: "note";
                    readonly includes: {
                        readonly prop: "includes";
                        readonly as: "strings";
                    };
                };
            }];
        };
    };
    readonly StatCards: {
        readonly role: "presentational";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "stats";
            readonly lists: readonly [{
                readonly prop: "tiles";
                readonly fields: {
                    readonly label: "label";
                    readonly value: "value";
                    readonly note: "note";
                    readonly accent: {
                        readonly prop: "accent";
                        readonly as: "flag";
                    };
                };
            }];
        };
    };
    readonly Cta: {
        readonly role: "presentational";
        readonly copy: readonly ["eyebrow", "heading", "body", "donateButtonText", "volunteerButtonText"];
        readonly media: readonly ["photoUrl"];
        readonly links: readonly [{
            readonly label: "donateButtonText";
            readonly href: "donateHref";
        }, {
            readonly label: "volunteerButtonText";
            readonly href: "volunteerUrl";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
    };
    readonly QuoteStrip: {
        readonly role: "presentational";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "quotes";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly quote: "quote";
                    readonly attribution: "attribution";
                    readonly role: "role";
                    readonly logoUrl: "logoUrl";
                };
            }];
        };
    };
    readonly Map: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "litLabel", "darkLabel", "startingLabel", "charterCtaText", "organizerText"];
        readonly media: readonly ["geoUrl"];
        readonly links: readonly [{
            readonly label: "charterCtaText";
            readonly href: "charterCtaHref";
        }, {
            readonly label: "organizerText";
            readonly href: "organizerHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["geoId", "focusRegion", "regionTotal", "regionNoun", "anchorId"];
        readonly data: {
            readonly source: "regions";
            readonly rows: {
                readonly read: (p: Props) => Props[];
                readonly write: typeof mapRows;
            };
        };
    };
    readonly MovementMap: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "badgeNoun", "uncategorizedLabel", "sourceLabel"];
        readonly media: readonly ["datasetUrl"];
        readonly links: readonly [{
            readonly label: "sourceLabel";
            readonly href: "sourceHref";
        }];
        readonly options: readonly ["datasetPreset", "datasetArea", "categoryProperty", "centerLat", "centerLng", "zoom", "anchorId"];
        readonly hosted: readonly ["datasetPath", "pageId"];
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
        readonly data: {
            readonly source: "movement_map";
            readonly lists: readonly [{
                readonly prop: "statTiles";
                readonly fields: "*";
            }, {
                readonly prop: "categories";
                readonly group: "category";
                readonly fields: {
                    readonly value: "value";
                    readonly label: "label";
                };
            }];
        };
    };
    readonly VideoEmbed: {
        readonly role: "presentational";
        readonly copy: readonly ["caption"];
        readonly media: readonly ["url", "videoUrl", "videoPosterUrl"];
        readonly variant: "orientation";
        readonly options: readonly ["anchorId"];
    };
    readonly PdfEmbed: {
        readonly role: "presentational";
        readonly copy: readonly ["title", "caption"];
        readonly media: readonly ["pdfUrl"];
        readonly variant: "height";
        readonly options: readonly ["anchorId"];
    };
    readonly QuickDonate: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "buttonLabel", "monthlyLabel", "note"];
        readonly media: readonly ["imageUrl"];
        readonly links: readonly [{
            readonly label: "buttonLabel";
            readonly href: "donateHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["amounts", "defaultAmount", "monthly", "anchorId"];
        readonly data: {
            readonly source: "ladder";
            readonly lists: readonly [{
                readonly prop: "ladder";
                readonly fields: {
                    readonly amount: {
                        readonly prop: "amount";
                        readonly as: "number";
                    };
                    readonly impact: "impact";
                };
            }];
        };
    };
    readonly VoterTools: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "registerLabel", "pollingLabel", "idNote", "earlyVoting", "electionDay", "datesHeading"];
        readonly links: readonly [{
            readonly label: "registerLabel";
            readonly href: "registerHref";
        }, {
            readonly label: "pollingLabel";
            readonly href: "pollingHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "dates";
            readonly lists: readonly [{
                readonly prop: "dates";
                readonly fields: {
                    readonly label: "label";
                    readonly date: "date";
                    readonly note: "note";
                };
            }];
        };
    };
    readonly SampleBallot: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "printLabel", "endorsedLabel", "measuresHeading", "note"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "ballot";
            readonly lists: readonly [{
                readonly prop: "rows";
                readonly fields: {
                    readonly office: "office";
                    readonly name: "name";
                    readonly party: "party";
                    readonly region: "region";
                    readonly position: "position";
                    readonly summary: "summary";
                    readonly kind: "kind";
                    readonly href: "href";
                    readonly imageUrl: "imageUrl";
                    readonly endorsed: {
                        readonly prop: "endorsed";
                        readonly as: "flag";
                    };
                };
            }];
        };
    };
    readonly Scorecard: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "sourceNote", "promiseLabel", "promise", "promiseSource", "didLabel", "did", "didDetail"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "votes";
            readonly lists: readonly [{
                readonly prop: "rows";
                readonly fields: {
                    readonly bill: "bill";
                    readonly issue: "issue";
                    readonly vote: "vote";
                    readonly position: "position";
                    readonly date: "date";
                    readonly href: "href";
                    readonly name: "name";
                    readonly office: "office";
                    readonly grade: "grade";
                    readonly score: {
                        readonly prop: "score";
                        readonly as: "number";
                    };
                    readonly imageUrl: "imageUrl";
                };
            }];
        };
    };
    readonly Faq: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "contactHeading", "contactLabel"];
        readonly links: readonly [{
            readonly label: "contactLabel";
            readonly href: "contactHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["firstOpen", "anchorId"];
        readonly data: {
            readonly source: "faq";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly question: "question";
                    readonly answer: "answer";
                    readonly topic: "topic";
                };
            }];
        };
    };
    readonly Comparison: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "usLabel", "themLabel", "them2Label", "leftLabel", "rightLabel"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "comparison";
            readonly lists: readonly [{
                readonly prop: "rows";
                readonly fields: {
                    readonly issue: "issue";
                    readonly us: "us";
                    readonly them: "them";
                    readonly them2: "them2";
                    readonly usAt: {
                        readonly prop: "usAt";
                        readonly as: "number";
                    };
                    readonly themAt: {
                        readonly prop: "themAt";
                        readonly as: "number";
                    };
                    readonly them2At: {
                        readonly prop: "them2At";
                        readonly as: "number";
                    };
                };
            }];
        };
    };
    readonly Stories: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "label", "title", "summary", "status", "outcome", "readLabel", "watchLabel"];
        readonly media: readonly ["imageUrl"];
        readonly links: readonly [{
            readonly label: "readLabel";
            readonly href: "readHref";
        }, {
            readonly label: "watchLabel";
            readonly href: "watchHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "stories";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly label: "label";
                    readonly title: "title";
                    readonly body: "body";
                    readonly status: "status";
                    readonly tone: "tone";
                    readonly imageUrl: "imageUrl";
                    readonly href: "href";
                };
            }];
        };
    };
    readonly ShareKit: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "copyLabel", "shareLabel"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "share";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly network: "network";
                    readonly text: "text";
                    readonly href: "href";
                    readonly imageUrl: "imageUrl";
                };
            }];
        };
    };
    readonly Financials: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "year", "sourceNote", "reportLabel"];
        readonly links: readonly [{
            readonly label: "reportLabel";
            readonly href: "reportHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "financials";
            readonly lists: readonly [{
                readonly prop: "rows";
                readonly fields: {
                    readonly category: "category";
                    readonly share: {
                        readonly prop: "share";
                        readonly as: "number";
                    };
                    readonly amount: "amount";
                    readonly note: "note";
                };
            }];
        };
    };
    readonly Services: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "featuredLabel", "startingLabel", "note"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "services";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly name: "name";
                    readonly summary: "summary";
                    readonly price: "price";
                    readonly term: "term";
                    readonly includes: {
                        readonly prop: "includes";
                        readonly as: "strings";
                    };
                    readonly href: "href";
                    readonly buttonLabel: "buttonLabel";
                    readonly featured: {
                        readonly prop: "featured";
                        readonly as: "flag";
                    };
                    readonly icon: "icon";
                };
            }];
        };
    };
    readonly CaseStudies: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "readLabel", "beforeLabel", "afterLabel", "note"];
        readonly media: readonly ["imageUrl"];
        readonly links: readonly [{
            readonly label: "readLabel";
            readonly href: "readHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "cases";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly title: "title";
                    readonly tag: "tag";
                    readonly challenge: "challenge";
                    readonly approach: "approach";
                    readonly result: "result";
                    readonly metric: "metric";
                    readonly metricLabel: "metricLabel";
                    readonly metric2: "metric2";
                    readonly metric2Label: "metric2Label";
                    readonly metric3: "metric3";
                    readonly metric3Label: "metric3Label";
                    readonly before: "before";
                    readonly after: "after";
                    readonly href: "href";
                    readonly imageUrl: "imageUrl";
                };
            }];
        };
    };
    readonly Resources: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "gatedLabel", "openLabel", "buttonLabel"];
        readonly links: readonly [{
            readonly label: "buttonLabel";
            readonly href: "buttonHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "resources";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly title: "title";
                    readonly kind: "kind";
                    readonly detail: "detail";
                    readonly summary: "summary";
                    readonly href: "href";
                    readonly imageUrl: "imageUrl";
                    readonly gated: {
                        readonly prop: "gated";
                        readonly as: "flag";
                    };
                };
            }];
        };
    };
    readonly Pathways: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "programsLabel", "quizHeading", "resultLabel", "startLabel"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "pathways";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly title: "title";
                    readonly summary: "summary";
                    readonly outcome: "outcome";
                    readonly icon: "icon";
                    readonly href: "href";
                    readonly programs: {
                        readonly prop: "programs";
                        readonly as: "strings";
                    };
                    readonly fits: {
                        readonly prop: "fits";
                        readonly as: "strings";
                    };
                };
            }];
        };
    };
    readonly Portfolio: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "body", "clientLabel"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "work";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly title: "title";
                    readonly kind: "kind";
                    readonly client: "client";
                    readonly year: "year";
                    readonly summary: "summary";
                    readonly role: "role";
                    readonly result: "result";
                    readonly imageUrl: "imageUrl";
                    readonly href: "href";
                    readonly images: {
                        readonly prop: "images";
                        readonly as: "strings";
                    };
                };
            }];
        };
    };
    readonly MediaKit: {
        readonly role: "presentational";
        readonly copy: readonly ["kicker", "heading", "role", "shortBio", "longBio", "facts", "talksHeading", "bookLabel", "contactHeading", "contactLine", "kitLabel"];
        readonly media: readonly ["imageUrl"];
        readonly links: readonly [{
            readonly label: "bookLabel";
            readonly href: "bookHref";
        }, {
            readonly label: "kitLabel";
            readonly href: "kitHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "mediakit";
            readonly lists: readonly [{
                readonly prop: "items";
                readonly fields: {
                    readonly title: "title";
                    readonly kind: "kind";
                    readonly detail: "detail";
                    readonly outlet: "outlet";
                    readonly date: "date";
                    readonly href: "href";
                    readonly imageUrl: "imageUrl";
                };
            }];
        };
    };
    readonly Progress: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "buttonLabel"];
        readonly links: readonly [{
            readonly label: "buttonLabel";
            readonly href: "donateHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["matchMultiplier", "matchUntil", "anchorId"];
        readonly hosted: readonly ["campaignId", "fundDesignationId"];
        readonly data: {
            readonly source: "progress";
            readonly rows: {
                readonly read: typeof progressRows;
                readonly write: ([row]: Props[]) => {};
            };
        };
    };
    readonly Countdown: {
        readonly role: "data";
        readonly copy: readonly ["eyebrow", "heading", "body", "linkText"];
        readonly links: readonly [{
            readonly label: "linkText";
            readonly href: "linkHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["source", "anchorId"];
        readonly data: {
            readonly source: "countdown";
            readonly rows: {
                readonly read: (p: Props) => {
                    deadline: unknown;
                }[];
                readonly write: ([row]: Props[]) => {
                    deadline: unknown;
                };
            };
        };
    };
    readonly Leaderboard: {
        readonly role: "data";
        readonly copy: readonly ["heading"];
        readonly options: readonly ["limit", "anchorId"];
        readonly hosted: readonly ["campaignId"];
        readonly data: {
            readonly source: "leaderboard";
        };
    };
    readonly SocialFeed: {
        readonly role: "data";
        readonly copy: readonly ["heading"];
        readonly options: readonly ["maxPosts", "anchorId"];
        readonly hosted: readonly ["campaignId"];
        readonly data: {
            readonly source: "social_feed";
        };
    };
    readonly MovementTicker: {
        readonly role: "data";
        readonly copy: readonly ["heading"];
        readonly options: readonly ["kinds", "showTotal", "anchorId"];
        readonly hosted: readonly ["orgSlug", "petitionSlug", "eventSlug", "pageId"];
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
        readonly data: {
            readonly source: "movement";
            readonly lists: readonly [{
                readonly prop: "statTiles";
                readonly fields: {
                    readonly value: "value";
                    readonly label: "label";
                };
            }];
        };
    };
    readonly EventsList: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "allLabel", "eventsEmptyCta"];
        readonly links: readonly [{
            readonly label: "allLabel";
            readonly href: "allHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["max", "actions", "anchorId"];
        readonly data: {
            readonly source: "events";
            readonly cap: (p: Props) => number;
            readonly lists: readonly [{
                readonly prop: "events";
                readonly fields: {
                    readonly id: "id";
                    readonly title: "title";
                    readonly starts_at: "startsAt";
                    readonly ends_at: "endsAt";
                    readonly timezone: "timezone";
                    readonly location: "location";
                    readonly is_virtual: {
                        readonly prop: "isVirtual";
                        readonly as: "flag";
                    };
                    readonly type: "type";
                    readonly registration_closed: {
                        readonly prop: "registrationClosed";
                        readonly as: "flag";
                    };
                    readonly url: "href";
                    readonly sells_tickets: {
                        readonly prop: "sellsTickets";
                        readonly as: "flag";
                    };
                    readonly tickets_url: "ticketsHref";
                    readonly lat: {
                        readonly prop: "lat";
                        readonly as: "number";
                    };
                    readonly lng: {
                        readonly prop: "lng";
                        readonly as: "number";
                    };
                };
            }];
        };
        readonly embed: (_p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly Blog: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "allLabel"];
        readonly links: readonly [{
            readonly label: "allLabel";
            readonly href: "allHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["kindFilter", "maxItems"];
        readonly hosted: readonly ["orgSlug", "siteId", "blogBase"];
        readonly data: {
            readonly source: "blog";
        };
    };
    readonly Collection: {
        readonly role: "data";
        readonly copy: readonly ["heading", "pluralLabel"];
        readonly links: readonly [{
            readonly label: "pluralLabel";
            readonly href: "moreHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["type", "term", "limit", "anchorId"];
        readonly hosted: readonly ["orgSlug", "siteId"];
        readonly data: {
            readonly source: (p: Props) => string;
            readonly lists: readonly [{
                readonly prop: "entries";
                readonly fields: {
                    readonly slug: "slug";
                    readonly title: "title";
                    readonly summary: "summary";
                    readonly url: "href";
                    readonly image_url: "hero_url";
                    readonly publish_at: "publish_at";
                    readonly terms: {
                        readonly prop: "terms";
                        readonly rows: {
                            readonly label: "label";
                        };
                    };
                    readonly authors: {
                        readonly prop: "authors";
                        readonly rows: {
                            readonly name: "name";
                            readonly role: "role_label";
                        };
                    };
                };
            }];
        };
    };
    readonly ContentPost: {
        readonly role: "data";
        readonly copy: readonly ["heading", "postHtml", "notesLabel", "linksHeading"];
        readonly links: readonly [{
            readonly list: "links";
            readonly label: "label";
            readonly href: "href";
        }];
        readonly variant: "layout";
        readonly options: readonly ["showTitle", "showDate", "anchorId"];
        readonly data: {
            readonly source: "entry";
            readonly rows: {
                readonly read: (p: Props) => {
                    slug: string | null;
                    title: unknown;
                    kind: string | null;
                    date: string | null;
                    media_url: string | null;
                    media_kind: string | null;
                    image_url: string | null;
                }[];
                readonly write: ([row]: Props[]) => {
                    [k: string]: unknown;
                };
            };
        };
    };
    readonly PlatformPlanks: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "pdfLabel"];
        readonly links: readonly [{
            readonly label: "pdfLabel";
            readonly href: "pdfHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "platform";
            readonly lists: readonly [{
                readonly prop: "sections";
                readonly fields: {
                    readonly num: {
                        readonly prop: "num";
                        readonly fallback: (i: number) => string;
                    };
                    readonly title: "title";
                    readonly ethos: "ethos";
                    readonly icon: "icon";
                    readonly planks: {
                        readonly prop: "planks";
                        readonly rows: {
                            readonly headline: "headline";
                            readonly plain: "plain";
                            readonly full: "full";
                        };
                    };
                };
            }];
        };
    };
    readonly CandidateRoster: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "allLabel", "candidatesEmptyCta"];
        readonly links: readonly [{
            readonly label: "allLabel";
            readonly href: "allHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["showFilters", "cycleYear", "anchorId"];
        readonly data: {
            readonly source: "candidates";
            readonly lists: readonly [{
                readonly prop: "entries";
                readonly fields: {
                    readonly name: "name";
                    readonly office: "office";
                    readonly level: "level";
                    readonly region: "region";
                    readonly issues: {
                        readonly prop: "issues";
                        readonly as: "strings";
                    };
                    readonly status: "status";
                    readonly donate_url: "donateUrl";
                    readonly web_url: "webUrl";
                    readonly image_url: "photoUrl";
                    readonly endorsed: {
                        readonly prop: "endorsed";
                        readonly as: "flag";
                    };
                };
            }];
        };
    };
    readonly TeamGrid: {
        readonly role: "data";
        readonly copy: readonly ["heading", "teamOpenRolesIntro", "interestButtonText"];
        readonly links: readonly [{
            readonly label: "interestButtonText";
            readonly href: "interestUrl";
        }];
        readonly variant: "layout";
        readonly options: readonly ["showOpenRoles", "anchorId"];
        readonly hosted: readonly ["campaignId", "pageId"];
        readonly data: {
            readonly source: "team";
            readonly lists: readonly [{
                readonly prop: "exec";
                readonly group: "exec";
                readonly fields: {
                    readonly name: "name";
                    readonly role: "role";
                    readonly bio: "bio";
                    readonly image_url: "photoUrl";
                    readonly link_url: "linkUrl";
                };
            }, {
                readonly prop: "staff";
                readonly group: "staff";
                readonly fields: {
                    readonly name: "name";
                    readonly role: "role";
                    readonly dept: "dept";
                    readonly image_url: "photoUrl";
                    readonly link_url: "linkUrl";
                };
            }, {
                readonly prop: "open";
                readonly group: "open";
                readonly fields: {
                    readonly role: "role";
                    readonly dept: "dept";
                    readonly blurb: "blurb";
                    readonly link_url: "linkUrl";
                };
            }, {
                readonly prop: "roster";
                readonly group: "roster";
                readonly fields: {
                    readonly body: "body";
                    readonly body_key: "bodyKey";
                    readonly seat: "seat";
                    readonly name: "name";
                    readonly since: "since";
                    readonly term_ends: "termEnds";
                    readonly is_officer: {
                        readonly prop: "isOfficer";
                        readonly as: "flag";
                    };
                    readonly photo_url: "photoUrl";
                    readonly bio: "bio";
                    readonly link: "linkUrl";
                    readonly url: "url";
                };
            }];
        };
    };
    readonly Membership: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "body", "joinLabel", "benefitsHeading", "note"];
        readonly links: readonly [{
            readonly label: "joinLabel";
            readonly href: "joinHref";
        }];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "membership";
            readonly lists: readonly [{
                readonly prop: "paths";
                readonly fields: {
                    readonly name: "name";
                    readonly model: "model";
                    readonly monthly_cents: {
                        readonly prop: "monthly_cents";
                        readonly as: "number";
                    };
                    readonly annual_cents: {
                        readonly prop: "annual_cents";
                        readonly as: "number";
                    };
                    readonly lifetime_cents: {
                        readonly prop: "lifetime_cents";
                        readonly as: "number";
                    };
                    readonly onetime_cents: {
                        readonly prop: "onetime_cents";
                        readonly as: "number";
                    };
                    readonly symbolic: {
                        readonly prop: "symbolic";
                        readonly as: "flag";
                    };
                    readonly benefits: {
                        readonly prop: "benefits";
                        readonly as: "strings";
                    };
                };
            }];
        };
    };
    readonly Booking: {
        readonly role: "data";
        readonly copy: readonly ["kicker", "heading", "body", "pickLabel"];
        readonly variant: "layout";
        readonly options: readonly ["anchorId"];
        readonly data: {
            readonly source: "booking";
            readonly lists: readonly [{
                readonly prop: "types";
                readonly fields: {
                    readonly name: "name";
                    readonly slug: "slug";
                    readonly description: "description";
                    readonly duration_minutes: {
                        readonly prop: "duration_minutes";
                        readonly as: "number";
                    };
                    readonly location_kind: "location_kind";
                    readonly price_cents: {
                        readonly prop: "price_cents";
                        readonly as: "number";
                    };
                    readonly url: "url";
                };
            }];
        };
    };
    readonly Classroom: {
        readonly role: "data";
        readonly copy: readonly ["heading", "kicker"];
        readonly links: readonly [];
        readonly variant: "layout";
        readonly options: readonly ["limit", "anchorId"];
        readonly hosted: readonly ["orgSlug", "siteId"];
        readonly data: {
            readonly source: "courses";
            readonly lists: readonly [{
                readonly prop: "courses";
                readonly fields: {
                    readonly slug: "slug";
                    readonly title: "title";
                    readonly summary: "summary";
                    readonly url: "url";
                    readonly hero_url: "hero_url";
                    readonly lesson_count: {
                        readonly prop: "lesson_count";
                        readonly as: "number";
                    };
                    readonly total_seconds: {
                        readonly prop: "total_seconds";
                        readonly as: "number";
                    };
                    readonly access: "access";
                    readonly locked: {
                        readonly prop: "locked";
                        readonly as: "flag";
                    };
                };
            }];
        };
    };
    readonly Course: {
        readonly role: "data";
        readonly copy: readonly [];
        readonly variant: "layout";
        readonly options: readonly ["courseSlug", "anchorId"];
    };
    readonly Lesson: {
        readonly role: "data";
        readonly copy: readonly [];
        readonly variant: "layout";
        readonly options: readonly ["courseSlug", "anchorId"];
    };
    readonly Donate: {
        readonly role: "compliance";
        readonly copy: readonly ["heading", "storyHeadline", "storyBody"];
        readonly media: readonly ["storyImageUrl"];
        readonly variant: "layout";
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly FormBlock: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly PollBlock: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly Petition: {
        readonly role: "compliance";
        readonly copy: readonly ["heading", "addressedTo", "goalNote", "volunteerPrompt"];
        readonly variant: "header";
        readonly options: readonly ["datasetPreset", "datasetArea", "badgeNoun", "uncategorizedLabel", "volunteerAsk", "recognition", "anchorId"];
        readonly data: {
            readonly source: "petition";
            readonly lists: readonly [{
                readonly prop: "asks";
                readonly fields: {
                    readonly title: "title";
                    readonly body: "body";
                };
            }, {
                readonly prop: "statTiles";
                readonly group: "tile";
                readonly fields: {
                    readonly label: "label";
                    readonly value: "value";
                    readonly note: "note";
                };
            }];
        };
        readonly hosted: readonly ["pageId"];
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly Store: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly embed: (_p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly Event: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly Calendar: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "opensOn";
        readonly embed: (_p: Props, ctx: ProjectDocumentContext) => SectionEmbed | null;
    };
    readonly SignupCapture: {
        readonly role: "compliance";
        readonly copy: readonly ["kicker", "heading", "lede"];
        readonly variant: "layout";
        readonly embed: typeof signupEmbed;
    };
    readonly SocialFrame: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "family";
    };
    readonly Advocacy: {
        readonly role: "compliance";
        readonly copy: readonly ["heading"];
        readonly variant: "layout";
        readonly embed: (p: Props, ctx: ProjectDocumentContext) => {
            iframe: null;
            script: string;
            mount: {
                'data-bg-advocacy': string;
                'data-org': string;
                'data-set': string;
            };
        } | null;
    };
};
type ContentApiBlockType = keyof typeof CONTENT_API_BLOCKS;
/**
 * The chrome blocks the Content API projects inside an area item's sections
 * only (ProjectDocumentContext.areaItem), never in a page's own `sections`:
 * an un-updated site drawing unknown types through its default section never
 * suddenly shows one there. A TakeoverBanner is its headline and pitch.
 */
declare const CONTENT_API_AREA_BLOCKS: {
    readonly TakeoverBanner: {
        readonly role: "presentational";
        readonly copy: readonly ["headline", "pitch"];
    };
};
/**
 * Each block's band and bleed when its props set neither — a copy of
 * BAND_INTRINSICS in packages/site/src/components/band.tsx (shared cannot
 * import the block library). content-api.test.ts reads that file and fails
 * when the two differ. Chrome blocks carry no band.
 */
declare const BLOCK_BAND_INTRINSICS: Record<string, {
    role: SectionBand;
    bleed: SectionBleed;
}>;
/** A data section's rows written back to the props they were read from. */
declare function dataProps(spec: ContentApiDataSpec, data: SectionData | undefined): Props;
/**
 * A baked page document as the Content API's ordered sections. Pure: the api
 * bakes the document (published snapshot, inlined synced sections, bake
 * deltas) and this only reads it. Chrome blocks and unknown types are dropped.
 */
declare function projectDocument(doc: {
    content?: unknown;
}, ctx: ProjectDocumentContext): Section[];
/**
 * The block props a presentational or data section renders from: the inverse
 * of its CONTENT_API_BLOCKS entry (copy, media, links, variant, options and
 * rows back to the props they were read from; band and bleed as the props the
 * block reads). Null for a compliance or chrome section, which renders from
 * its own props. The block's `hosted` props are not here: they never reach a
 * section. A projection made with an empty `apiOrigin` leaves asset paths as
 * authored, so its props match the block's.
 */
declare function sectionProps(section: Section): Props | null;
/**
 * The props BackGold's own renderer draws a presentational or data block
 * from: the block projected alone and read back through `sectionProps`, its
 * `hosted` props carried from the block as stored, and the block's own id
 * (none when it has none). Null for a compliance, chrome or unknown block,
 * which renders from its own props.
 */
declare function projectedBlockProps(block: {
    type: string;
    props: Props;
}, ctx: ProjectDocumentContext): Props | null;

export { type AreaItem, type Areas, type AreasResponse, type Author, type AuthorResponse, type AuthorsResponse, BLOCK_BAND_INTRINSICS, CONTENT_API_AREA_BLOCKS, CONTENT_API_BLOCKS, CONTENT_API_PREFIX, ContentAccessLevel, type ContentApiBlockRole, type ContentApiBlockSpec, type ContentApiBlockType, type ContentApiDataSpec, type ContentApiEmbedUrls, type ContentApiError, type ContentApiLegal, type ContentApiLinkSpec, type ContentApiRowField, type ContentApiRowFields, type ContentApiRowList, ContentFieldKind, type ContentTypeField, type ContentTypeSummary, type CourseDetail, type CourseLesson, type CourseProgress, type CourseResponse, type CourseSummary, type CoursesResponse, EVENTS_WINDOW_MAX_DAYS, type EntriesResponse, type Entry, type EntryAuthor, type EntryCursor, type EntryDetail, type EntryLock, type EntryRenditions, type EntryResponse, type EntryTerm, type EventDetail, type EventLiveCounts, type EventResponse, type EventTypeSummary, type EventsListRow, type EventsLiveResponse, type EventsResponse, type LessonProgressRequest, type LessonProgressResponse, type LessonResponse, type MenuItem, type MenuResponse, type MenuShowsOn, type MenuShowsOnPage, type MenuTarget, type PageResponse, type PageSummary, type PagesResponse, type ProjectDocumentContext, type RedirectsResponse, SECTION_BANDS, SECTION_BLEEDS, SECTION_LAYOUTS, SITE_CHROME_LAYOUTS, type Section, type SectionBand, type SectionBleed, type SectionData, type SectionEmbed, type SectionLayout, type SectionLayoutType, type SectionLink, type SectionLinkTarget, type SectionMedia, type SectionOption, type SectionsResponse, type SiteArea, type SiteChromeClosing, type SiteChromeLink, type SiteChromeResponse, type SiteFooterLayout, type SiteHeaderLayout, SiteMenuKey, type SiteResponse, type SiteTheme, type SiteThemeColors, type SiteThemeFont, type SiteThemeTokens, type SitemapResponse, TEMPLATE_SECTION_TYPES, type TemplateSectionType, type TermsResponse, type TypesResponse, VISITOR_COOKIE, VISITOR_HEADER, VISITOR_PROGRESS_PATH, VISITOR_RENEW_HEADER, VISITOR_RENEW_WINDOW_SECONDS, VISITOR_RETURN_PATH, VISITOR_SIGN_IN_PATH, VISITOR_SIGN_OUT_PATH, VISITOR_TOKEN_TTL_SECONDS, type Visitor, type VisitorExchangeRequest, type VisitorExchangeResponse, type VisitorResponse, contentApiEmbedUrls, dataProps, decodeEntryCursor, encodeEntryCursor, isSafeContentHref, maskSiteKey, projectDocument, projectedBlockProps, sectionProps, siteKeyKind };
