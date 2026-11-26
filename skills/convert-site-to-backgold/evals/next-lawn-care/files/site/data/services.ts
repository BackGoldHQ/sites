export interface Service {
  slug: string
  name: string
  price: number
  unit: string
  summary: string
  body: string[]
  includes: string[]
  faqs: { q: string; a: string }[]
}

export const SERVICES: Service[] = [
  {
    slug: 'mowing',
    name: 'Weekly mowing',
    price: 45,
    unit: 'per visit',
    summary: 'Mow, edge and blow, the same day every week from April to October.',
    body: [
      'We mow at three inches through the summer so the lawn shades its own roots, and we alternate the pattern every visit so the mower does not wear ruts.',
      'Edges are cut with a blade, not a string, along every walk and drive. Clippings are mulched back unless the grass got away from us after rain.',
    ],
    includes: ['Mowing at the right height for the month', 'Blade edging', 'Walks and drive blown clean'],
    faqs: [
      { q: 'What if it rains on my day?', a: 'We come the next dry day and text you the night before.' },
      { q: 'Do I need to be home?', a: 'No. We only need the gate unlocked.' },
    ],
  },
  {
    slug: 'aeration',
    name: 'Core aeration',
    price: 120,
    unit: 'per lawn',
    summary: 'Plugs pulled across the whole lawn in spring or fall, with overseeding if you want it.',
    body: [
      'Clay under Cedar Hollow packs hard. Pulling cores lets water and air back down to the roots, and it is the single best thing for a thin lawn.',
      'We mark sprinkler heads first. Leave the plugs where they fall; they break down in two weeks.',
    ],
    includes: ['Two passes on compacted areas', 'Sprinkler heads flagged', 'Overseeding for $40 more'],
    faqs: [{ q: 'When is the best time?', a: 'September, once the nights cool. April is second best.' }],
  },
  {
    slug: 'cleanup',
    name: 'Spring and fall cleanup',
    price: 180,
    unit: 'from',
    summary: 'Leaves, beds and the first or last cut, hauled away.',
    body: ['Beds are cleared by hand, leaves are hauled off, perennials are cut back and the lawn gets its first or last mow of the year.'],
    includes: ['Leaf removal and haul-away', 'Beds cleared and edged', 'Perennials cut back'],
    faqs: [{ q: 'Do you haul everything away?', a: 'Yes. Nothing is left at the curb.' }],
  },
  {
    slug: 'hedges',
    name: 'Hedge trimming',
    price: 60,
    unit: 'per hour',
    summary: 'Shaped by hand shears where it shows, power trimmed where it does not.',
    body: ['We trim after the spring flush and again in late summer. Flowering shrubs are cut after they bloom, never before.'],
    includes: ['Clippings raked and removed', 'Tools disinfected between yards'],
    faqs: [],
  },
]
