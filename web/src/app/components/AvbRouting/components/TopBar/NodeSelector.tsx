// Node Selector — tab strip + view-mode toggles. T2475 (E1) Carbon
// migration. Replaces MUI Tabs/Tab/Menu/IconButton with semantic
// role="tablist" + role="tab" buttons; the per-node context menu
// is a hand-rolled role="menu" with click-outside + Escape handling
// (Carbon's OverflowMenu disagrees with the keyboard contract the
// test suite asserts on the inline trigger). All test contracts
// preserved verbatim:
//   - data-testid="node-selector-tab-<id>" with role="tab" + aria-selected
//   - aria-label="Node status online|degraded|offline" inside each tab
//   - data-testid="node-selector-selected-marker-<id>" reflecting state
//   - data-testid="node-selector-menu-trigger-<id>" with role="button",
//     tabindex="0", aria-haspopup="menu", aria-expanded toggling
//   - "All Nodes" tab resolvable via getByRole('tab', { name: /All Nodes/ })
//   - Click/keyboard semantics matching the suite

import React, { useEffect, useRef, useState } from 'react'
import {
  CheckmarkFilled,
  Devices,
  ErrorFilled,
  Network_4,
  OverflowMenuVertical,
  Router,
  WarningFilled,
} from '@carbon/icons-react'
import { Tooltip } from '@carbon/react'

import { StatusChip } from '../../../primitives'
import { useNodes, useLocalNodeId } from '../../hooks/useNodeApi'
import { useRouting } from '../../context/RoutingContext'
import type { AvbNode, NodeStatus } from '../../types'
import { sortNodesForNavigation } from '../../utils/nodeSorting'
import './NodeSelector.css'

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

function handleKeyboardActivation(
  event: React.KeyboardEvent<HTMLElement>,
  action: () => void,
) {
  if (!isActivationKey(event.key)) return
  event.preventDefault()
  action()
}

function getStatusIcon(status: NodeStatus, ptpSynced: boolean) {
  if (status === 'offline') {
    return <ErrorFilled size={16} className="node-selector__status-icon node-selector__status-icon--offline" />
  }
  if (status === 'degraded' || !ptpSynced) {
    return <WarningFilled size={16} className="node-selector__status-icon node-selector__status-icon--warn" />
  }
  return <CheckmarkFilled size={16} className="node-selector__status-icon node-selector__status-icon--ok" />
}

function getDeviceIcon(node: AvbNode) {
  if (node.type === 'map2_local' || node.type === 'map2_remote') return Devices
  if (node.type === 'avdecc') return Router
  return Network_4
}

interface NodeTabProps {
  node: AvbNode
  isLocal: boolean
  highlighted: boolean
  onClick: () => void
}

