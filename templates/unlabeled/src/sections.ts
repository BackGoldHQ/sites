// Every section type and layout this template draws, by '<Type>' and
// '<Type>:<layout>': the kit's, her own (the home cover, the ticker, the
// petition's sheet, the letter, the agenda) and the archive's
// (src/archive.ts), later ones winning. src/template.ts hands each key to
// Filed.astro, which draws the band's running head and then this component.
import { kitSections, type AstroComponent } from '@backgold/template-kit/template'
import { archiveSections } from './archive'
import AboutLetter from './components/sections/About/letter.astro'
import EventsAgenda from './components/sections/EventsList/agenda.astro'
import HeroCover from './components/sections/Hero/cover.astro'
import MovementTicker from './components/sections/MovementTicker/index.astro'
import Petition from './components/sections/Petition/Sheet.astro'

export const drawn: Record<string, AstroComponent> = {
  ...kitSections,
  'Hero:cover': HeroCover,
  'About:letter': AboutLetter,
  'EventsList:agenda': EventsAgenda,
  MovementTicker,
  'MovementTicker:ticker': MovementTicker,
  Petition,
  'Petition:none': Petition,
  'Petition:image': Petition,
  'Petition:map': Petition,
  'Petition:coverage': Petition,
  ...archiveSections,
}

/** The layouts that draw their own running head (or carry none: a line, a strip). */
export const OWN_HEAD = new Set(['Hero:cover', 'About:letter', 'MovementTicker', 'MovementTicker:ticker', 'Cta:strip'])
