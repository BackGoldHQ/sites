import { describe, expect, it } from 'vitest'
import type { MenuNode } from '@backgold/astro/server'
import { tidyHeaderMenu } from '@backgold/template-kit/lib/menu'
import { meetingHolds } from '../src/lib/last-meeting'

const link = (label: string, href: string | null, children: MenuNode[] = [], current = false): MenuNode => ({
  label,
  kind: children.length > 0 ? 'group' : 'page',
  href,
  rel: undefined,
  current,
  children,
})
const shape = (nodes: MenuNode[]): unknown => nodes.map((n) => (n.children.length > 0 ? [n.label, shape(n.children)] : `${n.label} ${n.href}`))

describe('tidyHeaderMenu (the kit header menu, her twin as it was on 10-20)', () => {
  const donate = link('DONATE', '/donate')

  it('never draws the header button as a plain item too, by its label at any address', () => {
    const out = tidyHeaderMenu([link('HOME', '/'), link('DONATE', '/donate-2'), link('Donate', '/donate')], donate)
    expect(shape(out)).toEqual(['HOME /'])
  })

  it("keeps an item at the button's address under another label (a drive's The petition)", () => {
    const out = tidyHeaderMenu([link('The petition', '/#petition')], link('Sign the petition', '/#petition'))
    expect(shape(out)).toEqual(['The petition /#petition'])
  })

  it('draws two same siblings once and folds a group of one link into a plain item', () => {
    const events = link('EVENTS', '/events', [link('EVENTS', '/events'), link('EVENTS', '/events')])
    const vote = link('VOTE', null, [link('I VOTED — SHARE YOUR STORY', '/i-voted-share', [], true)])
    const out = tidyHeaderMenu([events, vote], donate)
    expect(shape(out)).toEqual(['EVENTS /events', 'VOTE /i-voted-share'])
    expect(out[1]!.current).toBe(true)
  })

  it('keeps a group with two links, and its own address first only once', () => {
    const bisd = link('BISD', null, [link('Archive', '/archive'), link('BISD: PETITION', '/bisd-petition'), link('Archive', '/archive')])
    expect(shape(tidyHeaderMenu([bisd], null))).toEqual([['BISD', ['Archive /archive', 'BISD: PETITION /bisd-petition']]])
  })

  it('leaves out a group whose only link was the header button', () => {
    expect(shape(tidyHeaderMenu([link('GIVE', null, [link('Donate', '/donate')])], donate))).toEqual([])
  })
})

describe('meetingHolds (the event page archive door)', () => {
  it('says what a meeting page holds', () => {
    expect(meetingHolds({ meeting_kind: 'Regular meeting', agenda_pdf: { url: 'x' }, resolutions_link: 'y', minutes_pdf: null })).toEqual([
      'Regular meeting',
      'Agenda and resolutions',
      'No minutes yet',
    ])
    expect(meetingHolds({ agenda_link: 'a', minutes_link: 'm' })).toEqual(['Agenda', 'Minutes'])
  })
})
