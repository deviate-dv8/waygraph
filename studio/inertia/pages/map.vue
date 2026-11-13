<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { VueFlow, useVueFlow, type Edge, type Node, type VueFlowStore } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import WorkspaceLayout from '~/layouts/workspace.vue'
import PageNode from '~/components/graph/page_node.vue'
import FolderNode from '~/components/graph/folder_node.vue'
import ShellRegion from '~/components/graph/shell_region.vue'
import ShellHalo from '~/components/graph/shell_halo.vue'
import LayoutPanel from '~/components/map/layout_panel.vue'
import MapTree from '~/components/map/map_tree.vue'
import MapLegend from '~/components/map/map_legend.vue'
import FindPalette from '~/components/map/find_palette.vue'
import type { TreeLabel } from '~/components/map/map_tree_row.vue'
import { everything, only, toggled, visibleTree, type MapTree as Tree } from '~/lib/map_filter'
import SketchEdge from '~/components/graph/sketch_edge.vue'
import PagePanel from '~/components/map/page_panel.vue'
import BlockPanel from '~/components/map/block_panel.vue'
import { useStorage } from '@vueuse/core'
import { layoutTree, treeColumns, type TreeDirection } from '~/lib/layout'
import { planLabels } from '~/lib/edge_labels'
import { mapEdges, pageSummary } from '~/lib/project_graph'
import { count } from '~/lib/format'
import { MOVE_KINDS, kindColor, kindIcon } from '~/lib/kinds'
import { urlFor } from '~/client'
import { router } from '@inertiajs/vue3'
import type {
  LastResult,
  ManifestBlock,
  ManifestPage,
  ManifestReadBlock,
  MapAccess,
  PageFlow,
  PageNetwork,
  LiveSession,
  SiteMap,
} from '#types/project'

/**
 * The project's map, as a site map: each site at the root, its pages hung from it by their addresses (dashed), and every
 * move between pages as an arrow.
 */
const props = defineProps<{
  project: { name: string; dir: string; waygraph: string; baseUrl?: string }
  checkpoints: string[]
  blocks: ManifestBlock[]
  readBlocks: ManifestReadBlock[]
  /** Every Page Block with what it holds (waygraph 0.18.0+; none from an older project). */
  pages: ManifestPage[]
  /** How each Block last went, by name: the dot beside a move or an expectation. */
  results: Record<string, LastResult>
  /**
   * The UI many pages share (a menu, a sidebar), each drawn once with a line to each page its links lead to, and the
   * accounts the map can be shown as (`?as=`). The pages and Blocks above are what that account is given.
   */
  access: MapAccess
  pageUrls: Record<string, string[]>
  /** The site map: each site, the folders of its paths, and where each page hangs. */
  site: SiteMap
  /** The pages in the order the project's flows reach them. */
  journey: string[]
  /** Each page's flows: those with a step that lands, may land or starts on it, and how each one's newest run went. */
  pageFlows: Record<string, PageFlow[]>
  /** Each page's calls in the flows' newest runs, and what is wrong with them. */
  network: Record<string, PageNetwork>
  /** Live browser sessions on this project (`waygraph pilot start`), and the page each is on. */
  live: LiveSession[]
  /** Each page's newest screenshot (a Block's `screenshot: true`), by Checkpoint: when it was taken. */
  shots: Record<string, number>
  flows: {
    id: string
    name: string
    file: string
    steps: number
    labels: string[]
    stepNames: string[]
  }[]
  skipped: { file: string; error: string }[]
}>()

/** While a live session is open the map follows it (every 3 s); with none it only looks now and then (every 20 s). */
let following: ReturnType<typeof setTimeout> | undefined
const follow = () => {
  following = setTimeout(
    () => {
      router.reload({ only: ['live'], onFinish: follow })
    },
    props.live.length ? 3000 : 20_000
  )
}
onMounted(follow)
onBeforeUnmount(() => clearTimeout(following))

