import { ClickableTile, Tile } from '@carbon/react'
import { Keyboard, ConnectionSignal, Calibrate, Network_4 } from '@carbon/icons-react'
import { useState } from 'react'

import { StatusChip } from '../../components/primitives'
import { ConnectKeyboardTask } from '../../components/Brain/Setup/ConnectKeyboardTask'
import './setupView.css'

type SetupTaskId = 'connect-keyboard' | 'map-controller' | 'calibrate-mk1' | 'discover-avdecc'

interface SetupTaskMeta {
  id: SetupTaskId
  title: string
  description: string
  Icon: typeof Keyboard
  status: 'available' | 'coming-soon'
  roadmapTag?: string
}

const SETUP_TASKS: readonly SetupTaskMeta[] = [
  {
    id: 'connect-keyboard',
    title: 'Connect a new keyboard',
    description:
      'Detect a MIDI keyboard, verify it is sending events, and create a Brain snapshot bound to it. The keyboard becomes live at the end.',
    Icon: Keyboard,
    status: 'available',
  },
  {
    id: 'map-controller',
    title: 'Map a MIDI controller',
    description:
      'Bind faders, encoders, and buttons on a control surface to MAP2 targets via the controller-host mapping engine.',
    Icon: ConnectionSignal,
    status: 'coming-soon',
    roadmapTag: 'T2459',
  },
  {
    id: 'calibrate-mk1',
    title: 'Calibrate Maschine MK1',
    description:
      'Run the headless Maschine MK1 onboarding: pad sensitivity, pressure curves, screen calibration, and profile selection.',
    Icon: Calibrate,
    status: 'coming-soon',
    roadmapTag: 'T700',
  },
  {
    id: 'discover-avdecc',
    title: 'Discover AVDECC devices',
    description:
      'Enumerate AVB-capable devices via la_avdecc, audition stream formats, and bind them into the routing matrix.',
    Icon: Network_4,
    status: 'coming-soon',
    roadmapTag: 'AVDECC',
  },
] as const

export function SetupView() {
  const [activeTaskId, setActiveTaskId] = useState<SetupTaskId | null>(null)

  if (activeTaskId === 'connect-keyboard') {
    return <ConnectKeyboardTask onExit={() => setActiveTaskId(null)} />
  }

  return (
    <div className="brain-setup">
      <div className="brain-setup__header">
        <div className="brain-setup__eyebrow">SETUP TASKS</div>
        <h2 className="brain-setup__title">Operator setup</h2>
        <p className="brain-setup__subtitle">
          Guided paths for first-time hardware onboarding into Brain. Pick a task to begin.
        </p>
      </div>
      <div className="brain-setup__catalog" role="list">
        {SETUP_TASKS.map((task) => {
          const isAvailable = task.status === 'available'
          const Icon = task.Icon
          const tile = (
            <div className="brain-setup__tile-body">
              <div className="brain-setup__tile-icon">
                <Icon size={24} />
              </div>
              <div className="brain-setup__tile-text">
                <div className="brain-setup__tile-title">{task.title}</div>
                <div className="brain-setup__tile-description">{task.description}</div>
                <div className="brain-setup__tile-status">
                  {isAvailable ? (
                    <StatusChip tone="ok" size="sm" label="Available" />
                  ) : (
                    <StatusChip tone="neutral" size="sm" label="Coming soon" />
                  )}
                  {task.roadmapTag ? (
                    <StatusChip tone="info" size="sm" label={task.roadmapTag} />
                  ) : null}
                </div>
              </div>
            </div>
          )

          return (
            <div key={task.id} role="listitem" className="brain-setup__tile-wrap">
              {isAvailable ? (
                <ClickableTile
                  className="brain-setup__tile brain-setup__tile--available"
                  onClick={() => setActiveTaskId(task.id)}
                  aria-label={`Start setup task: ${task.title}`}
                >
                  {tile}
                </ClickableTile>
              ) : (
                <Tile
                  className="brain-setup__tile brain-setup__tile--ghost"
                  aria-disabled="true"
                >
                  {tile}
                </Tile>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
