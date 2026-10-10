// Which component renders each section type, by the type's name in BackGold.
// `<Section components={sections}>` (from @backgold/astro) looks a section up
// here as '<Type>:<variant>' first, where the variant is the section's stored
// layout (the Layout chosen in BackGold), then as '<Type>'; a type that is
// not listed renders through the package's DefaultSection, so a block
// BackGold adds later still shows. The areas (src/layouts/Site.astro and the
// Sidebar in src/pages/[...path].astro) draw their sections through this map
// too, TakeoverBanner among them.
//
// Each type has a directory: `<Type>/index.astro` is its default layout (the
// first one template.json lists) and `<Type>/<layout>.astro` each other
// layout template.json lists for it. Every layout template.json names is
// registered below; a layout BackGold stores that is not listed falls back to
// `<Type>/index.astro`, which gets the layout as its `variant` prop.
//
// Money and consent modules (Donate, FormBlock, PollBlock, Petition, Store,
// Event, Calendar, SignupCapture, SocialFrame, Advocacy) are deliberately
// not listed: they render as BackGold's own embed, which keeps contribution
// limits, receipts and consent on BackGold's side. Do not add them here.

import About from './About/index.astro'
import Blog from './Blog/index.astro'
import CandidateRoster from './CandidateRoster/index.astro'
import Collection from './Collection/index.astro'
import ContentPost from './ContentPost/index.astro'
import Countdown from './Countdown/index.astro'
import Cta from './Cta/index.astro'
import EventsList from './EventsList/index.astro'
import Hero from './Hero/index.astro'
import Issues from './Issues/index.astro'
import Leaderboard from './Leaderboard/index.astro'
import MapSection from './Map/index.astro'
import MovementMap from './MovementMap/index.astro'
import MovementTicker from './MovementTicker/index.astro'
import PdfEmbed from './PdfEmbed/index.astro'
import PlatformPlanks from './PlatformPlanks/index.astro'
import Progress from './Progress/index.astro'
import QuoteStrip from './QuoteStrip/index.astro'
import SocialFeed from './SocialFeed/index.astro'
import StatCards from './StatCards/index.astro'
import TeamGrid from './TeamGrid/index.astro'
import VideoEmbed from './VideoEmbed/index.astro'

import AboutLeft from './About/left.astro'
import AboutLetter from './About/letter.astro'
import BlogList from './Blog/list.astro'
import BlogFeature from './Blog/feature.astro'
import CandidateRosterBallot from './CandidateRoster/ballot.astro'
import CandidateRosterCompact from './CandidateRoster/compact.astro'
import CollectionList from './Collection/list.astro'
import CollectionCompact from './Collection/compact.astro'
import CtaBanner from './Cta/banner.astro'
import CtaPhoto from './Cta/photo.astro'
import CtaStrip from './Cta/strip.astro'
import EventsListCards from './EventsList/cards.astro'
import EventsListAgenda from './EventsList/agenda.astro'
import HeroCover from './Hero/cover.astro'
import HeroSplit from './Hero/split.astro'
import HeroStatement from './Hero/statement.astro'
import IssuesSteps from './Issues/steps.astro'
import IssuesNumbered from './Issues/numbered.astro'
import MapSectionMap from './Map/map.astro'
import PdfEmbedMedium from './PdfEmbed/medium.astro'
import PdfEmbedTall from './PdfEmbed/tall.astro'
import PlatformPlanksLongread from './PlatformPlanks/longread.astro'
import QuoteStripSingle from './QuoteStrip/single.astro'
import StatCardsRibbon from './StatCards/ribbon.astro'
import TeamGridBoard from './TeamGrid/board.astro'
import VideoEmbedLandscape from './VideoEmbed/landscape.astro'
import VideoEmbedPortrait from './VideoEmbed/portrait.astro'
import VideoEmbedSquare from './VideoEmbed/square.astro'
import TakeoverBanner from '../chrome/TakeoverBanner.astro'

export const sections = {
  Hero,
  'Hero:cover': HeroCover,
  'Hero:split': HeroSplit,
  'Hero:statement': HeroStatement,
  About,
  'About:left': AboutLeft,
  'About:letter': AboutLetter,
  Issues,
  'Issues:steps': IssuesSteps,
  'Issues:numbered': IssuesNumbered,
  StatCards,
  'StatCards:ribbon': StatCardsRibbon,
  Cta,
  'Cta:banner': CtaBanner,
  'Cta:strip': CtaStrip,
  'Cta:photo': CtaPhoto,
  QuoteStrip,
  'QuoteStrip:single': QuoteStripSingle,
  Map: MapSection,
  'Map:map': MapSectionMap,
  MovementMap,
  VideoEmbed,
  'VideoEmbed:landscape': VideoEmbedLandscape,
  'VideoEmbed:portrait': VideoEmbedPortrait,
  'VideoEmbed:square': VideoEmbedSquare,
  PdfEmbed,
  'PdfEmbed:medium': PdfEmbedMedium,
  'PdfEmbed:tall': PdfEmbedTall,
  Progress,
  Countdown,
  Leaderboard,
  SocialFeed,
  MovementTicker,
  EventsList,
  'EventsList:cards': EventsListCards,
  'EventsList:agenda': EventsListAgenda,
  Blog,
  'Blog:list': BlogList,
  'Blog:feature': BlogFeature,
  Collection,
  'Collection:list': CollectionList,
  'Collection:compact': CollectionCompact,
  ContentPost,
  PlatformPlanks,
  'PlatformPlanks:longread': PlatformPlanksLongread,
  CandidateRoster,
  'CandidateRoster:ballot': CandidateRosterBallot,
  'CandidateRoster:compact': CandidateRosterCompact,
  TeamGrid,
  'TeamGrid:board': TeamGridBoard,
  TakeoverBanner,
}
