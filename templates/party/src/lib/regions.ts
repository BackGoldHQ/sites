// A Map section's places, matched to its geometry (src/lib/geo.ts) the way
// BackGold's own Map block matches them (packages/site map-status.ts and
// runtime/map-choropleth.ts): a row's `region` names a place by its key in
// the geometry, ignoring case and surrounding spaces, and a later row for
// the same place wins. Its `status` is 'lit', 'starting', or anything else,
// which is dark; a place no row names is dark too.
//
// A section with `focusRegion` frames that one place (BackGold's
// focusFrameViewBox): its bounding box padded by FOCUS_PADDING of its larger
// side, no narrower than FOCUS_MIN_WIDTH of the whole set, shaped to the
// whole set's proportions and kept inside it. The other places stay, dimmed.
//
// The coverage line is a count and a label. Over a map it counts the lit
// rows against the set's `regionTotal` (else the rows) and names the set's
// places by its `regionNoun` ("8 of 254 counties" · "Organized"); over the
// tiles it counts against the rows ("2 of 4" · "Organized"). A framed
// map names its place and status instead ("Travis county" · "Organized"),
// as BackGold's block does: the count of the whole set is not that place's
// story. The label is the section's litLabel as written, never turned into
// a verb.
//
// Under a map the directory lists the lit and starting places only; the
// places the map draws dark are one invitation in the coverage line's
// shape, their count and the section's darkLabel ("239 counties" · "No
// chapter yet"), which carries the section's charter link (the link whose
// label is `charterCtaText`) as its button.

import type { Section } from '@backgold/content'
import type { Geo } from './geo'
import { linkOf, type Link, type Row } from './section'
import { text } from './format'

export type RegionStatus = 'lit' | 'starting' | 'dark'

export interface Place {
  /** The row's `region`, as the organization wrote it. */
  name: string
  status: RegionStatus
  link: Link | null
}

export interface DrawnRegion {
  key: string
  /** `labels[key]`, else the key. */
  label: string
  d: string
  status: RegionStatus
  /** A lit place's link, when its row has a safe one. */
  link: Link | null
  focus: boolean
}

export interface DrawnMap {
  viewBox: string
  /** Every place in the geometry: the underlay first, the framed place last. */
  regions: DrawnRegion[]
  /** The framed place, when `focusRegion` names one in the geometry. */
  focus: DrawnRegion | null
}

const FOCUS_PADDING = 0.35
const FOCUS_MIN_WIDTH = 0.14

/** The key BackGold matches a row's place to the geometry by. */
const regionKey = (name: string): string => name.trim().toLowerCase()

/** The section's rows as places: each with a name, its status and its link. */
export function placesOf(rows: Row[]): Place[] {
  return rows.flatMap((row) => {
    const name = text(row.region)
    if (!name) return []
    const status: RegionStatus = row.status === 'lit' ? 'lit' : row.status === 'starting' ? 'starting' : 'dark'
    return [{ name, status, link: linkOf(row.region, row.url) }]
  })
}

/** The place in `geo` that `name` names: the key as written, else ignoring case. */
function keyIn(geo: Geo, name: string): string | null {
  if (name in geo.paths) return name
  const wanted = regionKey(name)
  return Object.keys(geo.paths).find((key) => regionKey(key) === wanted) ?? null
}

/** The bounding box of a path made of absolute M and L commands; null for any other. */
function bbox(d: string): { x: number; y: number; w: number; h: number } | null {
  if (/[^MLZ0-9eE.,\-\s]/.test(d)) return null
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)
  if (!nums || nums.length < 2) return null
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i])
    const y = Number(nums[i + 1])
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return Number.isFinite(minX) && Number.isFinite(minY) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

const round = (n: number): number => Math.round(n * 100) / 100

/** The viewBox framing `key`: from its path's box, else a point at its centroid; null with neither. */
function frame(geo: Geo, key: string): string | null {
  const centroid = geo.centroids[key]
  const box = bbox(geo.paths[key]!) ?? (centroid ? { x: centroid[0], y: centroid[1], w: 0, h: 0 } : null)
  if (!box) return null
  const aspect = geo.width / geo.height
  const pad = Math.max(box.w, box.h) * FOCUS_PADDING
  let w = Math.max(box.w + pad * 2, FOCUS_MIN_WIDTH * geo.width)
  let h = Math.max(box.h + pad * 2, FOCUS_MIN_WIDTH * geo.width)
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  w = Math.min(w, geo.width)
  h = Math.min(h, geo.height)
  const x = Math.max(0, Math.min(box.x + box.w / 2 - w / 2, geo.width - w))
  const y = Math.max(0, Math.min(box.y + box.h / 2 - h / 2, geo.height - h))
  return `${round(x)} ${round(y)} ${round(w)} ${round(h)}`
}

