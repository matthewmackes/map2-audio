import { Tile } from '@carbon/react'

import { SequencerKeyboardVisualizer, useMidiDeviceEvents } from '../../SequencerKeyboardVisualizer'

interface ConnectKeyboardTestPhaseProps {
  selectedPortName: string | null
}

export function ConnectKeyboardTestPhase({ selectedPortName }: ConnectKeyboardTestPhaseProps) {
  const { activeNotes, log, isConnected, totalReceived, connectAttempts } =
    useMidiDeviceEvents(selectedPortName)

  return (
    <Tile className="connect-keyboard-task__phase-body">
      <SequencerKeyboardVisualizer
        portName={selectedPortName}
        activeNotes={activeNotes}
        log={log}
        isConnected={isConnected}
        totalReceived={totalReceived}
        connectAttempts={connectAttempts}
      />

      <p className="connect-keyboard-task__phase-paragraph">
        Press <strong>Continue</strong> when you are satisfied the keyboard is the right one.
        The next phase creates a Brain snapshot bound to it.
      </p>
    </Tile>
  )
}
