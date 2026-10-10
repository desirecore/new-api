import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { TopologyTable } from '../components/topology-table'
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
    if (url.endsWith('models')) {
      return {
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
      }
    }
    const group = config?.params.group as string
    const model = config?.params.model as string
    if (group === 'g') {
      return new Promise((resolve) => {
        resolveA = resolve
      })
    }
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
    if (url.endsWith('models')) {
      return {
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
      }
    }
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

it('paginates the complete group and searches models outside the loaded pages', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url.endsWith('groups')) return { data: { success: true, data: [] } }
    if (url.endsWith('detail')) {
      return { data: { success: true, data: detail('org/model-a', 'vendor') } }
    }
    const params = config?.params
    const items = params.keyword
      ? [summary('org/model-a')]
      : Array.from({ length: 50 }, (_, i) =>
          summary(`m${(params.p - 1) * 50 + i}`)
        )
    return {
      data: {
        success: true,
        data: {
          items,
          total: params.keyword ? 1 : 120,
          group_total: 120,
          page: params.p,
          page_size: 50,
        },
      },
    }
  })
  const { result, rerender } = renderHook(
    (search: TopologySearch) =>
      useTopologyView({ search, onSearchChange: () => {} }),
    { initialProps: { tGroup: 'g' } as TopologySearch, wrapper: wrapper() }
  )
  await waitFor(() => expect(result.current.models).toHaveLength(50))
  act(() => result.current.loadMoreModels())
  await waitFor(() => expect(result.current.models).toHaveLength(100))
  expect(result.current.models[50].name).toBe('m50')
  rerender({ tGroup: 'g', tSearch: 'org/model-a', tModel: 'org/model-a' })
  await waitFor(() =>
    expect(result.current.models.map((m) => m.name)).toEqual(['org/model-a'])
  )
  await waitFor(() =>
    expect(result.current.details['org/model-a']?.model).toBe('org/model-a')
  )
  expect(result.current.total).toBe(1)
  expect(result.current.groupTotal).toBe(120)
  expect(
    get.mock.calls.some(
      ([url, config]) =>
        url.endsWith('models') && config?.params.keyword === 'org/model-a'
    )
  ).toBe(true)
})

it('restores the model from a changed URL instead of retaining an old local selection', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url.endsWith('groups')) {
      return { data: { success: true, data: [] } }
    }
    if (url.endsWith('models')) {
      return {
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
      }
    }
    return { data: { success: true, data: detail(config?.params.model, 'X') } }
  })
  const { result, rerender } = renderHook(
    (search: TopologySearch) =>
      useTopologyView({ search, onSearchChange: () => {} }),
    {
      initialProps: { tGroup: 'g', tModel: 'A' } as TopologySearch,
      wrapper: wrapper(),
    }
  )
  await waitFor(() => expect(result.current.details.A).toBeDefined())
  act(() =>
    result.current.setSelection({ kind: 'relation', model: 'A', channelId: 7 })
  )
  rerender({ tGroup: 'g', tModel: 'B' })
  expect(result.current.selection?.model).toBe('B')
})

it.each(['constructor', 'toString', '__proto__'])(
  'restores the literal model name %s while its detail is pending',
  async (name) => {
    let resolveDetail: (v: unknown) => void = () => {}
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url.endsWith('groups')) return { data: { success: true, data: [] } }
      if (url.endsWith('models')) {
        return {
          data: {
            success: true,
            data: {
              items: [summary(name), summary('B')],
              total: 2,
              group_total: 2,
              page: 1,
              page_size: 50,
            },
          },
        }
      }
      return new Promise((resolve) => {
        resolveDetail = resolve
      })
    })
    const { result } = renderHook(
      () =>
        useTopologyView({
          search: { tGroup: 'g', tModel: name },
          onSearchChange: () => {},
        }),
      { wrapper: wrapper() }
    )
    expect(result.current.models).toEqual([])
    await waitFor(() =>
      expect(result.current.models).toEqual([summary(name), summary('B')])
    )
    expect(result.current.details[name]).toBeUndefined()
    act(() =>
      resolveDetail({ data: { success: true, data: detail(name, 'X') } })
    )
    await waitFor(() => expect(result.current.details[name]?.model).toBe(name))
  }
)

it('loads selected table model details without expanding inline channels', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url.endsWith('groups')) return { data: { success: true, data: [] } }
    if (url.endsWith('models')) {
      return {
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
      }
    }
    return { data: { success: true, data: detail(config?.params.model, 'X') } }
  })
  function Table() {
    const [search, setSearch] = useState({ tGroup: 'g' })
    const view = useTopologyView({
      search,
      onSearchChange: (next) => setSearch((prev) => ({ ...prev, ...next })),
    })
    return <TopologyTable view={view} />
  }
  render(<Table />, { wrapper: wrapper() })
  fireEvent.click(await screen.findByRole('button', { name: 'A' }))
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('detail'),
      expect.objectContaining({
        params: expect.objectContaining({ model: 'A' }),
      })
    )
  )
  expect(
    screen.queryByRole('button', { name: 'Collapse' })
  ).not.toBeInTheDocument()
})
