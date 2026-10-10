import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { TopologyViewState } from '../hooks/use-topology-view'
import { topologyChannels } from '../lib/graph'
import { topologyDiagnosticLabel } from '../lib/labels'

export function TopologyTable(props: { view: TopologyViewState }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return (
    <div className='h-full space-y-3 overflow-auto'>
      <StaticDataTable
        data={props.view.models}
        getRowKey={(m) => m.name}
        columns={[
          {
            id: 'model',
            header: t('Model'),
            cell: (m) => (
              <Button
                variant='link'
                className='h-auto text-left break-all whitespace-normal'
                onClick={() => {
                  props.view.expandModel(m.name)
                  props.view.setSelection({ kind: 'model', model: m.name })
                }}
              >
                {m.name}
              </Button>
            ),
          },
          {
            id: 'channels',
            header: t('Enabled / configured'),
            cell: (m) =>
              `${formatNumber(m.enabled_channels, locale)} / ${formatNumber(m.configured_channels, locale)}`,
          },
          {
            id: 'layers',
            header: t('Priority layers'),
            cell: (m) => formatNumber(m.priority_layers, locale),
          },
          {
            id: 'diagnostics',
            header: t('Diagnostics'),
            cell: (m) =>
              m.diagnostics
                .map((d) => topologyDiagnosticLabel(d.code, t))
                .join(' · '),
          },
          {
            id: 'expand',
            header: t('Model chain'),
            cell: (m) => (
              <Button
                size='sm'
                variant='outline'
                aria-expanded={props.view.expandedModels.has(m.name)}
                onClick={() =>
                  props.view.expandedModels.has(m.name)
                    ? props.view.collapseModel(m.name)
                    : props.view.expandModel(m.name)
                }
              >
                {props.view.expandedModels.has(m.name)
                  ? t('Collapse')
                  : t('Expand')}
              </Button>
            ),
          },
        ]}
      />
      {props.view.models
        .filter((m) => props.view.expandedModels.has(m.name))
        .map((m) => (
          <section className='space-y-2 rounded-lg border p-4' key={m.name}>
            <h3 className='font-medium break-all'>{m.name}</h3>
            {props.view.detailLoading.has(m.name) && (
              <p role='status'>{t('Loading...')}</p>
            )}
            {props.view.detailErrors.has(m.name) && (
              <Button onClick={() => props.view.retryDetail(m.name)}>
                {t('Retry')}
              </Button>
            )}
            {props.view.details[m.name] &&
              topologyChannels(props.view.details[m.name]).map((ch) => (
                <Button
                  variant='outline'
                  className='h-auto w-full justify-start text-left break-all whitespace-normal'
                  key={ch.channel_id}
                  onClick={() =>
                    props.view.setSelection({
                      kind: 'relation',
                      model: m.name,
                      channelId: ch.channel_id,
                    })
                  }
                >
                  #{formatNumber(ch.channel_id, locale)} {ch.channel_name} ·{' '}
                  {ch.channel_status === 1 ? t('Enabled') : t('Disabled')} ·{' '}
                  {t('Priority {{value}}', {
                    value: formatNumber(ch.priority, locale),
                  })}{' '}
                  · {t('Raw weight')}:{' '}
                  {formatNumber(ch.configured_weight, locale)} ·{' '}
                  {ch.mapping.names.join(' → ')}
                </Button>
              ))}
          </section>
        ))}
    </div>
  )
}
