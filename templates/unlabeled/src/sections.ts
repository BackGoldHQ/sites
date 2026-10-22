// Every section type and layout this template draws, by '<Type>' and
// '<Type>:<layout>': the kit's, her own (the home cover, also for a centered
// Hero with a video or photo, the ticker, the petition's sheet, the letter,
// the agenda, the newsletter's numbered Collection list) and the archive's
// (src/archive.ts), later ones winning. src/template.ts hands each key to
// Filed.astro, which draws the band's running head and then this component.
import { kitSections, type AstroComponent } from '@backgold/template-kit/template'
import { archiveSections } from './archive'
import AboutLetter from './components/sections/About/letter.astro'
import CollectionList from './components/sections/Collection/list.astro'
import EventsAgenda from './components/sections/EventsList/agenda.astro'
import HeroCover from './components/sections/Hero/cover.astro'
import HeroFramed from './components/sections/Hero/framed.astro'
import MovementTicker from './components/sections/MovementTicker/index.astro'
import Petition from './components/sections/Petition/Sheet.astro'

export const drawn: Record<string, AstroComponent> = {
  ...kitSections,
  // A centered Hero (or one naming no layout) with a video or a photo is the
  // cover (framed.astro); the video layout is the cover with its video playing.
  Hero: HeroFramed,
  'Hero:centered': HeroFramed,
  'Hero:video': HeroCover,
  'Hero:cover': HeroCover,
  'About:letter': AboutLetter,
  // A list of the newsletter's issues numbers them from the oldest; any other list is the kit's.
  'Collection:list': CollectionList,
  // An events list that names no layout is the agenda (U8); 'list' is the kit's list.
  EventsList: EventsAgenda,
  'EventsList:list': kitSections.EventsList!,
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
export const OWN_HEAD = new Set(['Hero', 'Hero:centered', 'Hero:video', 'Hero:cover', 'About:letter', 'MovementTicker', 'MovementTicker:ticker', 'Cta:strip'])
