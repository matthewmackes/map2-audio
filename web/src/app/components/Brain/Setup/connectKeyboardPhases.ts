// Phase definition for the "Connect a new keyboard" setup task.
// Per T2480 locked decisions: 5 phases, Welcome → Detect → Test → Snapshot → Done.
// This is a setup-task surface (Carbon Tile-based phase list), NOT a wizard
// stepper — see docs/CLAUDE.md "Page Design Standards" + the T2480 epic notes
// in docs/PROJECT_WORKLIST.md for the reframe rationale.

export type ConnectKeyboardPhaseId =
  | 'welcome'
  | 'detect'
  | 'test'
  | 'snapshot'
  | 'done'

export interface ConnectKeyboardPhaseMeta {
  id: ConnectKeyboardPhaseId
  ordinal: number
  title: string
  description: string
}

export const CONNECT_KEYBOARD_PHASES: readonly ConnectKeyboardPhaseMeta[] = [
  {
    id: 'welcome',
    ordinal: 1,
    title: 'Welcome',
    description:
      'You are about to set up a new keyboard. The next phases detect the device, verify it is sending MIDI, and create a Brain snapshot bound to it.',
  },
  {
    id: 'detect',
    ordinal: 2,
    title: 'Detect device',
    description:
      'Pick the keyboard from the list of available MIDI inputs. Already-onboarded devices appear at the top.',
  },
  {
    id: 'test',
    ordinal: 3,
    title: 'Verify it is live',
    description:
      'Press a few keys. The visualizer + event log confirm MIDI is flowing.',
  },
  {
    id: 'snapshot',
    ordinal: 4,
    title: 'Create the snapshot',
    description:
      'A Brain snapshot is created with a default sound chain and bound to the keyboard. Activation makes it live.',
  },
  {
    id: 'done',
    ordinal: 5,
    title: 'Done',
    description: 'Your keyboard is live. Pick where to go next.',
  },
] as const

export const PHASE_INDEX: Record<ConnectKeyboardPhaseId, number> =
  Object.fromEntries(
    CONNECT_KEYBOARD_PHASES.map((p, i) => [p.id, i]),
  ) as Record<ConnectKeyboardPhaseId, number>

/** Phases past which Back is disabled (post-activation = point of no return). */
export const POINT_OF_NO_RETURN_PHASE: ConnectKeyboardPhaseId = 'snapshot'

export function isBackDisabled(currentPhaseId: ConnectKeyboardPhaseId): boolean {
  return PHASE_INDEX[currentPhaseId] >= PHASE_INDEX[POINT_OF_NO_RETURN_PHASE]
}

/** Phases past phase 1 trigger the exit-confirm modal on cancel/navigate-away. */
export function shouldConfirmOnExit(currentPhaseId: ConnectKeyboardPhaseId): boolean {
  return PHASE_INDEX[currentPhaseId] > 0
}
