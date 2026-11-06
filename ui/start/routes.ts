/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router.get('/', [controllers.Workspaces, 'show']).as('map')
router.get('/flows', [controllers.Flows, 'index']).as('flows.index')
router.get('/flows/:name', [controllers.Flows, 'show']).as('flows.show')
router.get('/runs', [controllers.Runs, 'index']).as('runs.index')
router.get('/runs/:id', [controllers.Runs, 'show']).as('runs.show')
router.post('/plays', [controllers.Plays, 'store']).as('plays.store')
router.delete('/plays', [controllers.Plays, 'destroy']).as('plays.destroy')
