import type { Viewport } from '@xyflow/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { TopologyViewState } from '../hooks/use-topology-view'
import { buildTopologyGraph } from '../lib/graph'
import { layoutTopologyGraph } from '../lib/layout'
import { TopologyCanvas } from './topology-canvas'

export function TopologyGraphDialog(props: {
  view: TopologyViewState
  model?: string
  open: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [fullScreen, setFullScreen] = useState(false)
  const [budget, setBudget] = useState(300)
  const viewports = useRef(new Map<string, Viewport>())
  const { view, model } = props
  const models = useMemo(
    () => (model ? view.models.filter((m) => m.name === model) : view.models),
    [model, view.models]
  )
  const graph = useMemo(
    () =>
      props.open
        ? layoutTopologyGraph(
            buildTopologyGraph({
              group: view.group,
              models,
              detailsByModel: view.details,
              expandedModels: model ? new Set([model]) : view.expandedModels,
              mode: model ? 'tree' : 'network',
              visibleBudget: budget,
            }),
            model ? 'tree' : 'network'
          )
        : {
            nodes: [],
            edges: [],
            omittedCounts: { nodes: 0, models: 0, channels: 0 },
          },
    [
      props.open,
      view.group,
      models,
      view.details,
      view.expandedModels,
      model,
      budget,
    ]
  )
  const graphView = {
    ...view,
    models,
    mode: model ? ('tree' as const) : ('network' as const),
    expandedModels: model ? new Set([model]) : view.expandedModels,
    setSelection: (selection: Parameters<typeof view.setSelection>[0]) => {
      if (model) {
        view.setSelection(
          selection?.model === model ? selection : { kind: 'model', model }
        )
      } else if (selection) {
        props.onClose()
        view.setSelection(selection)
      }
    },
  }
  let content = props.open && (
    <div className='min-h-0 flex-1'>
      <TopologyCanvas
        key={JSON.stringify([view.group, model])}
        graph={graph}
        view={graphView}
        inDialog
        singleModel={!!model}
        viewports={viewports.current}
      />
    </div>
  )
  if (model && view.detailLoading.has(model)) content = <LoadingState />
  else if (model && view.detailErrors.has(model)) {
    content = <ErrorState onRetry={() => view.retryDetail(model)} />
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          setFullScreen(false)
          props.onClose()
        }
      }}
      title={
        model
          ? `${model} · ${t('Model chain')}`
          : t('Group relationship overview')
      }
      description={`${view.group} · ${t('Configuration topology')} · ${t('Channel mapping only')}`}
      contentHeight={fullScreen ? 'calc(100dvh - 10rem)' : '70dvh'}
      contentClassName={
        fullScreen
          ? 'w-screen max-w-none rounded-none sm:max-w-none'
          : 'w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)]'
      }
      bodyClassName='flex h-full flex-col gap-3'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Static configuration links · Disabled channels remain visible · No hit probability'
          )}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setFullScreen(!fullScreen)}
        >
          {fullScreen ? t('Exit full screen') : t('Full screen')}
        </Button>
      </div>
      {content}
      {graph.omittedCounts.nodes > 0 && (
        <div role='status' className='flex items-center gap-2 text-sm'>
          {t('{{visible}} nodes shown · {{omitted}} nodes pending', {
            visible: formatNumber(graph.nodes.length, locale),
            omitted: formatNumber(graph.omittedCounts.nodes, locale),
          })}
          <Button variant='outline' onClick={() => setBudget(budget + 300)}>
            {t('Show 300 more nodes')}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
