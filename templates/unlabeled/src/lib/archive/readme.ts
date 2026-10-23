// The archive's READ_ME.txt (/archive/README.txt), in plain text from the
// index: what the archive is, the three disclaimers, what it holds by kind
// with each count and address, and the downloads.

import { browsePath, type ArchiveData } from './index'
import { ARCHIVE_DISCLAIMERS, ARCHIVE_PROVENANCE } from './disclaimers'
import { longDay, plural } from './format'

/** The line length the text is set to. */
const WIDTH = 72

/** A paragraph broken into lines of at most WIDTH characters (a longer word keeps its own line), each indented. */
function wrap(text: string, indent = ''): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > WIDTH) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.map((l) => `${indent}${l}`).join('\n')
}

const heading = (text: string) => `${text.toUpperCase()}\n${'-'.repeat(text.length)}`

export function archiveReadme(data: ArchiveData, origin: string): string {
  const at = (path: string) => new URL(path, origin).href
  const present = data.types.filter((t) => t.present)
  const count = (key: string) => data.docs.filter((d) => d.kind === key).length
  const meetings = count('board_meeting')
  const width = Math.max(...present.map((t) => t.plural.length), 0)
  const built = longDay(data.builtAt)
  const out = [
    'BISD PUBLIC DATA ARCHIVE · READ_ME',
    '='.repeat('BISD PUBLIC DATA ARCHIVE · READ_ME'.length),
    '',
    wrap(`${ARCHIVE_PROVENANCE}. Online at ${at('/archive')}.${built ? ` This copy was built on ${built} from the site’s content version ${data.version}.` : ''}`),
    '',
    heading('What this is'),
    wrap(
      `A source-linked public records reader: BISD BoardBook material and public information requests${present.length > 0 ? `, as ${present.map((t) => t.plural.toLowerCase()).join(', ')}` : ''}. Originals are preserved without alteration.`,
    ),
    '',
    wrap(
      'Search the full archive by topic, date, school, program, person, salary or pay value, dollar amount or policy. Every summary links back to the original diagram, workbook or source material included in the archive.',
    ),
    '',
    heading('Read this first'),
    ...ARCHIVE_DISCLAIMERS.flatMap((d, i) => [`${String(i + 1).padStart(2, '0')} ${d.heading}`, wrap(d.text, '   '), '']),
    heading('What it holds'),
    ...(present.length > 0
      ? present.map((t) => `${String(count(t.key)).padStart(5)}  ${t.plural.padEnd(width)}  ${at(browsePath(t))}`)
      : ['    0  Nothing is published yet.']),
    `${String(data.docs.length).padStart(5)}  in all`,
    '',
    heading('Download the whole thing'),
    `archive.csv        ${at('/archive/archive.csv')}`,
    wrap(`${plural(data.docs.length, 'row')}, one per record: its kind, mark, title, date, meeting, category, campuses, presenter, vote, amounts, reported pay value, citation, summary and address.`, '                   '),
    ...(meetings > 0
      ? [
          `DownloadLinks.csv  ${at('/archive/download-links.csv')}`,
          wrap(`${plural(meetings, 'board meeting')}, one per row: its date and kind, the agenda, minutes and resolutions on BoardBook, BoardBook’s downloads and the PDFs the archive keeps.`, '                   '),
        ]
      : []),
    `READ_ME.txt        ${at('/archive/README.txt')}`,
    wrap('This file.', '                   '),
    '',
  ]
  return out.join('\n')
}
