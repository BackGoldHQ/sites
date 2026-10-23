// Which component renders each section type, by the type's name in BackGold.
// `<Section components={sections}>` (from @backgold/astro) looks a section up
// here as '<Type>:<variant>' first, where the variant is the section's stored
// layout (the Layout chosen in BackGold), then as '<Type>'; a type that is
// not listed renders through the package's DefaultSection, so a block
// BackGold adds later still shows. The areas (src/layouts/Site.astro and the
// Sidebar in src/routes/catch-all.astro) draw their sections through this map
// too, TakeoverBanner among them. It is `kitSections` (src/template.ts); a
// template's own `sections` is this map with the layouts it draws itself
// added.
//
// Each type has a directory: `<Type>/index.astro` is its default layout (the
// first one a template.json lists) and `<Type>/<layout>.astro` each other
// layout it lists for it. Every layout the kit draws is registered below; a
// layout BackGold stores that the template's map does not list falls back to
// `<Type>/index.astro`, which gets the layout as its `variant` prop.
//
// BackGold's money and consent modules (Donate, FormBlock, PollBlock,
// Petition, Store, Event, Calendar, SignupCapture, Advocacy) are listed for
// their frame only: each draws its section's heading and its card around
// BackGold's own frame (modules/ModuleFrame.astro),
// which it asks to wear the site in the chosen layout. The fields, limits,
// receipts and consent stay inside BackGold's frame; never draw them here.
// SocialFrame has no frame a site can place and stays unlisted.
//
// The academy's sections (Classroom, Course, Lesson) read their courses for
// the visitor signed in on the site, if any (lib/visitor.ts): a section's
// baked rows are the public courses only, and a visitor's progress and locks
// come from the visitor's own reads, never from the cached page data.

