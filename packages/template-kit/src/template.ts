// What a template is to the kit: its manifest (template.json), the component
// that draws each section type and layout, the entry and list layouts, and
// its own two faces. A template's src/template.ts exports one, built from the
// kit's registries with its own layouts added:
//
//   import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
//   import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
//   import manifest from '../template.json'
//   import HeroPortrait from './components/sections/Hero/portrait.astro'
//   import './styles/template.css'
//
//   export default defineTemplate({
//     manifest: siteTemplateManifestSchema.parse(manifest),
//     sections: { ...kitSections, 'Hero:portrait': HeroPortrait },
//     entries: kitEntries,
//     fonts: { heading: 'Oswald:wght@500;700', body: 'Public+Sans:wght@400;700' },
//   })
//
// The template's astro.config.mjs names that file to the kit's integration
// (`templateKit({ template: './src/template.ts' })`), whose routes import it
// as `virtual:backgold-template` and pass it to the Site layout and to
// everything that draws a section or an entry.

import type { SiteTemplateManifest } from '@backgold/contract/site-templates'
import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
import { entries } from './components/entries'
import { sections } from './components/sections'

export type AstroComponent = AstroComponentFactory

export interface TemplateConfig {
  /** The template's template.json. */
  manifest: SiteTemplateManifest
  /**
   * The component for each section type ('<Type>') and layout
   * ('<Type>:<layout>'), as `<Section components>` looks them up
   * (src/components/sections/index.ts).
   */
  sections: Record<string, AstroComponent>
  /** The entry and list layouts, as '<type>:<layout>' (src/components/entries/index.ts). */
  entries: Record<string, AstroComponent>
  /**
   * The template's own faces, as Google Fonts family specs
   * (`Family+Name:axes@values`): what the site draws in when its theme in
   * BackGold names none (src/lib/fonts.ts).
   */
  fonts: { heading: string; body: string }
  /**
   * The set a site whose appearance is `auto` opens in: `light` (the default)
   * follows the visitor's system; `dark` opens dark whatever the system says
   * (src/lib/brand.ts brandCss). Either way the header's switch still
   * changes it, and a site pinned `light` or `dark` in BackGold keeps its pin.
   */
  defaultAppearance?: 'light' | 'dark'
  /**
   * The face BackGold's module frames draw in (the embed look's `font`, one
   * of `public-sans`, `inter`, `system-sans`, `system-serif`,
   * `ubuntu-sans-mono`, `jetbrains-mono`: the api's EMBED_LOOK_FONTS). Left
   * out, or not one of those, the frames draw in Public Sans
   * (sections/modules/ModuleFrame.astro).
   */
  frameFont?: string
  /**
   * The corner radius BackGold's module frames draw with, in whole pixels
   * from 0 to 40 (the embed look's `radius`). Left out, or outside that, 12
   * (sections/modules/ModuleFrame.astro).
   */
  frameRadius?: number
  /**
   * Links a template adds to the header menu for routes it draws itself (an
   * archive at `/archive`), which no menu link in BackGold can name: each at
   * the menu's top level, last unless `position` is `first`, and, when
   * `group` names a group of the header menu by its label, first inside that
   * group too; in the bar and in the phone sheet alike, marked
   * current on its own address (layouts/Site.astro). Left out, nothing
   * changes.
   */
  menuLinks?: Array<{ label: string; href: string; group?: string; position?: 'first' | 'last' }>
  /**
   * Where the news list draws its search box: at the end of the filter row,
   * beside the chips (`filter`, board A4, the default), or beside the list's
   * head, on its subhead's line (`head`, board C10); on a narrow screen it
   * wraps to the end of its own line (src/components/entries/ListFrame.astro).
   */
  newsSearch?: 'filter' | 'head'
  /**
   * Whether the header offers visitors Sign in (board D1), on a first-party
   * site: a template whose pages hold what the organization keeps for people
   * it knows (the academy's lessons) sets it. Left out, the header has no
   * Sign in; a visitor already signed in (through a lesson's door) still sees
   * their name and Sign out on every template (src/components/chrome/VisitorAccount.astro).
   */
  visitorSignIn?: boolean
}

/** Every section type and layout the kit draws. */
export const kitSections: Record<string, AstroComponent> = sections

/** Every entry and list layout the kit draws. */
export const kitEntries: Record<string, AstroComponent> = entries

/** A template's configuration, typed. */
export const defineTemplate = (config: TemplateConfig): TemplateConfig => config

declare global {
  namespace App {
    interface Locals {
      /** The template drawing this request; PageSections sets it for LeadingHero. */
      template?: TemplateConfig
    }
  }
}
