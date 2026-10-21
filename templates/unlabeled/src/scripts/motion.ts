// The site's motion that CSS cannot do alone (src/styles/template.css § 6
// holds the rest), loaded once a page from Filed.astro, the event page, the
// 404 and the archive's frame. The page as the server sends it is the
// finished page: nothing here runs for a visitor who asked for reduced
// motion, and nothing it does hides a word for good. Nothing loops.
//
//   decode    a heading (`[data-u-decode]`) and every running head's words
//             resolve through her ornament glyphs, left to right, once.
//   odometer  the archive's holdings and a petition's typed figures roll up
//             digit by digit the first time they are seen (never money, pay
//             or a count BackGold's frame draws).
//   redact    the manifesto (About) and an issue's statement start as white
//             bars, word by word or sentence by sentence, and retract as the
//             paragraph comes into view: a redacted file where nothing is.
//   folio     on a long page, once the header has scrolled away, a hairline at
//             the top of the window grows as you read (CSS, scroll-driven),
//             with the band you are in (`§ 03 / 07`) at its right.

const GLYPHS = '/[]§#01_×'
const STILL = /[\s.,:;'’"“”!?()–—\-&$%]/

const seen = (els: Iterable<Element>, run: (el: HTMLElement) => void, margin = '0px 0px -15% 0px') => {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        io.unobserve(entry.target)
        run(entry.target as HTMLElement)
      }
    },
    { rootMargin: margin },
  )
  for (const el of els) io.observe(el)
}

/** Resolves an element's text through the glyphs; the element holds only text. */
function decode(el: HTMLElement): void {
  const final = el.textContent ?? ''
  if (!final.trim() || el.children.length > 0) return
  if (!el.closest('[aria-hidden="true"]')) el.setAttribute('aria-label', final.trim())
  const shown = document.createElement('span')
  shown.setAttribute('aria-hidden', 'true')
  el.replaceChildren(shown)
  const chars = [...final]
  const limit = chars.length > 60 ? 24 : chars.length
  let frame = 0
  const step = () => {
    frame += 1
    let done = true
    shown.textContent = chars
      .map((c, k) => {
        if (k >= limit || STILL.test(c) || frame >= 4 + k * 1.2) return c
        done = false
        return GLYPHS[(k * 7 + frame) % GLYPHS.length]
      })
      .join('')
    if (!done) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Rolls a figure's digits up from 0, rightmost first; separators stay put. */
export function odometer(el: HTMLElement, value = el.textContent ?? ''): void {
  if (!/^[\d,.\s]+$/.test(value.trim())) return
  el.setAttribute('aria-label', value.trim())
  const digits = [...value.trim()]
  const wheels = digits.map((c, i) => {
    if (!/\d/.test(c)) return Object.assign(document.createElement('span'), { textContent: c })
    const wheel = document.createElement('span')
    wheel.className = 'u-odo-d'
    wheel.style.setProperty('--k', String(digits.length - 1 - i))
    const column = document.createElement('span')
    for (let d = 0; d < 10; d++) column.append(Object.assign(document.createElement('span'), { textContent: String(d) }))
    wheel.append(column)
    requestAnimationFrame(() => requestAnimationFrame(() => wheel.style.setProperty('--d', c)))
    return wheel
  })
  const run = document.createElement('span')
  run.className = 'u-odo'
  run.setAttribute('aria-hidden', 'true')
  run.append(...wheels)
  el.replaceChildren(run)
}

/** Wraps a paragraph's words (or, past 120 words in its section, its sentences) in bars. */
function redact(section: HTMLElement): void {
  const paragraphs = [...section.querySelectorAll<HTMLElement>('.about-right-words p, .u-letter-words p, .statement-lede')]
  const words = paragraphs.reduce((n, p) => n + (p.textContent ?? '').split(/\s+/).length, 0)
  const unit = words > 120 ? /(?<=[.!?])\s+/u : /\s+/u
  for (const p of paragraphs) {
    if (p.children.length > 0) continue
    const parts = (p.textContent ?? '').split(unit).filter(Boolean)
    p.style.setProperty('--n', String(parts.length))
    p.replaceChildren(
      ...parts.flatMap((part, i) => {
        const bar = Object.assign(document.createElement('span'), { className: 'u-redact', textContent: part })
        bar.style.setProperty('--i', String(i))
        return [bar, ' ']
      }),
    )
    p.classList.add('u-redacted')
  }
  seen(paragraphs, (p) => p.classList.add('is-read'), '0px 0px -40% 0px')
}

/** The reading rule and the live folio, on a page that runs past three screens. */
function folio(): void {
  const heads = [...document.querySelectorAll<HTMLElement>('main .u-running-head')]
  if (heads.length < 2 || document.documentElement.scrollHeight < innerHeight * 3) return
  const bar = document.createElement('div')
  bar.className = 'u-reading'
  bar.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  bar.append(label)
  document.body.append(bar)
  const pad = (n: number) => String(n).padStart(2, '0')
  const show = (n: number) => (label.textContent = `§ ${pad(n)} / ${pad(heads.length)}`)
  // The band you are in: the last running head above the window's middle.
  let queued = false
  const update = () => {
    queued = false
    const middle = innerHeight * 0.45
    show(Math.max(1, heads.filter((h) => h.getBoundingClientRect().top < middle).length))
  }
  addEventListener('scroll', () => {
    if (!queued) requestAnimationFrame(update)
    queued = true
  }, { passive: true })
  update()
  const header = document.querySelector('.site-header')
  if (header) new IntersectionObserver(([e]) => bar.classList.toggle('is-on', !e!.isIntersecting)).observe(header)
}

if (matchMedia('(prefers-reduced-motion: no-preference)').matches && 'IntersectionObserver' in window) {
  seen(document.querySelectorAll('[data-u-decode]'), decode, '0px')
  seen(document.querySelectorAll('main .u-running-head .u-rh-words'), decode)
  seen(document.querySelectorAll('.ar-holdings .u-numeral, .u-petition-figures .u-numeral'), (el) => odometer(el))
  document.querySelectorAll<HTMLElement>(".bg-section[data-type='About'], .bg-section.hero-statement").forEach(redact)
  folio()
}