const selected = ref<string | null>(null)
/** A Block opened from a badge on a line (a move's Nav, Method, API call): its panel, like a page's. */
const selectedBlock = ref<string | null>(null)
const openBlock = (id: string) => {
  selected.value = null
  selectedBlock.value = id
}
provide('selectBlock', openBlock)
provide('selectPage', (id: string) => (selected.value = id))
provide('selectShell', (id: string) => (selected.value = id))
const blockPanel = computed(() => props.blocks.find((b) => b.id === selectedBlock.value))
watch(selected, (id) => {
  if (!id) return
  selectedBlock.value = null
  // A page picked (from the tree, a layout, Find) comes into view, large enough to read.
  void flow?.fitView({ nodes: [id], padding: 1.5, maxZoom: 1, duration: 300 })
})
/** Which way the site map grows: left to right by default; the viewer's pick is remembered in this browser. */
const direction = useStorage<TreeDirection>('waygraph-map-direction', 'LR')
/** The pages on the map: those the account (if one is picked) can open. */
const checkpoints = computed(() => props.checkpoints)
/** The Blocks of pages, not layouts: a layout's links are drawn once, from it. */
/** The map shows only what some flows use: picked by label (`auth`) or by name; none picked, everything. */
const flowPick = useStorage<string[]>(`waygraph-map-flows:${props.project.dir}`, [])
const pickedFlows = computed(() =>
  flowPick.value.length
    ? props.flows.filter(
        (f) =>
          flowPick.value.includes(f.name) ||
          f.labels.some((l) => flowPick.value.includes(`label:${l}`))
      )
    : null
)
/** The Blocks those flows play, and the pages they pass through. */
const pickedBlocks = computed(
  () => pickedFlows.value && new Set(pickedFlows.value.flatMap((f) => f.stepNames))
)
const pickedPages = computed(() => {
  if (!pickedFlows.value) return null
  const names = new Set(pickedFlows.value.map((f) => f.name))
  return new Set(
    Object.entries(props.pageFlows)
      // Where a flow lands, not every page a shared link could start from.
      .filter(([, flows]) => flows.some((f) => names.has(f.name) && f.reach !== 'acts'))
      .map(([page]) => page)
  )
})
const flowItems = computed(() => [
  ...[...new Set(props.flows.flatMap((f) => f.labels))]
    .sort()
    .map((l) => ({ label: `label: ${l}`, value: `label:${l}` })),
  ...props.flows.map((f) => ({ label: f.name, value: f.name })),
])
const pageBlocks = computed(() => {
  const links = new Set(props.access.links)
  const picked = pickedBlocks.value
  return props.blocks.filter(
    (b) => !links.has(b.name) && (!picked || picked.has(b.name) || b.kind === 'page')
  )
})
const layoutIds = computed(() => props.access.layouts.map((l) => l.node))
/** Every move between pages (the tree and the journey read these). */
const edgesData = computed(() => mapEdges(pageBlocks.value))
/**
 * A link valid from several pages (a sidebar, a menu) is one line from each: a web. Those are counted on the page they
 * lead to, and drawn only for the page selected.
 */
const sharedMoves = computed(() =>
  edgesData.value.filter(
    (e) =>
      e.blocks.length > 0 && e.blocks.every((b) => b.from.filter((from) => from !== '*').length > 1)
  )
)
/** The other sites a project's pages live on sit together under one `external` node, apart from the app itself. */
const EXTERNAL = 'group:external'
const externalSites = computed(() => site.value.sites.slice(1))
/** The site map's lines, with the external node's own: external -> each other site. */
const siteLines = computed(() => [
  ...site.value.edges,
  ...externalSites.value.map((s) => ({
    id: `${EXTERNAL}->${s.id}`,
    source: EXTERNAL,
    target: s.id,
    blocks: [],
    site: true as const,
  })),
])
/** Shows the map as `account` sees it (null: everyone): the server leaves out what it isn't given. */
function showAs(account: string | null) {
  router.get(urlFor('map'), account ? { as: account } : {}, {
    preserveState: true,
    preserveScroll: true,
  })
}
/** The site map, from the server: the sites, the folders of their paths, each page under its place. */
const site = computed(() => props.site)
/** Sites and folders: nodes on the map that aren't pages, so there's no page panel to open. */
const notPages = computed(
  () =>
    new Set([
      ...props.site.sites.map((s) => s.id),
      ...props.site.folders.map((f) => f.id),
      ...layoutIds.value,
      ...(externalSites.value.length ? [EXTERNAL] : []),
    ])
)

