import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { expect, it, vi } from 'vitest'

import { TopologyNode } from '../components/topology-node'
import type { TopologyNodeData } from '../types'

it('expands separately from selection and keeps node names keyboard accessible', () => {
  const expand = vi.fn()
  const select = vi.fn()
  const data: TopologyNodeData = {
    kind: 'model',
    model: 'org/long-model',
    label: 'org/long-model',
    depth: 1,
    onExpand: expand,
    onSelect: select,
    expanded: false,
  }
  render(
    <ReactFlowProvider>
      <TopologyNode
        id='model'
        data={data}
        type='topology'
        selected={false}
        dragging={false}
        draggable={false}
        selectable
        isConnectable={false}
        deletable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
      />
    </ReactFlowProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Expand model' }))
  expect(expand).toHaveBeenCalledOnce()
  expect(select).not.toHaveBeenCalled()
  screen.getByRole('button', { name: 'org/long-model' }).focus()
  expect(screen.getByRole('button', { name: 'org/long-model' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'org/long-model' }))
  expect(select).toHaveBeenCalledOnce()
})
