import type { AstroIntegration } from 'astro'

export interface TemplateKitOptions {
  /** The template's config (its `defineTemplate(...)` module), relative to the project root: './src/template.ts'. */
  template: string
}

/** The kit's Astro integration: its routes, the template's config as `virtual:backgold-template`, and the package compiled as source. */
export declare function templateKit(options: TemplateKitOptions): AstroIntegration
export default templateKit
