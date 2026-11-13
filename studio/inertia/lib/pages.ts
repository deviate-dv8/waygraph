import { urlFor } from '~/client'

/** A page of the app in the sidebar: its name, icon, address, and the addresses that are it (its own and below). */
export type AppPage = {
  id: string
  label: string
  icon: string
  to: string
  isAt: (url: string) => boolean
}

/** The sidebar's pages, in order. Settings can hide any of them; a hidden page still opens by its address. */
export function appPages(): AppPage[] {
  const under = (prefix: string) => (url: string) => url.startsWith(prefix)
  return [
    {
      id: 'map',
      label: 'Map',
      icon: 'i-lucide-map',
      to: urlFor('map'),
      isAt: (url) => url === '/' || url.startsWith('/?'),
    },
    {
      id: 'flows',
      label: 'Flows',
      icon: 'i-lucide-route',
      to: urlFor('flows.index'),
      isAt: under('/flows'),
    },
    {
      id: 'blocks',
      label: 'Blocks',
      icon: 'i-lucide-boxes',
      to: urlFor('blocks.index'),
      isAt: under('/blocks'),
    },
    {
      id: 'api',
      label: 'API',
      icon: 'i-lucide-send',
      to: urlFor('api.index'),
      isAt: under('/api'),
    },
    {
      id: 'runs',
      label: 'Runs',
      icon: 'i-lucide-history',
      to: urlFor('runs.index'),
      isAt: under('/runs'),
    },
    {
      id: 'project',
      label: 'Project',
      icon: 'i-lucide-folder-cog',
      to: urlFor('project.show'),
      isAt: under('/project'),
    },
    {
      id: 'playwright',
      label: 'Playwright',
      icon: 'i-lucide-flask-conical',
      to: urlFor('playwright.show'),
      isAt: under('/playwright'),
    },
  ]
}
