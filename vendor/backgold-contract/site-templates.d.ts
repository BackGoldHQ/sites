import { z } from 'zod';
import { S as SiteNavItemType } from './constants-DuDgs06x.js';

/**
 * A site template's manifest: the `template.json` at the root of each
 * template in the sites repository, gitlab.com/backgold/sites
 * (`templates/<key>/template.json`). The platform keeps and reads its checked
 * copy of each, site-templates/<key>.template.json in this package
 * (site-template-manifests.ts).
 *
 * The composer and the pipeline read it to learn, against the contract
 * (docs/design/sites-unification-2026-10/CONTRACT.md §6), what the template
 * draws: the layouts (variants) of each section type, default first; where it
 * places each area and what it does with an area it does not name; one entry
 * layout and one list layout per routable built-in content type; its chrome;
 * and the starter content a new site on it begins with.
 *
 * The starter content refers to its own pages by slug, never by id: a
 * template ships before any site, page or entry exists.
 */

/**
 * Every template BackGold ships, by its manifest `key`. A site may wear any of
 * them: creating a template site and the template switch accept every key
 * here.
 *
 * A template whose manifest `audience` is HIDDEN_SITE_TEMPLATE_AUDIENCE
 * (`unlabeled`, one organization's one-of-one template) is registered like the
 * others but never offered: SITE_TEMPLATE_CARDS leaves it out, so /sites/new
 * draws no card for it, its start route goes back to the gallery and the
 * Change template list does not name it. Staff point that organization's site
 * at it through the template switch. There is no per-organization allowlist:
 * the gallery omission is the whole gate, the smallest honest one for a single
 * tenant (Engineering-Decision, 2026-10-20); a second one-of-one template is
 * when to revisit it.
 */
declare const SITE_TEMPLATE_KEYS: readonly ["party", "candidate", "petition-drive", "academy", "nonprofit", "unlabeled"];
type SiteTemplateKey = (typeof SITE_TEMPLATE_KEYS)[number];
/** The manifest `audience` of a template that is registered but never offered in the gallery (SITE_TEMPLATE_KEYS). */
declare const HIDDEN_SITE_TEMPLATE_AUDIENCE = "hidden";
/**
 * The data sources whose rows an author types in BackGold, named exactly as
 * CONTENT_API_BLOCKS projects them. A starter section may carry placeholder
 * rows only under one of these; every other source (events, blog posts,
 * candidates, the team, progress, a countdown, the leaderboard, the social
 * feed, the movement, a collection, a post, map regions, the membership
 * program, the booking module's meeting types) is live or record-backed, BackGold's to fill, and never starter
 * content.
 */
