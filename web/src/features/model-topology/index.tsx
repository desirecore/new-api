import type { Viewport } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { hasPermission } from '@/lib/admin-permissions'
import { formatNumber } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { TopologyCanvas } from './components/topology-canvas'
import { TopologyDetails } from './components/topology-details'
import { TopologyTable } from './components/topology-table'
import { TopologyToolbar } from './components/topology-toolbar'
import {
  useTopologyView,
  type TopologyViewInput,
} from './hooks/use-topology-view'
import { buildTopologyGraph } from './lib/graph'
import { layoutTopologyGraph } from './lib/layout'

export function ModelTopology(props: TopologyViewInput) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  if (
    !user ||
    user.role < ROLE.ADMIN ||
    !hasPermission(user, 'channel', 'read')
  ) {
    return <ErrorState title={t('Channel read permission is required')} />
  }
  return <TopologyPage {...props} />
}
function TopologyPage(props: TopologyViewInput) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const view = useTopologyView(props)
  const key = JSON.stringify([view.group, view.mode])
  const [capacity, setCapacity] = useState({ key, budget: 300 })
  const budget = capacity.key === key ? capacity.budget : 300
  const viewports = useRef(new Map<string, Viewport>())
  const previous = useRef(
    new Map<string, Map<string, { x: number; y: number }>>()
  )
  const graph = useMemo(
    () =>
      layoutTopologyGraph(
        buildTopologyGraph({
          group: view.group,
          models: view.models,
          detailsByModel: view.details,
          expandedModels: view.expandedModels,
          mode: view.mode === 'network' ? 'network' : 'tree',
          visibleBudget: budget,
        }),
        view.mode === 'network' ? 'network' : 'tree',
        previous.current.get(key)
      ),
    [
      view.group,
      view.models,
      view.details,
      view.expandedModels,
      view.mode,
      budget,
      key,
    ]
  )
  useEffect(() => {
    previous.current.set(
      key,
      new Map(graph.nodes.map((n) => [n.id, n.position]))
    )
  }, [graph, key])
  let content = (
    <TopologyCanvas graph={graph} view={view} viewports={viewports.current} />
  )
  if (view.mode === 'table') content = <TopologyTable view={view} />
  if (view.loading) content = <LoadingState />
  else if (view.errors && !view.models.length) {
    content = <ErrorState onRetry={view.refresh} />
  } else if (view.groupInfo?.special) {
    content = (
      <EmptyState
        title={t('Request-time group strategy')}
        description={t(
          'Auto groups depend on the requesting user and token. Select a concrete group to inspect its configured models.'
        )}
      />
    )
  } else if (!view.models.length) {
    content = (
      <EmptyState
        title={t('No configured models')}
        description={t(
          'This group has no matching channel model configuration. Ability-only references remain available in group diagnostics.'
        )}
        action={
          <Button
            variant='outline'
            onClick={() => view.setSelection({ kind: 'group' })}
          >
            {t('Group diagnostics')}
          </Button>
        }
      />
    )
  }
  return (
    <div className='flex h-full min-h-0 flex-col gap-3 overflow-y-auto'>
      <TopologyToolbar view={view} />
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
        <span>
          {t('Configuration topology')} ·{' '}
          {view.runtimeMode === 'memory_cache'
            ? t('Memory cache routing')
            : t('Database routing')}
        </span>
        <span>
          {t('Observed at')}: {view.observedAt ?? '—'}
        </span>
        <span>
          {t(
            'Configuration reads do not refresh routing caches or represent a live multi-instance snapshot.'
          )}
        </span>
        <Button
          variant='link'
          size='xs'
          onClick={() => view.setSelection({ kind: 'group' })}
        >
          {t('Group diagnostics')}
        </Button>
      </div>
      {view.errors && view.models.length > 0 && (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            'Refresh failed. Previously loaded configuration is still displayed.'
          )}{' '}
          <Button variant='link' onClick={view.refresh}>
            {t('Retry')}
          </Button>
        </p>
      )}
      <div className='relative min-h-[240px] flex-1'>{content}</div>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {view.hasMoreModels && (
          <Button
            variant='outline'
            onClick={view.loadMoreModels}
            disabled={view.loadingMore}
          >
            {view.loadingMore ? t('Loading...') : t('Load more models')}
          </Button>
        )}
        {view.mode !== 'table' && graph.omittedCounts.nodes > 0 && (
          <div
            role='status'
            className='flex flex-wrap items-center gap-2 text-sm'
          >
            <span>
              {t('{{visible}} nodes shown · {{omitted}} nodes pending', {
                visible: formatNumber(graph.nodes.length, locale),
                omitted: formatNumber(graph.omittedCounts.nodes, locale),
              })}
            </span>
            <Button
              variant='outline'
              onClick={() => setCapacity({ key, budget: budget + 300 })}
            >
              {t('Show 300 more nodes')}
            </Button>
          </div>
        )}
        <p className='text-muted-foreground text-xs'>
          {t(
            'Static configuration links · Disabled channels remain visible · No hit probability'
          )}
        </p>
      </div>
      <TopologyDetails
        selection={view.selection}
        view={view}
        onClose={() => view.setSelection(null)}
      />
    </div>
  )
}
