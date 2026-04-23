import { type ReactNode, useState } from 'react'
import { GoLiveButton } from './GoLiveButton'
import { LiveMarqueeBar } from './LiveMarqueeBar'
import { PublishStage } from './PublishStage'
import { PublishStepper } from './PublishStepper'
import {
  usePublishStageMachine,
  type PublishStageId,
  type PublishStageMachineInput,
} from './usePublishStageMachine'
import './publishPerformance.css'

export interface PublishPerformanceShellProps {
  snapshotName: string
  hostId: string | null
  revisionLabel: string | null
  lastPublishAgo: string | null
  machineInput: PublishStageMachineInput
  onGoLive: () => void
  stageBodies: Record<PublishStageId, ReactNode>
  diffDrawer?: ReactNode
}

export function PublishPerformanceShell({
  snapshotName,
  hostId,
  revisionLabel,
  lastPublishAgo,
  machineInput,
  onGoLive,
  stageBodies,
  diffDrawer,
}: PublishPerformanceShellProps) {
  const machine = usePublishStageMachine(machineInput)
  const [expandedStageId, setExpandedStageId] = useState<PublishStageId | null>(null)
  const activeStageId: PublishStageId = expandedStageId ?? machine.activeStageId

  const handleToggle = (stageId: PublishStageId) => {
    setExpandedStageId((prev) => (prev === stageId ? null : stageId))
  }

  return (
    <div className="publish-performance">
      <LiveMarqueeBar
        snapshotName={snapshotName}
        hostId={hostId}
        machine={machine}
        lastPublishAgo={lastPublishAgo}
        revisionLabel={revisionLabel}
      />

      <PublishStepper
        stages={machine.stages}
        activeStageId={activeStageId}
        onSelectStage={(id) => setExpandedStageId(id)}
      />

      <div className="publish-performance__stages">
        {machine.stages.map((stage) => (
          <PublishStage
            key={stage.id}
            stage={stage}
            isActive={stage.id === activeStageId}
            onToggle={() => handleToggle(stage.id)}
          >
            {stageBodies[stage.id]}
          </PublishStage>
        ))}
      </div>

      <div className="publish-performance__golive-row">
        <GoLiveButton
          machine={machine}
          disabled={machineInput.publishDisabled}
          onGoLive={onGoLive}
          snapshotName={snapshotName}
        />
      </div>

      {diffDrawer ? (
        <details className="publish-performance__diff-drawer">
          <summary>Show draft vs requested vs confirmed</summary>
          {diffDrawer}
        </details>
      ) : null}
    </div>
  )
}
