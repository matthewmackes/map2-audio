import { Button, Tile } from '@carbon/react'
import { ArrowLeft } from '@carbon/icons-react'

import './connectKeyboardTask.css'

interface ConnectKeyboardTaskProps {
  onExit: () => void
}

export function ConnectKeyboardTask({ onExit }: ConnectKeyboardTaskProps) {
  return (
    <div className="connect-keyboard-task">
      <div className="connect-keyboard-task__header">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={onExit}
        >
          Setup tasks
        </Button>
        <div className="connect-keyboard-task__title-block">
          <div className="connect-keyboard-task__eyebrow">SETUP TASK</div>
          <h2 className="connect-keyboard-task__title">Connect a new keyboard</h2>
        </div>
      </div>
      <Tile className="connect-keyboard-task__placeholder">
        <div className="connect-keyboard-task__placeholder-title">
          Phase implementation arrives in T2480-2 / -3 / -4
        </div>
        <p className="connect-keyboard-task__placeholder-body">
          The 5-phase task flow (Welcome &middot; Detect &middot; Test &middot; Snapshot &middot; Done)
          will land in subsequent T2480 subtasks. This stub completes T2480-1 by
          establishing the catalog &rarr; task surface seam.
        </p>
      </Tile>
    </div>
  )
}
