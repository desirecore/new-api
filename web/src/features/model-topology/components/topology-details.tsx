import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { TopologyViewState } from '../hooks/use-topology-view'
import { topologyChannels } from '../lib/graph'
import { topologyDiagnosticLabel } from '../lib/labels'
import type { TopologySelection } from '../types'

export function TopologyDetails(props: {
  selection: TopologySelection | null
  view: TopologyViewState
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const focus = useRef<HTMLElement | null>(null)
  if (
    props.selection &&
    document.activeElement instanceof HTMLElement &&
    !document.activeElement.closest('[role="dialog"]')
  )
    {focus.current = document.activeElement}
  const selected = props.selection
  const detail = selected?.model
    ? props.view.details[selected.model]
    : undefined
  const channels = detail
    ? topologyChannels(detail).filter(
        (ch) => !selected?.channelId || ch.channel_id === selected.channelId
      )
    : []
  const summary =
    detail?.summary ?? props.view.models.find((m) => m.name === selected?.model)
  const related = selected?.channelId
    ? Object.values(props.view.details).flatMap((d) =>
        topologyChannels(d)
          .filter((ch) => ch.channel_id === selected.channelId)
          .map((ch) => ({ model: d.model, channel: ch }))
      )
    : []
  return (
    <Sheet
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('sm:max-w-xl')}
        finalFocus={() => focus.current}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='break-all'>
            {selected?.model ?? props.view.group}
          </SheetTitle>
          <SheetDescription>
            {t('Configuration topology')} · {t('Channel mapping only')}
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-5 overflow-auto p-5'>
          {selected?.kind === 'group' && (
            <>
              <p>
                {t('Sources')}: {props.view.groupInfo?.sources.join(', ')}
              </p>
              {props.view.groupInfo?.diagnostics.map((d) => (
                <p key={`${d.code}:${d.affected_channel_id ?? 0}`}>
                  {topologyDiagnosticLabel(d.code, t)}
                </p>
              ))}
            </>
          )}
          {summary && (
            <dl className='grid grid-cols-2 gap-2 text-sm'>
              <dt>{t('Configured channels')}</dt>
              <dd>{formatNumber(summary.configured_channels, locale)}</dd>
              <dt>{t('Enabled channels')}</dt>
              <dd>{formatNumber(summary.enabled_channels, locale)}</dd>
              <dt>{t('Priority layers')}</dt>
              <dd>{formatNumber(summary.priority_layers, locale)}</dd>
            </dl>
          )}
          {selected?.model && props.view.detailLoading.has(selected.model) && (
            <LoadingState inline />
          )}
          {selected?.model && props.view.detailErrors.has(selected.model) && (
            <ErrorState
              onRetry={() => props.view.retryDetail(selected.model ?? '')}
            />
          )}
          {channels.map((ch) => (
            <section
              key={ch.channel_id}
              className='space-y-2 rounded-lg border p-4'
            >
              <h3 className='font-medium break-all'>
                #{formatNumber(ch.channel_id, locale)} {ch.channel_name}
              </h3>
              <p className='text-sm'>
                {ch.channel_status === 1
                  ? t('Enabled')
                  : t('Excluded from ordinary selection')}{' '}
                · {t('Channel type')}: {formatNumber(ch.channel_type, locale)}
              </p>
              <p>
                {t('Priority {{value}}', {
                  value: formatNumber(ch.priority, locale),
                })}{' '}
                · {t('Raw weight')}:{' '}
                {formatNumber(ch.configured_weight, locale)}
              </p>
              <p className='font-mono text-sm break-all'>
                {ch.mapping.names.join(' → ')}
              </p>
              {ch.diagnostics.map((d) => (
                <p
                  key={`${d.code}:${d.affected_channel_id ?? 0}`}
                  className='text-sm'
                >
                  {topologyDiagnosticLabel(d.code, t)}
                </p>
              ))}
            </section>
          ))}
          {selected?.kind === 'channel' && !selected.model && (
            <>
              <p>
                {t('{{loaded}} loaded / {{total}} related models', {
                  loaded: formatNumber(related.length, locale),
                  total: formatNumber(
                    related[0]?.channel.related_model_count_in_group,
                    locale
                  ),
                })}
              </p>
              {related.map((r) => (
                <Button
                  key={r.model}
                  variant='outline'
                  className='h-auto w-full justify-start text-left break-all whitespace-normal'
                  onClick={() =>
                    props.view.setSelection({
                      kind: 'relation',
                      model: r.model,
                      channelId: selected.channelId,
                    })
                  }
                >
                  {r.model} · {r.channel.mapping.names.join(' → ')}
                </Button>
              ))}
              <Button
                variant='outline'
                onClick={() => {
                  props.view.onSearchChange({
                    tChannelId: selected.channelId,
                    tModel: undefined,
                  })
                  props.onClose()
                }}
              >
                {t('Filter models by this channel')}
              </Button>
            </>
          )}
          {summary?.diagnostics.map((d) => (
            <p
              className='text-sm'
              key={`${d.code}:${d.affected_channel_id ?? 0}`}
            >
              {topologyDiagnosticLabel(d.code, t)}
              {d.affected_channel_id
                ? ` #${formatNumber(d.affected_channel_id, locale)}`
                : ''}
            </p>
          ))}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Priority and raw weight describe configuration, not hit probability. Pinned channels, affinity, endpoints, model matching, plugins, auto groups and user or token limits may change selection.'
            )}
          </p>
          {detail && (
            <p className='text-muted-foreground text-xs break-all'>
              {t('Observed at')}: {detail.observed_at}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