import About from './About/index.astro'
import Blog from './Blog/index.astro'
import CandidateRoster from './CandidateRoster/index.astro'
import Classroom from './Classroom/index.astro'
import ClassroomList from './Classroom/list.astro'
import Collection from './Collection/index.astro'
import ContentPost from './ContentPost/index.astro'
import ContentPostPlayer from './ContentPost/player.astro'
import ContentPostBanner from './ContentPost/banner.astro'
import ContentPostTheater from './ContentPost/theater.astro'
import Countdown from './Countdown/index.astro'
import Course from './Course/index.astro'
import CourseOutline from './Course/outline.astro'
import Cta from './Cta/index.astro'
import EventsList from './EventsList/index.astro'
import Hero from './Hero/index.astro'
import Issues from './Issues/index.astro'
import Leaderboard from './Leaderboard/index.astro'
import Lesson from './Lesson/index.astro'
import LessonReading from './Lesson/reading.astro'
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
import AboutPortrait from './About/portrait.astro'
import AboutBooks from './About/books.astro'
import BlogList from './Blog/list.astro'
import BlogFeature from './Blog/feature.astro'
import CandidateRosterBallot from './CandidateRoster/ballot.astro'
import CandidateRosterCompact from './CandidateRoster/compact.astro'
import CollectionList from './Collection/list.astro'
import CollectionCompact from './Collection/compact.astro'
import CollectionFeature from './Collection/feature.astro'
import CollectionLibrary from './Collection/library.astro'
import CollectionShelves from './Collection/shelves.astro'
import CollectionOutline from './Collection/outline.astro'
import CtaBanner from './Cta/banner.astro'
import CtaCard from './Cta/card.astro'
import CtaPhoto from './Cta/photo.astro'
import CtaStrip from './Cta/strip.astro'
import EventsListCards from './EventsList/cards.astro'
import EventsListAgenda from './EventsList/agenda.astro'
import EventsListCalendar from './EventsList/calendar.astro'
import EventsListCompact from './EventsList/compact.astro'
import EventsListShifts from './EventsList/shifts.astro'
import EventsListWeek from './EventsList/week.astro'
import EventsListCohorts from './EventsList/cohorts.astro'
import EventsListMap from './EventsList/map.astro'
import HeroCover from './Hero/cover.astro'
import HeroSplit from './Hero/split.astro'
import HeroOverlap from './Hero/overlap.astro'
import HeroStatement from './Hero/statement.astro'
import HeroDonate from './Hero/donate.astro'
import HeroVideo from './Hero/video.astro'
import HeroRotating from './Hero/rotating.astro'
import HeroField from './Hero/field.astro'
import IssuesSteps from './Issues/steps.astro'
import IssuesNumbered from './Issues/numbered.astro'
import IssuesRows from './Issues/rows.astro'
import IssuesChecklist from './Issues/checklist.astro'
import IssuesTabs from './Issues/tabs.astro'
import IssuesDrawer from './Issues/drawer.astro'
import MapSectionMap from './Map/map.astro'
import MapSectionBar from './Map/bar.astro'
import PdfEmbedMedium from './PdfEmbed/medium.astro'
import PdfEmbedTall from './PdfEmbed/tall.astro'
import PdfEmbedCard from './PdfEmbed/card.astro'
import PlatformPlanksLongread from './PlatformPlanks/longread.astro'
import PlatformPlanksColumns from './PlatformPlanks/columns.astro'
import ProgressMatch from './Progress/match.astro'
import ProgressRing from './Progress/ring.astro'
import ProgressCompact from './Progress/compact.astro'
import QuoteStripSingle from './QuoteStrip/single.astro'
import QuoteStripTicker from './QuoteStrip/ticker.astro'
import QuoteStripLogos from './QuoteStrip/logos.astro'
import QuoteStripCarousel from './QuoteStrip/carousel.astro'
import QuoteStripWall from './QuoteStrip/wall.astro'
import StatCardsRibbon from './StatCards/ribbon.astro'
import StatCardsFeature from './StatCards/feature.astro'
import StatCardsWall from './StatCards/wall.astro'
import TeamGridBoard from './TeamGrid/board.astro'
import TeamGridList from './TeamGrid/list.astro'
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
import QuickDonate from './QuickDonate/index.astro'
import QuickDonateHero from './QuickDonate/hero.astro'
import QuickDonateBar from './QuickDonate/bar.astro'
import QuickDonateJar from './QuickDonate/jar.astro'
import QuickDonateBand from './QuickDonate/band.astro'
import QuickDonateLadder from './QuickDonate/ladder.astro'
import VoterTools from './VoterTools/index.astro'
import VoterToolsPolling from './VoterTools/polling.astro'
import VoterToolsDates from './VoterTools/dates.astro'
import SampleBallot from './SampleBallot/index.astro'
import SampleBallotCards from './SampleBallot/cards.astro'
import SampleBallotMeasures from './SampleBallot/measures.astro'
import Scorecard from './Scorecard/index.astro'
import ScorecardGrades from './Scorecard/grades.astro'
import ScorecardPromise from './Scorecard/promise.astro'
import Membership from './Membership/index.astro'
import MembershipTiers from './Membership/tiers.astro'
import MembershipCompare from './Membership/compare.astro'
import Faq from './Faq/index.astro'
import FaqTopics from './Faq/topics.astro'
import FaqCards from './Faq/cards.astro'
import Comparison from './Comparison/index.astro'
import ComparisonCards from './Comparison/cards.astro'
import ComparisonSpectrum from './Comparison/spectrum.astro'
import Stories from './Stories/index.astro'
import StoriesCards from './Stories/cards.astro'
import StoriesTimeline from './Stories/timeline.astro'
import ShareKit from './ShareKit/index.astro'
import ShareKitStrip from './ShareKit/strip.astro'
import ShareKitCompact from './ShareKit/compact.astro'
import Financials from './Financials/index.astro'
import FinancialsDonut from './Financials/donut.astro'
import FinancialsTable from './Financials/table.astro'
import Services from './Services/index.astro'
import ServicesList from './Services/list.astro'
import ServicesCompare from './Services/compare.astro'
import CaseStudies from './CaseStudies/index.astro'
import CaseStudiesGrid from './CaseStudies/grid.astro'
import CaseStudiesBeforeafter from './CaseStudies/beforeafter.astro'
import Resources from './Resources/index.astro'
import ResourcesFeatured from './Resources/featured.astro'
import ResourcesBand from './Resources/band.astro'
import Pathways from './Pathways/index.astro'
import PathwaysTabs from './Pathways/tabs.astro'
import PathwaysQuiz from './Pathways/quiz.astro'
import Portfolio from './Portfolio/index.astro'
import PortfolioFeatured from './Portfolio/featured.astro'
import PortfolioStrip from './Portfolio/strip.astro'
import MediaKit from './MediaKit/index.astro'
import MediaKitSpeaker from './MediaKit/speaker.astro'
import MediaKitPress from './MediaKit/press.astro'
import Booking from './Booking/index.astro'
import BookingList from './Booking/list.astro'

