/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router.get('/', [controllers.Workspaces, 'show']).as('map')
router.get('/flows', [controllers.Flows, 'index']).as('flows.index')
router.get('/flows/:name', [controllers.Flows, 'show']).as('flows.show')
router.get('/runs', [controllers.Runs, 'index']).as('runs.index')
router.get('/runs/:id', [controllers.Runs, 'show']).as('runs.show')
router.post('/plays', [controllers.Plays, 'store']).as('plays.store')
router.delete('/plays', [controllers.Plays, 'destroy']).as('plays.destroy')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use(middleware.auth())
