import { Tile } from '@carbon/react'

interface ConnectKeyboardWelcomePhaseProps {
  totalPhaseCount: number
}

export function ConnectKeyboardWelcomePhase({ totalPhaseCount }: ConnectKeyboardWelcomePhaseProps) {
  return (
    <Tile className="connect-keyboard-task__phase-body">
      <p className="connect-keyboard-task__phase-paragraph">
        This task guides you through connecting a new MIDI keyboard to Brain.
        It runs in {totalPhaseCount} phases:
      </p>
      <ol className="connect-keyboard-task__phase-list">
        <li>Detect the MIDI device on the network or USB.</li>
        <li>Verify it is sending events by playing a few keys.</li>
        <li>Create a Brain snapshot bound to the keyboard with a default sound chain.</li>
        <li>Activate the snapshot so the keyboard becomes live.</li>
      </ol>
      <p className="connect-keyboard-task__phase-paragraph">
        Press <strong>Continue</strong> to begin. You can press <strong>Cancel</strong>
        at any time before activation.
      </p>
    </Tile>
  )
}
