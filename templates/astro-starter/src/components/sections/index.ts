// Which component renders each section type, by the type's name in BackGold.
// `<Section components={sections}>` (from @backgold/astro) looks a section up
// here as '<Type>:<variant>' first, where the variant is the section's stored
// layout (the Layout chosen in BackGold), then as '<Type>'; a type that is
// not listed renders through the package's DefaultSection, so a block
// BackGold adds later still shows. The areas (src/layouts/Site.astro and the
// Sidebar in src/pages/[...path].astro) draw their sections through this map
// too, TakeoverBanner among them.
//
// Money and consent modules (Donate, FormBlock, PollBlock, Petition, Store,
// Event, Calendar, SignupCapture, SocialFrame, Advocacy) are deliberately
// not listed: they render as BackGold's own embed, which keeps contribution
// limits, receipts and consent on BackGold's side. Do not add them here.
//
// To give one layout a component of its own, add it as '<Type>:<layout>'
// (for example 'Hero:split'); every other layout of the type keeps '<Type>'.

import About from './About.astro'
import Blog from './Blog.astro'
import CandidateRoster from './CandidateRoster.astro'
import Collection from './Collection.astro'
import ContentPost from './ContentPost.astro'
import Countdown from './Countdown.astro'
import Cta from './Cta.astro'
import EventsList from './EventsList.astro'
import Hero from './Hero.astro'
import Issues from './Issues.astro'
import Leaderboard from './Leaderboard.astro'
import MapSection from './Map.astro'
import MovementMap from './MovementMap.astro'
import MovementTicker from './MovementTicker.astro'
import PdfEmbed from './PdfEmbed.astro'
import PlatformPlanks from './PlatformPlanks.astro'
import Progress from './Progress.astro'
import QuoteStrip from './QuoteStrip.astro'
import SocialFeed from './SocialFeed.astro'
import StatCards from './StatCards.astro'
import TakeoverBanner from './TakeoverBanner.astro'
import TeamGrid from './TeamGrid.astro'
import VideoEmbed from './VideoEmbed.astro'

export const sections = {
  Hero,
  About,
  Issues,
  StatCards,
  Cta,
  QuoteStrip,
  VideoEmbed,
  PdfEmbed,
  Progress,
  Countdown,
  Map: MapSection,
  MovementMap,
  Blog,
  Collection,
  ContentPost,
  EventsList,
  PlatformPlanks,
  CandidateRoster,
  TeamGrid,
  Leaderboard,
  SocialFeed,
  MovementTicker,
  TakeoverBanner,
}
