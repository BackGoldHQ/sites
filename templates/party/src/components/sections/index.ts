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
// BackGold's money and consent modules (Donate, FormBlock, PollBlock,
// Petition, Store, Event, Calendar, SignupCapture, Advocacy) are listed for
// their frame only: each draws its section's heading and its card around
// BackGold's own frame (modules/ModuleFrame.astro),
// which it asks to wear the site in the chosen layout. The fields, limits,
// receipts and consent stay inside BackGold's frame; never draw them here.
// SocialFrame has no frame a site can place and stays unlisted.

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
import EventsListCalendar from './EventsList/calendar.astro'
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
import Donate from './Donate/index.astro'
import DonateStory from './Donate/story.astro'
import FormBlock from './FormBlock/index.astro'
import FormBlockWide from './FormBlock/wide.astro'
import PollBlock from './PollBlock/index.astro'
import SignupCapture from './SignupCapture/index.astro'
import SignupCaptureBand from './SignupCapture/band.astro'
import SignupCaptureInline from './SignupCapture/inline.astro'
import Petition from './Petition/index.astro'
import PetitionImage from './Petition/image.astro'
import PetitionMap from './Petition/map.astro'
import PetitionCoverage from './Petition/coverage.astro'
import Event from './Event/index.astro'
import EventCard from './Event/card.astro'
import Store from './Store/index.astro'
import StoreFeatured from './Store/featured.astro'
import Calendar from './Calendar/index.astro'
import CalendarAgenda from './Calendar/agenda.astro'
import Advocacy from './Advocacy/index.astro'
import AdvocacyCompact from './Advocacy/compact.astro'

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
  'EventsList:calendar': EventsListCalendar,
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
  Donate,
  'Donate:story': DonateStory,
  FormBlock,
  'FormBlock:wide': FormBlockWide,
  PollBlock,
  SignupCapture,
  'SignupCapture:band': SignupCaptureBand,
  'SignupCapture:inline': SignupCaptureInline,
  Petition,
  'Petition:image': PetitionImage,
  'Petition:map': PetitionMap,
  'Petition:coverage': PetitionCoverage,
  Event,
  'Event:card': EventCard,
  Store,
  'Store:featured': StoreFeatured,
  Calendar,
  'Calendar:agenda': CalendarAgenda,
  Advocacy,
  'Advocacy:compact': AdvocacyCompact,
}
