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
it('adds the topology section, defaults to the list and opens only the selected model graph above its details', async () => {
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
  fireEvent.click(await screen.findByRole('button', { name: 'A' }))
  await screen.findByRole('button', { name: 'View model chain' })
  expect(
    screen.queryByLabelText('Model topology canvas')
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View model chain' }))
  await waitFor(() =>
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2)
  )
  expect(screen.getByLabelText('Model topology canvas')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Collapse model' })
  ).not.toBeInTheDocument()
  expect(document.querySelectorAll('[data-id*="B"]')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
  expect(
    screen.getByRole('button', { name: 'View model chain' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(screen.getByRole('table')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Group relationship overview' })
  )
  await screen.findByLabelText('Model topology canvas')
  expect(screen.getByRole('dialog')).toHaveAccessibleName(
    'Group relationship overview'
  )
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
  expect(
    screen.getByRole('button', { name: '分组关系总览' })
  ).toBeInTheDocument()
  expect(screen.getByText(/分组共 1,234 个模型/)).toBeInTheDocument()
  await act(() => i18n.changeLanguage('zhTW'))
  expect(
    screen.getByRole('button', { name: '分組關係總覽' })
  ).toBeInTheDocument()
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
