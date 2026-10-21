// @ts-check
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import backgold from '@backgold/astro'
import templateKit from '@backgold/template-kit'

export default defineConfig({
  output: 'server',
  // Images come from BackGold already sized, and the site keeps no sessions,
  // so the Worker needs neither a Cloudflare Images binding nor a session KV
  // namespace. Turn either on here if you add a use for it.
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  // The kit draws every page (its routes) with this template's config; the
  // stylesheet BackGold's module frames load from the site (src/frame-css.ts)
  // is a route of its own, since Astro routes no page whose path starts `_`.
  integrations: [
    backgold(),
    templateKit({ template: './src/template.ts' }),
    {
      name: 'nonprofit-frame-css',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => injectRoute({ pattern: '/_backgold/frame.css', entrypoint: './src/frame-css.ts' }),
      },
    },
  ],
})
