import { Tile } from '@carbon/react'

import { BrainKeyboardVisualizer, useMidiDeviceEvents } from '../../BrainKeyboardVisualizer'

interface ConnectKeyboardTestPhaseProps {
  selectedPortName: string | null
}

export function ConnectKeyboardTestPhase({ selectedPortName }: ConnectKeyboardTestPhaseProps) {
  const { activeNotes, log, isConnected, totalReceived } = useMidiDeviceEvents(selectedPortName)

  return (
    <Tile className="connect-keyboard-task__phase-body">
      <BrainKeyboardVisualizer
        portName={selectedPortName}
        activeNotes={activeNotes}
        log={log}
        isConnected={isConnected}
        totalReceived={totalReceived}
      />

      <p className="connect-keyboard-task__phase-paragraph">
        Press <strong>Continue</strong> when you are satisfied the keyboard is the right one.
        The next phase creates a Brain snapshot bound to it.
      </p>
    </Tile>
  )
}
