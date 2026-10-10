import type { Node, Edge } from '@xyflow/react'

import type {
  TopologyChannel,
  TopologyGraph,
  TopologyGraphInput,
  TopologyNodeData,
  TopologyEdgeData,
} from '../types'

export const topologyId = (...parts: (string | number)[]): string =>
  JSON.stringify(parts)
export function buildTopologyGraph(input: TopologyGraphInput): TopologyGraph {
  const nodes: Node<TopologyNodeData>[] = []
  const edges: Edge<TopologyEdgeData>[] = []
  const root = topologyId('group', input.group)
  nodes.push({
    id: root,
    type: 'topology',
    position: { x: 0, y: 0 },
    data: { kind: 'group', label: input.group, depth: 0 },
  })
  for (const model of input.models) {
    nodes.push({
      id: topologyId('model', input.group, model.name),
      type: 'topology',
      position: { x: 0, y: 0 },
      data: {
        kind: 'model',
        model: model.name,
        label: model.name,
        depth: 1,
        summary: model,
        expanded: input.expandedModels.has(model.name),
      },
    })
    edges.push({
      id: topologyId('group-model', input.group, model.name),
      source: root,
      target: topologyId('model', input.group, model.name),
      type: 'smoothstep',
    })
  }
  const shared = new Set<string>()
  for (const model of input.models) {
    const detail = input.detailsByModel[model.name]
    if (
      !input.expandedModels.has(model.name) ||
      !detail ||
      detail.group !== input.group
    ) {
      continue
    }
    const modelId = topologyId('model', input.group, model.name)
    const tiers = [
      ...detail.tiers,
      ...(detail.excluded_channels.length
        ? [{ priority: 0, channels: detail.excluded_channels }]
        : []),
    ]
    for (const [tierIndex, tier] of tiers.entries()) {
      const disabled = tier.channels.every((c) => c.channel_status !== 1)
      const tierId = topologyId('tier', input.group, model.name, tierIndex)
      if (input.mode === 'tree') {
        nodes.push({
          id: tierId,
          type: 'topology',
          position: { x: 0, y: 0 },
          data: {
            kind: 'tier',
            model: model.name,
            label: String(tier.priority),
            priority: tier.priority,
            depth: 2,
            disabled,
          },
        })
        edges.push({
          id: topologyId('model-tier', tierId),
          source: modelId,
          target: tierId,
          type: 'smoothstep',
          data: { model: model.name, disabled },
          style: { strokeDasharray: disabled ? '5 4' : undefined },
        })
      }
      for (const ch of tier.channels) {
        const channelId =
          input.mode === 'tree'
            ? topologyId('channel', input.group, model.name, ch.channel_id)
            : topologyId('channel', input.group, ch.channel_id)
        if (!shared.has(channelId)) {
          shared.add(channelId)
          nodes.push({
            id: channelId,
            type: 'topology',
            position: { x: 0, y: 0 },
            data: {
              kind: 'channel',
              model: input.mode === 'tree' ? model.name : undefined,
              channelId: ch.channel_id,
              label: ch.channel_name,
              channel: ch,
              depth: input.mode === 'tree' ? 3 : 2,
              disabled: ch.channel_status !== 1,
            },
          })
        }
        const relationship: TopologyEdgeData = {
          model: model.name,
          channelId: ch.channel_id,
          mapping: ch.mapping,
          priority: ch.priority,
          weight: ch.configured_weight,
          disabled: ch.channel_status !== 1,
        }
        edges.push({
          id: topologyId('relation', input.group, model.name, ch.channel_id),
          source: input.mode === 'tree' ? tierId : modelId,
          target: channelId,
          type: 'smoothstep',
          data: relationship,
          style: {
            strokeWidth: 1,
            strokeDasharray: ch.channel_status !== 1 ? '5 4' : undefined,
          },
        })
        if (input.mode === 'tree') {
          let parent = channelId
          for (const [step, name] of ch.mapping.names.slice(1).entries()) {
            const id = topologyId(
              'mapping',
              input.group,
              model.name,
              ch.channel_id,
              step
            )
            nodes.push({
              id,
              type: 'topology',
              position: { x: 0, y: 0 },
              data: {
                kind: 'mapping',
                model: model.name,
                channelId: ch.channel_id,
                label: name,
                depth: 4 + step,
                channel: ch,
              },
            })
            edges.push({
              id: topologyId('mapping-edge', id),
              source: parent,
              target: id,
              type: 'smoothstep',
              data: relationship,
            })
            parent = id
          }
        }
      }
    }
  }
  const visible = nodes.slice(0, Math.max(1, input.visibleBudget))
  const ids = new Set(visible.map((n) => n.id))
  const omitted = nodes.slice(visible.length)
  return {
    nodes: visible,
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    omittedCounts: {
      nodes: omitted.length,
      models: omitted.filter((n) => n.data.kind === 'model').length,
      channels: omitted.filter((n) => n.data.kind === 'channel').length,
    },
  }
}
export function topologyChannels(
  detail: import('../types').TopologyDetail
): TopologyChannel[] {
  return [
    ...detail.tiers.flatMap((t) => t.channels),
    ...detail.excluded_channels,
  ]
}
