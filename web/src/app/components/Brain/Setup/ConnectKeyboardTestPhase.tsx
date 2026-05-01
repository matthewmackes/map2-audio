import { Tile } from '@carbon/react'

import { StatusChip } from '../../primitives'

interface ConnectKeyboardTestPhaseProps {
  selectedPortName: string | null
}

export function ConnectKeyboardTestPhase({ selectedPortName }: ConnectKeyboardTestPhaseProps) {
  return (
    <Tile className="connect-keyboard-task__phase-body">
      <div className="connect-keyboard-task__test-header">
        <div>
          <div className="connect-keyboard-task__phase-eyebrow">SELECTED DEVICE</div>
          <div className="connect-keyboard-task__test-port-name">
            {selectedPortName ?? '—'}
          </div>
        </div>
        <StatusChip tone="neutral" size="sm" label="Awaiting visualizer (T2480-3)" />
      </div>

      <div
        className="connect-keyboard-task__test-piano-placeholder"
        role="img"
        aria-label="MIDI keyboard visualizer placeholder"
      >
        <div className="connect-keyboard-task__test-piano-placeholder-text">
          Live MIDI visualizer + event log land in T2480-3.
        </div>
      </div>

      <p className="connect-keyboard-task__phase-paragraph">
        Press <strong>Continue</strong> when you are satisfied the keyboard is the right one.
        The next phase creates a Brain snapshot bound to it.
      </p>
    </Tile>
  )
}
