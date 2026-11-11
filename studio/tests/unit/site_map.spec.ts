import { test } from '@japa/runner'
import { FOLDER, SITE, siteMap } from '#services/site_map'

const SITE_ID = SITE + 'http://localhost:3000'
const folder = (path: string) => FOLDER + 'http://localhost:3000' + path

test.group('siteMap', () => {
  test('each level of an address is a level of the map: a path no page has is a folder', ({
    assert,
  }) => {
    const urls = {
      Login: ['/auth/login'],
      Lines: ['/platform/lines'],
      LineDetail: ['/platform/lines/:id'],
      Areas: ['/platform/plant/areas'],
      Freezer: ['/platform/plant/freezer'],
      Home: ['/'],
    }
    const map = siteMap(Object.keys(urls), urls, 'http://localhost:3000', [])
    const parent = Object.fromEntries(map.edges.map((e) => [e.target, e.source]))
    assert.deepEqual(
      map.folders.map((f) => [f.path, f.label]),
      [
        ['/auth', 'auth/'],
        ['/platform', 'platform/'],
        ['/platform/plant', 'plant/'],
      ]
    )
    // A page under the folder of its path, a folder under the folder (or site) above it.
    assert.equal(parent.Login, folder('/auth'))
    assert.equal(parent[folder('/auth')], SITE_ID)
    assert.equal(parent[folder('/platform')], SITE_ID)
    assert.equal(parent[folder('/platform/plant')], folder('/platform'))
    assert.equal(parent.Areas, folder('/platform/plant'))
    // A page's own path holds the pages below it; the site's root page hangs from the site.
    assert.equal(parent.Lines, folder('/platform'))
    assert.equal(parent.LineDetail, 'Lines')
    assert.equal(parent.Home, SITE_ID)
  })

  test('a folder is named by its path past the page it hangs from', ({ assert }) => {
    const urls = {
      Lines: ['/platform/lines'],
      Archived: ['/platform/lines/archived/2024'],
      Old: ['/platform/lines/archived/2023'],
    }
    const map = siteMap(Object.keys(urls), urls, 'http://localhost:3000', [])
    const archived = map.folders.find((f) => f.path === '/platform/lines/archived')
    assert.equal(archived?.label, 'archived/')
    assert.equal(map.edges.find((e) => e.target === archived?.id)?.source, 'Lines')
  })
})
