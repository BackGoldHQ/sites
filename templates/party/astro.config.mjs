// @ts-check
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import backgold from '@backgold/astro'

export default defineConfig({
  output: 'server',
  // Images come from BackGold already sized, and the site keeps no sessions,
  // so the Worker needs neither a Cloudflare Images binding nor a session KV
  // namespace. Turn either on here if you add a use for it.
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  integrations: [backgold()],
})
