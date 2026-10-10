import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { TopologyViewState } from '../hooks/use-topology-view'
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
            id: 'details',
            header: t('Details'),
            cell: (m) => (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  props.view.setSelection({ kind: 'model', model: m.name })
                }
              >
                {t('View details')}
              </Button>
            ),
          },
        ]}
      />
    </div>
  )
}
