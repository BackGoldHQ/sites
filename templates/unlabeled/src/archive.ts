// The archive's own sections and entry layouts (the search door, the money and
// pay views, one layout per record type), registered beside the kit's in
// src/template.ts. The archive build fills these two maps.
import type { AstroComponent } from '@backgold/template-kit/template'

export const archiveSections: Record<string, AstroComponent> = {}
export const archiveEntries: Record<string, AstroComponent> = {}
