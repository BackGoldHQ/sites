// The archive's own sections and entry layouts, registered beside the kit's
// in src/template.ts. template.json names entry layouts for the built-in
// types only, so a custom type is drawn by `post:article` and `post:list`;
// the archive takes those two over with dispatchers that draw its six types
// with their own layouts and every other type with the kit's
// (src/components/entries/index.ts). The Home door to the archive is
// StatCards' `archive` layout.
import type { AstroComponent } from '@backgold/template-kit/template'
import ArchiveDoor from './components/archive/ArchiveDoor.astro'
import ArchiveEntry from './components/entries/ArchiveEntry.astro'
import ArchiveList from './components/entries/ArchiveList.astro'

export const archiveSections: Record<string, AstroComponent> = {
  'StatCards:archive': ArchiveDoor,
}
export const archiveEntries: Record<string, AstroComponent> = {
  'post:article': ArchiveEntry,
  'post:list': ArchiveList,
}
