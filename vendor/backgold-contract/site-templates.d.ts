import { z } from 'zod';
import { S as SiteNavItemType } from './constants-BcK31coy.js';

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

/** Every template BackGold ships, by its manifest `key`. */
declare const SITE_TEMPLATE_KEYS: readonly ["party"];
type SiteTemplateKey = (typeof SITE_TEMPLATE_KEYS)[number];
/**
 * The data sources whose rows an author types in BackGold, named exactly as
 * CONTENT_API_BLOCKS projects them. A starter section may carry placeholder
 * rows only under one of these; every other source (events, blog posts,
 * candidates, the team, progress, a countdown, the leaderboard, the social
 * feed, the movement, a collection, a post, map regions, the membership
 * program, the booking module's meeting types) is live or record-backed, BackGold's to fill, and never starter
 * content.
 */
declare const SITE_TEMPLATE_AUTHORED_DATA_SOURCES: readonly ["issues", "stats", "quotes", "platform", "dates", "ballot", "votes", "faq", "comparison", "stories", "services", "cases", "resources", "pathways", "work", "mediakit", "credentials", "words", "ladder", "share", "financials"];
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
    key: z.ZodEnum<{
        party: "party";
    }>;
    name: z.ZodString;
    audience: z.ZodString;
    version: z.ZodNumber;
    variants: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
    areas: z.ZodObject<{
        unknown: z.ZodLiteral<"after_page">;
    }, z.core.$catchall<z.ZodString>>;
    entryLayouts: z.ZodRecord<z.ZodEnum<{
        post: "post";
        video: "video";
        podcast: "podcast";
        plank: "plank";
        team_member: "team_member";
        open_role: "open_role";
        newsletter: "newsletter";
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
            columns: "columns";
            closing: "closing";
            compact: "compact";
            giving: "giving";
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
                            page: "page";
                            section: "section";
                            external: "external";
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
                sidebar: "sidebar";
                custom: "custom";
                announcement: "announcement";
                pre_footer: "pre_footer";
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
                            page: "page";
                            section: "section";
                            external: "external";
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
                    events: "events";
                    store: "store";
                    every_page: "every_page";
                    pages: "pages";
                    every_page_except: "every_page_except";
                    pages_holding: "pages_holding";
                    entry_types: "entry_types";
                    entries: "entries";
                    type_lists: "type_lists";
                }>;
                pages: z.ZodOptional<z.ZodArray<z.ZodString>>;
                content_types: z.ZodOptional<z.ZodArray<z.ZodString>>;
                modules: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    kind: z.ZodEnum<{
                        store: "store";
                        petition: "petition";
                        form: "form";
                        poll: "poll";
                        signup: "signup";
                        event: "event";
                        donation_form: "donation_form";
                        advocacy: "advocacy";
                    }>;
                }, z.core.$strip>>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
type SiteTemplateManifest = z.infer<typeof siteTemplateManifestSchema>;

export { SITE_TEMPLATE_AUTHORED_DATA, SITE_TEMPLATE_AUTHORED_DATA_SOURCES, SITE_TEMPLATE_KEYS, type SiteTemplateKey, type SiteTemplateManifest, type SiteTemplateMenuItem, siteTemplateManifestSchema };
