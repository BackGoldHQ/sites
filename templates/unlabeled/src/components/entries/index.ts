// The archive's entry and list layouts, by content type. The kit draws a
// type template.json does not name with the post layouts, and template.json
// names only the built-in types, so the archive registers its two
// dispatchers as `post:article` and `post:list` (src/archive.ts): an entry
// or list of an archive type gets its layout here, everything else the
// kit's post layouts.

import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
import type { ArchiveKindKey } from '../../lib/archive/kinds'
import Bucket from './bucket.astro'
import Decision from './decision.astro'
import List from './list.astro'
import Meeting from './meeting.astro'
import Pay from './pay.astro'
import Request from './request.astro'
import Requests from './requests.astro'
import Source from './source.astro'

export const ARCHIVE_ENTRY_LAYOUTS: Record<ArchiveKindKey, AstroComponentFactory> = {
  board_meeting: Meeting,
  board_decision: Decision,
  data_bucket: Bucket,
  pay_record: Pay,
  source_document: Source,
  information_request: Request,
}

export const ARCHIVE_LIST_LAYOUTS: Record<ArchiveKindKey, AstroComponentFactory> = {
  board_meeting: List,
  board_decision: List,
  data_bucket: List,
  pay_record: List,
  source_document: List,
  information_request: Requests,
}
