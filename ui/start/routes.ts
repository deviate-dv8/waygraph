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
router.get('/blocks', [controllers.Blocks, 'index']).as('blocks.index')
router.get('/runs', [controllers.Runs, 'index']).as('runs.index')
router.get('/runs/:id', [controllers.Runs, 'show']).as('runs.show')
router
  .get('/screenshots/pages/:checkpoint', [controllers.Screenshots, 'page'])
  .as('screenshots.page')
router.get('/screenshots/runs/:id/:file', [controllers.Screenshots, 'step']).as('screenshots.step')
router.post('/plays', [controllers.Plays, 'store']).as('plays.store')
router.delete('/plays', [controllers.Plays, 'destroy']).as('plays.destroy')
router.get('/playwright', [controllers.Playwright, 'show']).as('playwright.show')
router.post('/playwright', [controllers.Playwright, 'store']).as('playwright.store')
router.delete('/playwright', [controllers.Playwright, 'destroy']).as('playwright.destroy')
router.get('/settings', [controllers.Settings, 'show']).as('settings')
router.get('/project', [controllers.Project, 'show']).as('project.show')
router.post('/project/commands', [controllers.Project, 'store']).as('project.commands.store')
router.delete('/project/commands', [controllers.Project, 'destroy']).as('project.commands.destroy')
