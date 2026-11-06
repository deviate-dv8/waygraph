import { defineConfig } from '@adonisjs/inertia'

const inertiaConfig = defineConfig({
  /**
   * The pages render in the browser only: the app is a local tool, no search engine reads it.
   */
  ssr: { enabled: false },
})

export default inertiaConfig
