import type { TopologyGraph, TopologyMode } from '../types'

export function layoutTopologyGraph(
  graph: TopologyGraph,
  mode: TopologyMode,
  previousPositions?: ReadonlyMap<string, { x: number; y: number }>
): TopologyGraph {
  const positions = new Map<string, { x: number; y: number }>()
  if (mode === 'network') {
    for (const depth of [0, 1, 2]) {
      const layer = graph.nodes
        .filter((n) => n.data.depth === depth)
        .sort((a, b) => a.id.localeCompare(b.id))
      let cursor = 0
      for (const node of layer) {
        const y = Math.max(cursor, previousPositions?.get(node.id)?.y ?? 0)
        positions.set(node.id, { x: depth * 340, y })
        cursor = y + 160
      }
    }
  } else {
    let cursor = 0
    for (const model of graph.nodes.filter((n) => n.data.kind === 'model')) {
      const owned = graph.nodes.filter((n) => n.data.model === model.data.model)
      const channels = owned.filter((n) => n.data.kind === 'channel')
      const start = Math.max(cursor, previousPositions?.get(model.id)?.y ?? 0)
      positions.set(model.id, { x: 340, y: start })
      const channelRows = new Map(
        channels.map((node, index) => [
          node.data.channelId,
          start + index * 160,
        ])
      )
      for (const node of owned) {
        if (node.data.kind === 'channel' || node.data.kind === 'mapping') {
          positions.set(node.id, {
            x: node.data.depth * 340,
            y: channelRows.get(node.data.channelId) ?? start,
          })
        }
      }
      let tierCursor = start
      for (const tier of owned.filter((n) => n.data.kind === 'tier')) {
        const children = graph.edges
          .filter((e) => e.source === tier.id)
          .map((e) => positions.get(e.target)?.y)
          .filter((y): y is number => y !== undefined)
        const y = children.length
          ? (Math.min(...children) + Math.max(...children)) / 2
          : Math.max(tierCursor, start + channels.length * 160)
        positions.set(tier.id, { x: 680, y })
        tierCursor = y + 160
      }
      cursor =
        Math.max(start + Math.max(channels.length, 1) * 160, tierCursor) + 60
    }
  }
  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
    })),
  }
}
