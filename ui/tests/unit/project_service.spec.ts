import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import env from '#start/env'
import { ProjectService } from '#services/project_service'

const events = [
  { type: 'run:start', at: 1000, label: 'checkoutFlow' },
  { type: 'step:start', index: 0, block: 'nav-login', kind: 'page', from: '__start__' },
  { type: 'step:end', index: 0, block: 'nav-login', to: 'LoginPage', ms: 30 },
  { type: 'step:read', index: 0, block: 'nav-login', read: { login: { error: null } } },
  { type: 'step:start', index: 1, block: 'submit-login', kind: 'method', from: 'LoginPage' },
  {
    type: 'step:error',
    index: 1,
    block: 'submit-login',
    ms: 5000,
    error: 'wanted /inventory.html',
    check: { trait: 'url', when: 'after', wants: '/inventory.html', saw: '/' },
  },
  { type: 'run:mem', flow: 'loginFlow', values: { user: 'standard_user' } },
  { type: 'run:end', ok: false, ms: 5100 },
]

test.group('ProjectService', (group) => {
  let dir = ''
  group.each.setup(async () => {
    dir = await mkdtemp(join(tmpdir(), 'project-'))
    await mkdir(join(dir, '.waygraph', 'runs'), { recursive: true })
    const log = events.map((e) => JSON.stringify(e)).join('\n')
    // The last line is cut off mid-write, as a run that was killed leaves it.
    await writeFile(join(dir, '.waygraph', 'runs', 'run-1.jsonl'), `${log}\n{"type":"step:st`)
    env.set('WAYGRAPH_PROJECT_DIR', dir)
    return () => rm(dir, { recursive: true, force: true })
  })

  test('summarizes a run from its log', async ({ assert }) => {
    const [run] = await new ProjectService().runs()
    assert.deepEqual(run, {
      id: 'run-1',
      startedAt: 1000,
      ms: 5100,
      ok: false,
      flows: ['loginFlow'],
      steps: 2,
      firstStep: 'nav-login',
      lastStep: 'submit-login',
      failedAt: 'submit-login',
      error: 'wanted /inventory.html',
    })
  })

  test('folds a run into its steps', async ({ assert }) => {
    const run = await new ProjectService().run('run-1')
    assert.deepEqual(
      run?.stepsList.map((s) => [s.block, s.status, s.to, s.ms]),
      [
        ['nav-login', 'passed', 'LoginPage', 30],
        ['submit-login', 'failed', null, 5000],
      ]
    )
    assert.deepEqual(run?.stepsList[0]?.read, { login: { error: null } })
    assert.equal(run?.stepsList[1]?.check?.saw, '/')
    assert.deepEqual(run?.mem, [{ flow: 'loginFlow', values: { user: 'standard_user' } }])
  })

  test('reads a run again when its log grows', async ({ assert }) => {
    const project = new ProjectService()
    const before = await project.run('run-1')
    assert.equal(before?.stepsList.length, 2)
    const file = join(dir, '.waygraph', 'runs', 'run-1.jsonl')
    await appendFile(
      file,
      `\n${JSON.stringify({ type: 'step:start', index: 2, block: 'cleanup', kind: 'method', from: 'LoginPage' })}\n`
    )
    const after = await project.run('run-1')
    assert.equal(after?.stepsList.length, 3)
  })

  test("gives a run's video only when its log names it and the file is there", async ({
    assert,
  }) => {
    const video = join(dir, 'page.webm')
    await writeFile(video, 'webm')
    const file = join(dir, '.waygraph', 'runs', 'run-2.jsonl')
    const artifacts = [
      { type: 'run:start', at: 1 },
      { type: 'run:artifact', kind: 'screenshot', path: join(dir, 'shot.png') },
      { type: 'run:artifact', kind: 'video', path: video },
      { type: 'run:artifact', kind: 'video', path: join(dir, 'gone.webm') },
    ]
    await writeFile(file, artifacts.map((e) => JSON.stringify(e)).join('\n'))
    const project = new ProjectService()
    assert.deepEqual(await project.artifact('run-2', 1), { kind: 'video', path: video })
    // A screenshot isn't served this way, nor a video that isn't there, nor one the log doesn't name.
    assert.isNull(await project.artifact('run-2', 0))
    assert.isNull(await project.artifact('run-2', 2))
    assert.isNull(await project.artifact('run-2', 7))
  })

  test('reads only files in the runs folder', async ({ assert }) => {
    assert.isNull(await new ProjectService().run('../run-1'))
    assert.isNull(await new ProjectService().run('missing'))
  })
})
