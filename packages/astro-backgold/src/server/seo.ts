import type { Author, BackgoldContent, ContentTypeSummary, EntryAuthor, EntryDetail, PageResponse, SiteResponse } from '@backgold/content'
import { isUserAgent } from '../options.js'
import type { BackgoldLocals } from './context.js'
import { absoluteUrl, baseLabel, isBlogType, isoDate, listBase, listIndexPath, sitePath, siteName, writtenBy, xmlEscape } from './format.js'
import type { ResolvedType } from './resolve.js'

type Site = SiteResponse['site']

/** The path of a URL `/sitemap` listed, when it is on this site: site-relative, or absolute on the site's own host. */
function sameSitePath(raw: string, hosts: Set<string>): string | null {
  const relative = sitePath(raw)
  if (relative !== null) return relative
  try {
    const url = new URL(raw)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !hosts.has(url.host)) return null
    return sitePath(`${url.pathname}${url.search}`)
  } catch {
    return null
  }
}

/** `GET /sitemap.xml` from `/sitemap`. */
export async function sitemapXml(bg: BackgoldContent, siteUrl: string): Promise<string> {
  const [{ urls }, { site }] = await Promise.all([bg.sitemap(), bg.site()])
  const hosts = new Set([site.domain.toLowerCase(), new URL(siteUrl).host])
  const seen = new Set<string>()
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  for (const { url, updated_at } of urls) {
    const path = sameSitePath(url, hosts)
    if (path === null) continue
    const loc = `${siteUrl}${path}`
    if (seen.has(loc)) continue
    seen.add(loc)
    const lastmod = isoDate(updated_at)
    lines.push(`  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}

/** `GET /robots.txt`: everything allowed, the AI crawlers named, the sitemap line when it is served. */
export function robotsTxt(opts: { siteUrl: string; aiCrawlers: string[]; sitemap: boolean }): string {
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /preview', 'Disallow: /api/']
  for (const name of opts.aiCrawlers) {
    if (isUserAgent(name)) lines.push('', `User-agent: ${name}`, 'Allow: /')
  }
  if (opts.sitemap) lines.push('', `Sitemap: ${opts.siteUrl}/sitemap.xml`)
  return `${lines.join('\n')}\n`
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

/**
 * What a page's JSON-LD is built from: the site, and what the path resolved
 * to (a `Resolved` spreads in). A list's `base` is the blog types' address for
 * `'blog'` (without it, the legacy `blog`); its `intro` names that list.
 */
export type JsonLdInput = { site: Site; siteUrl: string } & (
  | { kind: 'page'; page: PageResponse['page'] }
  | { kind: 'index'; type: ResolvedType; base?: string; intro?: PageResponse | null }
  | { kind: 'entry'; type: ContentTypeSummary; entry: EntryDetail }
  | { kind: 'author'; author: Author }
  | { kind: 'term'; type: ResolvedType; base?: string; taxonomy: { key: string; label: string }; term: { slug: string; label: string } }
)

type Thing = Record<string, unknown>

/** The object without its null and undefined properties: a property with no source is omitted, never defaulted. */
function present(object: Thing): Thing {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined))
}

const CONTEXT = 'https://schema.org'

function organization(site: Site, siteUrl: string): Thing {
  const sameAs = site.social.flatMap((s) => (sitePath(s.url) === null ? (absoluteUrl(s.url, siteUrl) ?? []) : []))
  const logo = absoluteUrl(site.brand.logo_url, siteUrl)
  return present({
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: site.name,
    url: `${siteUrl}/`,
    logo,
    sameAs: sameAs.length > 0 ? sameAs : null,
  })
}

function webSite(site: Site, siteUrl: string): Thing {
  return present({
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: site.name ?? site.seo.title,
    description: site.seo.description,
    publisher: { '@id': `${siteUrl}/#organization` },
  })
}

function breadcrumbs(siteUrl: string, trail: Array<{ name: string; path: string } | null>): Thing {
  const items = trail.filter((step): step is { name: string; path: string } => step !== null)
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((step, i) => ({ '@type': 'ListItem', position: i + 1, name: step.name, item: `${siteUrl}${step.path}` })),
  }
}

/**
 * The home step, then the type's index. The blog types are one index at the
 * blog base, named by its intro page's title when it has one, else by the
 * base ("News", or "Blog" at `/blog`); every other type's is its plural.
 */
function typeTrail(site: Site, type: ResolvedType, base?: string, intro?: PageResponse | null): Array<{ name: string; path: string } | null> {
  const home = { name: siteName(site), path: '/' }
  const segment = listBase(type, base)
  if (segment === null) return [home, null]
  const name = type === 'blog' || isBlogType(type) ? intro?.page.title?.trim() || baseLabel(segment) : type.plural_label
  return [home, { name, path: `/${encodeURIComponent(segment)}` }]
}

function person(author: EntryAuthor | Author, siteUrl: string): Thing {
  return present({
    '@type': 'Person',
    name: author.display_name,
    url: `${siteUrl}/authors/${encodeURIComponent(author.slug)}`,
    image: absoluteUrl(author.avatar_url, siteUrl),
    sameAs: absoluteUrl(author.link_url, siteUrl),
  })
}

