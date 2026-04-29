// SnapshotEditor flow-assignment dialog (T2473 part 5).
// Pure presentational sub-component. Lets the operator pick a
// cluster node to host a flow's chain. The parent owns:
//   - the flow being edited (selectedFlowForAssignment)
//   - the cluster node list + the chain analysis (so the
//     parent's React Query cache stays canonical)
//   - the assign/cancel handlers and the redundancy toggle
// This component owns no state — everything is prop-driven.

import { Button, Checkbox, InlineLoading, Modal, Tag } from '@carbon/react'
import type { FlowSlot } from './snapshotEditorPageTypes'

// Minimal cluster-node shape this component depends on. Avoids
// leaking the full cluster type through the prop boundary.
export interface AssignmentDialogNode {
  node_id: string
  hostname: string
  has_gpu?: boolean
  cpu_percent?: number
  memory_used_gb?: number
  memory_total_gb?: number
}

export interface AssignmentDialogAnalysis {
  estimated_cpu_percent?: number
  estimated_memory_mb?: number
  requires_gpu?: boolean
  gpu_recommended?: boolean
}

export interface SnapshotEditorAssignmentDialogProps {
  open: boolean
  selectedFlow: FlowSlot | null
  selectedNodeId: string | null
  redundancyEnabled: boolean
  isAssigning: boolean
  isAnalysisLoading: boolean
  assignmentNodes: AssignmentDialogNode[]
  recommendedNodes: AssignmentDialogNode[]
  analysis: AssignmentDialogAnalysis | undefined
  isSuitableNode: (node: AssignmentDialogNode) => boolean
  onClose: () => void
  onSubmit: () => void
  onSelectNode: (nodeId: string) => void
  onRedundancyChange: (enabled: boolean) => void
}

export function SnapshotEditorAssignmentDialog({
  open,
  selectedFlow,
  selectedNodeId,
  redundancyEnabled,
  isAssigning,
  isAnalysisLoading,
  assignmentNodes,
  recommendedNodes,
  analysis,
  isSuitableNode,
  onClose,
  onSubmit,
  onSelectNode,
  onRedundancyChange,
}: SnapshotEditorAssignmentDialogProps) {
  if (!open || !selectedFlow) return null
  return (
    <Modal
      open
      size="lg"
      modalHeading={`Assign ${selectedFlow.id}`}
      modalLabel={
        selectedFlow.chainId ? `Path ${selectedFlow.chainId}` : 'No path assigned'
      }
      primaryButtonText={isAssigning ? 'Assigning...' : 'Assign path'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={
        !selectedFlow.chainId || !selectedNodeId || isAssigning
      }
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={onSubmit}
    >
      <div className="juce-grid-page__form-modal-body">
        <p className="juce-grid-page__modal-copy">
          Select a target node for the active path. Recommendations favor headroom
          and GPU compatibility when the underlying runtime chain analysis requires
          it.
        </p>

        {!selectedFlow.chainId && (
          <p className="juce-grid-page__modal-copy">
            Assign a path to this slot before deploying it to a cluster node.
          </p>
        )}

        {isAnalysisLoading && (
          <InlineLoading description="Analyzing path requirements" status="active" />
        )}

        {recommendedNodes.length > 0 && (
          <div className="juce-grid-page__assignment-recommended">
            <p className="juce-grid-page__assignment-section-kicker">Recommended</p>
            <div className="juce-grid-page__compact-actions">
              {recommendedNodes.slice(0, 3).map((node) => (
                <Button
                  key={`recommended-${node.node_id}`}
                  size="sm"
                  kind={selectedNodeId === node.node_id ? 'secondary' : 'ghost'}
                  onClick={() => onSelectNode(node.node_id)}
                >
                  {node.hostname}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="juce-grid-page__assignment-grid">
          {assignmentNodes.map((node) => {
            const isSelected = selectedNodeId === node.node_id
            const suitable = isSuitableNode(node)
            return (
              <button
                key={node.node_id}
                type="button"
                className={`juce-grid-page__assignment-card ${
                  isSelected ? 'is-selected' : ''
                }`}
                onClick={() => suitable && onSelectNode(node.node_id)}
                disabled={!suitable}
                aria-pressed={isSelected}
              >
                <div className="juce-grid-page__assignment-card-header">
                  <h3 className="juce-grid-page__assignment-card-heading">
                    {node.hostname}
                  </h3>
                  <div className="juce-grid-page__compact-tags">
                    {node.has_gpu && <Tag type="blue">GPU</Tag>}
                    {!suitable && <Tag type="red">Capacity limit</Tag>}
                  </div>
                </div>
                <div className="juce-grid-page__assignment-card-meta">
                  <span>CPU {node.cpu_percent ?? 0}%</span>
                  <span>
                    RAM {(node.memory_used_gb ?? 0).toFixed(1)}/
                    {(node.memory_total_gb ?? 0).toFixed(1)} GB
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {analysis && (
          <div className="juce-grid-page__assignment-requirements">
            <p className="juce-grid-page__assignment-section-kicker">
              Chain requirements
            </p>
            <div className="juce-grid-page__compact-tags">
              <Tag type="cool-gray">CPU {analysis.estimated_cpu_percent ?? 0}%</Tag>
              <Tag type="cool-gray">
                Memory {analysis.estimated_memory_mb ?? 0} MB
              </Tag>
              {analysis.requires_gpu && <Tag type="purple">GPU required</Tag>}
            </div>
          </div>
        )}

        <Checkbox
          id="juce-grid-assignment-redundancy"
          labelText="Enable redundancy (standby nodes)"
          checked={redundancyEnabled}
          onChange={(_, data) => onRedundancyChange(Boolean(data.checked))}
        />
      </div>
    </Modal>
  )
}
