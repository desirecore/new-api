import type { Edge, Node } from '@xyflow/react'

export type TopologyDiagnostic = {
  code: string
  severity: string
  affected_channel_id?: number
}
export type TopologyGroup = {
  name: string
  sources: string[]
  special: boolean
  configured_models: number
  configured_channels: number
  diagnostics: TopologyDiagnostic[]
}
export type TopologyModelSummary = {
  name: string
  configured_channels: number
  enabled_channels: number
  priority_layers: number
  channel_ids: number[]
  has_mapping: boolean
  diagnostics: TopologyDiagnostic[]
}
export type TopologyMapping = {
  names: string[]
  status: string
  scope: 'channel_mapping'
  diagnostics: TopologyDiagnostic[]
}
export type TopologyChannel = {
  channel_id: number
  channel_name: string
  channel_type: number
  channel_status: number
  configured_weight: number
  priority: number
  ability_consistency: string
  related_model_count_in_group: number
  mapping: TopologyMapping
  diagnostics: TopologyDiagnostic[]
}
export type TopologyDetail = {
  group: string
  model: string
  observed_at: string
  basis: 'config'
  runtime_mode: string
  summary: TopologyModelSummary
  tiers: { priority: number; channels: TopologyChannel[] }[]
  excluded_channels: TopologyChannel[]
  limitations: string[]
}
export type TopologyModelQuery = {
  group: string
  keyword?: string
  channel_keyword?: string
  channel_id?: number
  status?: string
  has_mapping?: boolean
  has_diagnostics?: boolean
  p?: number
  page_size?: number
}
export type TopologyModelPage = {
  items: TopologyModelSummary[]
  total: number
  group_total: number
  page: number
  page_size: number
  observed_at: string
  basis: 'config'
  runtime_mode: string
}
export type TopologyMode = 'tree' | 'network'
export type TopologySearch = {
  tGroup?: string
  tModel?: string
  tMode?: TopologyMode | 'table'
  tSearch?: string
  tChannel?: string
  tChannelId?: number
  tStatus?: 'all' | 'enabled' | 'disabled' | 'inconsistent'
  tMapping?: boolean
  tDiagnostics?: boolean
}
export type TopologySelection = {
  kind: 'group' | 'model' | 'tier' | 'channel' | 'mapping' | 'relation'
  model?: string
  channelId?: number
  nodeId?: string
}
export type TopologyNodeData = Record<string, unknown> &
  TopologySelection & {
    label: string
    depth: number
    summary?: TopologyModelSummary
    channel?: TopologyChannel
    priority?: number
    expanded?: boolean
    disabled?: boolean
    onExpand?: () => void
    onSelect?: () => void
    loading?: boolean
    failed?: boolean
  }
export type TopologyEdgeData = Record<string, unknown> & {
  model?: string
  channelId?: number
  mapping?: TopologyMapping
  priority?: number
  weight?: number
  disabled?: boolean
}
export type TopologyGraph = {
  nodes: Node<TopologyNodeData>[]
  edges: Edge<TopologyEdgeData>[]
  omittedCounts: { nodes: number; models: number; channels: number }
}
export type TopologyGraphInput = {
  group: string
  models: TopologyModelSummary[]
  detailsByModel: Readonly<Record<string, TopologyDetail>>
  expandedModels: ReadonlySet<string>
  mode: TopologyMode
  visibleBudget: number
}