/**
 * The pages in the order a visit meets them: as the project's flows reach them, then along the moves from there, then the
 * rest by address. Rows laid out in this order read like the journey through the site.
 */
const journey = computed(() => {
  const next = new Map<string, string[]>()
  for (const e of edgesData.value) next.set(e.source, [...(next.get(e.source) ?? []), e.target])
  const byAddress = [...checkpoints.value].sort(
    (a, b) =>
      (site.value.paths[a] ?? '~').length - (site.value.paths[b] ?? '~').length ||
      (site.value.paths[a] ?? '~').localeCompare(site.value.paths[b] ?? '~')
  )
  const order: string[] = []
  const visit = (id: string) => {
    if (order.includes(id) || !checkpoints.value.includes(id)) return
    order.push(id)
    for (const to of next.get(id) ?? []) visit(to)
  }
  for (const id of [...props.journey, ...byAddress]) visit(id)
  return order
})

/** The site map's tree: sites at the root, folders and pages under where their address hangs. */
const tree = computed<Tree>(() => {
  const sites = site.value.sites
  // The site map's tree: a page under the page (or site) its address hangs from; a page with no known address under the
  // page whose move first reaches it, else under the first site. Children in journey order.
  const parentOf = new Map<string, string>(siteLines.value.map((e) => [e.target, e.source]))
  for (const id of journey.value) {
    if (parentOf.has(id)) continue
    const from = edgesData.value.find((e) => e.target === id && e.source !== id)?.source
    const parent = from ?? sites[0]?.id
    if (parent) parentOf.set(id, parent)
  }
  // A page ranks by where the journey reaches it; a folder by the first of its pages the journey reaches.
  const rank = new Map<string, number>(journey.value.map((id, i) => [id, i]))
  const rankOf = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!
    const under = siteLines.value.filter((e) => e.source === id).map((e) => rankOf(e.target))
    rank.set(id, under.length ? Math.min(...under) : Number.MAX_SAFE_INTEGER)
    return rank.get(id)!
  }
  const childrenOf = new Map<string, string[]>()
  if (externalSites.value.length)
    childrenOf.set(
      EXTERNAL,
      externalSites.value.map((s) => s.id)
    )
  for (const id of [...journey.value, ...site.value.folders.map((f) => f.id)]) {
    const parent = parentOf.get(id)
    if (parent) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), id])
  }
  for (const [parent, children] of childrenOf) {
    childrenOf.set(
      parent,
      [...children].sort((a, b) => rankOf(a) - rankOf(b))
    )
  }
  // Layouts first, above the sites: each its own root, its lines reaching down into the tree.
  const roots = [
    ...sites.slice(0, 1).map((s) => s.id),
    ...(externalSites.value.length ? [EXTERNAL] : []),
    ...journey.value.filter((id) => !parentOf.has(id)),
  ]
  return { roots, childrenOf, parentOf }
})

/** What the tree beside the map hides, kept in this browser for this project. */
const hiddenList = useStorage<string[]>(`waygraph-map-hidden:${props.project.dir}`, [])
/** What the tree hides, and, with flows picked, every page they don't pass through. */
/** What the person hid in the tree (kept for the project). */
const hiddenByYou = computed(() => new Set(hiddenList.value))
const hidden = computed(() => {
  const out = new Set(hiddenList.value)
  const keep = pickedPages.value
  if (keep) for (const id of props.checkpoints) if (!keep.has(id)) out.add(id)
  return out
})
const setHidden = (next: Set<string>) => (hiddenList.value = [...next])
const showTree = useStorage('waygraph-map-tree', true)
/** How many pages the map shows, of all of them: on the minimized Pages button. */
const allPages = computed(() => checkpoints.value.length)
const shownPages = computed(() => checkpoints.value.filter((id) => !hidden.value.has(id)).length)
/** Each node of the tree as its row names it. */
const treeLabels = computed<Record<string, TreeLabel>>(() => ({
  ...Object.fromEntries(
    site.value.sites.map((s) => [s.id, { kind: 'site' as const, label: s.label }])
  ),
  ...(externalSites.value.length
    ? { [EXTERNAL]: { kind: 'folder' as const, label: 'external', sub: 'other sites' } }
    : {}),
  ...Object.fromEntries(
    site.value.folders.map((f) => [f.id, { kind: 'folder' as const, label: f.label, sub: f.path }])
  ),
  ...Object.fromEntries(
    props.access.layouts.map((l) => [
      l.node,
      { kind: 'layout' as const, label: l.name, sub: `${l.covers.length} pages` },
    ])
  ),
  ...Object.fromEntries(
    checkpoints.value.map((id) => [
      id,
      {
        kind: 'page' as const,
        label: id,
        ...(site.value.paths[id] ? { sub: site.value.paths[id] } : {}),
      },
    ])
  ),
}))
/** The nodes on the map: what the tree doesn't hide. */
const shownTree = computed(() => visibleTree(tree.value, hidden.value))
const shown = computed(() => {
  const ids = new Set<string>()
  const walk = (id: string) => {
    ids.add(id)
    for (const child of shownTree.value.childrenOf.get(id) ?? []) walk(child)
  }
  shownTree.value.roots.forEach(walk)
  return ids
})

