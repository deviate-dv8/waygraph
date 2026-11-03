import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import adonisjs from '@adonisjs/vite/client'

export default defineConfig({
  plugins: [
    vue(),
    // Nuxt UI, with Inertia's router for its links; the theme's colours are in inertia/css/app.css.
    ui({
      router: 'inertia',
      ui: { colors: { primary: 'sketch', neutral: 'stone' } },
      // Icons are bundled from the installed collections (scanned in the source), never fetched at run time.
      icon: { clientBundle: { scan: true } },
    }),
    adonisjs({ entryPoints: ['inertia/app.ts'], reload: ['resources/views/**/*.edge'] }),
  ],

  resolve: {
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
      '@generated': `${import.meta.dirname}/.adonisjs/client/`,
      '#types': `${import.meta.dirname}/app/types/`,
    },
  },

  server: {
    watch: {
      ignored: ['**/storage/**', '**/tmp/**'],
    },
  },
})
