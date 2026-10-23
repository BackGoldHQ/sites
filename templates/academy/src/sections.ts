// Every section type and layout this template draws, by '<Type>' and
// '<Type>:<layout>': the kit's, and the academy's own, later ones winning.
// src/template.ts hands each key to Kindled.astro, which draws the layout
// named here and loads the template's motion once a page.
//
// The academy's own: Hero · field with the proof line under its buttons
// (the counts from the Content API); Course · outline as the free course's
// feature card (its cover, the first four lessons, Play lesson 1); a
// Collection's cards as conversations (16:9 stills, the guest line, length
// and date); and Pathways · doors as doors of a title, a line and a link.
import { kitSections, type AstroComponent } from '@backgold/template-kit/template'
import Conversations from './components/sections/Conversations.astro'
import CourseFeature from './components/sections/CourseFeature.astro'
import Doors from './components/sections/Doors.astro'
import HeroField from './components/sections/HeroField.astro'

export const drawn: Record<string, AstroComponent> = {
  ...kitSections,
  'Hero:field': HeroField,
  'Course:outline': CourseFeature,
  // A Collection that names no layout, or `cards`, is the conversations grid; `list` is the kit's.
  Collection: Conversations,
  'Collection:cards': Conversations,
  // A Pathways that names no layout, or `doors`, is the academy's doors; `tabs` and `quiz` are the kit's.
  Pathways: Doors,
  'Pathways:doors': Doors,
}