/** The lines between shown nodes: where each page hangs in the site map, and the moves between pages. */
const shownSiteEdges = computed(() =>
  siteLines.value.filter((e) => shown.value.has(e.source) && shown.value.has(e.target))
)
const hiddenShared = computed(() => {
  const hide = new Set(
    sharedMoves.value
      .filter((e) => selected.value !== e.source && selected.value !== e.target)
      .map((e) => e.id)
  )
  return hide
})
/** How many shared links lead to each page: shown on its box, so they're counted, not lost. */
const sharedIn = computed(() => {
  const by = new Map<string, number>()
  for (const e of sharedMoves.value) by.set(e.target, (by.get(e.target) ?? 0) + e.blocks.length)
  return by
})
const shownMoves = computed(() => {
  const drawn = edgesData.value.filter(
    (e) => shown.value.has(e.source) && shown.value.has(e.target) && !hiddenShared.value.has(e.id)
  )
  // A shared link drawn from many pages shows its badge once, with how many lines it has: `nav-x (33)`.
  const shared = new Set(sharedMoves.value.map((e) => e.id))
  const lines = new Map<string, number>()
  for (const e of drawn) {
    if (!shared.has(e.id)) continue
    for (const b of e.blocks)
      lines.set(`${b.id}|${e.target}`, (lines.get(`${b.id}|${e.target}`) ?? 0) + 1)
  }
  const labelled = new Set<string>()
  return drawn.map((e) => {
    if (!shared.has(e.id)) return e
    const blocks = e.blocks.flatMap((b) => {
      const key = `${b.id}|${e.target}`
      if (labelled.has(key)) return []
      labelled.add(key)
      const n = lines.get(key) ?? 1
      return [n > 1 ? { ...b, name: `${b.name} (${n})` } : b]
    })
    return { ...e, blocks }
  })
})
/** The column (or row) each shown node is in: from the tree alone, so labels are planned before the layout. */
const columns = computed(() =>
  treeColumns(shownTree.value.roots, shownTree.value.childrenOf, direction.value)
)
/** Where each line's label sits, and the room the layout makes for them so they push boxes aside instead of covering them. */
const labels = computed(() =>
  planLabels([...shownSiteEdges.value, ...shownMoves.value], columns.value, direction.value)
)

/** What each page shows (its Read Blocks' fields) by namespace; a yes/no field is a state the page can be in. */
const shows = computed(() => {
  const by = new Map<string, { namespace: string; fields: { name: string; state: boolean }[] }[]>()
  for (const id of checkpoints.value) {
    const groups = new Map<string, { name: string; state: boolean }[]>()
    for (const read of pageSummary(id, pageBlocks.value, props.readBlocks).reads) {
      for (const [key, shape] of Object.entries(read.fields)) {
        const dot = key.indexOf('.')
        const [ns, name] = dot > 0 ? [key.slice(0, dot), key.slice(dot + 1)] : ['', key]
        groups.set(ns, [...(groups.get(ns) ?? []), { name, state: shape === 'boolean' }])
      }
    }
    by.set(
      id,
      [...groups].map(([namespace, fields]) => ({ namespace, fields }))
    )
  }
  return by
})