declare const SITE_TEMPLATE_AUTHORED_DATA_SOURCES: readonly ["issues", "stats", "quotes", "platform", "dates", "ballot", "votes", "faq", "comparison", "stories", "services", "cases", "resources", "pathways", "work", "mediakit", "credentials", "words", "ladder", "share", "financials", "petition"];
/** The section type each authored source belongs to, and only to. */
declare const SITE_TEMPLATE_AUTHORED_DATA: Readonly<Record<string, (typeof SITE_TEMPLATE_AUTHORED_DATA_SOURCES)[number]>>;
/** A starter menu link's Shows on rule; the pages are starter page slugs. */
declare const starterShowsOnSchema: z.ZodUnion<readonly [z.ZodObject<{
    rule: z.ZodEnum<{
        every_page: "every_page";
        donation_pages: "donation_pages";
    }>;
}, z.core.$strip>, z.ZodObject<{
    rule: z.ZodEnum<{
        only_pages: "only_pages";
        except_pages: "except_pages";
    }>;
    pages: z.ZodArray<z.ZodString>;
}, z.core.$strip>]>;
interface SiteTemplateMenuItem {
    label: string;
    kind: SiteNavItemType;
    target: {
        slug?: string;
        url?: string;
        anchor?: string;
        type_key?: string;
        entry_slug?: string;
        taxonomy?: string;
        term_slug?: string;
    };
    shows_on: z.infer<typeof starterShowsOnSchema>;
    header_button: boolean;
    children: SiteTemplateMenuItem[];
}
declare const siteTemplateManifestSchema: z.ZodObject<{
    key: z.ZodString;
    name: z.ZodString;
    audience: z.ZodString;
    version: z.ZodNumber;
    variants: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
    areas: z.ZodObject<{
        unknown: z.ZodLiteral<"after_page">;
    }, z.core.$catchall<z.ZodString>>;
    entryLayouts: z.ZodRecord<z.ZodEnum<{
        post: "post";
        podcast: "podcast";
        video: "video";
        plank: "plank";
        team_member: "team_member";
        open_role: "open_role";
        newsletter: "newsletter";
        course: "course";
    }> & z.core.$partial, z.ZodObject<{
        entry: z.ZodString;
        list: z.ZodString;
    }, z.core.$strip>>;
    chrome: z.ZodObject<{
        header: z.ZodArray<z.ZodEnum<{
            bar: "bar";
            centered: "centered";
        }>>;
        footer: z.ZodArray<z.ZodEnum<{
            compact: "compact";
            giving: "giving";
            columns: "columns";
            closing: "closing";
        }>>;
        takeoverBanner: z.ZodBoolean;
        legalLine: z.ZodBoolean;
    }, z.core.$strip>;
    starter: z.ZodObject<{
        pages: z.ZodArray<z.ZodObject<{
            slug: z.ZodString;
            title: z.ZodString;
            sections: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodString;
                band: z.ZodEnum<{
                    plain: "plain";
                    tint: "tint";
                    panel: "panel";
                    wash: "wash";
                    contrast: "contrast";
                }>;
                bleed: z.ZodEnum<{
                    full: "full";
                    contained: "contained";
                }>;
                variant: z.ZodNullable<z.ZodString>;
                copy: z.ZodRecord<z.ZodString, z.ZodString>;
                media: z.ZodRecord<z.ZodString, z.ZodObject<{
                    url: z.ZodString;
                    alt: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                links: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    target: z.ZodObject<{
                        kind: z.ZodEnum<{
                            section: "section";
                            external: "external";
                            page: "page";
                            surface: "surface";
                        }>;
                        slug: z.ZodOptional<z.ZodString>;
                        anchor: z.ZodOptional<z.ZodString>;
                        url: z.ZodOptional<z.ZodString>;
                        path: z.ZodOptional<z.ZodString>;
                    }, z.core.$strip>;
                    url: z.ZodString;
                    style: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
                data: z.ZodOptional<z.ZodObject<{
                    source: z.ZodEnum<{
                        petition: "petition";
                        issues: "issues";
                        dates: "dates";
                        platform: "platform";
                        ladder: "ladder";
                        ballot: "ballot";
                        words: "words";
                        credentials: "credentials";
                        stats: "stats";
                        quotes: "quotes";
                        votes: "votes";
                        faq: "faq";
                        comparison: "comparison";
                        stories: "stories";
                        share: "share";
                        financials: "financials";
                        services: "services";
                        cases: "cases";
                        resources: "resources";
                        pathways: "pathways";
                        work: "work";
                        mediakit: "mediakit";
                    }>;
                    items: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        menus: z.ZodObject<{
            primary: z.ZodArray<z.ZodType<SiteTemplateMenuItem, unknown, z.core.$ZodTypeInternals<SiteTemplateMenuItem, unknown>>>;
            footer: z.ZodArray<z.ZodType<SiteTemplateMenuItem, unknown, z.core.$ZodTypeInternals<SiteTemplateMenuItem, unknown>>>;
        }, z.core.$strip>;
        sections: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            kind: z.ZodEnum<{
                custom: "custom";
                announcement: "announcement";
                pre_footer: "pre_footer";
                sidebar: "sidebar";
            }>;
            document: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodString;
                band: z.ZodEnum<{
                    plain: "plain";
                    tint: "tint";
                    panel: "panel";
                    wash: "wash";
                    contrast: "contrast";
                }>;
                bleed: z.ZodEnum<{
                    full: "full";
                    contained: "contained";
                }>;
                variant: z.ZodNullable<z.ZodString>;
                copy: z.ZodRecord<z.ZodString, z.ZodString>;
                media: z.ZodRecord<z.ZodString, z.ZodObject<{
                    url: z.ZodString;
                    alt: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                links: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    target: z.ZodObject<{
                        kind: z.ZodEnum<{
                            section: "section";
                            external: "external";
                            page: "page";
                            surface: "surface";
                        }>;
                        slug: z.ZodOptional<z.ZodString>;
                        anchor: z.ZodOptional<z.ZodString>;
                        url: z.ZodOptional<z.ZodString>;
                        path: z.ZodOptional<z.ZodString>;
                    }, z.core.$strip>;
                    url: z.ZodString;
                    style: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
                data: z.ZodOptional<z.ZodObject<{
                    source: z.ZodEnum<{
                        petition: "petition";
                        issues: "issues";
                        dates: "dates";
                        platform: "platform";
                        ladder: "ladder";
                        ballot: "ballot";
                        words: "words";
                        credentials: "credentials";
                        stats: "stats";
                        quotes: "quotes";
                        votes: "votes";
                        faq: "faq";
                        comparison: "comparison";
                        stories: "stories";
                        share: "share";
                        financials: "financials";
                        services: "services";
                        cases: "cases";
                        resources: "resources";
                        pathways: "pathways";
                        work: "work";
                        mediakit: "mediakit";
                    }>;
                    items: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            rules: z.ZodArray<z.ZodObject<{
                area_key: z.ZodString;
                shows_on: z.ZodEnum<{
                    store: "store";
                    events: "events";
                    entries: "entries";
                    every_page: "every_page";
                    every_page_except: "every_page_except";
                    pages: "pages";
                    pages_holding: "pages_holding";
                    entry_types: "entry_types";
                    type_lists: "type_lists";
                }>;
                pages: z.ZodOptional<z.ZodArray<z.ZodString>>;
                content_types: z.ZodOptional<z.ZodArray<z.ZodString>>;
                modules: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    kind: z.ZodEnum<{
                        event: "event";
                        petition: "petition";
                        form: "form";
                        store: "store";
                        poll: "poll";
                        signup: "signup";
                        donation_form: "donation_form";
                        advocacy: "advocacy";
                    }>;
                }, z.core.$strip>>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
type SiteTemplateManifest = z.infer<typeof siteTemplateManifestSchema>;
/**
 * One section a template switch draws differently
 * (GET /api/orgs/domains/:id/template/switch, PUT /api/orgs/domains/:id/template):
 * a section of a live page whose layout (`layout`, its `variant`) the new
 * template does not draw. It takes `fallback`, the new template's default
 * layout for the type, until the author picks one. A section whose type the
 * new template does not draw at all has `fallback: null` and `undrawn: true`.
 * `section_label` is the section's heading, else its type.
 */
interface LostLayout {
    page_id: string;
    page_name: string;
    page_slug: string;
    section_id: string;
    section_type: string;
    section_label: string;
    layout: string;
    fallback: string | null;
    undrawn?: true;
}

export { HIDDEN_SITE_TEMPLATE_AUDIENCE, type LostLayout, SITE_TEMPLATE_AUTHORED_DATA, SITE_TEMPLATE_AUTHORED_DATA_SOURCES, SITE_TEMPLATE_KEYS, type SiteTemplateKey, type SiteTemplateManifest, type SiteTemplateMenuItem, siteTemplateManifestSchema };