/** The geometry drawn for these places, framed on `focusRegion` when it names one. */
export function drawMap(geo: Geo, places: Place[], focusRegion: string | null): DrawnMap {
  const byKey = new Map(places.map((p) => [regionKey(p.name), p]))
  const named = focusRegion ? keyIn(geo, focusRegion) : null
  const framed = named ? frame(geo, named) : null
  const focusKey = framed ? named : null
  const underlay = new Set(geo.underlay)
  const keys = [...geo.underlay, ...Object.keys(geo.paths).filter((key) => !underlay.has(key) && key !== focusKey), ...(focusKey && !underlay.has(focusKey) ? [focusKey] : [])]
  const regions = keys.map((key): DrawnRegion => {
    const place = byKey.get(regionKey(key))
    const status = place?.status ?? 'dark'
    return { key, label: geo.labels[key] ?? key, d: geo.paths[key]!, status, link: status === 'lit' ? (place?.link ?? null) : null, focus: key === focusKey }
  })
  return { viewBox: framed ?? `0 0 ${geo.width} ${geo.height}`, regions, focus: regions.find((r) => r.focus) ?? null }
}

export interface MapLabels {
  lit: string
  starting: string
  dark: string
}

/** The section's words for each status, else the template's. */
export function mapLabels(section: Section): MapLabels {
  return {
    lit: text(section.copy.litLabel) ?? 'Organized',
    starting: text(section.copy.startingLabel) ?? 'Getting started',
    dark: text(section.copy.darkLabel) ?? 'Still open',
  }
}

/** "county" → "counties", "district" → "districts" (BackGold's pluralizeRegionNoun). */
function pluralNoun(noun: string): string {
  return /[^aeiou]y$/i.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`
}

/** "county"/"counties" for `n`; "place"/"places" when the section names no noun. */
function nounFor(section: Section, n: number): string {
  const noun = text(section.options?.regionNoun)?.trim() ?? 'place'
  return n === 1 ? noun : pluralNoun(noun)
}

export interface Coverage {
  /** "8 of 254 counties", "2 of 4", or a framed map's "Cedar county". */
  count: string
  /** The status label the count is of. */
  label: string
}

/** The coverage line (see above); `drawn` is null over the tiles. */
export function coverage(section: Section, drawn: DrawnMap | null, places: Place[], labels: MapLabels): Coverage {
  const noun = text(section.options?.regionNoun)?.trim() ?? null
  if (drawn?.focus) return { count: `${drawn.focus.label}${noun ? ` ${noun}` : ''}`, label: labels[drawn.focus.status] }
  const lit = places.filter((p) => p.status === 'lit').length
  if (!drawn) return { count: `${lit} of ${places.length}`, label: labels.lit }
  const regionTotal = section.options?.regionTotal
  const total = typeof regionTotal === 'number' && regionTotal > 0 ? Math.trunc(regionTotal) : places.length
  return { count: `${lit} of ${total}${noun ? ` ${nounFor(section, total)}` : ''}`, label: labels.lit }
}

export interface Invitation {
  /** "239 counties", "1 place". */
  count: string
  /** The section's darkLabel, else the template's ("Still open"). */
  label: string
  /** The section's charter link, drawn as the invitation's button. */
  charter: Link | null
}

/** The invitation the dark places on a map collapse into; null when the map draws none dark. */
export function invitation(section: Section, drawn: DrawnMap, links: Link[], labels: MapLabels): Invitation | null {
  const dark = drawn.regions.filter((r) => r.status === 'dark').length
  if (dark === 0) return null
  const charterText = text(section.copy.charterCtaText)
  return {
    count: `${dark} ${nounFor(section, dark)}`,
    label: labels.dark,
    charter: (charterText && links.find((link) => link.label === charterText)) || null,
  }
}
