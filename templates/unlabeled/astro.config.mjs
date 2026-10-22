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
  // font files her frame stylesheet names (src/frame/) are a route of their
  // own, since Astro routes no page whose path starts `_` (the stylesheet
  // itself is src/pages/[skin]/frame.css.ts).
  integrations: [
    backgold(),
    templateKit({ template: './src/template.ts' }),
    {
      name: 'unlabeled-frame-fonts',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          injectRoute({ pattern: '/_backgold/fonts/[...path]', entrypoint: './src/frame/font.ts' })
        },
      },
    },
  ],
})
