import '@adonisjs/inertia/types'

import type { VNodeProps, AllowedComponentProps, ComponentInstance } from 'vue'

type ExtractProps<T> = Omit<
  ComponentInstance<T>['$props'],
  keyof VNodeProps | keyof AllowedComponentProps
>

declare module '@adonisjs/inertia/types' {
  export interface InertiaPages {
    'api': ExtractProps<(typeof import('../../inertia/pages/api.vue'))['default']>
    'blocks/index': ExtractProps<(typeof import('../../inertia/pages/blocks/index.vue'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.vue'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.vue'))['default']>
    'flows/index': ExtractProps<(typeof import('../../inertia/pages/flows/index.vue'))['default']>
    'flows/show': ExtractProps<(typeof import('../../inertia/pages/flows/show.vue'))['default']>
    'map': ExtractProps<(typeof import('../../inertia/pages/map.vue'))['default']>
    'playwright': ExtractProps<(typeof import('../../inertia/pages/playwright.vue'))['default']>
    'project': ExtractProps<(typeof import('../../inertia/pages/project.vue'))['default']>
    'runs/index': ExtractProps<(typeof import('../../inertia/pages/runs/index.vue'))['default']>
    'runs/show': ExtractProps<(typeof import('../../inertia/pages/runs/show.vue'))['default']>
    'settings': ExtractProps<(typeof import('../../inertia/pages/settings.vue'))['default']>
    'setup': ExtractProps<(typeof import('../../inertia/pages/setup.vue'))['default']>
  }
}
