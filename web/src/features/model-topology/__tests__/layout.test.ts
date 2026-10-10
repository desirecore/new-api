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
    expect(laid.nodes.find((n) => n.id === e.source)?.position.x ?? Number.NaN).toBeLessThan(
      laid.nodes.find((n) => n.id === e.target)?.position.x ?? Number.NaN
    )
  }
  for (const a of laid.nodes)
    {for (const b of laid.nodes) {
      if (a.id !== b.id && a.position.x === b.position.x) {
        expect(Math.abs(a.position.y - b.position.y)).toBeGreaterThanOrEqual(
          120
        )
      }
    }}
  const previous = new Map(laid.nodes.map((n) => [n.id, n.position]))
  expect(
    layoutTopologyGraph(graph, 'tree', previous).nodes.map((n) => n.position)
  ).toEqual(laid.nodes.map((n) => n.position))
})
