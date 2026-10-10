import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useTopologyView } from '../hooks/use-topology-view'
import type { TopologySearch } from '../types'
import { detail, summary } from './fixtures'

afterEach(() => vi.restoreAllMocks())
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper(p: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{p.children}</QueryClientProvider>
    )
  }
}
it('isolates a late old-group response and keeps a successful detail after a sibling fails', async () => {
  let resolveA: (v: unknown) => void = () => {}
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url.endsWith('groups')) return { data: { success: true, data: [] } }
    if (url.endsWith('models'))
      {return {
        data: {
          success: true,
          data: {
            items: [summary('A'), summary('B')],
            total: 2,
            group_total: 2,
            page: 1,
            page_size: 50,
          },
        },
      }}
    const group = config?.params.group as string
    const model = config?.params.model as string
    if (group === 'g')
      {return new Promise((resolve) => {
        resolveA = resolve
      })}
    if (model === 'B') throw new Error('unavailable')
    return { data: { success: true, data: detail(model, 'new', group) } }
  })
  const { result, rerender } = renderHook(
    (search: TopologySearch) =>
      useTopologyView({ search, onSearchChange: () => {} }),
    { initialProps: { tGroup: 'g' } as TopologySearch, wrapper: wrapper() }
  )
  await waitFor(() => expect(result.current.models).toHaveLength(2))
  act(() => result.current.expandModel('A'))
  await waitFor(() => expect(result.current.detailLoading.has('A')).toBe(true))
  rerender({ tGroup: 'other' })
  await waitFor(() => expect(result.current.models).toHaveLength(2))
  act(() => result.current.expandAll())
  await waitFor(() => expect(result.current.details.A?.group).toBe('other'))
  await waitFor(() => expect(result.current.detailErrors.has('B')).toBe(true))
  act(() => resolveA({ data: { success: true, data: detail('A', 'old') } }))
  expect(result.current.details.A?.tiers[0].channels[0].mapping.names).toEqual([
    'A',
    'new',
  ])
})
it('limits expansion requests to four and cancels the remaining queue on collapse', async () => {
  const pending: ((value: unknown) => void)[] = []
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.endsWith('groups')) return { data: { success: true, data: [] } }
    if (url.endsWith('models'))
      {return {
        data: {
          success: true,
          data: {
            items: Array.from({ length: 6 }, (_, i) => summary(String(i))),
            total: 120,
            group_total: 120,
            page: 1,
            page_size: 50,
          },
        },
      }}
    return new Promise((resolve) => pending.push(resolve))
  })
  const { result } = renderHook(
    () =>
      useTopologyView({ search: { tGroup: 'g' }, onSearchChange: () => {} }),
    { wrapper: wrapper() }
  )
  await waitFor(() => expect(result.current.models).toHaveLength(6))
  act(() => result.current.expandAll())
  await waitFor(() => expect(pending).toHaveLength(4))
  act(() => result.current.collapseAll())
  act(() =>
    pending.forEach((resolve) =>
      resolve({ data: { success: true, data: detail('0', 'X') } })
    )
  )
  expect(pending).toHaveLength(4)
  expect(result.current.total).toBe(120)
})
