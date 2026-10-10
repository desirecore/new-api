import {
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
} from '@xyflow/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Canvas } from '@/components/ai-elements/canvas'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { TopologyViewState } from '../hooks/use-topology-view'
import type { TopologyGraph } from '../types'
import { TopologyNode } from './topology-node'

const nodeTypes = { topology: TopologyNode }
export function TopologyCanvas(props: {
  graph: TopologyGraph
  view: TopologyViewState
}) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasContent {...props} />
    </ReactFlowProvider>
  )
}
function TopologyCanvasContent(props: {
  graph: TopologyGraph
  view: TopologyViewState
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const flow = useReactFlow()
  const [fullScreen, setFullScreen] = useState(false)
  const viewports = useRef(new Map<string, Viewport>())
  const key = JSON.stringify([props.view.group, props.view.mode])
  const viewport = viewports.current.get(key)
  const selected = props.view.selection
  const graph = useMemo(() => {
    const channelModels = new Set(
      props.graph.edges
        .filter((e) => e.data?.channelId === selected?.channelId)
        .map((e) => e.data?.model)
    )
    const activeModels = selected?.model
      ? new Set([selected.model])
      : channelModels
    const highlighted = new Set<string>()
    const edges = props.graph.edges.map((edge) => {
      const active =
        !selected ||
        selected.kind === 'group' ||
        activeModels.has(edge.data?.model) ||
        props.graph.nodes.some(
          (n) =>
            n.id === edge.target &&
            n.data.kind === 'model' &&
            activeModels.has(n.data.model)
        )
      if (active) {
        highlighted.add(edge.source)
        highlighted.add(edge.target)
      }
      let label: string | undefined
      if (props.view.mode === 'network' && edge.data?.channelId) {
        label = t('P {{priority}} · W {{weight}} · {{mapping}}', {
          priority: formatNumber(edge.data.priority, locale),
          weight: formatNumber(edge.data.weight, locale),
          mapping: edge.data.mapping?.names.join(' → '),
        })
      }
      return {
        ...edge,
        label,
        animated: false,
        style: { ...edge.style, strokeWidth: 1, opacity: active ? 1 : 0.18 },
      }
    })
    const nodes = props.graph.nodes.map((node) => ({
      ...node,
      draggable: false,
      connectable: false,
      deletable: false,
      selected:
        !!selected &&
        (node.id === selected.nodeId ||
          (selected.model === node.data.model && node.data.kind === 'model') ||
          (selected.channelId === node.data.channelId &&
            (!selected.model || node.data.model === selected.model))),
      style: {
        opacity:
          !selected || selected.kind === 'group' || highlighted.has(node.id)
            ? 1
            : 0.3,
      },
      data: {
        ...node.data,
        loading: node.data.model
          ? props.view.detailLoading.has(node.data.model)
          : false,
        failed: node.data.model
          ? props.view.detailErrors.has(node.data.model)
          : false,
        onSelect: () =>
          props.view.setSelection({
            kind: node.data.kind,
            model: node.data.model,
            channelId: node.data.channelId,
            nodeId: node.id,
          }),
        onExpand: () => {
          const name = node.data.model
          if (!name) return
          if (props.view.detailErrors.has(name)) {
            props.view.retryDetail(name)
            return
          }
          if (props.view.expandedModels.has(name)) {
            props.view.collapseModel(name)
            requestAnimationFrame(() =>
              document.getElementById(`topology-focus-${node.id}`)?.focus()
            )
          } else props.view.expandModel(name)
        },
      },
    }))
    return { nodes, edges }
  }, [props.graph, props.view, selected, t, locale])
  function locate() {
    const node =
      graph.nodes.find((n) => n.id === selected?.nodeId) ||
      graph.nodes.find(
        (n) => selected?.model === n.data.model && n.data.kind === 'model'
      ) ||
      graph.nodes.find((n) => selected?.channelId === n.data.channelId)
    if (node)
      {void flow.fitView({ nodes: [{ id: node.id }], padding: 0.8, maxZoom: 1 })}
  }
  return (
    <div
      className={cn(
        'bg-background relative h-full min-h-[420px] overflow-hidden rounded-lg border',
        fullScreen && 'fixed inset-0 z-40 h-dvh rounded-none'
      )}
      aria-label={t('Model topology canvas')}
    >
      <div className='absolute top-3 left-3 z-10 flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          onClick={locate}
          disabled={!selected}
        >
          {t('Locate selection')}
        </Button>
        <Button size='sm' variant='outline' onClick={props.view.expandAll}>
          {t('Expand loaded models')}
        </Button>
        <Button size='sm' variant='outline' onClick={props.view.collapseAll}>
          {t('Collapse all')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setFullScreen(!fullScreen)}
        >
          {fullScreen ? t('Exit full screen') : t('Full screen')}
        </Button>
      </div>
      <Canvas
        key={key}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        defaultViewport={viewport}
        fitView={!viewport}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        selectionOnDrag={false}
        controlsProps={{ showInteractive: false }}
        onMoveEnd={(_event, next) => {
          viewports.current.set(key, next)
        }}
        onPaneClick={() => props.view.setSelection(null)}
        onEdgeClick={(_event, edge) => {
          if (edge.data?.channelId)
            {props.view.setSelection({
              kind: 'relation',
              model: edge.data.model as string,
              channelId: edge.data.channelId as number,
            })}
        }}
        ariaLabelConfig={{
          'controls.zoomIn.ariaLabel': t('Zoom in'),
          'controls.zoomOut.ariaLabel': t('Zoom out'),
          'controls.fitView.ariaLabel': t('Fit view'),
          'minimap.ariaLabel': t('Topology minimap'),
        }}
      >
        <MiniMap
          pannable
          zoomable
          nodeColor='var(--muted-foreground)'
          maskColor='var(--background)'
        />
      </Canvas>
    </div>
  )
}
