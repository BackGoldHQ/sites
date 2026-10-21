// Her skin for BackGold's frames (the RSVP and tickets, the petition's sheet,
// a form, a poll, the donate form, the sign-up), served at
// /_backgold/frame.css (src/pages/[skin]/frame.css.ts) and linked by each
// frame when the kit sends `skin` (src/template.ts `frameSkin`). The frame is
// another origin's page, so it cannot read this site's variables: her values
// are written in. What it draws, as boards U6–U9 draw the frames: labels in
// capitals, small and tracked, in the grey; square black fields on a
// strong hairline, white when focused; the white block submit in capitals
// that inverts on hover; no rounded corner, no shadow, no colour but white
// and the greys (a validation message keeps the frame's own status colour);
// a petition's count set huge; the cards as hairline boxes; the live feed
// (MovementTicker) as one line: the count, then each name and what they
// did, between hairlines.
//
// The selectors are the frames' markup as BackGold serves it today: the look
// root `.bg-look`, the `data-test-*` hooks on the event and petition frames,
// the sign-up's `gg-su-*` classes and the form controls' component classes
// (`.input`, `.btn`, `.checkbox`). Everything is scoped under the look root
// or the sign-up island, so a frame without them is left as it is.

const INK = '#ffffff'
const GROUND = '#000000'
const MUTED = '#949494'
const LINE = '#1a1a1a'
const LINE_STRONG = '#616161'

/** The meta line: small capitals, tracked. */
const META = `font-size: 11px !important; line-height: 1.4 !important; font-weight: 400 !important; letter-spacing: 0.1em !important; text-transform: uppercase !important;`

