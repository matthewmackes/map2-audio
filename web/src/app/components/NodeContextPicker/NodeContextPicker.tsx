import './NodeContextPicker.css'

import { Dropdown } from '@carbon/react'
import { useMemo } from 'react'

import { useViewedNode, useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeTopology } from '../../types/node'
import { formatNodeDisplayName, getNodeStatusLabel } from '../../utils/nodeDisplay'

interface NodeContextPickerProps {
  pageKey: string
  topology: NodeTopology | undefined
}

type NodePickerItem = {
  id: string
  label: string
  status: string
}

export function NodeContextPicker({ pageKey, topology }: NodeContextPickerProps) {
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const localNode = topology?.nodes.find((node) => node.is_local) ?? topology?.nodes[0] ?? null
  const fallbackLocalId = localNode?.node_id ?? 'local'
  const selectedNodeId = useViewedNode(pageKey, fallbackLocalId)

  const items = useMemo<NodePickerItem[]>(() => {
    return (topology?.nodes ?? []).map((node) => ({
      id: node.node_id,
      label: formatNodeDisplayName(node),
      status: getNodeStatusLabel(node.status),
    }))
  }, [topology?.nodes])

  const selectedItem = items.find((item) => item.id === selectedNodeId) ?? items.find((item) => item.id === fallbackLocalId) ?? null
  const disabled = !topology || items.length <= 1

  return (
    <div className="node-context-picker">
      <Dropdown<NodePickerItem>
        id={`node-context-picker-${pageKey}`}
        type="inline"
        size="sm"
        titleText="Viewing node:"
        label={disabled ? 'Loading nodes' : 'Select a node'}
        items={items}
        disabled={disabled}
        selectedItem={selectedItem}
        itemToString={(item) => item?.label ?? ''}
        itemToElement={(item) => (
          <div className="node-context-picker__item">
            <span className={`node-context-picker__status node-context-picker__status--${item.status.toLowerCase()}`} aria-hidden="true" />
            <span>{item.label}</span>
          </div>
        )}
        onChange={({ selectedItem: nextItem }) => {
          if (!nextItem) {
            return
          }
          setViewedNode(pageKey, nextItem.id)
        }}
      />
    </div>
  )
}

export type { NodeContextPickerProps }

