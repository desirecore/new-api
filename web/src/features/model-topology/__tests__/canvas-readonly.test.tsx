import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { TopologyCanvas } from '../components/topology-canvas'
import type { TopologyViewState } from '../hooks/use-topology-view'
import { buildTopologyGraph } from '../lib/graph'
import { layoutTopologyGraph } from '../lib/layout'
import { summary } from './fixtures'

it('keeps nodes after deletion keys and never offers an editing toggle', () => {
  const view = {
    group: 'g',
    mode: 'tree',
    selection: null,
    details: {},
    expandedModels: new Set(),
    detailErrors: new Set(),
    detailLoading: new Set(),
    setSelection: vi.fn(),
    expandAll: vi.fn(),
    collapseAll: vi.fn(),
  } as unknown as TopologyViewState
  const graph = layoutTopologyGraph(
    buildTopologyGraph({
      group: 'g',
      models: [summary('A')],
      detailsByModel: {},
      expandedModels: new Set(),
      visibleBudget: 300,
      mode: 'tree',
    }),
    'tree'
  )
  const { container } = render(<TopologyCanvas graph={graph} view={view} />)
  expect(
    screen.queryByRole('button', { name: /toggle interactivity/i })
  ).not.toBeInTheDocument()
  const before = container.querySelectorAll('.react-flow__node').length
  expect(before).toBe(2)
  fireEvent.keyDown(document.body, { key: 'Delete' })
  fireEvent.keyDown(document.body, { key: 'Backspace' })
  expect(container.querySelectorAll('.react-flow__node')).toHaveLength(before)
  expect(container.querySelector('.react-flow__node.draggable')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
  expect(
    screen.getByRole('button', { name: 'Exit full screen' })
  ).toBeInTheDocument()
})
