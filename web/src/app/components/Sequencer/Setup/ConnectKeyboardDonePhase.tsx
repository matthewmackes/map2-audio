import { Button, ClickableTile, Tile } from '@carbon/react'
import { CheckmarkFilled, Edit, Music, Renew } from '@carbon/icons-react'
import { useNavigate } from 'react-router-dom'

import { StatusChip } from '../../primitives'
import type { JobResult } from './useConnectKeyboardSnapshotJob'

interface ConnectKeyboardDonePhaseProps {
  selectedPortName: string | null
  result: JobResult
  onSetupAnother: () => void
}

export function ConnectKeyboardDonePhase({
  selectedPortName,
  result,
  onSetupAnother,
}: ConnectKeyboardDonePhaseProps) {
  const navigate = useNavigate()

  return (
    <Tile className="connect-keyboard-task__phase-body">
      <div className="connect-keyboard-task__done-header">
        <CheckmarkFilled size={32} className="connect-keyboard-task__done-check" />
        <div>
          <h3 className="connect-keyboard-task__done-title">
            {result.libraryEmpty
              ? 'Snapshot created — load a sound to hear audio'
              : 'Your keyboard is live'}
          </h3>
          <p className="connect-keyboard-task__done-subtitle">
            {selectedPortName ?? '—'} is bound to snapshot{' '}
            <strong>{result.snapshotName ?? 'unknown'}</strong>.
          </p>
        </div>
      </div>

      <div className="connect-keyboard-task__done-status">
        <StatusChip
          tone={result.activated ? 'live' : 'caution'}
          size="md"
          label={result.activated ? 'Activated' : 'Not activated'}
        />
        {result.asset ? (
          <StatusChip tone="info" size="md" label={`Slot 1: ${result.asset.name}`} />
        ) : (
          <StatusChip tone="caution" size="md" label="Slot 1: empty" />
        )}
      </div>

      {result.libraryEmpty ? (
        <div className="connect-keyboard-task__done-empty-library">
          The Brain library has no SoundFonts, SFZ instruments, samples, or
          drum kits available. The snapshot was created but no sound source
          was wired into slot 1. Add an asset to the Brain library and then
          load it into slot 1 to hear sound when you press a key.
        </div>
      ) : null}

      <div className="connect-keyboard-task__done-cta-row">
        <Button kind="primary" renderIcon={Music} onClick={() => navigate('/sequencer?section=perform')}>
          Open Perform
        </Button>
        <Button kind="secondary" renderIcon={Renew} onClick={onSetupAnother}>
          Set up another keyboard
        </Button>
      </div>

      <div className="connect-keyboard-task__done-eyebrow">WHAT'S NEXT</div>
      <div className="connect-keyboard-task__done-next-tiles">
        {result.snapshotId !== null ? (
          <ClickableTile
            className="connect-keyboard-task__done-next-tile"
            onClick={() => navigate(`/snapshots/${result.snapshotId}`)}
          >
            <div className="connect-keyboard-task__done-next-tile-title">
              Tweak this snapshot in the editor
            </div>
            <div className="connect-keyboard-task__done-next-tile-body">
              Adjust chains, plug-ins, automation, and routing for{' '}
              {result.snapshotName ?? 'this snapshot'}.
            </div>
            <Edit size={16} />
          </ClickableTile>
        ) : null}
        <ClickableTile
          className="connect-keyboard-task__done-next-tile"
          onClick={() => navigate('/midi-hub')}
        >
          <div className="connect-keyboard-task__done-next-tile-title">
            Map controllers in MIDI Hub
          </div>
          <div className="connect-keyboard-task__done-next-tile-body">
            Bind faders, knobs, and footswitches on your control surfaces.
          </div>
          <Edit size={16} />
        </ClickableTile>
        <ClickableTile
          className="connect-keyboard-task__done-next-tile"
          onClick={() => navigate('/sequencer?section=practice_coach')}
        >
          <div className="connect-keyboard-task__done-next-tile-title">
            Try Practice Coach
          </div>
          <div className="connect-keyboard-task__done-next-tile-body">
            Run drills against the keyboard you just connected.
          </div>
          <Edit size={16} />
        </ClickableTile>
      </div>
    </Tile>
  )
}