export const sections = {
  Hero,
  'Hero:cover': HeroCover,
  'Hero:split': HeroSplit,
  'Hero:overlap': HeroOverlap,
  'Hero:statement': HeroStatement,
  'Hero:donate': HeroDonate,
  'Hero:video': HeroVideo,
  'Hero:rotating': HeroRotating,
  'Hero:field': HeroField,
  About,
  'About:left': AboutLeft,
  'About:letter': AboutLetter,
  'About:portrait': AboutPortrait,
  'About:books': AboutBooks,
  Issues,
  'Issues:steps': IssuesSteps,
  'Issues:numbered': IssuesNumbered,
  'Issues:rows': IssuesRows,
  'Issues:checklist': IssuesChecklist,
  'Issues:tabs': IssuesTabs,
  'Issues:drawer': IssuesDrawer,
  StatCards,
  'StatCards:ribbon': StatCardsRibbon,
  'StatCards:feature': StatCardsFeature,
  'StatCards:wall': StatCardsWall,
  Cta,
  'Cta:card': CtaCard,
  'Cta:banner': CtaBanner,
  'Cta:strip': CtaStrip,
  'Cta:photo': CtaPhoto,
  QuoteStrip,
  'QuoteStrip:single': QuoteStripSingle,
  'QuoteStrip:ticker': QuoteStripTicker,
  'QuoteStrip:logos': QuoteStripLogos,
  'QuoteStrip:carousel': QuoteStripCarousel,
  'QuoteStrip:wall': QuoteStripWall,
  Map: MapSection,
  'Map:map': MapSectionMap,
  'Map:bar': MapSectionBar,
  MovementMap,
  VideoEmbed,
  'VideoEmbed:landscape': VideoEmbedLandscape,
  'VideoEmbed:portrait': VideoEmbedPortrait,
  'VideoEmbed:square': VideoEmbedSquare,
  PdfEmbed,
  'PdfEmbed:medium': PdfEmbedMedium,
  'PdfEmbed:tall': PdfEmbedTall,
  'PdfEmbed:card': PdfEmbedCard,
  Progress,
  'Progress:ring': ProgressRing,
  'Progress:compact': ProgressCompact,
  'Progress:match': ProgressMatch,
  Countdown,
  Leaderboard,
  SocialFeed,
  MovementTicker,
  EventsList,
  'EventsList:cards': EventsListCards,
  'EventsList:agenda': EventsListAgenda,
  'EventsList:calendar': EventsListCalendar,
  'EventsList:compact': EventsListCompact,
  'EventsList:shifts': EventsListShifts,
  'EventsList:week': EventsListWeek,
  'EventsList:cohorts': EventsListCohorts,
  'EventsList:map': EventsListMap,
  Blog,
  'Blog:list': BlogList,
  'Blog:feature': BlogFeature,
  Collection,
  'Collection:list': CollectionList,
  'Collection:compact': CollectionCompact,
  'Collection:feature': CollectionFeature,
  'Collection:library': CollectionLibrary,
  'Collection:shelves': CollectionShelves,
  'Collection:outline': CollectionOutline,
  ContentPost,
  'ContentPost:banner': ContentPostBanner,
  'ContentPost:player': ContentPostPlayer,
  'ContentPost:theater': ContentPostTheater,
  PlatformPlanks,
  'PlatformPlanks:columns': PlatformPlanksColumns,
  'PlatformPlanks:longread': PlatformPlanksLongread,
  CandidateRoster,
  'CandidateRoster:ballot': CandidateRosterBallot,
  'CandidateRoster:compact': CandidateRosterCompact,
  TeamGrid,
  'TeamGrid:board': TeamGridBoard,
  'TeamGrid:list': TeamGridList,
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
  QuickDonate,
  'QuickDonate:hero': QuickDonateHero,
  'QuickDonate:bar': QuickDonateBar,
  'QuickDonate:jar': QuickDonateJar,
  'QuickDonate:band': QuickDonateBand,
  'QuickDonate:ladder': QuickDonateLadder,
  VoterTools,
  'VoterTools:polling': VoterToolsPolling,
  'VoterTools:dates': VoterToolsDates,
  SampleBallot,
  'SampleBallot:cards': SampleBallotCards,
  'SampleBallot:measures': SampleBallotMeasures,
  Scorecard,
  'Scorecard:grades': ScorecardGrades,
  'Scorecard:promise': ScorecardPromise,
  Membership,
  'Membership:tiers': MembershipTiers,
  'Membership:compare': MembershipCompare,
  Faq,
  'Faq:topics': FaqTopics,
  'Faq:cards': FaqCards,
  Comparison,
  'Comparison:cards': ComparisonCards,
  'Comparison:spectrum': ComparisonSpectrum,
  Stories,
  'Stories:cards': StoriesCards,
  'Stories:timeline': StoriesTimeline,
  ShareKit,
  'ShareKit:strip': ShareKitStrip,
  'ShareKit:compact': ShareKitCompact,
  Financials,
  'Financials:donut': FinancialsDonut,
  'Financials:table': FinancialsTable,
  Services,
  'Services:list': ServicesList,
  'Services:compare': ServicesCompare,
  CaseStudies,
  'CaseStudies:grid': CaseStudiesGrid,
  'CaseStudies:beforeafter': CaseStudiesBeforeafter,
  Resources,
  'Resources:featured': ResourcesFeatured,
  'Resources:band': ResourcesBand,
  Pathways,
  'Pathways:tabs': PathwaysTabs,
  'Pathways:quiz': PathwaysQuiz,
  Portfolio,
  'Portfolio:featured': PortfolioFeatured,
  'Portfolio:strip': PortfolioStrip,
  MediaKit,
  'MediaKit:speaker': MediaKitSpeaker,
  'MediaKit:press': MediaKitPress,
  Booking,
  'Booking:list': BookingList,
  Classroom,
  'Classroom:list': ClassroomList,
  Course,
  'Course:outline': CourseOutline,
  Lesson,
  'Lesson:reading': LessonReading,
}
