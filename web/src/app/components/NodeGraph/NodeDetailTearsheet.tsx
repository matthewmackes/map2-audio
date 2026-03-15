import './NodeGraph.css'

import { Close } from '@carbon/icons-react'
import { Button, InlineNotification, Layer, Tag, TextInput } from '@carbon/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { patchNodeLabel } from '../../../map2/api'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeSummary } from '../../types/node'
import { formatNodeDisplayName, getNodeRoleLabel, getNodeStatusTagType } from '../../utils/nodeDisplay'

interface NodeDetailTearsheetProps {
  node: NodeSummary | null
  open: boolean
  pageKey: string
  onClose: () => void
}

export function NodeDetailTearsheet({ node, open, pageKey, onClose }: NodeDetailTearsheetProps) {
  const queryClient = useQueryClient()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const [labelValue, setLabelValue] = useState('')

  useEffect(() => {
    setLabelValue(node?.display_label ?? '')
  }, [node?.display_label, node?.node_id])

  const labelMutation = useMutation({
    mutationFn: async (nextLabel: string) => {
      if (!node) {
        throw new Error('No node selected')
      }
      return patchNodeLabel(nextLabel, node.is_local ? null : node.node_id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['nodeTopology'] })
      await queryClient.invalidateQueries({ queryKey: ['nodeIdentity'] })
    },
  })

  if (!open || !node) {
    return null
  }

  return (
    <div className="node-tearsheet" role="dialog" aria-modal="true" aria-label={`Details for ${node.hostname}`}>
      <div className="node-tearsheet__scrim" onClick={onClose} aria-hidden="true" />
      <Layer className="node-tearsheet__panel">
        <div className="node-tearsheet__header">
          <div>
            <h2 className="node-tearsheet__title">{formatNodeDisplayName(node)}</h2>
            <div className="node-tearsheet__header-tags">
              <Tag type="cool-gray">{getNodeRoleLabel(node.role)}</Tag>
              <Tag type="gray">{new Date(node.last_seen).toLocaleString()}</Tag>
            </div>
          </div>
          <button type="button" className="node-tearsheet__close" onClick={onClose} aria-label="Close node details">
            <Close size={20} />
          </button>
        </div>

        <section className="node-tearsheet__section">
          <div className="node-tearsheet__metrics">
            <Tag type={getNodeStatusTagType(node.status)}>{node.status.toUpperCase()}</Tag>
            <span>CPU {node.cpu_percent.toFixed(1)}%</span>
            <span>Memory {node.memory_percent.toFixed(1)}%</span>
          </div>
        </section>

        <section className="node-tearsheet__section">
          <h3>Services</h3>
          <div className="node-tearsheet__tag-grid">
            <Tag type={node.services.backend ? 'green' : 'red'}>Backend</Tag>
            <Tag type={node.services.juce_engine ? 'green' : 'red'}>JUCE Engine</Tag>
            <Tag type={node.services.pipewire ? 'green' : 'red'}>PipeWire</Tag>
          </div>
        </section>

        <section className="node-tearsheet__section">
          <h3>Audio</h3>
          <div className="node-tearsheet__kv-list">
            <div>
              <span>Latency</span>
              <strong>{node.audio_latency_ms.toFixed(2)} ms</strong>
            </div>
            <div className={node.xrun_count > 0 ? 'node-tearsheet__kv--warn' : ''}>
              <span>XRuns</span>
              <strong>{node.xrun_count}</strong>
            </div>
          </div>
        </section>

        <section className="node-tearsheet__section">
          <div className="node-tearsheet__actions">
            <Button
              kind="primary"
              size="sm"
              onClick={() => {
                setViewedNode(pageKey, node.node_id)
                onClose()
              }}
            >
              Set as This Page&apos;s Node
            </Button>
            <Button kind="ghost" size="sm" onClick={onClose}>
              View on Graph
            </Button>
          </div>
        </section>

        <section className="node-tearsheet__section">
          <h3>Edit label</h3>
          <TextInput
            id={`node-label-${node.node_id}`}
            labelText="Display label"
            value={labelValue}
            onChange={(event) => setLabelValue(event.currentTarget.value)}
            onBlur={() => {
              if (labelValue === (node.display_label ?? '')) {
                return
              }
              labelMutation.mutate(labelValue)
            }}
          />
          {labelMutation.isError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Label update failed"
              subtitle={labelMutation.error instanceof Error ? labelMutation.error.message : 'Unable to update node label.'}
            />
          ) : null}
        </section>
      </Layer>
    </div>
  )
}

