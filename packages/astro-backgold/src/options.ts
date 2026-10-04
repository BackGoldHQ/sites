export interface BackgoldOptions {
  /** `GET /sitemap.xml`. Default on. */
  sitemap?: boolean
  /** `GET /robots.txt`. Default on. */
  robots?: boolean
  /** `GET /llms.txt` and `GET /llms-full.txt`. Default on. */
  llms?: boolean
  /** `GET /feed.xml` (the blog built-ins). Default on. */
  feeds?: boolean
  /** User agents `robots.txt` names as allowed. Default GPTBot, ClaudeBot, PerplexityBot, Google-Extended. */
  aiCrawlers?: string[]
}

export type ResolvedBackgoldOptions = Required<BackgoldOptions>

/** What the integration's virtual module serves at runtime: the options and this build's id. */
export interface RuntimeBackgoldOptions extends ResolvedBackgoldOptions {
  /** Names one `astro build` in the edge-cache key, so a code deploy retires every older page. */
  buildId: string
}

/** The build id under `astro dev` (which keeps no edge cache) and every command but `build`. */
export const DEV_BUILD_ID = 'dev'

/** Twelve hex characters from a random source: nothing about the machine, the time or the project. */
export function mintBuildId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const DEFAULT_AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']

/** A robots.txt user-agent token: no whitespace, colon, `#` or control character, so it cannot add a directive. */
const USER_AGENT = /^[A-Za-z0-9._-]{1,100}$/

export const isUserAgent = (name: unknown): name is string => typeof name === 'string' && USER_AGENT.test(name)

/** The options with defaults applied; throws for a crawler name robots.txt cannot carry. */
export function resolveOptions(options: BackgoldOptions = {}): ResolvedBackgoldOptions {
  const aiCrawlers = options.aiCrawlers ?? DEFAULT_AI_CRAWLERS
  for (const name of aiCrawlers) {
    if (!isUserAgent(name)) {
      throw new TypeError(`backgold({ aiCrawlers }): ${JSON.stringify(name)} is not a user-agent name`)
    }
  }
  return {
    sitemap: options.sitemap ?? true,
    robots: options.robots ?? true,
    llms: options.llms ?? true,
    feeds: options.feeds ?? true,
    aiCrawlers: [...aiCrawlers],
  }
}
