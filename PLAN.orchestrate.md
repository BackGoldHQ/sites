# PLAN — Unlabeled twin gaps pass: sites side (2026-10-22)

Workstream node: `BackGold WS: Unlabeled twin gaps pass (2026-10-22)`.
Branch: `jhl/unlabeled-gaps` (this repo, off origin/main a771492). The platform
side (the starter content pass script) runs on `jhl/unlabeled-content-pass` in
gitlab.com/backgold/backgold. Landing: GitLab MRs (as the 2026-10-21 build;
Assay not used for sites). Brief: the 2026-10-22 gap report (boards U1–U11 +
U-cat in the platform repo's `docs/design/unlabeled-site-2026-10/`, live twin
https://unlabeled.backgold.dev).

Interface decisions already made:
- Each task adds its styles in its own new CSS file imported by its component
  (not in `archive.css`/`template.css`) unless it owns that file (T3 owns
  `archive.css`, T4 owns `template.css`).
- Scripts-off base state is the finished page (MOTION.md rule 1); no new
  runtime dependency; colours stay the seven tokens, status colours only inside
  BackGold's frames.
- Kit changes are opt-in through `TemplateConfig` so other templates' output
  is byte-identical (T4).
- Punted (not in this run): the original archive ZIP download (needs hosting),
  mono diagram renders and `agenda_item` fills (import data), left-04's detail
  lines (import data), per-card Issues links (contract), the event door's
  decision count, Details+RSVP two buttons per row.

Tasks (worktrees under ~/Code/backgold-sites-wt/<slug>, branch task/<slug>):
- [x] T1 `sites-money-records` — ramps + count parse, cross-bucket flow, money
      page balanced flows only, line-item sign, "filed twice" copy, pay
      workbook block
- [x] T2 `sites-meeting-sources` — agenda spine title fallback, venue line,
      next-meeting link, Agenda/Resolution tabs, source Text/PDF tabs, windowed
      pane, find stepper
- [ ] T3 `sites-archive-door-records` — Clear filters, phone filter sheet,
      parse lines, request row meta, kind labels, /records head + Show more,
      request reader + running head, disclaimer copy, DownloadLinks.csv +
      README.txt
- [x] T4 `sites-shell-chrome` — phone sheet bleed-through, sheet socials /
      inverted current / Close ×, trailing empty month, Issues grid + numerals,
      cover running head, footer socials column, newsletter Issue nn, frame
      skin error red + JetBrains fields

Change-feed cursor: (set at dispatch)
