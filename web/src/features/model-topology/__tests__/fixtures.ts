import type { TopologyDetail, TopologyModelSummary } from '../types'

export function summary(name: string): TopologyModelSummary {
  return {
    name,
    configured_channels: 1,
    enabled_channels: 1,
    priority_layers: 1,
    channel_ids: [7],
    has_mapping: true,
    diagnostics: [],
  }
}
export function detail(
  name: string,
  target: string,
  group = 'g'
): TopologyDetail {
  return {
    group,
    model: name,
    observed_at: '2026-10-10T00:00:00Z',
    basis: 'config',
    runtime_mode: 'database',
    summary: summary(name),
    tiers: [
      {
        priority: 100,
        channels: [
          {
            channel_id: 7,
            channel_name: 'Shared',
            channel_type: 1,
            channel_status: 1,
            configured_weight: 80,
            priority: 100,
            ability_consistency: 'consistent',
            related_model_count_in_group: 2,
            mapping: {
              names: [name, target],
              status: 'mapped',
              scope: 'channel_mapping',
              diagnostics: [],
            },
            diagnostics: [],
          },
        ],
      },
    ],
    excluded_channels: [],
    limitations: [],
  }
}
