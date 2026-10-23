// The academy's motion that CSS cannot do alone (src/styles/template.css
// § Motion holds the rest), loaded once a page from Kindled.astro. The page
// as the server sends it is the finished page: nothing here runs for a
// visitor who asked for reduced motion, and nothing it does hides a word for
// good. Nothing loops (the field hero's motes are the kit's).
//
//   odometer  the field hero's proof line (`[data-ak-count]`): each count
//             rolls up once on load, each digit in its cell from 0. Counts
//             only, never money.
//   seen      where the browser has scroll-driven animations, the bands
//             already in the window are marked `ak-seen` and stay finished,
//             then `ak-scroll` on the root lets the stylesheet play the
//             ember rule and the heading's rise on every other band's view
//             timeline as it comes in.
//   kindle    elsewhere, from the visitor's first scroll, each section's
//             kicker and the heading under it that are still below the fold
//             wait (`ak-wait`) and play once as they come into view
//             (`ak-lit`): the ember rule draws in under the kicker, the
//             heading rises. Before that first scroll nothing waits, so a
//             page read without scrolling is the finished page.

/** Rolls a figure's digits up from 0 in their cells, the rightmost first. */
function odometer(el: HTMLElement): void {
  const cells = [...el.querySelectorAll<HTMLElement>('.ak-digit')]
  cells.forEach((cell, i) => {
    const digit = cell.textContent ?? '0'
    const column = document.createElement('span')
    for (let d = 0; d < 10; d++) column.append(Object.assign(document.createElement('span'), { textContent: String(d) }))
    cell.classList.add('ak-odo-d')
    cell.style.setProperty('--k', String(cells.length - 1 - i))
    cell.replaceChildren(column)
    requestAnimationFrame(() => requestAnimationFrame(() => cell.style.setProperty('--d', digit)))
  })
}

/** The bands the window already shows stay as they are; every other band plays as it comes in. */
function seen(): void {
  for (const band of document.querySelectorAll<HTMLElement>('main .bg-section')) {
    if (band.getBoundingClientRect().top < innerHeight) band.classList.add('ak-seen')
  }
  document.documentElement.classList.add('ak-scroll')
}

/** The section kickers and the headings under them still below the fold wait, then play once as they come into view. */
function kindle(): void {
  const targets = [...document.querySelectorAll<HTMLElement>('main .bg-section .kicker + h2')].flatMap((h) => [h.previousElementSibling as HTMLElement, h])
  const below = targets.filter((el) => el.getBoundingClientRect().top > innerHeight)
  if (below.length === 0) return
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        io.unobserve(entry.target)
        entry.target.classList.replace('ak-wait', 'ak-lit')
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  for (const el of below) {
    el.classList.add('ak-wait')
    io.observe(el)
  }
}

if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  document.querySelectorAll<HTMLElement>('.ak-proof [data-ak-count]').forEach(odometer)
  if (CSS.supports('animation-timeline: view()')) seen()
  else if ('IntersectionObserver' in window) addEventListener('scroll', kindle, { once: true, passive: true })
}