function entryThing(type: ContentTypeSummary, entry: EntryDetail, siteUrl: string): Thing {
  const url = absoluteUrl(entry.url, siteUrl)
  const image = absoluteUrl(entry.hero?.url, siteUrl)
  const media = absoluteUrl(entry.media_url, siteUrl)
  const authors = writtenBy(entry.authors).map((a) => person(a, siteUrl))
  const common = {
    '@context': CONTEXT,
    url,
    description: entry.summary,
    author: authors.length > 0 ? authors : null,
    publisher: { '@id': `${siteUrl}/#organization` },
  }
  if (type.built_in && type.key === 'podcast') {
    return present({
      ...common,
      '@type': 'PodcastEpisode',
      name: entry.title,
      image,
      datePublished: isoDate(entry.publish_at),
      dateModified: isoDate(entry.updated_at),
      associatedMedia: media ? { '@type': 'MediaObject', contentUrl: media } : null,
    })
  }
  if (type.built_in && type.key === 'video') {
    return present({
      ...common,
      '@type': 'VideoObject',
      name: entry.title,
      thumbnailUrl: image,
      uploadDate: isoDate(entry.publish_at),
      dateModified: isoDate(entry.updated_at),
      contentUrl: media,
    })
  }
  return present({
    ...common,
    '@type': type.built_in && type.key === 'post' ? 'BlogPosting' : 'Article',
    headline: entry.title,
    image,
    datePublished: isoDate(entry.publish_at),
    dateModified: isoDate(entry.updated_at),
    mainEntityOfPage: url,
  })
}

/** The JSON-LD objects for a page: `Organization` and `WebSite` always, then what the page is. */
export function jsonLdFor(input: JsonLdInput): object[] {
  const { site, siteUrl } = input
  const out: Thing[] = [organization(site, siteUrl), webSite(site, siteUrl)]
  switch (input.kind) {
    case 'page':
      break
    case 'index':
      out.push(breadcrumbs(siteUrl, typeTrail(site, input.type, input.base, input.intro)))
      break
    case 'term': {
      const base = listIndexPath(input.type, input.base)
      const path = base === null ? null : `${base}/${encodeURIComponent(input.taxonomy.key)}/${encodeURIComponent(input.term.slug)}`
      out.push(breadcrumbs(siteUrl, [...typeTrail(site, input.type, input.base), path === null ? null : { name: input.term.label, path }]))
      break
    }
    case 'entry': {
      const path = input.entry.url === null ? null : sitePath(input.entry.url)
      out.push(breadcrumbs(siteUrl, [...typeTrail(site, input.type), path === null ? null : { name: input.entry.title, path }]))
      out.push(entryThing(input.type, input.entry, siteUrl))
      break
    }
    case 'author': {
      const author = input.author
      out.push(breadcrumbs(siteUrl, [{ name: siteName(site), path: '/' }, { name: author.display_name, path: `/authors/${encodeURIComponent(author.slug)}` }]))
      out.push({ '@context': CONTEXT, ...person(author, siteUrl), description: author.bio ?? undefined })
      break
    }
  }
  return out.map(present)
}

const SCRIPT_UNSAFE: Record<string, string> = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' }

/** JSON for a `<script type="application/ld+json">`: nothing in it can close the element or end a line in a script. */
export function serializeJsonLd(objects: object[]): string {
  return JSON.stringify(objects.length === 1 ? objects[0] : objects).replace(/[<>&\u2028\u2029]/g, (c) => SCRIPT_UNSAFE[c]!)
}

// ── The head ─────────────────────────────────────────────────────────────────

/** `<Seo>`'s props. */
export interface SeoProps {
  title?: string
  description?: string
  image?: string
  canonicalPath: string
  noindex?: boolean
  jsonLd?: object[]
}

/** What `<Seo>` renders, every URL absolute and every fallback applied. */
export interface SeoHead {
  title: string | null
  description: string | null
  canonical: string
  siteName: string | null
  ogType: 'website' | 'article'
  image: string | null
  twitterCard: 'summary' | 'summary_large_image'
  noindex: boolean
  favicon: string | null
  /** The `facebook-domain-verification` content from `/site`, drawn on every page; null draws no tag. */
  metaDomainVerification: string | null
  feed: { href: string; title: string } | null
  jsonLd: object[] | null
}

const ARTICLE_TYPES = new Set(['Article', 'BlogPosting'])

/** `<Seo>`'s tags from its props and the request's BackGold state; `feeds` is the integration's option. */
export function seoHead(props: SeoProps, bg: BackgoldLocals, feeds: boolean): SeoHead {
  const site = bg.site
  let path = '/'
  try {
    path = new URL(props.canonicalPath, 'https://site.invalid').pathname
  } catch {
    // An unparseable path canonicalizes to the home page.
  }
  const name = site ? siteName(site) : null
  const jsonLd = props.jsonLd && props.jsonLd.length > 0 ? props.jsonLd : null
  const image = absoluteUrl(props.image, bg.siteUrl)
  return {
    title: props.title ?? site?.seo.title ?? site?.name ?? null,
    description: props.description ?? site?.seo.description ?? null,
    canonical: `${bg.siteUrl}${path}`,
    siteName: site?.name ?? null,
    ogType: jsonLd?.some((thing) => ARTICLE_TYPES.has(String((thing as Thing)['@type']))) ? 'article' : 'website',
    image,
    twitterCard: image ? 'summary_large_image' : 'summary',
    noindex: props.noindex === true,
    favicon: absoluteUrl(site?.favicon_url, bg.siteUrl),
    metaDomainVerification: site?.meta_domain_verification ?? null,
    feed: feeds && name ? { href: `${bg.siteUrl}/feed.xml`, title: name } : null,
    jsonLd,
  }
}
