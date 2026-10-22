// The three disclaimers the BISD archive states (archive-normalized.json
// `disclaimers`), in board U2's tightened wording, which every archive page
// wears in a band above the footer, small, never collapsed, and READ_ME.txt
// repeats.

/** The band's head, at its left; ARCHIVE_PROVENANCE sits at its right. */
export const ARCHIVE_DISCLAIMERS_HEAD = '// Read this first — on every archive page'

export const ARCHIVE_DISCLAIMERS = [
  {
    heading: 'Dates and completeness',
    text: 'This archive holds BISD BoardBook material posted April through August 2026, from records dated April 2025 through August 2026. Its v1 completeness was not independently validated as of September 19, 2026.',
  },
  {
    heading: 'Pay values',
    text: 'Pay records reproduce the workbook field EMP_ASGN_PAY_HIST_A_NRML_PAY. The workbook does not define the unit: a value may be annual, hourly or another pay unit.',
  },
  {
    heading: 'Summaries',
    text: 'Summaries are navigation aids, not substitutes for the original records. Every summary links to its source. Read the source.',
  },
] as const

/** Where the archive came from, at the band's right. */
export const ARCHIVE_PROVENANCE = 'Compiled Sept. 2026 from meetings.boardbook.org · v1'
