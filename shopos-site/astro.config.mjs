import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://shopos.framer.website',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
