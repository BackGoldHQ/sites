import { SITE_KEY_PREFIXES, MAP_REGION_STATUSES, BACKGOLD_SURFACE_PATHS } from './chunk-H26EJR32.js';

// src/safe-href.ts
function isSafeContentHref(href) {
  if (href.startsWith("#")) return true;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

// src/map-status.ts
var MAP_ROWS_MAX_LINES = 500;
var MAP_ROWS_MAX_LINE_LEN = 200;
function parseMapStatusRows(rows) {
  const out = /* @__PURE__ */ new Map();
  if (!rows) return out;
  const lines = rows.split(/\r?\n/).slice(0, MAP_ROWS_MAX_LINES);
  for (const rawLine of lines) {
    if (rawLine.length > MAP_ROWS_MAX_LINE_LEN) continue;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0];
    const status = (parts[1] ?? "").toLowerCase();
    if (!name) continue;
    if (!MAP_REGION_STATUSES.includes(status)) continue;
    let isNew = false;
    let href;
    for (const token of parts.slice(2)) {
      if (!token) continue;
      if (token.toLowerCase() === "new") isNew = true;
      else if (href === void 0 && isSafeContentHref(token)) href = token;
    }
    out.set(name, { status, isNew, ...href ? { href } : {} });
  }
  return out;
}

