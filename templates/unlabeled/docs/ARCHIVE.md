# The archive

The BISD public data archive on Unlabeled's site: the five content types the
archive was normalized into, plus her own records requests, made searchable
on her domain (design: the platform repository's
`docs/design/unlabeled-site-2026-10/`, brief §4 and boards U2–U5, U10, U11).

## Routes

| Address | What it is | Where |
| --- | --- | --- |
| `/archive` | The door, and the search across all six types: `?q&kind&category&meeting&from&to&pay_min&pay_max&sort&page` | `src/pages/archive/index.astro` |
| `/archive/index.json` | The documents the search runs over, for the island | `src/pages/archive/index.json.ts` |
| `/archive/archive.csv` | The whole archive, a row per record | `src/pages/archive/archive.csv.ts` |
| `/archive/money` | The data buckets by family, the Financial family by fund | `src/pages/archive/money.astro` |
| `/archive/pay` | The pay records: histogram, offices, table (`?q&sort&office`) | `src/pages/archive/pay.astro` |
| `/data`, `/pay` | Redirect (301) to `/archive/money` and `/archive/pay` | `src/pages/data/index.ts`, `src/pages/pay/index.ts` |
| `/meetings/<date>`, `/decisions/<slug>`, `/data/<slug>`, `/pay/<slug>`, `/sources/<slug>`, `/records/<slug>` | One entry, drawn by its type's layout | `src/components/entries/*.astro` |
| `/meetings`, `/decisions`, `/sources`, `/records` and their term lists | A type's list (`/records` is the requests ledger with Request a record at `#request-a-record`) | `src/components/entries/list.astro`, `requests.astro` |

The entry and list addresses are the kit's catch-all route. template.json
names entry layouts only for the built-in types, so a custom type is drawn
with `post:article` and `post:list`; `src/archive.ts` registers dispatchers
under those two keys that draw the six archive types with their own layouts
(`src/components/entries/index.ts`) and every other type with the kit's
post layouts. Home's door to the archive is StatCards' `archive` layout
(`src/components/archive/ArchiveDoor.astro`).

Every archive page wears the three disclaimers in a band above the footer
(`src/lib/archive/disclaimers.ts`), never collapsed.

## The index and its cache key

`src/lib/archive/index.ts` reads every entry of the six types through the
site's Content API client: the list pages (50 a page), then each entry's
detail (the list route carries no field values), eight at a time. Each
detail becomes an `ArchiveDoc` (`src/lib/archive/record.ts`). The whole set
is kept in KV (`BACKGOLD_CACHE`) under

```
bg-archive:<site id>:v<content version>:f<ARCHIVE_FORMAT>
```

for seven days, so a publish in BackGold (a new content version) is a new
key and the next request builds it; nothing rebuilds it before. For the 421
entries the value is about 0.9 MB. Concurrent requests in one isolate share
one build; two isolates that miss on a new version both build it and write
the same value. A cold build costs one list read per 50 entries and one
detail read per entry (about 431 reads for 421 entries), each cached by the
client under the same version.

The search (`src/lib/archive/search.ts`) is a MiniSearch index over title,
summary, every field value, the people and the terms, built from the
documents once per isolate per version. The island
(`src/components/archive/Island.astro`) loads `/archive/index.json`, builds
the same index in the browser and runs the same module. The readable texts
(agendas, documents) are fetched from their `readable_text` / `agenda_text`
links and kept in KV under `bg-archive-text:<site id>:v<version>:<hash of
the address>` (`src/lib/archive/text.ts`).

`/archive` with any query name, `/archive/pay` with `q`, `sort` or `office`,
and a source with `?find=` answer `Cache-Control: no-store`, and `/archive`
names its query names in `X-Backgold-Reads-Query`, so the edge cache never
answers a query with the bare page's copy.

## Query grammar (`src/lib/archive/query.ts`)

| Asks for | Written as |
| --- | --- |
| Words (all must match; four letters or more match as a prefix) | `superintendent`, `west brook`, `cheryl hernandez` |
| A phrase | `"sallie curtis"` |
| A policy or procurement code (spaces and case ignored) | `CH(LOCAL)`, `CH (Local)`, `RFP 25.11`, `CSP 26.16` |
| A dollar amount, to its stated precision | `$68 million`, `68 million`, `$68M`, `68,000,000`, `68000000` all mean $68,000,000–$68,999,999; `$480,354` is that figure; `$562,143.00` is exact |
| A pay range (pay records only) | `pay:90000-125000`, `pay:90k-125k`, `pay:100000-`, or the rail's `pay_min` / `pay_max` |
| A day, a month, a year | `2026-08-20`, `August 20, 2026`, `2026-02`, `february 2026`, `2025` |

