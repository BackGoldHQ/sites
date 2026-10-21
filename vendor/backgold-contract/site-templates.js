<<<<<<< HEAD
import { SECTION_BLEEDS, SECTION_BANDS, SITE_CHROME_LAYOUTS } from './chunk-3KB7ZRTE.js';
import { SITE_AREA_KEY_RE, SITE_NAV_SHOWS_ON, SITE_NAV_ITEM_TYPES, SITE_PAGE_MODULE_KINDS, SITE_SECTION_RULE_SHOWS_ON, SITE_SECTION_KINDS, BUILT_IN_CONTENT_TYPE_KEYS, TEMPLATE_KEY_PATTERN } from './chunk-LK52PNGL.js';
=======
import { SECTION_BLEEDS, SECTION_BANDS, SITE_CHROME_LAYOUTS } from './chunk-6L74ALML.js';
import { SITE_AREA_KEY_RE, SITE_NAV_SHOWS_ON, SITE_NAV_ITEM_TYPES, SITE_PAGE_MODULE_KINDS, SITE_SECTION_RULE_SHOWS_ON, SITE_SECTION_KINDS, BUILT_IN_CONTENT_TYPE_KEYS, TEMPLATE_KEY_PATTERN } from './chunk-XH5WEM3Q.js';
>>>>>>> 373ef2c (The kit's ContentPost reads the whole post in place as its Prose layout; the candidate template draws it by default)
import { z } from 'zod';

var SITE_TEMPLATE_KEYS = ["party", "candidate", "petition-drive", "academy", "nonprofit", "unlabeled"];
var HIDDEN_SITE_TEMPLATE_AUDIENCE = "hidden";
var name = z.string().trim().min(1).max(120);
var layoutName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
var slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$|^$/, "a page slug (lower case, words joined by -; empty for home)");
var areaKey = z.string().regex(SITE_AREA_KEY_RE);
var SITE_TEMPLATE_AUTHORED_DATA_SOURCES = [
  "issues",
  "stats",
  "quotes",
  "platform",
  "dates",
  "ballot",
  "votes",
  "faq",
  "comparison",
  "stories",
  "services",
  "cases",
  "resources",
  "pathways",
  "work",
  "mediakit",
  "credentials",
  // Sections batch 3 (2026-10-14): the Hero's rotating words, QuickDonate's
  // impact ladder, ShareKit's posts and Financials' figures.
  "words",
  "ladder",
  "share",
  "financials",
  // The petition-drive template (2026-10-15): the asks and the typed stat tiles.
  "petition"
];
var SITE_TEMPLATE_AUTHORED_DATA = {
  Issues: "issues",
  StatCards: "stats",
  QuoteStrip: "quotes",
  PlatformPlanks: "platform",
  VoterTools: "dates",
  SampleBallot: "ballot",
  Scorecard: "votes",
  Faq: "faq",
  Comparison: "comparison",
  Stories: "stories",
  Services: "services",
  CaseStudies: "cases",
  Resources: "resources",
  Pathways: "pathways",
  Portfolio: "work",
  MediaKit: "mediakit",
  About: "credentials",
  Hero: "words",
  QuickDonate: "ladder",
  ShareKit: "share",
  Financials: "financials",
  Petition: "petition"
};
var starterSectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().regex(/^[A-Z][A-Za-z]{0,39}$/),
  band: z.enum(SECTION_BANDS),
  bleed: z.enum(SECTION_BLEEDS),
  variant: layoutName.nullable(),
  copy: z.record(z.string(), z.string()),
  media: z.record(z.string(), z.object({ url: z.string(), alt: z.string().optional() })),
  links: z.array(
    z.object({
      label: z.string(),
      target: z.object({
        kind: z.enum(["page", "section", "external", "surface"]),
        slug: z.string().optional(),
        anchor: z.string().optional(),
        url: z.string().optional(),
        path: z.string().optional()
      }),
      url: z.string(),
      style: z.string().optional()
    })
  ),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  data: z.object({
    source: z.enum(SITE_TEMPLATE_AUTHORED_DATA_SOURCES),
    items: z.array(z.record(z.string(), z.unknown())).min(1).max(20)
  }).optional()
}).superRefine((section, ctx) => {
  if (!section.data) return;
  const own = Object.hasOwn(SITE_TEMPLATE_AUTHORED_DATA, section.type) ? SITE_TEMPLATE_AUTHORED_DATA[section.type] : void 0;
  if (section.data.source !== own) {
    ctx.addIssue({
      code: "custom",
      path: ["data", "source"],
      message: own ? `a ${section.type} section's rows are '${own}'` : `a ${section.type} section's rows are BackGold's to fill, never starter content`
    });
  }
});
var starterPageSchema = z.object({
  slug,
  title: name,
  sections: z.array(starterSectionSchema)
});
var starterShowsOnSchema = z.union([
  z.object({ rule: z.enum(SITE_NAV_SHOWS_ON).extract(["every_page", "donation_pages"]) }),
  z.object({ rule: z.enum(SITE_NAV_SHOWS_ON).extract(["only_pages", "except_pages"]), pages: z.array(slug).min(1) })
]);
var starterMenuItemSchema = z.lazy(
  () => z.object({
    label: name,
    kind: z.enum(SITE_NAV_ITEM_TYPES),
    target: z.object({
      slug: slug.optional(),
      url: z.string().optional(),
      anchor: z.string().optional(),
      type_key: z.string().optional(),
      entry_slug: z.string().optional(),
      taxonomy: z.string().optional(),
      term_slug: z.string().optional()
    }),
    shows_on: starterShowsOnSchema,
    header_button: z.boolean(),
    children: z.array(starterMenuItemSchema)
  })
);
var starterRuleSchema = z.object({
  area_key: areaKey,
  shows_on: z.enum(SITE_SECTION_RULE_SHOWS_ON),
  pages: z.array(slug).optional(),
  content_types: z.array(z.string()).optional(),
  modules: z.array(z.object({ kind: z.enum(SITE_PAGE_MODULE_KINDS) })).optional()
});
var starterReusableSectionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  label: name,
  kind: z.enum(SITE_SECTION_KINDS),
  document: z.array(starterSectionSchema),
  rules: z.array(starterRuleSchema)
});
var entryLayoutSchema = z.object({ entry: layoutName, list: layoutName });
var siteTemplateManifestSchema = z.object({
  /**
   * The template's key, by shape: a template is written in the sites
   * repository before the platform registers it, so the schema cannot know
   * the registry. The platform's own copies are held to SITE_TEMPLATE_KEYS by
   * site-template-manifests.ts, which refuses a copy whose key is not the one
   * it was filed under.
   */
  key: z.string().regex(TEMPLATE_KEY_PATTERN),
  name,
  audience: z.string().regex(/^[a-z][a-z_]{0,39}$/),
  version: z.number().int().min(1),
  /** Section type → the layouts the template draws, the default first. */
  variants: z.record(z.string(), z.array(layoutName).min(1)),
  /**
   * Area key → where the layout places it, in words. `unknown` is what the
   * template does with an area it does not name: `after_page` draws it after
   * the page, full width, in the order the site lists its areas.
   */
  areas: z.object({ unknown: z.literal("after_page") }).catchall(name).superRefine((areas, ctx) => {
    for (const key of Object.keys(areas)) {
      if (!areaKey.safeParse(key).success) ctx.addIssue({ code: "custom", path: [key], message: "not an area key" });
    }
  }),
  /** Routable built-in content type key → its entry layout and its list layout. */
  entryLayouts: z.partialRecord(z.enum(BUILT_IN_CONTENT_TYPE_KEYS), entryLayoutSchema),
  /**
   * The site parts the template draws around every page: the header and
   * footer layouts it draws (SITE_CHROME_LAYOUTS, its default first; the
   * site's choice is `/site`'s `chrome`), the takeover banner and the legal
   * line.
   */
  chrome: z.object({
    header: z.array(z.enum(SITE_CHROME_LAYOUTS.header)).min(1),
    footer: z.array(z.enum(SITE_CHROME_LAYOUTS.footer)).min(1),
    takeoverBanner: z.boolean(),
    legalLine: z.boolean()
  }),
  starter: z.object({
    pages: z.array(starterPageSchema),
    menus: z.object({ primary: z.array(starterMenuItemSchema), footer: z.array(starterMenuItemSchema) }),
    sections: z.array(starterReusableSectionSchema)
  })
});
var deployTemplateManifestSchema = siteTemplateManifestSchema.omit({ audience: true });
function siteLayoutsOf(manifest) {
  return {
    name: manifest.name,
    variants: manifest.variants,
    chrome: { header: manifest.chrome.header, footer: manifest.chrome.footer }
  };
}

export { HIDDEN_SITE_TEMPLATE_AUDIENCE, SITE_TEMPLATE_AUTHORED_DATA, SITE_TEMPLATE_AUTHORED_DATA_SOURCES, SITE_TEMPLATE_KEYS, deployTemplateManifestSchema, siteLayoutsOf, siteTemplateManifestSchema };