// src/content-api.ts
var CONTENT_API_PREFIX = "/api/content/v1";
var EVENTS_WINDOW_MAX_DAYS = 42;
var SECTION_BANDS = ["plain", "tint", "panel", "wash", "contrast"];
var SECTION_BLEEDS = ["full", "contained"];
var SECTION_LAYOUTS = {
  // donate, video and rotating: sections batch 3 (2026-10-14), a hero with a
  // donate card beside its words, one over a looping video, and one whose
  // headline's last word cycles through its own `words` rows. portrait is the
  // candidate template's name-first hero (2026-10-15, proposed, C-1).
  Hero: ["centered", "split", "overlap", "cover", "statement", "donate", "video", "rotating", "portrait"],
  // portrait and books: the services sections (2026-10-14), a bio with its
  // credentials and a writer with their books.
  About: ["right", "left", "letter", "portrait", "books"],
  // rows and checklist: the services sections (2026-10-14), a process.
  // tabs and drawer: sections batch 3 (2026-10-14), one issue at a time and
  // each issue's plan behind a control.
  Issues: ["cards", "steps", "numbered", "rows", "checklist", "tabs", "drawer"],
  // wall: the political sections (2026-10-13), a wall of up to eight figures.
  StatCards: ["row", "ribbon", "feature", "wall"],
  Cta: ["card", "banner", "strip", "photo"],
  // logos, carousel and wall: the services sections (2026-10-14), testimonials.
  QuoteStrip: ["row", "single", "ticker", "logos", "carousel", "wall"],
  Map: ["directory", "map", "bar"],
  VideoEmbed: ["auto", "landscape", "portrait", "square"],
  PdfEmbed: ["short", "medium", "tall", "card"],
  // The political sections (2026-10-13): drawn by templates only; BackGold's
  // hosted renderer draws each as one plain section (TemplateSection.tsx).
  // jar and band: the services sections (2026-10-14), a tip jar and an end-of-post ask.
  // ladder: sections batch 3 (2026-10-14), each amount beside what it does (its `ladder` rows).
  QuickDonate: ["grid", "hero", "bar", "jar", "band", "ladder"],
  VoterTools: ["register", "polling", "dates"],
  SampleBallot: ["slate", "cards", "measures"],
  Scorecard: ["table", "grades", "promise"],
  Faq: ["accordion", "topics", "cards"],
  Comparison: ["table", "cards", "spectrum"],
  Stories: ["spotlight", "cards", "timeline"],
  // Sections batch 3 (2026-10-14): drawn by templates only, like the
  // political sections. Posts to share, and the organization's own figures.
  ShareKit: ["cards", "strip", "compact"],
  Financials: ["bars", "donut", "table"],
  // The services sections (2026-10-14): drawn by templates only, like the
  // political sections.
  Services: ["packages", "list", "compare"],
  CaseStudies: ["featured", "grid", "beforeafter"],
  Resources: ["library", "featured", "band"],
  Pathways: ["doors", "tabs", "quiz"],
  Portfolio: ["grid", "featured", "strip"],
  MediaKit: ["kit", "speaker", "press"],
  // match: the political sections (2026-10-13), a matched-gift window.
  Progress: ["bar", "ring", "compact", "match"],
  // tiles and inline: the candidate template's (2026-10-15), CONTRACT §2's proposed values.
  Countdown: ["banner", "tiles", "inline"],
  // calendar: ruling 32 (2026-10-09), a month grid beside the agenda, never in its place.
  // shifts and week: the political sections (2026-10-13), volunteer shifts and the next seven days.
  // cohorts: the services sections (2026-10-14), a course's start dates.
  // map: sections batch 3 (2026-10-14), the list beside a pin per event that has a location.
  EventsList: ["list", "cards", "agenda", "compact", "calendar", "shifts", "week", "cohorts", "map"],
  Blog: ["cards", "list", "feature"],
  // library, shelves and outline: the services sections (2026-10-14), a course catalog and a syllabus.
  Collection: ["cards", "list", "compact", "feature", "library", "shelves", "outline"],
  // player and theater: the services sections (2026-10-14), a lesson's media beside its notes.
  ContentPost: ["card", "banner", "player", "theater"],
  PlatformPlanks: ["numbered", "columns", "longread"],
  CandidateRoster: ["cards", "ballot", "compact"],
  TeamGrid: ["grid", "board", "list"],
  Membership: ["card", "tiers", "compare"],
  // The services sections (2026-10-14): the org's meeting types.
  Booking: ["cards", "list"],
  Donate: ["form", "story"],
  SignupCapture: ["card", "band", "inline"],
  FormBlock: ["card", "wide"],
  PollBlock: ["card"],
  Petition: ["none", "image", "map", "coverage"],
  Store: ["grid", "featured"],
  Event: ["detail", "card"],
  Calendar: ["month", "agenda"],
  SocialFrame: ["ring", "lower_third", "corner", "countdown"],
  Advocacy: ["full", "compact"]
};
var TEMPLATE_SECTION_TYPES = [
  "QuickDonate",
  "VoterTools",
  "SampleBallot",
  "Scorecard",
  "Membership",
  "Faq",
  "Comparison",
  "Stories",
  "ShareKit",
  "Financials",
  "Services",
  "CaseStudies",
  "Resources",
  "Pathways",
  "Portfolio",
  "MediaKit",
  "Booking"
];
var SITE_CHROME_LAYOUTS = {
  header: ["bar", "centered"],
  footer: ["columns", "closing", "compact", "giving"]
};
function siteKeyKind(key) {
  if (key.startsWith(SITE_KEY_PREFIXES.publishable)) return "publishable";
  if (key.startsWith(SITE_KEY_PREFIXES.secret)) return "secret";
  return null;
}
function maskSiteKey(last4) {
  return `${SITE_KEY_PREFIXES.secret}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${last4}`;
}
function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
function encodeEntryCursor(cursor) {
  return base64UrlEncode(`${cursor.publish_at}|${cursor.id}`);
}
function decodeEntryCursor(value) {
  if (!value || value.length > 512) return null;
  const text = base64UrlDecode(value);
  if (text === null) return null;
  const bar = text.indexOf("|");
  if (bar <= 0) return null;
  const publishAt = text.slice(0, bar);
  const id = text.slice(bar + 1);
  if (!id || id.includes("|") || Number.isNaN(Date.parse(publishAt))) return null;
  return { publish_at: publishAt, id };
}
var seg = encodeURIComponent;
function contentApiEmbedUrls(origins) {
  const api = origins.apiOrigin.replace(/\/+$/, "");
  const donor = origins.donateOrigin.replace(/\/+$/, "");
  return {
    donate: (formId) => `${donor}/embed/d/${seg(formId)}`,
    form: (pageId, blockId) => `${api}/f/${seg(pageId)}/${seg(blockId)}`,
    poll: (pageId, blockId) => `${api}/f/${seg(pageId)}/${seg(blockId)}`,
    signup: (pageId, blockId) => `${api}/embed/signup/${seg(pageId)}/${seg(blockId)}`,
    signupSection: (sectionId, blockId) => `${api}/embed/signup/section/${seg(sectionId)}/${seg(blockId)}`,
    petition: (orgSlug, slug) => `${donor}/embed/p/${seg(orgSlug)}/${seg(slug)}`,
    petitionBlock: (pageId, blockId) => `${api}/embed/petition/${seg(pageId)}/${seg(blockId)}`,
    movementMapBlock: (pageId, blockId) => `${api}/embed/movement-map/${seg(pageId)}/${seg(blockId)}`,
    event: (orgSlug, slug) => `${donor}/embed/e/${seg(orgSlug)}/${seg(slug)}`,
    events: (orgSlug) => `${api}/embed/events/${seg(orgSlug)}`,
    calendar: (orgSlug) => `${api}/embed/calendar/${seg(orgSlug)}`,
    store: (orgSlug) => `${donor}/embed/s/${seg(orgSlug)}`,
    loaderScript: `${donor}/embed.js`,
    advocacyScript: `${api}/api/advocacy-pages/embed.js`
  };
}
function str(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function list(value) {
  return Array.isArray(value) ? value.filter((v) => !!v && typeof v === "object" && !Array.isArray(v)) : [];
}
function iframeEmbed(iframe, ctx) {
  return iframe ? { iframe, script: ctx.embedUrls.loaderScript } : null;
}
function mapRegions(rows) {
  if (typeof rows !== "string") return [];
  return [...parseMapStatusRows(rows)].map(([region, s]) => ({
    region,
    status: s.status,
    url: s.href ?? null,
    is_new: s.isNew
  }));
}
function mapRows(items) {
  const lines = items.flatMap((r) => {
    const region = str(r.region);
    if (!region || !MAP_REGION_STATUSES.includes(r.status)) return [];
    const url = str(r.url);
    return [[region, r.status, ...r.is_new === true ? ["new"] : [], ...url ? [url] : []].join(", ")];
  });
  return lines.length ? { rows: lines.join("\n") } : {};
}
function progressRows(p) {
  const raised = typeof p.lastKnownRaisedCents === "number" && p.lastKnownRaisedCents > 0 ? p.lastKnownRaisedCents : 0;
  const goal = typeof p.goalCents === "number" && p.goalCents > 0 ? p.goalCents : null;
  if (raised === 0 && goal === null) return [];
  return [{ raised_cents: raised, goal_cents: goal }];
}
function eventsCap(max) {
  return typeof max === "number" && Number.isFinite(max) && max > 0 ? Math.floor(max) : 6;
}
function formTarget(p) {
  const pageId = str(p.pageId);
  const pointer = str(p.sourcePageId) && str(p.sourceBlockId);
  const blockId = pointer ? str(p.sourceBlockId) : str(p.id);
  return pageId && blockId ? { pageId, blockId } : null;
}
function signupEmbed(p, ctx) {
  if (ctx.areaSectionId) {
    const blockId = str(p.id);
    return iframeEmbed(blockId && ctx.embedUrls.signupSection(ctx.areaSectionId, blockId), ctx);
  }
  const target = formTarget(p);
  return iframeEmbed(target && ctx.embedUrls.signup(target.pageId, target.blockId), ctx);
}
var PETITION_BLOCK_HEADERS = /* @__PURE__ */ new Set(["map", "coverage"]);
function petitionEmbed(p, ctx) {
  const slug = str(p.petitionSlug);
  if (!slug) return null;
  const pageId = str(p.pageId);
  const blockId = str(p.id);
  if (typeof p.header === "string" && PETITION_BLOCK_HEADERS.has(p.header) && pageId && blockId) {
    return iframeEmbed(ctx.embedUrls.petitionBlock(pageId, blockId), ctx);
  }
  return iframeEmbed(ctx.embedUrls.petition(ctx.orgSlug, slug), ctx);
}
function movementMapEmbed(p, ctx) {
  const pageId = str(p.pageId);
  const blockId = str(p.id);
  const hasSource = !!str(p.datasetUrl) || !!str(p.datasetPreset) && !!str(p.datasetArea);
  if (!pageId || !blockId || !hasSource) return null;
  return iframeEmbed(ctx.embedUrls.movementMapBlock(pageId, blockId), ctx);
}
var HEADING_ONLY = ["heading"];
var CONTENT_API_BLOCKS = {
  // ── chrome ──
  Navbar: { role: "chrome" },
  SiteNav: { role: "chrome" },
  TakeoverBanner: { role: "chrome" },
  Footer: { role: "chrome" },
  Disclaimer: { role: "chrome" },
  // Renders nothing itself: the api inlines a placed section's blocks before
  // projecting, so a SectionRef still in the document is one that placed nothing.
  SectionRef: { role: "chrome" },
  // ── presentational ──
  // The donate card (`monthlyLabel`, `note`, `amounts`, `defaultAmount`,
  // `monthly`, read as QuickDonate reads them, its donate link the first link)
  // and the `words` rows (each a `title`, the rotating headline's last word in
  // turn) are a template's donate and rotating layouts' (sections batch 3,
  // added 2026-10-14). The hosted block draws neither. `caption` is the line
  // under the in-layout photo and `imageAlt` that photo's alt text (photoUrl's,
  // else imageUrl's); the hosted block draws both under and on its photo.
  Hero: {
    role: "presentational",
    copy: ["kicker", "headline", "subheadline", "ctaText", "secondaryText", "monthlyLabel", "note", "caption", "imageAlt"],
    media: ["imageUrl", "photoUrl", "videoUrl", "videoPosterUrl"],
    links: [
      { label: "ctaText", href: "donateHref" },
      { label: "secondaryText", href: "secondaryHref" }
    ],
    variant: "layout",
    options: ["photoTint", "photoStyle", "amounts", "defaultAmount", "monthly"],
    // The capture form is a compliance surface inside the hero: its switch and
    // its words travel with the frame (the embed), never as section fields.
    hosted: [
      "showSignup",
      "signupHeading",
      "signupButtonText",
      "campaignId",
      "pageId",
      "issue",
      "consentOrgName",
      "consentUseCase"
    ],
    // A hero with its capture on frames that form; one without has no embed.
    embed: (p, ctx) => p.showSignup === true ? signupEmbed(p, ctx) : null,
    data: { source: "words", lists: [{ prop: "words", fields: { title: "title" } }] }
  },
  // The pull quote (`quote`, `quoteSource`), the button and the credential
  // rows are a template's portrait and books layouts' (the services sections,
  // added 2026-10-14): a row's `kind` is ABOUT_CREDENTIAL_KINDS (a book's
  // `href` is where to buy it, `imageUrl` its cover). The hosted block draws
  // none of them.
  About: {
    role: "presentational",
    copy: ["kicker", "heading", "role", "signature", "body", "quote", "quoteSource", "buttonLabel"],
    media: ["photoUrl"],
    links: [{ label: "buttonLabel", href: "buttonHref" }],
    variant: "photoSide",
    options: ["photoStyle", "anchorId"],
    data: {
      source: "credentials",
      lists: [
        {
          prop: "items",
          fields: { kind: "kind", label: "label", detail: "detail", year: "year", href: "href", imageUrl: "imageUrl" }
        }
      ]
    }
  },
  // A row's `imageUrl`, `note` (a chip such as "Week 0") and `includes` are a
  // template's rows and checklist layouts' (the services sections, added
  // 2026-10-14); the hosted block draws the title, body and icon.
  Issues: {
    role: "presentational",
    copy: ["heading", "kicker", "lead"],
    links: [{ list: "ctas", label: "label", href: "href", style: "style" }],
    variant: "style",
    options: ["columns", "anchorId"],
    data: {
      source: "issues",
      lists: [
        {
          prop: "items",
          fields: {
            title: "title",
            body: "body",
            icon: "icon",
            imageUrl: "imageUrl",
            note: "note",
            includes: { prop: "includes", as: "strings" }
          }
        }
      ]
    }
  },
  StatCards: {
    role: "presentational",
    copy: ["heading"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "stats",
      lists: [{ prop: "tiles", fields: { label: "label", value: "value", note: "note", accent: { prop: "accent", as: "flag" } } }]
    }
  },
  Cta: {
    role: "presentational",
    copy: ["eyebrow", "heading", "body", "donateButtonText", "volunteerButtonText"],
    media: ["photoUrl"],
    links: [
      { label: "donateButtonText", href: "donateHref" },
      { label: "volunteerButtonText", href: "volunteerUrl" }
    ],
    variant: "layout",
    options: ["anchorId"]
  },
  // A row's `role` (the speaker's title and organization) and `logoUrl` (the
  // organization's mark) are a template's logos, carousel and wall layouts'
  // (the services sections, added 2026-10-14).
  QuoteStrip: {
    role: "presentational",
    copy: ["heading"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "quotes",
      lists: [{ prop: "items", fields: { quote: "quote", attribution: "attribution", role: "role", logoUrl: "logoUrl" } }]
    }
  },
  Map: {
    role: "presentational",
    copy: ["kicker", "heading", "litLabel", "darkLabel", "startingLabel", "charterCtaText", "organizerText"],
    // The geometry the bake resolves from geoId (an /lp-runtime asset).
    media: ["geoUrl"],
    links: [
      { label: "charterCtaText", href: "charterCtaHref" },
      { label: "organizerText", href: "organizerHref" }
    ],
    variant: "layout",
    // geoId names one of BackGold's public geography sets; regionTotal and
    // regionNoun are that set's, baked beside geoUrl.
    options: ["geoId", "focusRegion", "regionTotal", "regionNoun", "anchorId"],
    data: { source: "regions", rows: { read: (p) => mapRegions(p.rows), write: mapRows } }
  },
  // The figures and the legend travel as rows for a site to draw; the live
  // map itself — the one a visitor zooms and explores — is BackGold's, framed
  // by the page's block (`embed`) whenever the block names a data source (a
  // curated preset with an area, or a public dataset URL). The bake stamps
  // `pageId`; a block with no source has nothing to frame and no embed.
  MovementMap: {
    role: "presentational",
    copy: ["kicker", "heading", "badgeNoun", "uncategorizedLabel", "sourceLabel"],
    media: ["datasetUrl"],
    links: [{ label: "sourceLabel", href: "sourceHref" }],
    options: ["datasetPreset", "datasetArea", "categoryProperty", "centerLat", "centerLng", "zoom", "anchorId"],
    hosted: ["datasetPath", "pageId"],
    embed: (p, ctx) => movementMapEmbed(p, ctx),
    // The stat tiles as stored, then the legend's categories (`group: 'category'`).
    data: {
      source: "movement_map",
      lists: [
        { prop: "statTiles", fields: "*" },
        { prop: "categories", group: "category", fields: { value: "value", label: "label" } }
      ]
    }
  },
  VideoEmbed: {
    role: "presentational",
    copy: ["caption"],
    media: ["url", "videoUrl", "videoPosterUrl"],
    variant: "orientation",
    options: ["anchorId"]
  },
  PdfEmbed: { role: "presentational", copy: ["title", "caption"], media: ["pdfUrl"], variant: "height", options: ["anchorId"] },
  // ── the political sections (CONTRACT §2, added 2026-10-13) ──
  // Each is drawn by a template against this contract; BackGold's hosted
  // renderer draws them as one plain section. Every row field is the Puck
  // prop of the same name.
  //
  // One-tap amounts that hand the choice to the donate page (`?amount=` in
  // whole dollars, `&frequency=monthly` when the monthly switch is on). No
  // raised figures: those belong to a Progress section beside it. The
  // `ladder` rows (sections batch 3, added 2026-10-14) are the ladder
  // layout's rungs: `amount` in whole dollars and `impact`, what it does.
  QuickDonate: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "buttonLabel", "monthlyLabel", "note"],
    media: ["imageUrl"],
    links: [{ label: "buttonLabel", href: "donateHref" }],
    variant: "layout",
    // `amounts`: comma-separated whole dollars; `defaultAmount`: one of them;
    // `monthly`: offer the monthly switch.
    options: ["amounts", "defaultAmount", "monthly", "anchorId"],
    data: {
      source: "ladder",
      lists: [{ prop: "ladder", fields: { amount: { prop: "amount", as: "number" }, impact: "impact" } }]
    }
  },
  // Registration, polling place and key dates, by link to the official
  // lookups the operator names.
  VoterTools: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "registerLabel", "pollingLabel", "idNote", "earlyVoting", "electionDay", "datesHeading"],
    links: [
      { label: "registerLabel", href: "registerHref" },
      { label: "pollingLabel", href: "pollingHref" }
    ],
    variant: "layout",
    options: ["anchorId"],
    // `date` is YYYY-MM-DD.
    data: { source: "dates", lists: [{ prop: "dates", fields: { label: "label", date: "date", note: "note" } }] }
  },
  // The party's slate and its positions on ballot measures. A measure's
  // `office` is its title; `position` is set on measures only.
  SampleBallot: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "printLabel", "endorsedLabel", "measuresHeading", "note"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "ballot",
      lists: [
        {
          prop: "rows",
          // The office leads: it is the row's first words where a site draws
          // the row as a plain line (the hosted page).
          fields: {
            office: "office",
            name: "name",
            party: "party",
            region: "region",
            position: "position",
            summary: "summary",
            kind: "kind",
            href: "href",
            imageUrl: "imageUrl",
            endorsed: { prop: "endorsed", as: "flag" }
          }
        }
      ]
    }
  },
  // Recorded votes (bill, issue, vote, position, date, href), grades (name,
  // office, grade, score 0–100, imageUrl), and a record against a promise
  // (the copy, listing the rows' bills).
  Scorecard: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "sourceNote", "promiseLabel", "promise", "promiseSource", "didLabel", "did", "didDetail"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "votes",
      lists: [
        {
          prop: "rows",
          fields: {
            bill: "bill",
            issue: "issue",
            vote: "vote",
            position: "position",
            date: "date",
            href: "href",
            name: "name",
            office: "office",
            grade: "grade",
            score: { prop: "score", as: "number" },
            imageUrl: "imageUrl"
          }
        }
      ]
    }
  },
  // Questions and answers, optionally grouped by topic.
  Faq: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "contactHeading", "contactLabel"],
    links: [{ label: "contactLabel", href: "contactHref" }],
    variant: "layout",
    options: ["firstOpen", "anchorId"],
    data: { source: "faq", lists: [{ prop: "items", fields: { question: "question", answer: "answer", topic: "topic" } }] }
  },
  // Where we stand against the others: a column per labelled side, and each
  // side's place (0–100) between leftLabel and rightLabel.
  Comparison: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "usLabel", "themLabel", "them2Label", "leftLabel", "rightLabel"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "comparison",
      lists: [
        {
          prop: "rows",
          fields: {
            issue: "issue",
            us: "us",
            them: "them",
            them2: "them2",
            usAt: { prop: "usAt", as: "number" },
            themAt: { prop: "themAt", as: "number" },
            them2At: { prop: "them2At", as: "number" }
          }
        }
      ]
    }
  },
  // One featured story (the copy, photo and links) and a list of stories,
  // each with a status and a tone; on a timeline `label` is the year.
  Stories: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "label", "title", "summary", "status", "outcome", "readLabel", "watchLabel"],
    media: ["imageUrl"],
    links: [
      { label: "readLabel", href: "readHref" },
      { label: "watchLabel", href: "watchHref" }
    ],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "stories",
      lists: [
        {
          prop: "items",
          fields: { label: "label", title: "title", body: "body", status: "status", tone: "tone", imageUrl: "imageUrl", href: "href" }
        }
      ]
    }
  },
  // ── sections batch 3 (CONTRACT §2, added 2026-10-14) ──
  // Drawn by a template against this contract, like the political sections;
  // BackGold's hosted renderer draws them as one plain section.
  //
  // Posts and graphics the operator wrote for supporters to copy or share
  // from their own device: `network` is the operator's word ("X", "Text a
  // friend"), `text` the post (Copy and Share carry the text alone, any
  // address written into it), `href` where the row's link goes (the
  // network's compose page, or a page to open), `imageUrl` the graphic. No
  // counts.
  ShareKit: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "copyLabel", "shareLabel"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "share",
      lists: [{ prop: "items", fields: { network: "network", text: "text", href: "href", imageUrl: "imageUrl" } }]
    }
  },
  // The organization's own published figures, drawn as typed: each row's
  // `share` (0–100) of the year's spending and its `amount` in the operator's
  // words ("$412,000"). A site never sums, normalises or derives them. The
  // report link is the filing the figures come from.
  Financials: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "year", "sourceNote", "reportLabel"],
    links: [{ label: "reportLabel", href: "reportHref" }],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "financials",
      lists: [
        {
          prop: "rows",
          fields: { category: "category", share: { prop: "share", as: "number" }, amount: "amount", note: "note" }
        }
      ]
    }
  },
  // ── the services sections (CONTRACT §2, added 2026-10-14) ──
  // Drawn by a template against this contract, like the political sections;
  // BackGold's hosted renderer draws them as one plain section. Every row
  // field is the Puck prop of the same name, and a row's first field is the
  // words that lead it on the hosted page.
  //
  // What the organization offers and what it costs, as the operator types its
  // own price list: `price` and `term` are words ("$4,500/mo", "3-month
  // minimum"), `includes` the service's list (a compare layout makes each
  // distinct one a row), `featured` marks the one `featuredLabel` names.
  Services: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "featuredLabel", "startingLabel", "note"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "services",
      lists: [
        {
          prop: "items",
          fields: {
            name: "name",
            summary: "summary",
            price: "price",
            term: "term",
            includes: { prop: "includes", as: "strings" },
            href: "href",
            buttonLabel: "buttonLabel",
            featured: { prop: "featured", as: "flag" },
            icon: "icon"
          }
        }
      ]
    }
  },
  // Proof of results: each case's challenge, approach and result, up to three
  // figures (`metric` with `metricLabel`, and the 2 and 3 pairs; words such as
  // "$412k") and a before and after. `imageUrl` is the featured case's picture.
  CaseStudies: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "readLabel", "beforeLabel", "afterLabel", "note"],
    media: ["imageUrl"],
    links: [{ label: "readLabel", href: "readHref" }],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "cases",
      lists: [
        {
          prop: "items",
          fields: {
            title: "title",
            tag: "tag",
            challenge: "challenge",
            approach: "approach",
            result: "result",
            metric: "metric",
            metricLabel: "metricLabel",
            metric2: "metric2",
            metric2Label: "metric2Label",
            metric3: "metric3",
            metric3Label: "metric3Label",
            before: "before",
            after: "after",
            href: "href",
            imageUrl: "imageUrl"
          }
        }
      ]
    }
  },
  // Guides and downloads, free or behind an email: a `gated` row links to the
  // section's button address (a page with an email sign-up, or the file);
  // the section never asks for an email itself. `summary` lines are a
  // featured row's points.
  Resources: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "gatedLabel", "openLabel", "buttonLabel"],
    links: [{ label: "buttonLabel", href: "buttonHref" }],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "resources",
      lists: [
        {
          prop: "items",
          fields: {
            title: "title",
            kind: "kind",
            detail: "detail",
            summary: "summary",
            href: "href",
            imageUrl: "imageUrl",
            gated: { prop: "gated", as: "flag" }
          }
        }
      ]
    }
  },
  // "Which path fits you?": each pathway's programs ("Deciding to run · 45 min")
  // and the statements a visitor would say about themselves (`fits`), which a
  // quiz offers as answers and scores by pathway.
  Pathways: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "programsLabel", "quizHeading", "resultLabel", "startLabel"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "pathways",
      lists: [
        {
          prop: "items",
          fields: {
            title: "title",
            summary: "summary",
            outcome: "outcome",
            icon: "icon",
            href: "href",
            programs: { prop: "programs", as: "strings" },
            fits: { prop: "fits", as: "strings" }
          }
        }
      ]
    }
  },
  // Visual work: each piece's picture, `images` the more pictures a lightbox
  // shows, and its client, year, role and result.
  Portfolio: {
    role: "presentational",
    copy: ["kicker", "heading", "body", "clientLabel"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "work",
      lists: [
        {
          prop: "items",
          fields: {
            title: "title",
            kind: "kind",
            client: "client",
            year: "year",
            summary: "summary",
            role: "role",
            result: "result",
            imageUrl: "imageUrl",
            href: "href",
            images: { prop: "images", as: "strings" }
          }
        }
      ]
    }
  },
  // What a booker or a reporter needs: the name (`heading`), the line under
  // it (`role`), two bios, a facts line, the headshot, and rows of each
  // MEDIA_KIT_ROW_KINDS kind: downloadable assets, talks, past appearances
  // and press mentions (`outlet`, `date` YYYY-MM-DD).
  MediaKit: {
    role: "presentational",
    copy: [
      "kicker",
      "heading",
      "role",
      "shortBio",
      "longBio",
      "facts",
      "talksHeading",
      "bookLabel",
      "contactHeading",
      "contactLine",
      "kitLabel"
    ],
    media: ["imageUrl"],
    links: [
      { label: "bookLabel", href: "bookHref" },
      { label: "kitLabel", href: "kitHref" }
    ],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "mediakit",
      lists: [
        {
          prop: "items",
          fields: {
            title: "title",
            kind: "kind",
            detail: "detail",
            outlet: "outlet",
            date: "date",
            href: "href",
            imageUrl: "imageUrl"
          }
        }
      ]
    }
  },
  // ── data-bound ──
  // The raised and goal figures the hosted page shows; never the campaign or
  // fund the money is counted against. The kicker, heading, button and the
  // match window (`matchMultiplier` 2–10, `matchUntil` an ISO date-time) are
  // a template's to draw; the hosted block draws the bar for every layout.
  Progress: {
    role: "data",
    copy: ["kicker", "heading", "buttonLabel"],
    links: [{ label: "buttonLabel", href: "donateHref" }],
    variant: "layout",
    options: ["matchMultiplier", "matchUntil", "anchorId"],
    hosted: ["campaignId", "fundDesignationId"],
    data: {
      source: "progress",
      rows: {
        read: progressRows,
        write: ([row]) => row ? {
          lastKnownRaisedCents: row.raised_cents,
          ...typeof row.goal_cents === "number" ? { goalCents: row.goal_cents } : {}
        } : {}
      }
    }
  },
  Countdown: {
    role: "data",
    copy: ["eyebrow", "heading", "body", "linkText"],
    links: [{ label: "linkText", href: "linkHref" }],
    variant: "layout",
    options: ["source", "anchorId"],
    data: {
      source: "countdown",
      rows: {
        read: (p) => str(p.deadline) ? [{ deadline: p.deadline }] : [],
        // No row is a Countdown not configured yet: the renderer's `deadline: ''`.
        write: ([row]) => ({ deadline: row ? row.deadline : "" })
      }
    }
  },
  // Live rows (supporter names and amounts) are fetched by the page at run
  // time and are never projected.
  Leaderboard: {
    role: "data",
    copy: HEADING_ONLY,
    options: ["limit", "anchorId"],
    hosted: ["campaignId"],
    data: { source: "leaderboard" }
  },
  SocialFeed: {
    role: "data",
    copy: HEADING_ONLY,
    options: ["maxPosts", "anchorId"],
    hosted: ["campaignId"],
    data: { source: "social_feed" }
  },
  MovementTicker: {
    role: "data",
    copy: HEADING_ONLY,
    options: ["kinds", "showTotal", "anchorId"],
    hosted: ["orgSlug", "petitionSlug", "eventSlug"],
    data: { source: "movement", lists: [{ prop: "statTiles", fields: { value: "value", label: "label" } }] }
  },
  // The org's upcoming events as the bake listed them, as many as the block
  // shows (its `max`). Each row links to the event's own page, which is where
  // an RSVP happens; the events-list frame is offered too, for a partner that
  // would rather embed the list. `timezone` is the event's own zone (IANA),
  // null when it has none: the hosted block shows the time in that zone.
  // `actions` ('link' or 'buttons') is how each row offers the event, an
  // option; the section's variant is its `layout`. The "All events" link
  // (allLabel, allHref) goes to the org's events index.
  // `sells_tickets` is true when the event has a live paid ticket type and its
  // registration is open as of the bake; `tickets_url` is then the event's own
  // page (the row's `url`), null otherwise. Seats left are live, never baked:
  // GET /events/live. `lat` and `lng` (sections batch 3, added 2026-10-14) are
  // the event's pinned location, null without one: a template's map layout
  // pins the rows that carry them.
  EventsList: {
    role: "data",
    copy: ["kicker", "heading", "allLabel", "eventsEmptyCta"],
    links: [{ label: "allLabel", href: "allHref" }],
    variant: "layout",
    options: ["max", "actions", "anchorId"],
    data: {
      source: "events",
      cap: (p) => eventsCap(p.max),
      lists: [
        {
          prop: "events",
          fields: {
            id: "id",
            title: "title",
            starts_at: "startsAt",
            ends_at: "endsAt",
            timezone: "timezone",
            location: "location",
            is_virtual: { prop: "isVirtual", as: "flag" },
            type: "type",
            registration_closed: { prop: "registrationClosed", as: "flag" },
            url: "href",
            sells_tickets: { prop: "sellsTickets", as: "flag" },
            tickets_url: "ticketsHref",
            lat: { prop: "lat", as: "number" },
            lng: { prop: "lng", as: "number" }
          }
        }
      ]
    },
    embed: (_p, ctx) => iframeEmbed(ctx.embedUrls.events(ctx.orgSlug), ctx)
  },
  // The list is fetched by the page at run time; /entries serves it.
  Blog: {
    role: "data",
    copy: ["kicker", "heading", "allLabel"],
    links: [{ label: "allLabel", href: "allHref" }],
    variant: "layout",
    options: ["kindFilter", "maxItems"],
    hosted: ["orgSlug", "siteId", "blogBase"],
    data: { source: "blog" }
  },
  Collection: {
    role: "data",
    copy: ["heading", "pluralLabel"],
    // The block's "See all" link to the type's index, labelled by the type.
    links: [{ label: "pluralLabel", href: "moreHref" }],
    variant: "layout",
    // `type` is the content type's key and `term` a term's slug: both public.
    options: ["type", "term", "limit", "anchorId"],
    hosted: ["orgSlug", "siteId"],
    data: {
      source: (p) => `entries/${str(p.type) ?? "post"}`,
      lists: [
        {
          prop: "entries",
          fields: {
            slug: "slug",
            title: "title",
            summary: "summary",
            url: "href",
            image_url: "hero_url",
            publish_at: "publish_at",
            terms: { prop: "terms", rows: { label: "label" } },
            authors: { prop: "authors", rows: { name: "name", role: "role_label" } }
          }
        }
      ]
    }
  },
  // `postHtml` is the entry body the bake renders from its markdown with raw
  // HTML off: authored prose, safe as is. The row's `media_url` is the piece's
  // own media (a podcast's audio, a vlog's video link; https) with
  // `media_kind` (CONTENT_POST_MEDIA_KINDS) saying which, and `image_url` its
  // hero picture; each null when the piece has none. The links (`links`, under
  // `linksHeading`) and `notesLabel` are a template's player and theater
  // layouts' (the services sections, added 2026-10-14): a lesson's outline or
  // resources beside its notes. The hosted block draws the piece as prose.
  ContentPost: {
    role: "data",
    copy: ["heading", "postHtml", "notesLabel", "linksHeading"],
    links: [{ list: "links", label: "label", href: "href" }],
    variant: "layout",
    options: ["showTitle", "showDate", "anchorId"],
    data: {
      source: "entry",
      rows: {
        read: (p) => str(p.postTitle) ? [
          {
            slug: str(p.contentSlug),
            title: p.postTitle,
            kind: str(p.postKind),
            date: str(p.postDate),
            media_url: str(p.postMediaUrl),
            media_kind: str(p.postMediaKind),
            image_url: str(p.postImageUrl)
          }
        ] : [],
        write: ([row]) => row ? Object.fromEntries(
          [
            ["contentSlug", row.slug],
            ["postTitle", row.title],
            ["postKind", row.kind],
            ["postDate", row.date],
            ["postMediaUrl", row.media_url],
            ["postMediaKind", row.media_kind],
            ["postImageUrl", row.image_url]
          ].filter(([, v]) => typeof v === "string")
        ) : {}
      }
    }
  },
  // `num` is the number the hosted block prints: the section's own, else its
  // place, two digits. pdfLabel and pdfHref link the whole platform as a file.
  PlatformPlanks: {
    role: "data",
    copy: ["kicker", "heading", "pdfLabel"],
    links: [{ label: "pdfLabel", href: "pdfHref" }],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "platform",
      lists: [
        {
          prop: "sections",
          fields: {
            num: { prop: "num", fallback: (i) => String(i + 1).padStart(2, "0") },
            title: "title",
            ethos: "ethos",
            icon: "icon",
            planks: { prop: "planks", rows: { headline: "headline", plain: "plain", full: "full" } }
          }
        }
      ]
    }
  },
  // The org's approved candidates as the bake listed them (api
  // lib/public-candidates.ts), each with the headshot the hosted card shows.
  // `endorsed` (sections batch 3, added 2026-10-14) is the template's
  // endorsement chip; the bake writes it from no record yet, so every
  // baked row reads false until the candidate record carries an endorsement.
  CandidateRoster: {
    role: "data",
    copy: ["kicker", "heading", "allLabel", "candidatesEmptyCta"],
    links: [{ label: "allLabel", href: "allHref" }],
    variant: "layout",
    options: ["showFilters", "cycleYear", "anchorId"],
    data: {
      source: "candidates",
      lists: [
        {
          prop: "entries",
          fields: {
            name: "name",
            office: "office",
            level: "level",
            region: "region",
            issues: { prop: "issues", as: "strings" },
            status: "status",
            donate_url: "donateUrl",
            web_url: "webUrl",
            image_url: "photoUrl",
            endorsed: { prop: "endorsed", as: "flag" }
          }
        }
      ]
    }
  },
  // The party's people as the bake listed them (api landing-pages-ssr.ts and
  // lib/team-roster.ts): `exec` and `staff` the team_member entries by group,
  // `open` the open roles, `roster` the seats on the party's bodies with their
  // current holders (an open seat has a null name), officers first in each
  // body, then the team members with no seat under body "Staff".
  TeamGrid: {
    role: "data",
    copy: ["heading", "teamOpenRolesIntro", "interestButtonText"],
    links: [{ label: "interestButtonText", href: "interestUrl" }],
    variant: "layout",
    options: ["showOpenRoles", "anchorId"],
    hosted: ["campaignId", "pageId"],
    data: {
      source: "team",
      lists: [
        {
          prop: "exec",
          group: "exec",
          fields: { name: "name", role: "role", bio: "bio", image_url: "photoUrl", link_url: "linkUrl" }
        },
        {
          prop: "staff",
          group: "staff",
          fields: { name: "name", role: "role", dept: "dept", image_url: "photoUrl", link_url: "linkUrl" }
        },
        { prop: "open", group: "open", fields: { role: "role", dept: "dept", blurb: "blurb", link_url: "linkUrl" } },
        {
          prop: "roster",
          group: "roster",
          fields: {
            body: "body",
            body_key: "bodyKey",
            seat: "seat",
            name: "name",
            since: "since",
            term_ends: "termEnds",
            is_officer: { prop: "isOfficer", as: "flag" },
            photo_url: "photoUrl",
            bio: "bio",
            link: "linkUrl",
            url: "url"
          }
        }
      ]
    }
  },
  // The org's membership program as the bake lists it (CONTRACT §2, added
  // 2026-10-13; api lib/membership-offers.ts): one row per offer the org's
  // join page sells — each tier of a tiered program in the operator's order,
  // else one row. `model` is the program's (MEMBERSHIP_MODELS) on every row;
  // `name` the tier's or the single plan's, null for donation and free. Each
  // `<cadence>_cents` is what the join page charges that row at that cadence
  // (a donation program's minimum), null where the row is not sold at it; a
  // free program's one row has every amount null. `symbolic` marks a tier
  // whose price carries a meaning; `benefits` is the program's list on every
  // row. No rows when the org has no program on. The join link goes to the
  // org's join page.
  Membership: {
    role: "data",
    copy: ["kicker", "heading", "body", "joinLabel", "benefitsHeading", "note"],
    links: [{ label: "joinLabel", href: "joinHref" }],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "membership",
      lists: [
        {
          prop: "paths",
          fields: {
            name: "name",
            model: "model",
            monthly_cents: { prop: "monthly_cents", as: "number" },
            annual_cents: { prop: "annual_cents", as: "number" },
            lifetime_cents: { prop: "lifetime_cents", as: "number" },
            onetime_cents: { prop: "onetime_cents", as: "number" },
            symbolic: { prop: "symbolic", as: "flag" },
            benefits: { prop: "benefits", as: "strings" }
          }
        }
      ]
    }
  },
  // The org's meeting types as its booking module offers them (CONTRACT §2,
  // added 2026-10-14, the services sections): one row per active booking event
  // type the bake lists, `duration_minutes` its length, `location_kind` where
  // it happens (BOOKING_LOCATION_TYPES), `price_cents` what it costs (0 free,
  // null when the type names no price) and `url` the type's public booking
  // page, where the time is picked. No rows when the org offers none. The
  // section never draws a slot picker or a form.
  Booking: {
    role: "data",
    copy: ["kicker", "heading", "body", "pickLabel"],
    variant: "layout",
    options: ["anchorId"],
    data: {
      source: "booking",
      lists: [
        {
          prop: "types",
          fields: {
            name: "name",
            slug: "slug",
            description: "description",
            duration_minutes: { prop: "duration_minutes", as: "number" },
            location_kind: "location_kind",
            price_cents: { prop: "price_cents", as: "number" },
            url: "url"
          }
        }
      ]
    }
  },
  // ── compliance ──
  // Each BackGold module's `layout` is how the frame around it is arranged
  // (CONTRACT §2): the module's fields, limits and consent never change with it.
  // The story layout's words and picture are the frame's, not the module's:
  // a site draws them beside the checkout (board A8).
  Donate: {
    role: "compliance",
    copy: ["heading", "storyHeadline", "storyBody"],
    media: ["storyImageUrl"],
    variant: "layout",
    embed: (p, ctx) => iframeEmbed(str(p.donationFormId) && ctx.embedUrls.donate(p.donationFormId), ctx)
  },
  FormBlock: {
    role: "compliance",
    copy: HEADING_ONLY,
    variant: "layout",
    embed: (p, ctx) => {
      const target = formTarget(p);
      return iframeEmbed(target && ctx.embedUrls.form(target.pageId, target.blockId), ctx);
    }
  },
  PollBlock: {
    role: "compliance",
    copy: HEADING_ONLY,
    variant: "layout",
    embed: (p, ctx) => {
      const target = formTarget(p);
      return iframeEmbed(target && ctx.embedUrls.poll(target.pageId, target.blockId), ctx);
    }
  },
  // Under the plain and image headers the frame is the petition's own (the
  // record carries everything it draws). Under the map and coverage headers
  // the band is the BLOCK's — its data source and legend, asks, goal note and
  // stat tiles, or its county coverage rows — so the frame is addressed by
  // the page's block (the bake stamps `pageId`), the way a form's is, and
  // draws the hosted sheet with that band.
  // The petition's own words, switches and lists frame the sign sheet: the
  // asks, then the stat tiles (`group: 'tile'`), a tile's value a typed figure
  // or `auto:total` / `auto:signatures` / `auto:category:<value>`. The
  // bring-your-own dataset URL and the petition picked stay in the block.
  Petition: {
    role: "compliance",
    copy: ["heading", "addressedTo", "goalNote", "volunteerPrompt"],
    variant: "header",
    options: ["datasetPreset", "datasetArea", "badgeNoun", "uncategorizedLabel", "volunteerAsk", "recognition", "anchorId"],
    data: {
      source: "petition",
      lists: [
        { prop: "asks", fields: { title: "title", body: "body" } },
        { prop: "statTiles", group: "tile", fields: { label: "label", value: "value", note: "note" } }
      ]
    },
    hosted: ["pageId"],
    embed: (p, ctx) => petitionEmbed(p, ctx)
  },
  Store: { role: "compliance", copy: HEADING_ONLY, variant: "layout", embed: (_p, ctx) => iframeEmbed(ctx.embedUrls.store(ctx.orgSlug), ctx) },
  // An event the bake could not resolve (unpublished, gated, over) renders
  // nothing on the hosted page — no `eventName` — and has no embed.
  Event: {
    role: "compliance",
    copy: HEADING_ONLY,
    variant: "layout",
    embed: (p, ctx) => iframeEmbed(
      str(p.eventSlug) && str(p.eventName) && ctx.embedUrls.event(ctx.orgSlug, p.eventSlug.trim()),
      ctx
    )
  },
  Calendar: {
    role: "compliance",
    copy: HEADING_ONLY,
    variant: "opensOn",
    embed: (_p, ctx) => iframeEmbed(ctx.embedUrls.calendar(ctx.orgSlug), ctx)
  },
  // The capture form is framed (`/embed/signup`); the section carries the
  // words a site draws beside it (kicker, heading, lede), and the frame shows
  // the rest, ZIP or no ZIP as the block's `collectZip` says.
  SignupCapture: {
    role: "compliance",
    copy: ["kicker", "heading", "lede"],
    variant: "layout",
    embed: signupEmbed
  },
  // No embeddable surface exists for this one: a partner site gets the
  // section's place, heading and band, and nothing it could rebuild it from.
  SocialFrame: { role: "compliance", copy: HEADING_ONLY, variant: "family" },
  Advocacy: {
    role: "compliance",
    copy: HEADING_ONLY,
    variant: "layout",
    embed: (p, ctx) => {
      const set = str(p.setSlug);
      if (!set) return null;
      return {
        iframe: null,
        script: ctx.embedUrls.advocacyScript,
        mount: { "data-bg-advocacy": "", "data-org": ctx.orgSlug, "data-set": set }
      };
    }
  }
};
var CONTENT_API_AREA_BLOCKS = {
  TakeoverBanner: { role: "presentational", copy: ["headline", "pitch"] }
};
var BLOCK_BAND_INTRINSICS = {
  Hero: { role: "plain", bleed: "full" },
  About: { role: "plain", bleed: "full" },
  QuoteStrip: { role: "plain", bleed: "full" },
  Blog: { role: "plain", bleed: "full" },
  ContentPost: { role: "plain", bleed: "full" },
  Collection: { role: "plain", bleed: "full" },
  Event: { role: "plain", bleed: "full" },
  EventsList: { role: "plain", bleed: "full" },
  Calendar: { role: "plain", bleed: "full" },
  CandidateRoster: { role: "plain", bleed: "full" },
  PlatformPlanks: { role: "plain", bleed: "full" },
  TeamGrid: { role: "plain", bleed: "full" },
  StatCards: { role: "plain", bleed: "full" },
  FormBlock: { role: "plain", bleed: "full" },
  PollBlock: { role: "plain", bleed: "full" },
  SignupCapture: { role: "plain", bleed: "full" },
  SocialFrame: { role: "plain", bleed: "full" },
  VideoEmbed: { role: "plain", bleed: "full" },
  PdfEmbed: { role: "plain", bleed: "full" },
  Advocacy: { role: "plain", bleed: "full" },
  Store: { role: "plain", bleed: "full" },
  Map: { role: "plain", bleed: "full" },
  Petition: { role: "plain", bleed: "full" },
  QuickDonate: { role: "plain", bleed: "full" },
  VoterTools: { role: "plain", bleed: "full" },
  SampleBallot: { role: "plain", bleed: "full" },
  Scorecard: { role: "plain", bleed: "full" },
  Membership: { role: "plain", bleed: "full" },
  Faq: { role: "plain", bleed: "full" },
  Comparison: { role: "plain", bleed: "full" },
  Stories: { role: "plain", bleed: "full" },
  ShareKit: { role: "plain", bleed: "full" },
  Financials: { role: "plain", bleed: "full" },
  Services: { role: "plain", bleed: "full" },
  CaseStudies: { role: "plain", bleed: "full" },
  Resources: { role: "plain", bleed: "full" },
  Pathways: { role: "plain", bleed: "full" },
  Portfolio: { role: "plain", bleed: "full" },
  MediaKit: { role: "plain", bleed: "full" },
  Booking: { role: "plain", bleed: "full" },
  Issues: { role: "panel", bleed: "full" },
  Donate: { role: "panel", bleed: "full" },
  Leaderboard: { role: "panel", bleed: "full" },
  SocialFeed: { role: "panel", bleed: "full" },
  Progress: { role: "panel", bleed: "full" },
  Countdown: { role: "contrast", bleed: "full" },
  MovementMap: { role: "contrast", bleed: "full" },
  Cta: { role: "contrast", bleed: "contained" },
  MovementTicker: { role: "contrast", bleed: "contained" },
  SectionRef: { role: "plain", bleed: "full" }
};
var PRIVATE_KEY_RE = /email|phone|address|street|zip/i;
var PRIVATE_VALUE_RE = /^\s*(mailto|tel|sms):/i;
var ASSET_PATH_RE = /^\/(?:api\/(?:lp-assets|media-files)|lp-runtime)\//;
function absoluteAsset(url, ctx) {
  return ASSET_PATH_RE.test(url) ? `${ctx.apiOrigin.replace(/\/+$/, "")}${url}` : url;
}
function scrub(value, ctx) {
  if (typeof value === "string") return PRIVATE_VALUE_RE.test(value) ? null : absoluteAsset(value, ctx);
  if (Array.isArray(value)) return value.map((v) => scrub(v, ctx));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (PRIVATE_KEY_RE.test(key)) continue;
      out[key] = scrub(v, ctx);
    }
    return out;
  }
  return value;
}
function linkOf(label, href, ctx) {
  if (href.startsWith("#")) {
    return { label, target: { kind: "section", anchor: href.slice(1) }, url: href };
  }
  let path = href.startsWith("/") && !href.startsWith("//") ? href : null;
  let written = null;
  if (path === null) {
    try {
      const url = new URL(href);
      const site = new URL(ctx.siteUrl);
      if (url.host === site.host && (url.protocol === "https:" || url.protocol === "http:")) {
        path = `${url.pathname}${url.search}${url.hash}`;
        written = { url: href };
      }
    } catch {
    }
  }
  if (path === null) return { label, target: { kind: "external", url: href }, url: href };
  const slug = path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  const first = slug.split("/")[0];
  if (BACKGOLD_SURFACE_PATHS.includes(first)) {
    const surface = first;
    const target = { kind: "surface", surface, path, ...written };
    const resolved = slug === first ? ctx.surfaceUrls?.[surface] : void 0;
    if (resolved) {
      const at = path.search(/[?#]/);
      const tail = at < 0 ? "" : path.slice(at);
      const url = tail.startsWith("?") && resolved.includes("?") ? `${resolved}&${tail.slice(1)}` : `${resolved}${tail}`;
      return { label, target, url };
    }
    const host = (ctx.orgHostUrl ?? ctx.siteUrl).replace(/\/+$/, "");
    return { label, target, url: `${host}${path}` };
  }
  return { label, target: { kind: "page", slug, ...written }, url: path };
}
function hrefOf(link) {
  const { target } = link;
  if (target.kind === "external") return target.url ?? link.url;
  if (target.kind === "surface") return target.url ?? target.path ?? link.url;
  if (target.kind === "page") return target.url ?? link.url;
  return link.url;
}
function linksOf(spec, props, ctx) {
  const out = [];
  for (const l of spec.links ?? []) {
    const rows = l.list ? list(props[l.list]) : [props];
    for (const row of rows) {
      const label = str(row[l.label]);
      const href = str(row[l.href]);
      if (!label || !href || !isSafeContentHref(href)) continue;
      const link = linkOf(label, href, ctx);
      const style = l.style ? str(row[l.style]) : null;
      out.push(style ? { ...link, style } : link);
    }
  }
  return out;
}
function isBand(value) {
  return typeof value === "string" && SECTION_BANDS.includes(value);
}
function isBleed(value) {
  return typeof value === "string" && SECTION_BLEEDS.includes(value);
}
function isOption(value) {
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}
function readField(field, entry, index) {
  if (typeof field === "string") return str(entry[field]);
  const value = entry[field.prop];
  if ("as" in field) {
    if (field.as === "flag") return value === true;
    if (field.as === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  }
  if ("fallback" in field) return str(value) ?? field.fallback(index);
  return list(value).map((e, i) => readRow(field.rows, e, i));
}
function readRow(fields, entry, index) {
  const row = {};
  for (const [key, field] of Object.entries(fields)) row[key] = readField(field, entry, index);
  return row;
}
function writeRow(fields, row) {
  const entry = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = row[key];
    if (typeof field === "string") {
      if (typeof value === "string") entry[field] = value;
    } else if ("rows" in field) {
      if (Array.isArray(value)) entry[field.prop] = list(value).map((r) => writeRow(field.rows, r));
    } else if (value !== null && value !== void 0) {
      entry[field.prop] = value;
    }
  }
  return entry;
}
function dataOf(spec, props) {
  const source = typeof spec.source === "function" ? spec.source(props) : spec.source;
  const items = spec.rows ? spec.rows.read(props) : [];
  for (const l of spec.lists ?? []) {
    list(props[l.prop]).forEach((entry, i) => {
      const row = l.fields === "*" ? entry : readRow(l.fields, entry, i);
      items.push(l.group ? { group: l.group, ...row } : row);
    });
  }
  return { source, items: spec.cap ? items.slice(0, spec.cap(props)) : items };
}
function dataProps(spec, data) {
  const items = list(data?.items);
  const props = spec.rows ? spec.rows.write(items) : {};
  for (const l of spec.lists ?? []) {
    const rows = items.filter((row) => l.group ? row.group === l.group : row.group === void 0).map((row) => {
      if (l.fields === "*") return row;
      const { group: _group, ...rest } = row;
      return writeRow(l.fields, rest);
    });
    props[l.prop] = rows;
  }
  return props;
}
function projectDocument(doc, ctx) {
  const content = Array.isArray(doc.content) ? doc.content : [];
  const refByBlock = /* @__PURE__ */ new Map();
  for (const ref of ctx.sectionRefs ?? []) {
    for (const id of ref.blockIds) refByBlock.set(id, { key: ref.key, label: ref.label });
  }
  const sections = [];
  content.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const type = entry.type;
    if (typeof type !== "string" || !Object.hasOwn(CONTENT_API_BLOCKS, type)) return;
    let spec = CONTENT_API_BLOCKS[type];
    if (spec.role === "chrome") {
      if (!ctx.areaItem || !Object.hasOwn(CONTENT_API_AREA_BLOCKS, type)) return;
      spec = CONTENT_API_AREA_BLOCKS[type];
    }
    const rawProps = entry.props;
    const props = rawProps && typeof rawProps === "object" ? rawProps : {};
    const compliance = spec.role === "compliance";
    const id = str(props.id) ?? `${type}-${index + 1}`;
    const intrinsic = BLOCK_BAND_INTRINSICS[type] ?? { role: "plain", bleed: "full" };
    const copy = {};
    for (const key of spec.copy ?? []) {
      const value = props[key];
      if (compliance ? str(value) : typeof value === "string") copy[key] = value;
    }
    const media = {};
    for (const key of spec.media ?? []) {
      const value = str(props[key]);
      if (value) media[key] = { url: absoluteAsset(value, ctx) };
    }
    const options = {};
    for (const key of spec.options ?? []) {
      const value = props[key];
      if (isOption(value)) options[key] = value;
    }
    const section = {
      id,
      type,
      band: isBand(props.band) ? props.band : intrinsic.role,
      bleed: isBleed(props.bleed) ? props.bleed : intrinsic.bleed,
      variant: spec.variant ? str(props[spec.variant]) : null,
      copy,
      media,
      links: compliance ? [] : linksOf(spec, props, ctx),
      options
    };
    if (spec.data) {
      const data = dataOf(spec.data, props);
      section.data = ctx.audience === "hosted" ? data : { source: data.source, items: data.items.map((item) => scrub(item, ctx)) };
    }
    if (spec.embed) {
      const embed = spec.embed(props, ctx);
      if (embed) section.embed = embed;
    }
    const ref = refByBlock.get(id);
    if (ref) section.section_ref = ref;
    sections.push(section);
  });
  return sections;
}
function sectionProps(section) {
  if (!Object.hasOwn(CONTENT_API_BLOCKS, section.type)) return null;
  const spec = CONTENT_API_BLOCKS[section.type];
  if (spec.role !== "presentational" && spec.role !== "data") return null;
  const props = { id: section.id, band: section.band, bleed: section.bleed };
  for (const key of spec.copy ?? []) {
    if (Object.hasOwn(section.copy, key)) props[key] = section.copy[key];
  }
  for (const key of spec.media ?? []) {
    const media = section.media[key];
    if (media) props[key] = media.url;
  }
  if (spec.variant && section.variant !== null) props[spec.variant] = section.variant;
  const options = section.options ?? {};
  for (const key of spec.options ?? []) {
    if (Object.hasOwn(options, key)) props[key] = options[key];
  }
  let at = 0;
  for (const l of spec.links ?? []) {
    if (l.list) {
      props[l.list] = section.links.slice(at).map((link2) => ({
        [l.label]: link2.label,
        [l.href]: hrefOf(link2),
        ...l.style && link2.style !== void 0 ? { [l.style]: link2.style } : {}
      }));
      at = section.links.length;
      continue;
    }
    const link = section.links[at];
    if (link && link.label === props[l.label]) {
      props[l.href] = hrefOf(link);
      at += 1;
    }
  }
  if (spec.data) Object.assign(props, dataProps(spec.data, section.data));
  return props;
}
function projectedBlockProps(block, ctx) {
  const [section] = projectDocument({ content: [block] }, ctx);
  const props = section ? sectionProps(section) : null;
  if (!props) return null;
  const spec = CONTENT_API_BLOCKS[block.type];
  for (const key of spec.hosted ?? []) {
    if (Object.hasOwn(block.props, key)) props[key] = block.props[key];
  }
  if (Object.hasOwn(block.props, "id")) props.id = block.props.id;
  else delete props.id;
  return props;
}

export { BLOCK_BAND_INTRINSICS, CONTENT_API_AREA_BLOCKS, CONTENT_API_BLOCKS, CONTENT_API_PREFIX, EVENTS_WINDOW_MAX_DAYS, SECTION_BANDS, SECTION_BLEEDS, SECTION_LAYOUTS, SITE_CHROME_LAYOUTS, TEMPLATE_SECTION_TYPES, contentApiEmbedUrls, dataProps, decodeEntryCursor, encodeEntryCursor, isSafeContentHref, maskSiteKey, projectDocument, projectedBlockProps, sectionProps, siteKeyKind };
