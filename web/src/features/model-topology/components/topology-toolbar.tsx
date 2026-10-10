import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupSelector } from '@/components/model-group-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks/use-debounce'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { TopologyViewState } from '../hooks/use-topology-view'
import type { TopologySearch } from '../types'

function TopologySearchInput(props: {
  value: string
  label: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(props.value)
  const debounced = useDebounce(value, 300)
  const dirty = useRef(false)
  const onChange = useEffectEvent(props.onChange)
  useEffect(() => {
    setValue(props.value)
    dirty.current = false
  }, [props.value])
  useEffect(() => {
    if (dirty.current && debounced === value) {
      dirty.current = false
      onChange(debounced)
    }
  }, [debounced, value])
  return (
    <Input
      value={value}
      aria-label={props.label}
      placeholder={props.label}
      onChange={(event) => {
        dirty.current = true
        setValue(event.target.value)
      }}
      className='w-full sm:w-52'
    />
  )
}
export function TopologyToolbar(props: { view: TopologyViewState }) {
  const { t, i18n } = useTranslation()
  const view = props.view
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  let mappingLabel = t('Any mapping configuration')
  if (view.search.tMapping === true) {
    mappingLabel = t('Has mapping configuration')
  }
  if (view.search.tMapping === false) {
    mappingLabel = t('No mapping configuration')
  }
  let diagnosticsLabel = t('Any diagnostics')
  if (view.search.tDiagnostics === true) {
    diagnosticsLabel = t('Has configuration diagnostics')
  }
  if (view.search.tDiagnostics === false) {
    diagnosticsLabel = t('No configuration diagnostics')
  }
  function filter(next: Partial<TopologySearch>) {
    view.onSearchChange({ ...next, tModel: undefined })
  }
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <GroupSelector
          selectedGroup={view.group}
          groups={view.groups.map((g) => ({
            value: g.name,
            label: g.name,
            description: g.special
              ? t('Request-time group strategy')
              : undefined,
          }))}
          onGroupChange={(tGroup) =>
            view.onSearchChange({
              tGroup,
              tModel: undefined,
              tSearch: undefined,
              tChannel: undefined,
              tChannelId: undefined,
            })
          }
        />
        <TopologySearchInput
          key={`model-${view.group}`}
          value={view.search.tSearch ?? ''}
          label={t('Search all group models')}
          onChange={(tSearch) => filter({ tSearch })}
        />
        <TopologySearchInput
          key={`channel-${view.group}`}
          value={view.search.tChannel ?? ''}
          label={t('Search channels')}
          onChange={(tChannel) => filter({ tChannel, tChannelId: undefined })}
        />
        <Select
          value={view.search.tStatus ?? 'all'}
          onValueChange={(value) =>
            filter({ tStatus: (value ?? 'all') as TopologySearch['tStatus'] })
          }
        >
          <SelectTrigger aria-label={t('Channel availability')}>
            <SelectValue>
              {
                {
                  all: t('All configurations'),
                  enabled: t('Has enabled channels'),
                  disabled: t('Disabled channels only'),
                  inconsistent: t('Inconsistent configuration'),
                }[view.search.tStatus ?? 'all']
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All configurations')}</SelectItem>
            <SelectItem value='enabled'>{t('Has enabled channels')}</SelectItem>
            <SelectItem value='disabled'>
              {t('Disabled channels only')}
            </SelectItem>
            <SelectItem value='inconsistent'>
              {t('Inconsistent configuration')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            view.search.tMapping === undefined
              ? 'all'
              : String(view.search.tMapping)
          }
          onValueChange={(value) =>
            filter({ tMapping: value === 'all' ? undefined : value === 'true' })
          }
        >
          <SelectTrigger aria-label={t('Mapping filter')}>
            <SelectValue>{mappingLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('Any mapping configuration')}
            </SelectItem>
            <SelectItem value='true'>
              {t('Has mapping configuration')}
            </SelectItem>
            <SelectItem value='false'>
              {t('No mapping configuration')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            view.search.tDiagnostics === undefined
              ? 'all'
              : String(view.search.tDiagnostics)
          }
          onValueChange={(value) =>
            filter({
              tDiagnostics: value === 'all' ? undefined : value === 'true',
            })
          }
        >
          <SelectTrigger aria-label={t('Diagnostics filter')}>
            <SelectValue>{diagnosticsLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('Any diagnostics')}</SelectItem>
            <SelectItem value='true'>
              {t('Has configuration diagnostics')}
            </SelectItem>
            <SelectItem value='false'>
              {t('No configuration diagnostics')}
            </SelectItem>
          </SelectContent>
        </Select>
        {view.search.tChannelId && (
          <Button
            variant='outline'
            onClick={() => filter({ tChannelId: undefined })}
          >
            {t('Clear channel filter')} #
            {formatNumber(view.search.tChannelId, locale)}
          </Button>
        )}
        <Button
          variant='outline'
          onClick={view.refresh}
          disabled={view.refreshing}
        >
          {view.refreshing ? t('Refreshing...') : t('Refresh')}
        </Button>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Tabs
          value={view.mode}
          onValueChange={(value) =>
            view.onSearchChange({ tMode: value as TopologySearch['tMode'] })
          }
        >
          <TabsList>
            <TabsTrigger value='tree'>{t('Model chain tree')}</TabsTrigger>
            <TabsTrigger value='network'>
              {t('Shared channel network')}
            </TabsTrigger>
            <TabsTrigger value='table'>{t('Table')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <p role='status' className='text-muted-foreground text-xs'>
          {t(
            '{{loaded}} loaded / {{matched}} matched / {{total}} group models',
            {
              loaded: formatNumber(view.models.length, locale),
              matched: formatNumber(view.total, locale),
              total: formatNumber(view.groupTotal, locale),
            }
          )}
        </p>
      </div>
    </div>
  )
}
