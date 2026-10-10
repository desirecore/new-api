import type { TFunction } from 'i18next'

export function topologyDiagnosticLabel(code: string, t: TFunction): string {
  switch (code) {
    case 'missing_group_config':
      return t('Group ratio is not configured')
    case 'raw_whitespace':
      return t('Raw configuration contains surrounding whitespace')
    case 'missing_ability':
      return t('Ability record is missing')
    case 'orphan_ability':
      return t('Ability has no matching channel configuration')
    case 'ability_enabled_mismatch':
      return t('Ability and channel enabled states differ')
    case 'ability_routing_mismatch':
      return t('Ability priority or weight differs from channel configuration')
    case 'invalid_mapping':
      return t('Channel mapping JSON is invalid')
    case 'mapping_cycle':
      return t('Channel mapping contains a cycle')
    case 'mapping_truncated':
      return t('Channel mapping display is limited to 64 steps')
    default:
      return code
  }
}
