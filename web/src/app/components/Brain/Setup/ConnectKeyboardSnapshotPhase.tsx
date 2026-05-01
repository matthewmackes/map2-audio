import { Tile } from '@carbon/react'

interface ConnectKeyboardSnapshotPhaseProps {
  selectedPortName: string | null
}

export function ConnectKeyboardSnapshotPhase({ selectedPortName }: ConnectKeyboardSnapshotPhaseProps) {
  return (
    <Tile className="connect-keyboard-task__phase-body">
      <p className="connect-keyboard-task__phase-paragraph">
        Snapshot create + activate lands in T2480-4. This phase will:
      </p>
      <ol className="connect-keyboard-task__phase-list">
        <li>Scan the Brain library for an available SoundFont/SFZ/sample.</li>
        <li>Build a snapshot named after the device ({selectedPortName ?? '—'}) with NAM + reverb + EQ + limiter chain.</li>
        <li>Auto-activate it so the keyboard is immediately playable.</li>
      </ol>
    </Tile>
  )
}