/** A page box's height: its name, address and counts (and its screenshot), then the rows its shown fields wrap to. */
const BOX = { width: 200, base: 84, shot: 106 } as const
// The canvas's nodes as drawn (with their measured sizes), readable before the canvas reports it's ready.
const { getNodes } = useVueFlow()
/** Each page box's size as drawn (measured once it rendered): the layout's sizes, so no box runs into the next. */
const measured = ref(new Map<string, number>())
const boxHeight = (id: string): number => {
  const drawn = measured.value.get(id)
  if (drawn) return drawn
  const base = BOX.base + (props.shots[id] ? BOX.shot : 0)
  const groups = shows.value.get(id) ?? []
  if (!groups.length) return base
  // Chips wrap in the box's inner width; a chip is its monospace name and its padding.
  const inner = BOX.width - 32
  const rows = groups.reduce((total, group) => {
    let row = 1
    let used = group.namespace.length * 6 + 4
    for (const f of group.fields) {
      const w = f.name.length * 6 + 12
      if (used + w > inner) {
        row++
        used = 0
      }
      used += w
    }
    return total + row
  }, 0)
  return base + 14 + rows * 20
}

/** Where every shown node sits: the site map's tree, laid out in the chosen direction, with room for the labels. */
const placed = computed(() => {
  // A page's box is as tall as what it holds (its screenshot, what it shows); the layout gives each its own height.
  return layoutTree(
    shownTree.value.roots,
    shownTree.value.childrenOf,
    { width: BOX.width, height: BOX.base },
    direction.value,
    {
      size: (id) =>
        checkpoints.value.includes(id) ? { width: BOX.width, height: boxHeight(id) } : undefined,
      across: (id) => labels.value.across.get(id) ?? 0,
      gapAfter: (column) => labels.value.gapAfter.get(column) ?? 0,
    }
  )
})

/**
 * A shell as a halo behind each page it covers (merging where they touch) and its tag above the first of them: its links as
 * chips, its interrupts as badges. A statechart's superstate, without needing the covered pages to sit together on the
 * map; and no line from every page to every link.
 */
const regions = computed<Node[]>(() => {
  const PAD = 14
  const TAG = 34
  const box = (id: string) => {
    const at = placed.value.get(id) ?? { x: 0, y: 0 }
    return { id, x: at.x, y: at.y, w: BOX.width, h: boxHeight(id) }
  }
  const pages = checkpoints.value.filter((id) => shown.value.has(id))
  return props.access.layouts.flatMap((l, rank) => {
    const inside = l.covers.filter((id) => pages.includes(id)).map(box)
    const first = [...inside].sort((a, b) => a.y - b.y || a.x - b.x)[0]
    if (!first) return []
    // Bigger shells behind smaller ones (a shell inside a shell).
    const behind = -(inside.length + 1)
    return [
      ...inside.map((b) => ({
        id: `${l.node}::${b.id}`,
        type: 'shell-halo',
        position: { x: b.x - PAD, y: b.y - PAD },
        zIndex: behind,
        draggable: false,
        selectable: false,
        data: { width: b.w + PAD * 2, height: b.h + PAD * 2, selected: selected.value === l.node },
      })),
      {
        id: l.node,
        type: 'shell',
        position: { x: first.x - PAD, y: first.y - PAD - TAG - rank * 0 },
        zIndex: behind + 1,
        draggable: false,
        selectable: false,
        data: {
          label: l.name,
          node: l.node,
          links: l.links.map((link) => ({ name: link.name, to: link.to })),
          interrupts: l.interrupts ?? [],
          selected: selected.value === l.node,
        },
      },
    ]
  })
})

