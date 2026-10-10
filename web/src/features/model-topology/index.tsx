import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/admin-permissions'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { TopologyDetails } from './components/topology-details'
import { TopologyGraphDialog } from './components/topology-graph-dialog'
import { TopologyTable } from './components/topology-table'
import { TopologyToolbar } from './components/topology-toolbar'
import {
  useTopologyView,
  type TopologyViewInput,
} from './hooks/use-topology-view'

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
  const { t } = useTranslation()
  const view = useTopologyView(props)
  let content = <TopologyTable view={view} />
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
        <p className='text-muted-foreground text-xs'>
          {t(
            'Static configuration links · Disabled channels remain visible · No hit probability'
          )}
        </p>
      </div>
      <TopologyDetails
        selection={view.selection}
        view={view}
        onClose={() => {
          view.setSelection(null)
          view.onSearchChange({ tMode: 'table', tModel: undefined })
        }}
        onViewModelGraph={() => view.onSearchChange({ tMode: 'tree' })}
      >
        {view.selection?.model && (
          <TopologyGraphDialog
            key={JSON.stringify([view.group, view.selection.model])}
            view={view}
            model={view.selection.model}
            open={view.mode === 'tree'}
            onClose={() => view.onSearchChange({ tMode: 'table' })}
          />
        )}
      </TopologyDetails>
      <TopologyGraphDialog
        key={view.group}
        view={view}
        open={view.mode === 'network'}
        onClose={() => view.onSearchChange({ tMode: 'table' })}
      />
    </div>
  )
}
