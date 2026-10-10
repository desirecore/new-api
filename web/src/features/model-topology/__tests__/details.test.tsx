import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { TopologyDetails } from '../components/topology-details'
import type { TopologyViewState } from '../hooks/use-topology-view'
import { detail, summary } from './fixtures'

it('shows only the selected relationship mapping for a shared channel', () => {
  const view = {
    group: 'g',
    models: [summary('A'), summary('B')],
    details: { A: detail('A', 'X'), B: detail('B', 'Y') },
    detailLoading: new Set(),
    detailErrors: new Set(),
    setSelection: vi.fn(),
  } as unknown as TopologyViewState
  render(
    <TopologyDetails
      selection={{ kind: 'relation', model: 'A', channelId: 7 }}
      view={view}
      onClose={vi.fn()}
    />
  )
  expect(screen.getByText('A → X')).toBeInTheDocument()
  expect(screen.queryByText('B → Y')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
})
