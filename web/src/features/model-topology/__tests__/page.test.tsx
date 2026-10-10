import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react'
import i18n from 'i18next'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { MODELS_SECTION_IDS } from '@/features/models/section-registry'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ModelTopology } from '..'
import type { TopologySearch } from '../types'
import { detail, summary } from './fixtures'

afterEach(async () => {
  await i18n.changeLanguage('en')
  cleanup()
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})
function Page() {
  const [search, setSearch] = useState<TopologySearch>({ tGroup: 'g' })
  return (
    <ModelTopology
      search={search}
      onSearchChange={(next) => setSearch((prev) => ({ ...prev, ...next }))}
    />
  )
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  )
}
it('adds the topology section, defaults to a tree and preserves selection across table and network modes', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.endsWith('groups')) {
      return {
        data: {
          success: true,
          data: [
            {
              name: 'g',
              sources: ['config'],
              configured_models: 2,
              configured_channels: 1,
              special: false,
              diagnostics: [],
            },
          ],
        },
      }
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
            basis: 'config',
            runtime_mode: 'database',
            observed_at: '2026-10-10',
          },
        },
      }
    }
    return { data: { success: true, data: detail('A', 'X') } }
  })
  mount()
  expect(MODELS_SECTION_IDS).toEqual([
    'metadata',
    'vendors',
    'deployments',
    'topology',
  ])
  await waitFor(() =>
    expect(
      screen.getByRole('tab', { name: 'Model chain tree' })
    ).toHaveAttribute('aria-selected', 'true')
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Table' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
  )
  fireEvent.click(screen.getByRole('button', { name: 'A' }))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Shared channel network' }))
  expect(
    screen.getByRole('tab', { name: 'Shared channel network' })
  ).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: 'Table' }))
  expect(screen.getByRole('table')).toBeInTheDocument()
})
it('does not request or show topology for an admin denied channel read', () => {
  useAuthStore.getState().auth.setUser({
    id: 2,
    username: 'denied',
    role: 10,
    permissions: { admin_permissions: { channel: { read: false } } },
  })
  const get = vi.spyOn(api, 'get')
  mount()
  expect(
    screen.getByText('Channel read permission is required')
  ).toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
})

it('updates topology controls and formatted counts when switching Chinese locales', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  i18n.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
  i18n.addResourceBundle('zhTW', 'translation', zhTW.translation, true, true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: url.endsWith('groups')
        ? []
        : { items: [], total: 1234, group_total: 1234, page: 1, page_size: 50 },
    },
  }))
  mount()
  await waitFor(() =>
    expect(screen.getByText(/1,234 group models/)).toBeInTheDocument()
  )
  await act(() => i18n.changeLanguage('zhCN'))
  expect(screen.getByRole('tab', { name: '模型链路树' })).toBeInTheDocument()
  expect(screen.getByText(/分组共 1,234 个模型/)).toBeInTheDocument()
  await act(() => i18n.changeLanguage('zhTW'))
  expect(screen.getByRole('tab', { name: '模型鏈路樹' })).toBeInTheDocument()
  expect(screen.getByText(/分組共 1,234 個模型/)).toBeInTheDocument()
})

it('shows descriptive filter values instead of API enum identifiers', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: url.endsWith('groups')
        ? []
        : { items: [], total: 0, group_total: 0, page: 1, page_size: 50 },
    },
  }))
  mount()
  expect(
    screen.getByRole('combobox', { name: 'Channel availability' })
  ).toHaveTextContent('All configurations')
  expect(
    screen.getByRole('combobox', { name: 'Mapping filter' })
  ).toHaveTextContent('Any mapping configuration')
})