A bare number counts as an amount with a `$`, a scale word, thousands
separators, or five or more digits; a four-digit number from 1900 to 2099 is
a year. Dollar amounts match the figures a record states: a decision's
`amounts` and `largest_amount`, a bucket's `total_value` and line-item
figures, a pay record's `pay_value`, and any `$` figure in a summary. The
parse shows as dashed chips under the field. An empty result names what was
searched, the closest smaller query with its count, the nearest decision
category, a page on the site whose title holds a word of the query, and the
door to request a record.

## The data it expects

Field keys exactly as `ref/archive-normalized.json` `content_types.types`
defines them, plus her `information_request` type:

| Type (`url_base`) | Fields read | Terms |
| --- | --- | --- |
| `board_meeting` (`meetings`) | `meeting_date`, `meeting_time`, `meeting_kind`, `agenda_link`, `minutes_link`, `resolutions_link`, `agenda_download`, `minutes_download`, `agenda_pdf`, `minutes_pdf`, `agenda_text` (the agenda's text extraction, read for the outline and the reading pane) | — |
| `board_decision` (`decisions`) | `meeting` (reference: its slug), `decided_on`, `agenda_item` (`II.E.8`, hangs the decision on the agenda's outline), `presenter`, `seconder`, `vote_outcome`, `vote_detail` (the tally is drawn only from its `Yeas:` list), `amounts`, `largest_amount`, `source_citation`, `source_documents` (slugs), `timeline_diagram`, `timeline_data`, `archive_id` (`<folder>/<number>`, the row mark's number), `original_title` | `decision_category` (the row mark's prefix), `campus` |
| `data_bucket` (`data`) | `family`, `flow_side`, `total_value`, `total_label`, `basis`, `basis_decisions` (slugs), `line_items`, `notes`, `fed_by`, `flows_to`, `sankey_diagram`, `sankey_data`, `archive_id` | `campus` |
| `pay_record` (`pay`) | `person`, `position`, `pay_value`, `pay_display`, `workbook`, `workbook_row`, `workbook_file`, `unit_note`, `archive_id` | `district_office` |
| `source_document` (`sources`) | `document_kind`, `meeting` (reference), `boardbook_link`, `archived_file`, `readable_text`, `original_filename`, `source_note`, `archive_id` | — |
| `information_request` (`records`) | `requested_from`, `status`, `requested_on`, `responded_on`, `what_we_asked_for`, `request_email` (image), `what_came_back`, `records_provided`, `response_document` (pdf) | — |

A diagram field with a mono re-render stored beside it as
`timeline_diagram_mono` / `sankey_diagram_mono` (link or file) is shown in
its place; without one the colour original is shown in grey. Either way the
original and its `.mmd` are linked. Entries are listed newest first by
`publish_at`, so the import sets it to the meeting or decision date.

A type the organization does not have is left out everywhere (its count, its
chip, its rail); with none of them the door says the archive has nothing
published yet.

## Running it locally

```bash
node scripts/archive-fixture.mjs --data <platform checkout>/docs/design/unlabeled-site-2026-10/ref --port 4391
# templates/unlabeled/.dev.vars:
#   BACKGOLD_SITE_KEY=bg_site_pk_archivefixture0000
#   BACKGOLD_API_ORIGIN=http://127.0.0.1:4391
pnpm --filter backgold-template-unlabeled exec astro dev --port 4331
pnpm --filter backgold-template-unlabeled test   # the grammar, the index build, the search, the agenda outline
```

The fixture serves the Content API's `/site`, `/types`, `/entries`,
`/terms`, `/pages` and `/menus` from the normalized data, with Home holding
the archive door.

## Follow-ups for the platform

- **A list option that returns field values** (`GET /entries/:type?fields=1`
  or similar). Without it a cold index build reads every entry's detail,
  about 431 reads per content version for this archive.
- **Custom type keys in `entryLayouts`.** The contract's manifest schema
  takes only the built-in type keys, so the archive's layouts ride on the
  `post:article` / `post:list` dispatchers instead of being named per type
  in template.json.
- **StatCards `archive` in the contract's `SECTION_LAYOUTS`** (and in
  template.json's variants) so an operator can place the Home door.
- **`agenda_item` filled at import** for every decision (8 of 192 carry one
  today); a decision without one sits under "No item cited" on its meeting.
- **Mono diagrams** at import as `<field>_mono`.
