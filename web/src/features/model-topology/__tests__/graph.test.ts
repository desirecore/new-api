import { describe, expect, it } from 'vitest'
import { buildTopologyGraph } from '../lib/graph'
import { detail, summary } from './fixtures'

describe('topology projection', () => {
 it('keeps model-specific mappings on shared channel relationships', () => {
  const input = { group:'g', models:[summary('A'),summary('B')], detailsByModel:{ A:detail('A','X'), B:detail('B','Y') }, expandedModels:new Set(['A','B']), visibleBudget:300 }
  const tree=buildTopologyGraph({...input,mode:'tree'})
  const network=buildTopologyGraph({...input,mode:'network'})
  expect(tree.nodes.filter(n=>n.data.channelId===7 && n.data.kind==='channel')).toHaveLength(2)
  expect(network.nodes.filter(n=>n.data.channelId===7)).toHaveLength(1)
  const relations=network.edges.filter(e=>e.data?.channelId===7)
  expect(relations).toHaveLength(2)
  expect(relations.find(e=>e.data?.model==='A')?.data?.mapping?.names).toEqual(['A','X'])
  expect(relations.find(e=>e.data?.model==='B')?.data?.mapping?.names).toEqual(['B','Y'])
  expect(network.nodes.some(n=>n.data.kind==='mapping')).toBe(false)
 })
 it('retains summaries when collapsed and explicitly counts budget omissions',()=>{
  const input={ group:'g|A',models:[summary('A|g')],detailsByModel:{'A|g':detail('A|g','X','g|A')},expandedModels:new Set<string>(),visibleBudget:300,mode:'tree' as const }
  expect(buildTopologyGraph(input).nodes).toHaveLength(2)
  const graph=buildTopologyGraph({...input,expandedModels:new Set(['A|g']),visibleBudget:3})
  expect(graph.nodes.length).toBeLessThanOrEqual(3)
  expect(graph.omittedCounts.nodes).toBeGreaterThan(0)
  expect(new Set(graph.nodes.map(n=>n.id)).size).toBe(graph.nodes.length)
  expect(graph.edges.every(e=>graph.nodes.some(n=>n.id===e.source)&&graph.nodes.some(n=>n.id===e.target))).toBe(true)
 })
})