export const FRAME_SKIN_CSS = `/* Unlabeled: BackGold's frames in her look. */
:root { color-scheme: dark; }
html, body { background: transparent !important; }
:is(.bg-look, [data-gg-island]) { color: ${INK}; }

/* Square, flat. */
:is(.bg-look, [data-gg-island]) :is(*, *::before, *::after):not(.radio) { border-radius: 0 !important; }
:is(.bg-look, [data-gg-island]) :is([class*='shadow-'], .card, .gg-look-panel, .gg-ptask) { box-shadow: none !important; }

/* The cards: hairline boxes on black. */
.bg-look :is([data-test-event-rsvp-card], .gg-look-panel, .gg-ptask, .card) {
  background: ${GROUND} !important;
  border: 1px solid ${LINE_STRONG} !important;
}
.bg-look :is(.bg-base-100, .bg-base-200) { background-color: ${GROUND} !important; }
.bg-look .border-base-300 { border-color: ${LINE} !important; }

/* Headings: the display face in capitals, weight 500. */
.bg-look :is(h1, h2, h3, [data-test-event-free-heading], .gg-ptask .font-extrabold) {
  font-weight: 500 !important;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.bg-look :is(h3, [data-test-event-free-heading], .gg-ptask .font-extrabold) { font-size: 22px !important; line-height: 1.1 !important; }

/* Grey words: everything the frame dims. */
:is(.bg-look, [data-gg-island]) [class*='text-base-content/'] { color: ${MUTED} !important; }

/* Labels and the small print: the meta line. */
.bg-look :is(label.block, span.block.font-semibold, [data-test-event-question] > span.font-semibold, [data-test-event-guests] .font-semibold),
.bg-look :is([data-test-event-donor-hint], [data-test-petition-express-hint], [data-test-event-free-footnote], [data-test-event-guests-help], [data-test-petition-latest-signer]),
.gg-su :is(.gg-su-account-hint, .gg-su-fine) {
  ${META}
  color: ${MUTED} !important;
}
.bg-look :is(label.block, [data-test-event-question] > span.font-semibold) { margin-bottom: 6px !important; }
/* The required mark and the petition's own accents: white, never a colour. */
.bg-look :is(label, span.font-semibold) :is(.text-error, .text-primary),
.bg-look :is(.text-primary, .text-success):not(.alert *):not([role='alert'] *) { color: ${INK} !important; }

/* Links: white, underlined. */
:is(.bg-look, [data-gg-island]) :is(a, .link) { color: ${INK} !important; text-decoration: underline; text-underline-offset: 0.22em; text-decoration-thickness: 1px; }

/* Fields: square black boxes on the strong hairline, white when focused. */
:is(.bg-look, [data-gg-island]) :is(.input, .textarea, .select, .gg-su-input) {
  min-height: 46px;
  background: ${GROUND} !important;
  border: 1px solid ${LINE_STRONG} !important;
  color: ${INK} !important;
  font-size: 14px !important;
  outline: none !important;
}
:is(.bg-look, [data-gg-island]) :is(.input, .textarea, .select, .gg-su-input)::placeholder { color: #737373; opacity: 1; }
:is(.bg-look, [data-gg-island]) :is(.input, .textarea, .select, .gg-su-input):focus {
  border-color: ${INK} !important;
  box-shadow: inset 0 0 0 1px ${INK} !important;
}
.bg-look :is(.checkbox, .radio) { border: 1px solid ${LINE_STRONG} !important; background-color: ${GROUND}; }
.bg-look .checkbox:checked { background-color: ${INK} !important; border-color: ${INK} !important; color: ${GROUND} !important; --chkbg: ${INK}; --chkfg: ${GROUND}; }
.bg-look .radio:checked { background-color: ${INK} !important; border-color: ${INK} !important; box-shadow: 0 0 0 3px ${GROUND} inset !important; }

/* The submit: the white block, capitals, inverting on hover. */
:is(.bg-look, [data-gg-island]) :is(button[type='submit'], .btn-primary, .btn-secondary, .gg-su-submit) {
  min-height: 52px;
  background: ${INK} !important;
  border: 1px solid ${INK} !important;
  color: ${GROUND} !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase !important;
}
:is(.bg-look, [data-gg-island]) :is(button[type='submit'], .btn-primary, .btn-secondary, .gg-su-submit):is(:hover, :focus-visible) {
  background: ${GROUND} !important;
  color: ${INK} !important;
}
/* The other buttons (the guest steppers, choices): hairline boxes that invert. */
.bg-look .btn:not(.btn-primary):not(.btn-secondary):not([type='submit']) {
  background: ${GROUND} !important;
  border: 1px solid ${LINE_STRONG} !important;
  color: ${INK} !important;
  font-weight: 500 !important;
}
.bg-look .btn:not(.btn-primary):not(.btn-secondary):not([type='submit']):hover { background: ${INK} !important; color: ${GROUND} !important; }
.bg-look [data-test-event-guests] { border-color: ${LINE_STRONG} !important; }
.bg-look [data-test-event-guests-count] { font-weight: 500 !important; font-size: 18px !important; }

/* A petition's count, set huge, and its bar: white on the hairline. */
.bg-look [data-test-petition-count] .text-4xl {
  font-size: clamp(72px, 14vw, 132px) !important;
  font-weight: 500 !important;
  line-height: 0.9 !important;
  letter-spacing: -0.02em;
  color: ${INK} !important;
}
.bg-look [data-test-petition-count] .text-sm { ${META} color: ${MUTED} !important; }
.bg-look [data-test-petition-count] .bg-base-300 { background-color: ${LINE} !important; height: 4px !important; }
.bg-look [data-test-petition-count] .bg-primary { background-color: ${INK} !important; }

/* The sign-up's opening line: the meta line, not a headline. */
section[data-gg-band] > div > p:first-child { ${META} color: ${MUTED} !important; text-align: left !important; }

/* The live feed: one line, no card. */
[data-gg-island='movementticker'] { padding: 0 !important; background: transparent !important; min-height: 0 !important; }
[data-gg-island='movementticker'] .gg-mt-panel { display: flex; align-items: center; max-width: none !important; margin: 0 !important; padding: 0 !important; background: none !important; color: ${INK} !important; overflow: hidden; }
[data-gg-island='movementticker'] .gg-mt-total { display: flex; align-items: baseline; gap: 10px; flex: none; margin: 0 !important; padding: 0 24px 0 16px; white-space: nowrap; }
[data-gg-island='movementticker'] .gg-mt-total-num { font-size: 22px !important; font-weight: 500 !important; background: none !important; -webkit-text-fill-color: ${INK} !important; color: ${INK} !important; }
[data-gg-island='movementticker'] .gg-mt-total-label { ${META} display: inline !important; margin: 0 !important; color: ${MUTED} !important; }
[data-gg-island='movementticker'] .gg-mt-feed { flex-direction: row !important; flex-wrap: nowrap; gap: 0 !important; margin: 0 !important; min-width: 0; overflow: hidden; }
[data-gg-island='movementticker'] .gg-mt-row { flex: none; gap: 10px !important; padding: 14px 24px !important; border-top: 0 !important; border-left: 1px solid ${LINE} !important; animation: none !important; white-space: nowrap; }
[data-gg-island='movementticker'] .gg-mt-avatar, [data-gg-island='movementticker'] .gg-mt-dot { display: none !important; }
[data-gg-island='movementticker'] .gg-mt-body { display: flex; align-items: baseline; gap: 10px; }
[data-gg-island='movementticker'] :is(.gg-mt-name, .gg-mt-ctx, .gg-mt-time, .gg-mt-tag) { ${META} display: inline !important; }
[data-gg-island='movementticker'] .gg-mt-name { color: ${INK} !important; }
[data-gg-island='movementticker'] :is(.gg-mt-ctx, .gg-mt-time, .gg-mt-tag) { color: ${MUTED} !important; border: 0 !important; padding: 0 !important; }
[data-gg-island='movementticker'] .gg-mt-amt { background: none !important; -webkit-text-fill-color: ${INK} !important; color: ${INK} !important; }
[data-gg-island='movementticker'] :is(.gg-mt-stats, .gg-mt-note) { display: none !important; }

/* The petition island (a petition's map and coverage layouts): the sheet flat on black, the tally huge. */
[data-gg-island='petition'] :is(.gg-pt-sheet, .gg-pt-body) { background: transparent !important; border: 0 !important; box-shadow: none !important; }
[data-gg-island='petition'] .gg-pt-card { background: ${GROUND} !important; border: 1px solid ${LINE_STRONG} !important; box-shadow: none !important; }
[data-gg-island='petition'] :is(.gg-pt-org, .gg-pt-goalnote, .gg-pt-week, .gg-pt-account-hint, .gg-pt-addr, .gg-pt-field > span, .gg-pt-tally-of) { ${META} color: ${MUTED} !important; }
[data-gg-island='petition'] :is(.gg-pt-title, .gg-pt-cardhead) { font-weight: 500 !important; text-transform: uppercase; color: ${INK} !important; }
[data-gg-island='petition'] .gg-pt-summary, [data-gg-island='petition'] .gg-pt-statement { color: ${INK} !important; }
[data-gg-island='petition'] .gg-pt-statement { border-left: 1px solid ${LINE_STRONG} !important; }
[data-gg-island='petition'] .gg-pt-ask-n { background: ${GROUND} !important; border: 1px solid ${LINE_STRONG} !important; color: ${INK} !important; }
[data-gg-island='petition'] .gg-pt-tally-big { font-size: clamp(72px, 14vw, 132px) !important; font-weight: 500 !important; line-height: 0.9 !important; color: ${INK} !important; }
[data-gg-island='petition'] .gg-pt-tally-bar { background: ${LINE} !important; height: 4px !important; border: 0 !important; }
[data-gg-island='petition'] .gg-pt-tally-fill { background: ${INK} !important; }
[data-gg-island='petition'] :is(.gg-pt-input, .gg-pt-textarea) { min-height: 46px; background: ${GROUND} !important; border: 1px solid ${LINE_STRONG} !important; color: ${INK} !important; }
[data-gg-island='petition'] :is(.gg-pt-input, .gg-pt-textarea):focus { border-color: ${INK} !important; box-shadow: inset 0 0 0 1px ${INK} !important; outline: none !important; }
[data-gg-island='petition'] .gg-pt-check input { accent-color: ${INK}; }
[data-gg-island='petition'] .gg-pt-submit { min-height: 52px; background: ${INK} !important; border: 1px solid ${INK} !important; color: ${GROUND} !important; font-weight: 500 !important; letter-spacing: 0.1em !important; text-transform: uppercase !important; box-shadow: none !important; }
[data-gg-island='petition'] .gg-pt-submit:is(:hover, :focus-visible) { background: ${GROUND} !important; color: ${INK} !important; }
`
