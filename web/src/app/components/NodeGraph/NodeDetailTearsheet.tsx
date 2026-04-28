// NodeDetailTearsheet — node inspector surface opened from NodeGraph cards.
//
// T2474 B5: Migrated from a hand-rolled fixed-position tearsheet to the
// canonical DrawerPanel primitive (B4). Status indicators migrated to
// StatusChip; CPU/Memory to HealthMetric; latency to LatencyChip;
// label-update error to AlertPanel. Carbon Tag references kept only where
// the chip vocabulary doesn't cover the slot (role label, last-seen
// timestamp).

import './NodeGraph.css'

import { Tag, TextInput } from '@carbon/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { patchNodeLabel } from '../../../map2/api'
import {
  ActionButton,
  AlertPanel,
  DrawerPanel,
  HealthMetric,
  LatencyChip,
  StatusChip,
} from '../primitives'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeSummary } from '../../types/node'
import {
  formatNodeDisplayName,
  getNodeRoleLabel,
  getNodeStatusChipTone,
} from '../../utils/nodeDisplay'

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

  if (!node) {
    return null
  }

  const tone = getNodeStatusChipTone(node.status)

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      title={formatNodeDisplayName(node)}
      eyebrow="NODE"
      closeLabel="Close node details"
      footer={
        <>
          <ActionButton
            intent="ghost"
            size="sm"
            onClick={onClose}
          >
            View on Graph
          </ActionButton>
          <ActionButton
            intent="primary"
            size="sm"
            onClick={() => {
              setViewedNode(pageKey, node.node_id)
              onClose()
            }}
          >
            Set as This Page&apos;s Node
          </ActionButton>
        </>
      }
    >
      <div className="node-tearsheet__header-tags">
        <StatusChip tone={tone} label={node.status.toUpperCase()} size="sm" dot />
        <Tag type="cool-gray">{getNodeRoleLabel(node.role)}</Tag>
        <Tag type="gray">{new Date(node.last_seen).toLocaleString()}</Tag>
      </div>

      <section className="node-tearsheet__section">
        <h3>Metrics</h3>
        <div className="node-tearsheet__metrics">
          <HealthMetric label="CPU" value={node.cpu_percent} />
          <HealthMetric label="MEM" value={node.memory_percent} />
        </div>
      </section>

      <section className="node-tearsheet__section">
        <h3>Services</h3>
        <div className="node-tearsheet__tag-grid">
          <StatusChip tone={node.services.backend ? 'ok' : 'critical'} label="Backend" size="sm" dot />
          <StatusChip tone={node.services.juce_engine ? 'ok' : 'critical'} label="JUCE Engine" size="sm" dot />
          <StatusChip tone={node.services.pipewire ? 'ok' : 'critical'} label="PipeWire" size="sm" dot />
        </div>
      </section>

      <section className="node-tearsheet__section">
        <h3>Audio</h3>
        <div className="node-tearsheet__tag-grid">
          <LatencyChip latencyMs={node.audio_latency_ms} />
          <StatusChip
            tone={node.xrun_count > 0 ? 'caution' : 'ok'}
            label="XRUNS"
            value={String(node.xrun_count)}
            size="sm"
            dot
          />
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
          <AlertPanel
            severity="blocking"
            title="Label update failed"
            hideCloseButton
            lowContrast
          >
            {labelMutation.error instanceof Error
              ? labelMutation.error.message
              : 'Unable to update node label.'}
          </AlertPanel>
        ) : null}
      </section>
    </DrawerPanel>
  )
}
