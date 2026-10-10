import { describe, expect, it } from 'vitest'

import { buildTopologyGraph } from '../lib/graph'
import { detail, summary } from './fixtures'

describe('topology projection', () => {
  it('keeps model-specific mappings on shared channel relationships', () => {
    const input = {
      group: 'g',
      models: [summary('A'), summary('B')],
      detailsByModel: { A: detail('A', 'X'), B: detail('B', 'Y') },
      expandedModels: new Set(['A', 'B']),
      visibleBudget: 300,
    }
    const tree = buildTopologyGraph({ ...input, mode: 'tree' })
    const network = buildTopologyGraph({ ...input, mode: 'network' })
    expect(
      tree.nodes.filter(
        (n) => n.data.channelId === 7 && n.data.kind === 'channel'
      )
    ).toHaveLength(2)
    expect(network.nodes.filter((n) => n.data.channelId === 7)).toHaveLength(1)
    const relations = network.edges.filter((e) => e.data?.channelId === 7)
    expect(relations).toHaveLength(2)
    expect(
      relations.find((e) => e.data?.model === 'A')?.data?.mapping?.names
    ).toEqual(['A', 'X'])
    expect(
      relations.find((e) => e.data?.model === 'B')?.data?.mapping?.names
    ).toEqual(['B', 'Y'])
    expect(network.nodes.some((n) => n.data.kind === 'mapping')).toBe(false)
  })
  it('retains summaries when collapsed and explicitly counts budget omissions', () => {
    const input = {
      group: 'g|A',
      models: [summary('A|g')],
      detailsByModel: { 'A|g': detail('A|g', 'X', 'g|A') },
      expandedModels: new Set<string>(),
      visibleBudget: 300,
      mode: 'tree' as const,
    }
    expect(buildTopologyGraph(input).nodes).toHaveLength(2)
    const graph = buildTopologyGraph({
      ...input,
      expandedModels: new Set(['A|g']),
      visibleBudget: 3,
    })
    expect(graph.nodes.length).toBeLessThanOrEqual(3)
    expect(graph.omittedCounts.nodes).toBeGreaterThan(0)
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length)
    expect(
      graph.edges.every(
        (e) =>
          graph.nodes.some((n) => n.id === e.source) &&
          graph.nodes.some((n) => n.id === e.target)
      )
    ).toBe(true)
  })
})

it('counts omitted nodes explicitly at the 300-node budget and keeps disabled channel facts', () => {
  const d = detail('A', 'X')
  const template = d.tiers[0].channels[0]
  d.tiers[0].channels = Array.from({ length: 160 }, (_, i) => ({
    ...template,
    channel_id: i + 1,
    channel_name: 'Same name',
  }))
  d.excluded_channels = [{ ...template, channel_id: 999, channel_status: 2 }]
  const input = {
    group: 'g',
    models: [summary('A')],
    detailsByModel: { A: d },
    expandedModels: new Set(['A']),
    visibleBudget: 300,
    mode: 'tree' as const,
  }
  const limited = buildTopologyGraph(input)
  expect(limited.nodes).toHaveLength(300)
  expect(limited.omittedCounts.nodes).toBe(26)
  const complete = buildTopologyGraph({ ...input, visibleBudget: 600 })
  expect(complete.omittedCounts.nodes).toBe(0)
  expect(complete.nodes.filter((n) => n.data.kind === 'channel')).toHaveLength(
    161
  )
  expect(
    complete.edges.find((e) => e.data?.channelId === 999)?.data?.disabled
  ).toBe(true)
})

it('retains the configured priority on a disabled network relationship', () => {
  const d = detail('A', 'X')
  d.excluded_channels = [
    {
      ...d.tiers[0].channels[0],
      channel_id: 9,
      channel_status: 2,
      priority: 100,
    },
  ]
  const graph = buildTopologyGraph({
    group: 'g',
    models: [summary('A')],
    detailsByModel: { A: d },
    expandedModels: new Set(['A']),
    visibleBudget: 300,
    mode: 'network',
  })
  expect(graph.edges.find((e) => e.data?.channelId === 9)?.data?.priority).toBe(
    100
  )
})
