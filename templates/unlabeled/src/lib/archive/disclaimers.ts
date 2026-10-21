// The three disclaimers the BISD archive states, as it states them
// (archive-normalized.json `disclaimers`), which every archive page wears
// in a band above the footer, small, never collapsed.

export const ARCHIVE_DISCLAIMERS = [
  {
    heading: 'Dates and completeness',
    text: 'This archive includes BISD BoardBook material posted from April through August 2026, using records dated from April 2025 through August 2026. Its v1 completeness was not independently validated as of September 19, 2026.',
  },
  {
    heading: 'Pay values',
    text: 'Pay records reproduce the workbook field EMP_ASGN_PAY_HIST_A_NRML_PAY; the workbook does not define whether each value is annual, hourly or another pay unit.',
  },
  {
    heading: 'Summaries',
    text: 'Summaries are navigation aids, not substitutes for the original records.',
  },
] as const

/** The archive's line about where it came from, over the band. */
export const ARCHIVE_PROVENANCE = 'Compiled Sept. 2026 from meetings.boardbook.org · v1'
