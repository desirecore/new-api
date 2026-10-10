import { expect, it } from 'vitest'

import { buildTopologyGraph } from '../lib/graph'
import { layoutTopologyGraph } from '../lib/layout'
import { detail, summary } from './fixtures'

it('places a deterministic left-to-right tree without overlapping cards', () => {
  const graph = buildTopologyGraph({
    group: 'g',
    models: [summary('A'), summary('B')],
    detailsByModel: { A: detail('A', 'X'), B: detail('B', 'Y') },
    expandedModels: new Set(['A', 'B']),
    visibleBudget: 300,
    mode: 'tree',
  })
  const laid = layoutTopologyGraph(graph, 'tree')
  expect(
    layoutTopologyGraph(graph, 'tree').nodes.map((n) => n.position)
  ).toEqual(laid.nodes.map((n) => n.position))
  for (const e of laid.edges) {
    expect(
      laid.nodes.find((n) => n.id === e.source)?.position.x ?? Number.NaN
    ).toBeLessThan(
      laid.nodes.find((n) => n.id === e.target)?.position.x ?? Number.NaN
    )
  }
  for (const a of laid.nodes) {
    for (const b of laid.nodes) {
      if (a.id !== b.id && a.position.x === b.position.x) {
        expect(Math.abs(a.position.y - b.position.y)).toBeGreaterThanOrEqual(
          120
        )
      }
    }
  }
  const previous = new Map(laid.nodes.map((n) => [n.id, n.position]))
  expect(
    layoutTopologyGraph(graph, 'tree', previous).nodes.map((n) => n.position)
  ).toEqual(laid.nodes.map((n) => n.position))
})

it('centers each priority tier on its own parallel channel candidates', () => {
  const d = detail('A', 'X')
  d.tiers[0].channels.push({ ...d.tiers[0].channels[0], channel_id: 8 })
  const graph = layoutTopologyGraph(
    buildTopologyGraph({
      group: 'g',
      models: [summary('A')],
      detailsByModel: { A: d },
      expandedModels: new Set(['A']),
      visibleBudget: 300,
      mode: 'tree',
    }),
    'tree'
  )
  expect(graph.nodes.find((n) => n.data.kind === 'tier')?.position.y).toBe(80)
  expect(
    graph.nodes
      .filter((n) => n.data.kind === 'channel')
      .map((n) => n.position.y)
  ).toEqual([0, 160])
})

it('keeps a truncated priority tier separate from the visible tier', () => {
  const d = detail('A', 'X')
  d.tiers.push({
    ...d.tiers[0],
    priority: 5,
    channels: [{ ...d.tiers[0].channels[0], channel_id: 9 }],
  })
  const graph = layoutTopologyGraph(
    buildTopologyGraph({
      group: 'g',
      models: [summary('A')],
      detailsByModel: { A: d },
      expandedModels: new Set(['A']),
      visibleBudget: 6,
      mode: 'tree',
    }),
    'tree'
  )
  const tiers = graph.nodes.filter((n) => n.data.kind === 'tier')
  expect(tiers).toHaveLength(2)
  expect(
    Math.abs(tiers[0].position.y - tiers[1].position.y)
  ).toBeGreaterThanOrEqual(120)
})
