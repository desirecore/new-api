import type { Node, NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import { Node as NodeCard, NodeContent } from '@/components/ai-elements/node'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { TopologyNodeData } from '../types'

export function TopologyNode(props: NodeProps<Node<TopologyNodeData>>) {
  const { t, i18n } = useTranslation()
  const d = props.data
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  let title = d.label
  if (d.kind === 'tier') {
    title = d.disabled
      ? t('Excluded channels')
      : t('Priority {{value}}', { value: formatNumber(d.priority, locale) })
  }
  return (
    <NodeCard
      handles={{ target: d.depth > 0, source: true }}
      className={cn(
        '!h-[120px] !w-[240px] overflow-hidden',
        d.disabled && 'border-dashed',
        props.selected && 'ring-primary ring-2'
      )}
    >
      <NodeContent className='flex h-full flex-col justify-between !p-2'>
        <Button
          id={`topology-focus-${props.id}`}
          variant='ghost'
          className='nodrag nopan !h-auto min-h-12 w-full flex-col items-start overflow-hidden !px-1 text-left'
          onClick={d.onSelect}
          aria-label={title}
          title={title}
        >
          <span className='w-full truncate font-medium'>{title}</span>
          {d.kind === 'channel' && (
            <span className='text-muted-foreground text-xs'>
              #{formatNumber(d.channelId, locale)} ·{' '}
              {d.disabled ? t('Disabled') : t('Enabled')}
            </span>
          )}
          {d.summary && (
            <span className='text-muted-foreground text-xs'>
              {t('{{enabled}} / {{total}} enabled channels', {
                enabled: formatNumber(d.summary.enabled_channels, locale),
                total: formatNumber(d.summary.configured_channels, locale),
              })}
            </span>
          )}
        </Button>
        <div className='flex items-center justify-between gap-1 text-xs'>
          {d.kind === 'model' && d.onExpand ? (
            <Button
              variant='outline'
              size='xs'
              className='nodrag nopan'
              aria-label={d.expanded ? t('Collapse model') : t('Expand model')}
              aria-expanded={!!d.expanded}
              onClick={(event) => {
                event.stopPropagation()
                d.onExpand?.()
              }}
            >
              {d.expanded ? t('Collapse') : t('Expand')}
            </Button>
          ) : (
            <span className='text-muted-foreground'>
              {d.kind === 'mapping' ? t('Channel mapping') : null}
            </span>
          )}
          {d.loading && <span role='status'>{t('Loading...')}</span>}
          {d.failed && (
            <Button
              size='xs'
              variant='outline'
              className='nodrag nopan'
              onClick={d.onExpand}
            >
              {t('Retry')}
            </Button>
          )}
          {d.summary?.diagnostics.length || d.channel?.diagnostics.length ? (
            <span title={t('Configuration diagnostics')}>
              {t('Diagnostics')}
            </span>
          ) : null}
        </div>
      </NodeContent>
    </NodeCard>
  )
}
