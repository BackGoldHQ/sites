// Her skin for BackGold's frames (the RSVP and tickets, a petition's sheet
// and block, a form, a poll, the donate form, the sign-up, the live feed, a
// volunteer shift's sign-up card),
// served at /_backgold/frame.css (src/pages/[skin]/frame.css.ts) and linked
// by each frame when the kit sends `skin` (src/template.ts `frameSkin`),
// written to BackGold's frame-skin contract (the platform's
// docs/FRAME-SKINS.md): every rule under `html[data-bg-look]`, only the
// `bg-fr-*` parts, their states and the `--bg-look-*` variables, which carry
// her colours (src/template.ts `frameColors`). What it draws, as boards
// U6–U9 draw the frames: labels in small tracked capitals in the grey;
// square fields on the field edge, white when focused; the white block
// submit in capitals that inverts on hover; choices and items as hairline
// boxes that invert when picked; a petition's count set huge over a
// hairline meter, a shift's spots in the meta line over the same meter; a
// petition's collapsed text as a hairline-ruled disclosure whose summary is
// the meta line with a `[ + ]` bracket (`[ – ]` open) and whose text reads in
// the mono body; cards as hairline boxes. It never hides a required field,
// a consent row, a legal line, an error or the submit, and every state
// (focus, invalid, picked, disabled) still reads as what it is. The frame
// may refuse the skin (a preview host): the look alone then draws them.

const META = `font-size: 11px; line-height: 1.45; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase;`