function NodeTab({ node, isLocal, highlighted, onClick }: NodeTabProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = `node-selector-menu-${node.node_id}`
  const menuTriggerId = `node-selector-menu-trigger-${node.node_id}`

  useEffect(() => {
    if (!menuOpen) return
    const handleDocClick = (event: MouseEvent) => {
      if (
        menuRef.current &&
        triggerRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [menuOpen])

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setMenuOpen((value) => !value)
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    handleKeyboardActivation(event, () => {
      event.stopPropagation()
      setMenuOpen((value) => !value)
    })
  }

  const handleMenuEscape = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setMenuOpen(false)
    }
  }

  const ptpSynced = node.ptp?.state === 'master' || node.ptp?.state === 'slave'
  const totalEndpoints = node.talker_count + node.listener_count
  const DeviceIcon = getDeviceIcon(node)
  const statusLabel =
    node.status === 'offline'
      ? 'offline'
      : node.status === 'degraded' || !ptpSynced
        ? 'degraded'
        : 'online'

  // The Carbon Tooltip eagerly renders its `label` content into the
  // DOM, so the rich node-summary body has been compressed into a
  // single-line `title` attribute on the tab button. This keeps the
  // node name from appearing twice in the tree (which broke
  // getByText queries in the original test suite).
  const tooltipText = [
    `Type: ${node.type.toUpperCase()}`,
    `Address: ${node.address}`,
    `Endpoints: ${node.talker_count} talkers, ${node.listener_count} listeners`,
    `Active Routes: ${node.active_routes}`,
    node.ptp ? `PTP: ${node.ptp.state}${node.ptp.is_master ? ' (Master)' : ''}` : null,
    node.health ? `CPU: ${node.health.cpu_usage.toFixed(1)}%` : null,
    node.health ? `Latency: ${node.health.latency_ms.toFixed(1)}ms` : null,
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <span className="node-selector__tab-wrapper">
      <button title={tooltipText}
          type="button"
          role="tab"
          tabIndex={highlighted ? 0 : -1}
          aria-selected={highlighted ? 'true' : 'false'}
          onClick={onClick}
          onKeyDown={(event) => handleKeyboardActivation(event, onClick)}
          data-testid={`node-selector-tab-${node.node_id}`}
          data-selected={highlighted ? 'true' : 'false'}
          data-node-selected={highlighted ? 'true' : 'false'}
          className={`node-selector__tab ${highlighted ? 'node-selector__tab--active' : ''} ${node.status === 'offline' ? 'node-selector__tab--offline' : ''}`}
          style={highlighted ? { borderBottomColor: node.color } : undefined}
        >
          <span
            data-testid={`node-selector-label-${node.node_id}`}
            data-node-selected={highlighted ? 'true' : 'false'}
            className="node-selector__tab-content"
          >
            <DeviceIcon size={16} />
            <span
              aria-label={`Node status ${statusLabel}`}
              data-node-status={statusLabel}
              className="node-selector__tab-status"
            >
              {getStatusIcon(node.status, ptpSynced)}
            </span>
            <span
              className={`node-selector__tab-name ${highlighted ? 'node-selector__tab-name--active' : ''}`}
            >
              {node.name}
              {isLocal && <span className="node-selector__tab-name-local"> (local)</span>}
            </span>
            <span
              data-testid={`node-selector-selected-marker-${node.node_id}`}
              className="node-selector__hidden"
            >
              {highlighted ? 'selected' : 'unselected'}
            </span>
            <StatusChip
              tone={highlighted ? 'info' : 'neutral'}
              label={String(totalEndpoints)}
              size="sm"
            />
            <span
              ref={triggerRef}
              role="button"
              tabIndex={0}
              onClick={handleMenuClick}
              onKeyDown={handleMenuKeyDown}
              data-testid={menuTriggerId}
              id={menuTriggerId}
              aria-haspopup="menu"
              aria-controls={menuId}
              aria-expanded={menuOpen ? 'true' : 'false'}
              className="node-selector__menu-trigger"
            >
              <OverflowMenuVertical size={14} />
            </span>
          </span>
        </button>

      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={menuTriggerId}
          className="node-selector__menu"
          onKeyDown={handleMenuEscape}
          tabIndex={-1}
        >
          <button type="button" role="menuitem" disabled className="node-selector__menu-item">
            View Details
          </button>
          <button type="button" role="menuitem" disabled className="node-selector__menu-item">
            Pin to Top
          </button>
          <button type="button" role="menuitem" disabled className="node-selector__menu-item">
            Edit Name
          </button>
          <button type="button" role="menuitem" disabled className="node-selector__menu-item">
            Change Color
          </button>
        </div>
      )}
    </span>
  )
}