const nodes = computed<Node[]>(() => {
  const sites = site.value.sites
  return [
    ...sites.map((s) => ({
      id: s.id,
      type: 'page',
      position: placed.value.get(s.id) ?? { x: 0, y: 0 },
      data: {
        label: s.label,
        url: s.origin,
        start: true,
        actions: 0,
        expects: 0,
        reads: 0,
        flows: 0,
        failing: 0,
      },
    })),
    ...(externalSites.value.length
      ? [
          {
            id: EXTERNAL,
            type: 'folder',
            position: placed.value.get(EXTERNAL) ?? { x: 0, y: 0 },
            data: { label: 'external', path: 'other sites' },
          },
        ]
      : []),
    ...regions.value,
    ...site.value.folders.map((f) => ({
      id: f.id,
      type: 'folder',
      position: placed.value.get(f.id) ?? { x: 0, y: 0 },
      data: { label: f.label, path: f.path },
    })),
    ...checkpoints.value.map((id) => {
      const page = pageSummary(id, pageBlocks.value, props.readBlocks)
      return {
        id,
        type: 'page',
        position: placed.value.get(id) ?? { x: 0, y: 0 },
        data: {
          label: id,
          url: site.value.paths[id],
          image: shotUrl(id),
          selected: selected.value === id,
          actions: page.actions.length,
          expects: page.expects.length,
          reads: page.reads.length,
          layouts: props.access.pageLayouts[id] ?? [],
          shared: sharedIn.value.get(id) ?? 0,
          shows: shows.value.get(id) ?? [],
          flows: props.pageFlows[id]?.length ?? 0,
          failing: props.pageFlows[id]?.filter((f) => f.ok === false).length ?? 0,
          here: props.live.some((s) => s.here === id),
        },
      }
    }),
  ].filter((n) => n.type === 'shell' || n.type === 'shell-halo' || shown.value.has(n.id))
})

/** Each edge's lane: its place among the edges that leave the same node the same way, so their lines run apart. */
function lanes<E extends { source: string }>(edges: E[]): number[] {
  const seen = new Map<string, number>()
  return edges.map((e) => {
    const n = seen.get(e.source) ?? 0
    seen.set(e.source, n + 1)
    return n
  })
}

/** The account picker's value for everyone (a select's value can't be null). */
const EVERYONE = '__everyone__'

let flow: VueFlowStore | null = null
/**
 * Once the boxes are drawn: keep their real heights (a long name or many fields wrap more than estimated), which lays
 * the map out again where one differs; then fit the whole map in view.
 */
function measure() {
  const heights = new Map(measured.value)
  let changed = false
  for (const node of getNodes.value) {
    const height = Math.round(node.dimensions.height)
    if (!height || !checkpoints.value.includes(node.id)) continue
    if (Math.abs((heights.get(node.id) ?? 0) - height) > 1) {
      heights.set(node.id, height)
      changed = true
    }
  }
  if (changed) measured.value = heights
  fit()
}

/** Fit the whole map in view once its nodes are measured (and again when the layout changes). */
function fit() {
  void flow?.fitView({ padding: 0.15, duration: 200 })
}
function ready(instance: VueFlowStore) {
  flow = instance
  fit()
}
// A new layout (or a canvas resized by the tree) is measured a frame after it renders: fit then.
watch([direction, hiddenList, showTree, () => props.access.account], async () => {
  await nextTick()
  requestAnimationFrame(() => requestAnimationFrame(fit))
})

const edges = computed<Edge[]>(() => {
  // Only what joins two shown nodes; lanes among those, so hidden lines leave no gaps.
  const siteEdges = shownSiteEdges.value
  const moves = shownMoves.value
  const siteLanes = lanes(siteEdges)
  const moveLanes = lanes(moves)
  return [
    ...siteEdges.map((e, i) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'sketch',
      // Along the tree: rightwards (left to right) or downwards (top down).
      sourceHandle: direction.value === 'LR' ? 'out' : 'down',
      targetHandle: direction.value === 'LR' ? 'in' : 'up',
      data: {
        blocks: e.blocks.map((b) => ({
          id: b.id,
          name: b.name,
          kind: b.kind,
          description: b.description,
        })),
        dashed: true,
        squared: true,
        lane: siteLanes[i],
        place: labels.value.places.get(e.id),
        highlighted: selected.value === e.target,
      },
    })),
    ...moves.map((e, i) => {
      // A move deeper into the tree runs along it; one to a page of the same depth (or back up) brackets out to the side
      // and back, past the boxes instead of through them.
      const lr = direction.value === 'LR'
      const deeper = (columns.value.get(e.target) ?? 0) > (columns.value.get(e.source) ?? 0)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'sketch',
        sourceHandle: lr ? 'out' : 'down',
        targetHandle: deeper ? (lr ? 'in' : 'up') : lr ? 'back' : 'under',
        data: {
          blocks: e.blocks.map((b) => ({
            id: b.id,
            name: b.name,
            kind: b.kind,
            description: b.description,
          })),
          squared: true,
          lane: moveLanes[i],
          place: labels.value.places.get(e.id),
          highlighted: selected.value === e.source || selected.value === e.target,
        },
      }
    }),
  ]
})