export const FRAME_SKIN_CSS = `/* Unlabeled: BackGold's frames in her look (FRAME-SKINS contract). */
html[data-bg-look] { color-scheme: dark; }
html[data-bg-look] body { background: transparent; }

/* Cards: hairline boxes, square, flat. */
html[data-bg-look] .bg-fr-card,
html[data-bg-look] .bg-fr-sheet {
  background: transparent;
  border: 1px solid var(--bg-look-line-strong);
  border-radius: 0;
  box-shadow: none;
}
html[data-bg-look] .bg-fr-card-head,
html[data-bg-look] .bg-fr-title {
  color: var(--bg-look-ink);
  font-size: 22px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* Labels, help, the autofill line and the legal lines: the meta line, in the grey. */
html[data-bg-look] .bg-fr-label { ${META} color: var(--bg-look-muted); }
html[data-bg-look] .bg-fr-req { color: var(--bg-look-ink); }
html[data-bg-look] .bg-fr-help,
html[data-bg-look] .bg-fr-autofill,
html[data-bg-look] .bg-fr-fine { ${META} letter-spacing: 0.06em; color: var(--bg-look-muted); }
html[data-bg-look] .bg-fr-autofill a,
html[data-bg-look] .bg-fr-autofill button { color: var(--bg-look-ink); text-decoration: underline; text-underline-offset: 0.22em; }

/* Fields: square boxes on the field edge; white when focused; a dashed accent edge when they fail. */
html[data-bg-look] .bg-fr-input {
  min-height: 46px;
  background: var(--bg-look-surface);
  border: 1px solid var(--bg-look-field-edge);
  border-radius: 0;
  box-shadow: none;
  color: var(--bg-look-ink);
  font-size: 14px;
}
html[data-bg-look] .bg-fr-input:focus,
html[data-bg-look] .bg-fr-input:focus-visible {
  border-color: var(--bg-look-ink);
  box-shadow: inset 0 0 0 1px var(--bg-look-ink);
  outline: none;
}
html[data-bg-look] .bg-fr-input:user-invalid,
html[data-bg-look] .bg-fr-input[aria-invalid='true'] {
  border-color: var(--bg-look-accent);
  border-style: dashed;
}
html[data-bg-look] .bg-fr-input[disabled] { border-style: dotted; }

/* Choices and items: hairline boxes in capitals that invert when picked. */
html[data-bg-look] .bg-fr-choice,
html[data-bg-look] .bg-fr-item {
  background: transparent;
  border: 1px solid var(--bg-look-field-edge);
  border-radius: 0;
  box-shadow: none;
  color: var(--bg-look-ink);
}
html[data-bg-look] .bg-fr-choice { ${META} font-size: 12px; }
html[data-bg-look] .bg-fr-choice[aria-pressed='true'],
html[data-bg-look] .bg-fr-choice:has(input:checked),
html[data-bg-look] .bg-fr-item[aria-pressed='true'],
html[data-bg-look] .bg-fr-item:has(input:checked) {
  background: var(--bg-look-ink);
  border-color: var(--bg-look-ink);
  color: var(--bg-look-surface);
}

/* Checkbox and consent rows: the box ticked in white; the words stay whole. */
html[data-bg-look] .bg-fr-check { color: var(--bg-look-muted); font-size: 12px; line-height: 1.5; }
html[data-bg-look] .bg-fr-check input { accent-color: var(--bg-look-ink); border-radius: 0; }

/* The message line: a failure in the accent with a rule before it. */
html[data-bg-look] .bg-fr-error { font-size: 12px; letter-spacing: 0.04em; }
html[data-bg-look] .bg-fr-error[data-tone='error'] {
  padding-left: 10px;
  border-left: 2px solid var(--bg-look-accent);
  color: var(--bg-look-accent);
}

/* The main call: the white block in capitals, inverting on hover. */
html[data-bg-look] .bg-fr-submit {
  min-height: 52px;
  background: var(--bg-look-ink);
  border: 1px solid var(--bg-look-ink);
  border-radius: 0;
  box-shadow: none;
  color: var(--bg-look-surface);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
html[data-bg-look] .bg-fr-submit:not([disabled]):is(:hover, :focus-visible) {
  background: var(--bg-look-surface);
  color: var(--bg-look-ink);
}
html[data-bg-look] .bg-fr-submit:focus-visible { outline: 2px solid var(--bg-look-link); outline-offset: 3px; }
html[data-bg-look] .bg-fr-submit[disabled] { opacity: 0.55; cursor: not-allowed; }

/* The other buttons: hairline boxes in capitals that invert on hover. */
html[data-bg-look] .bg-fr-secondary {
  background: transparent;
  border: 1px solid var(--bg-look-field-edge);
  border-radius: 0;
  box-shadow: none;
  color: var(--bg-look-ink);
  ${META}
  font-size: 12px;
  font-weight: 500;
}
html[data-bg-look] .bg-fr-secondary:not([disabled]):hover { background: var(--bg-look-ink); color: var(--bg-look-surface); }
html[data-bg-look] .bg-fr-secondary[disabled] { opacity: 0.55; }

/* A petition's count, set huge, and its meter: a white hairline on the line. */
html[data-bg-look] [data-bg-fr='petition-sheet'] .bg-fr-count,
html[data-bg-look] [data-bg-fr='petition'] .bg-fr-count > :first-child {
  color: var(--bg-look-ink);
  font-size: clamp(72px, 14vw, 132px);
  font-weight: 500;
  line-height: 0.9;
  letter-spacing: -0.02em;
}
html[data-bg-look] :is([data-bg-fr='petition-sheet'], [data-bg-fr='petition']) .bg-fr-progress {
  height: 4px;
  background: var(--bg-look-line);
  border: 0;
  border-radius: 0;
}
html[data-bg-look] :is([data-bg-fr='petition-sheet'], [data-bg-fr='petition']) .bg-fr-progress > * {
  background: var(--bg-look-ink);
  border-radius: 0;
}
html[data-bg-look] .bg-fr-signer { ${META} color: var(--bg-look-muted); }

/* A shift's spots: the count in the meta line, the meter a white hairline on the line. */
html[data-bg-look] [data-bg-fr='shift'] .bg-fr-count { ${META} color: var(--bg-look-ink); }
html[data-bg-look] [data-bg-fr='shift'] .bg-fr-progress {
  height: 4px;
  background: var(--bg-look-line);
  border: 0;
  border-radius: 0;
}
html[data-bg-look] [data-bg-fr='shift'] .bg-fr-progress > * {
  height: 100%;
  background: var(--bg-look-ink);
  border-radius: 0;
}

/* A petition's collapsed text: a hairline-ruled disclosure, the summary in capitals with the bracket glyph, the text in the mono body. */
html[data-bg-look] .bg-fr-text {
  border-top: 1px solid var(--bg-look-line-strong);
  border-bottom: 1px solid var(--bg-look-line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
html[data-bg-look] .bg-fr-text-summary {
  ${META}
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  color: var(--bg-look-ink);
  cursor: pointer;
  list-style: none;
}
html[data-bg-look] .bg-fr-text-summary::-webkit-details-marker { display: none; }
html[data-bg-look] .bg-fr-text-summary::marker { content: ''; }
html[data-bg-look] .bg-fr-text-summary::after { content: '[ + ]'; white-space: pre; color: var(--bg-look-ink); }
html[data-bg-look] .bg-fr-text[open] > .bg-fr-text-summary::after { content: '[ \\2013 ]'; }
html[data-bg-look] .bg-fr-text-summary:focus-visible { outline: 2px solid var(--bg-look-link); outline-offset: 3px; }
html[data-bg-look] .bg-fr-text[open] > :not(.bg-fr-text-summary) {
  color: var(--bg-look-ink);
  font-family: var(--bg-look-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 13px;
  line-height: 1.7;
}

/* The live feed's total: her display weight. */
html[data-bg-look] [data-bg-fr='movement-ticker'] .bg-fr-count { color: var(--bg-look-ink); font-weight: 500; }

/* A map's legend: hairline rows in the meta face. */
html[data-bg-look] .bg-fr-legend { border-top: 1px solid var(--bg-look-line); }
html[data-bg-look] .bg-fr-legend-row { ${META} color: var(--bg-look-muted); }

/* The done screen: her heading face. */
html[data-bg-look] .bg-fr-done :is(h1, h2, h3) { font-weight: 500; text-transform: uppercase; }
`