export function NodeSelector() {
  const { state, dispatch } = useRouting()
  const { data: nodes = [] } = useNodes()
  const localNodeId = useLocalNodeId()

  const currentNodeId = state.network.nodeSelection.current_node_id
  const viewMode = state.network.nodeSelection.view_mode
  const selectedNodeIds = state.network.nodeSelection.selected_node_ids

  const visibleNodes = state.network.nodeSelection.show_offline
    ? nodes
    : nodes.filter((n) => n.status === 'online')
  const sortedVisibleNodes = sortNodesForNavigation(visibleNodes, localNodeId)
  const selectedNodeIsVisible = currentNodeId
    ? sortedVisibleNodes.some((node) => node.node_id === currentNodeId)
    : false

  const handleNodeSelect = (nodeId: string | null) => {
    dispatch({ type: 'SELECT_NODE', payload: nodeId })
  }

  const handleViewModeChange = (mode: 'all_nodes' | 'single_node' | 'multi_select') => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode })
  }

  const handleMultiSelectToggle = () => {
    if (viewMode === 'multi_select') {
      handleViewModeChange('all_nodes')
      return
    }
    handleViewModeChange('multi_select')
    const seedNodeId = currentNodeId || localNodeId || null
    if (seedNodeId && !selectedNodeIds.includes(seedNodeId)) {
      dispatch({ type: 'TOGGLE_NODE_SELECTION', payload: seedNodeId })
    }
  }

  const allNodesActive =
    viewMode === 'all_nodes' || (viewMode === 'single_node' && !selectedNodeIsVisible)

  return (
    <div className="node-selector" role="tablist" aria-label="Node selector">
      <Tooltip label="View all nodes simultaneously" align="bottom">
        <button
          type="button"
          onClick={() => handleViewModeChange('all_nodes')}
          onKeyDown={(event) =>
            handleKeyboardActivation(event, () => handleViewModeChange('all_nodes'))
          }
          data-testid="node-selector-all-nodes-toggle"
          aria-label="View all nodes"
          aria-pressed={viewMode === 'all_nodes'}
          className={`node-selector__icon-button ${viewMode === 'all_nodes' ? 'node-selector__icon-button--active' : ''}`}
        >
          <Network_4 size={16} />
        </button>
      </Tooltip>

      <Tooltip
        label={viewMode === 'multi_select' ? 'Exit multi-select mode' : 'Enter multi-select mode'}
        align="bottom"
      >
        <button
          type="button"
          onClick={handleMultiSelectToggle}
          onKeyDown={(event) => handleKeyboardActivation(event, handleMultiSelectToggle)}
          data-testid="node-selector-multi-select-toggle"
          aria-label="Toggle multi-select mode"
          aria-pressed={viewMode === 'multi_select'}
          className={`node-selector__icon-button ${viewMode === 'multi_select' ? 'node-selector__icon-button--multi' : ''}`}
        >
          <CheckmarkFilled size={16} />
        </button>
      </Tooltip>

      <button
        type="button"
        role="tab"
        aria-selected={allNodesActive ? 'true' : 'false'}
        tabIndex={allNodesActive ? 0 : -1}
        onClick={() => handleViewModeChange('all_nodes')}
        onKeyDown={(event) =>
          handleKeyboardActivation(event, () => handleViewModeChange('all_nodes'))
        }
        className={`node-selector__tab node-selector__tab--all-nodes ${allNodesActive ? 'node-selector__tab--active' : ''}`}
      >
        <span className="node-selector__tab-content">
          <Devices size={16} />
          <span className="node-selector__tab-name">All Nodes</span>
          <StatusChip
            tone={allNodesActive ? 'info' : 'neutral'}
            label={String(visibleNodes.length)}
            size="sm"
          />
        </span>
      </button>

      <div className="node-selector__scroll">
        {sortedVisibleNodes.map((node) => {
          const isNodeSelected =
            viewMode === 'single_node'
              ? currentNodeId === node.node_id
              : viewMode === 'multi_select'
                ? selectedNodeIds.includes(node.node_id)
                : false

          return (
            <NodeTab
              key={node.node_id}
              node={node}
              isLocal={node.node_id === localNodeId}
              highlighted={isNodeSelected}
              onClick={() => {
                if (viewMode === 'multi_select') {
                  dispatch({ type: 'TOGGLE_NODE_SELECTION', payload: node.node_id })
                  return
                }
                handleViewModeChange('single_node')
                handleNodeSelect(node.node_id)
              }}
            />
          )
        })}
      </div>

      <div className="node-selector__network-stats">
        <Router size={16} />
        <span>
          {visibleNodes.filter((n) => n.status === 'online').length} / {nodes.length} online
        </span>
      </div>
    </div>
  )
}

export default NodeSelector