/** A page's newest screenshot, versioned by when it was taken so a new one shows without a stale cache. */
const shotUrl = (checkpoint: string): string | undefined =>
  props.shots[checkpoint]
    ? `${urlFor('screenshots.page', { checkpoint })}?v=${Math.round(props.shots[checkpoint])}`
    : undefined

/** The selected layout, when a layout's node is selected. */
/** The selected page's Page Block, with what it holds. */
const pageObject = computed(() => props.pages.find((p) => p.checkpoint === selected.value))
const layout = computed(() => props.access.layouts.find((l) => l.node === selected.value))

const page = computed(() =>
  selected.value && !notPages.value.has(selected.value)
    ? pageSummary(selected.value, pageBlocks.value, props.readBlocks)
    : null
)
</script>

<template>
  <WorkspaceLayout :project="props.project">
    <!-- Beside the page tree when it's open, so the map fits where it can be seen. -->
    <div class="absolute inset-y-0 right-0" :class="showTree ? 'left-80' : 'left-0'">
      <VueFlow
        :nodes="nodes"
        :edges="edges"
        :nodes-draggable="true"
        :nodes-connectable="false"
        :min-zoom="0.2"
        class="h-full w-full"
        @pane-ready="ready"
        @nodes-initialized="measure"
        @node-click="({ node }) => (selected = node.id === selected ? null : node.id)"
        @pane-click="selected = null"
      >
        <template #node-page="nodeProps">
          <PageNode v-bind="nodeProps" />
        </template>
        <template #node-shell="nodeProps">
          <ShellRegion v-bind="nodeProps" />
        </template>
        <template #node-shell-halo="nodeProps">
          <ShellHalo v-bind="nodeProps" />
        </template>
        <template #node-folder="nodeProps">
          <FolderNode v-bind="nodeProps" />
        </template>
        <template #edge-sketch="edgeProps">
          <SketchEdge v-bind="edgeProps" />
        </template>
        <Background variant="dots" :gap="22" :size="1.3" />
      </VueFlow>
    </div>

    <div class="absolute top-3 left-1/2 z-10 -translate-x-1/2">
      <FindPalette
        :pages="checkpoints"
        :blocks="props.blocks"
        :objects="props.pages"
        :flows="props.flows"
        @page="selected = $event"
        @block="openBlock"
      />
    </div>
    <div v-if="showTree" class="pointer-events-none absolute top-16 bottom-16 left-3 flex">
      <MapTree
        class="pointer-events-auto"
        :tree="tree"
        :hidden="hiddenByYou"
        :labels="treeLabels"
        :selected="selected"
        @toggle="setHidden(toggled(tree, hiddenByYou, $event))"
        @only="setHidden(only(tree, $event))"
        @all="setHidden(new Set())"
        @none="setHidden(new Set(everything(tree)))"
        @select="selected = $event"
        @minimize="showTree = false"
      />
    </div>
    <!-- Minimized: the pages come back from where they were. -->
    <div v-else class="absolute top-16 left-3">
      <UButton
        label="Pages"
        icon="i-lucide-panel-left-open"
        size="sm"
        color="neutral"
        variant="outline"
        class="island"
        aria-label="Show the pages"
        @click="showTree = true"
      >
        <template #trailing>
          <span class="text-xs text-(--ink-soft)">{{ shownPages }}/{{ allPages }}</span>
        </template>
      </UButton>
    </div>

    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-start p-3 pt-16">
      <PagePanel
        v-if="page"
        class="pointer-events-auto"
        :page="page"
        :urls="props.pageUrls[page.checkpoint] ?? []"
        :image="shotUrl(page.checkpoint)"
        :object="pageObject"
        :results="props.results"
        :flows="props.pageFlows[page.checkpoint] ?? []"
        :network="props.network[page.checkpoint]"
        :layouts="props.access.pageLayouts[page.checkpoint] ?? []"
        :given="props.access.pageGiven[page.checkpoint]"
        @close="selected = null"
      />
      <BlockPanel
        v-else-if="blockPanel"
        class="pointer-events-auto"
        :block="blockPanel"
        @close="selectedBlock = null"
      />
      <LayoutPanel
        v-else-if="layout"
        class="pointer-events-auto"
        :layout="layout"
        @close="selected = null"
        @select="selected = $event"
      />
    </div>

    <div
      class="island absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 text-xs text-(--ink-soft)"
    >
      <UTooltip :text="showTree ? 'Hide the page tree' : 'Show the page tree'">
        <UButton
          icon="i-lucide-list-tree"
          size="xs"
          :color="showTree ? 'primary' : 'neutral'"
          variant="ghost"
          :aria-label="showTree ? 'Hide the page tree' : 'Show the page tree'"
          @click="showTree = !showTree"
        />
      </UTooltip>
      <UTooltip :text="direction === 'LR' ? 'Lay out top down' : 'Lay out left to right'">
        <UButton
          :icon="
            direction === 'LR' ? 'i-lucide-arrow-right-from-line' : 'i-lucide-arrow-down-from-line'
          "
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="direction === 'LR' ? 'Lay out top down' : 'Lay out left to right'"
          @click="direction = direction === 'LR' ? 'TB' : 'LR'"
        />
      </UTooltip>
      <span class="flex items-center gap-1" aria-label="Block kinds">
        <UBadge
          v-for="k in MOVE_KINDS"
          :key="k"
          :label="k"
          :icon="kindIcon(k)"
          :color="kindColor(k)"
          variant="subtle"
          size="sm"
          class="font-mono"
        />
      </span>
      <!-- Only what some flows use: by label or by name. -->
      <USelectMenu
        v-model="flowPick"
        :items="flowItems"
        value-key="value"
        multiple
        icon="i-lucide-route"
        size="xs"
        variant="ghost"
        class="w-40"
        placeholder="All flows"
        aria-label="Show only what some flows use"
      />
      <!-- The map as one account sees it: only what it's given (for). -->
      <USelect
        v-if="props.access.accounts.length"
        :model-value="props.access.account ?? EVERYONE"
        :items="[
          { label: 'Everyone', value: EVERYONE },
          ...props.access.accounts.map((a) => ({ label: `As ${a}`, value: a })),
        ]"
        icon="i-lucide-user-round"
        size="xs"
        variant="ghost"
        class="w-36"
        aria-label="Show the map as one account sees it"
        @update:model-value="showAs($event === EVERYONE ? null : String($event))"
      />
      <span
        v-if="props.access.leftOut || props.access.closed.length"
        class="text-(--run)"
        :title="`What ${props.access.account} isn't given (for)`"
      >
        {{ count(props.access.closed.length, 'page') }},
        {{ count(props.access.leftOut, 'Block') }} left out
      </span>
      <UPopover>
        <UButton icon="i-lucide-info" label="Legend" size="xs" color="neutral" variant="ghost" />
        <template #content>
          <MapLegend />
        </template>
      </UPopover>
      <span
        v-if="hiddenShared.size"
        :title="'Links valid from many pages (a menu, a sidebar) draw their lines when you select the page they lead to or start from'"
        class="text-(--ink-soft)"
        >{{ count(hiddenShared.size, 'shared link') }} hidden</span
      >
      <span>{{ count(checkpoints.length, 'page') }}</span>
      <span>{{ count(props.blocks.length, 'Block') }}</span>
      <span>{{ count(props.flows.length, 'flow') }}</span>
      <span>waygraph {{ props.project.waygraph }}</span>
      <UPopover v-if="props.skipped.length">
        <UButton
          size="xs"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :label="`${props.skipped.length} files skipped`"
        />
        <template #content>
          <ul class="max-w-md space-y-1 p-3 text-xs">
            <li v-for="s in props.skipped" :key="s.file">
              <span class="font-mono">{{ s.file }}</span
              >: {{ s.error }}
            </li>
          </ul>
        </template>
      </UPopover>
    </div>
  </WorkspaceLayout>
</template>
