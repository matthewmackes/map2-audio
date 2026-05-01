import { Button, InlineNotification, Tile } from '@carbon/react'
import { Renew, Edit } from '@carbon/icons-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { StatusChip } from '../../primitives'
import type { JobStage, useConnectKeyboardSnapshotJob } from './useConnectKeyboardSnapshotJob'

interface ConnectKeyboardSnapshotPhaseProps {
  selectedPortName: string | null
  job: ReturnType<typeof useConnectKeyboardSnapshotJob>
  onAdvance: () => void
}

function stageTone(status: JobStage['status']): 'live' | 'staged' | 'committed' | 'critical' | 'neutral' {
  if (status === 'done') return 'committed'
  if (status === 'running') return 'staged'
  if (status === 'failed') return 'critical'
  if (status === 'skipped') return 'neutral'
  return 'neutral'
}

function stageToneLabel(status: JobStage['status']): string {
  if (status === 'done') return 'Done'
  if (status === 'running') return 'Running'
  if (status === 'failed') return 'Failed'
  if (status === 'skipped') return 'Skipped'
  return 'Pending'
}

export function ConnectKeyboardSnapshotPhase({
  selectedPortName,
  job,
  onAdvance,
}: ConnectKeyboardSnapshotPhaseProps) {
  const navigate = useNavigate()

  // Auto-start the job on phase entry per Q12. Only start once per phase
  // mount; Retry replays via job.start().
  useEffect(() => {
    if (
      selectedPortName &&
      !job.isRunning &&
      !job.isComplete &&
      !job.hasError &&
      job.stages.every((s) => s.status === 'pending')
    ) {
      void job.start({ portName: selectedPortName })
    }
  }, [selectedPortName, job])

  // Auto-advance to Done when the job completes successfully.
  useEffect(() => {
    if (job.isComplete && !job.hasError && job.result.snapshotId !== null) {
      onAdvance()
    }
  }, [job.isComplete, job.hasError, job.result.snapshotId, onAdvance])

  return (
    <Tile className="connect-keyboard-task__phase-body">
      <div className="connect-keyboard-task__snapshot-summary">
        <div>
          <div className="connect-keyboard-task__phase-eyebrow">CREATING SNAPSHOT FOR</div>
          <div className="connect-keyboard-task__test-port-name">{selectedPortName ?? '—'}</div>
        </div>
      </div>

      <ol className="connect-keyboard-task__job-stages" aria-label="Snapshot creation progress">
        {job.stages.map((stage) => (
          <li key={stage.id} className="connect-keyboard-task__job-stage">
            <div className="connect-keyboard-task__job-stage-row">
              <span className="connect-keyboard-task__job-stage-label">{stage.label}</span>
              <StatusChip
                tone={stageTone(stage.status)}
                size="sm"
                label={stageToneLabel(stage.status)}
              />
            </div>
            {stage.detail ? (
              <div className="connect-keyboard-task__job-stage-detail">{stage.detail}</div>
            ) : null}
            {stage.error ? (
              <div className="connect-keyboard-task__job-stage-error">{stage.error}</div>
            ) : null}
          </li>
        ))}
      </ol>

      {job.hasError && job.failedStage ? (
        <>
          <InlineNotification
            kind="error"
            title={`Setup failed at: ${job.failedStage.label}`}
            subtitle={job.failedStage.error ?? 'Unknown error'}
            hideCloseButton
            lowContrast
          />
          <div className="connect-keyboard-task__snapshot-recovery">
            <Button
              kind="secondary"
              renderIcon={Renew}
              onClick={() => selectedPortName && void job.start({ portName: selectedPortName })}
              disabled={!selectedPortName || job.isRunning}
            >
              Retry
            </Button>
            {job.result.snapshotId !== null ? (
              <Button
                kind="ghost"
                renderIcon={Edit}
                onClick={() => navigate(`/snapshots/${job.result.snapshotId}`)}
              >
                Open in Snapshot Editor
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Tile>
  )
}
