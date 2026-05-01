// T2480-2 hardening: pure-function tests for the phase metadata + gating
// helpers used by ConnectKeyboardTask.

import {
  CONNECT_KEYBOARD_PHASES,
  PHASE_INDEX,
  POINT_OF_NO_RETURN_PHASE,
  isBackDisabled,
  shouldConfirmOnExit,
} from './connectKeyboardPhases'

describe('connectKeyboardPhases — phase catalog', () => {
  it('exposes 5 phases in order', () => {
    expect(CONNECT_KEYBOARD_PHASES).toHaveLength(5)
    expect(CONNECT_KEYBOARD_PHASES.map((p) => p.id)).toEqual([
      'welcome',
      'detect',
      'test',
      'snapshot',
      'done',
    ])
  })

  it('assigns sequential ordinals starting at 1', () => {
    CONNECT_KEYBOARD_PHASES.forEach((phase, idx) => {
      expect(phase.ordinal).toBe(idx + 1)
    })
  })

  it('PHASE_INDEX maps id → array index', () => {
    expect(PHASE_INDEX.welcome).toBe(0)
    expect(PHASE_INDEX.detect).toBe(1)
    expect(PHASE_INDEX.test).toBe(2)
    expect(PHASE_INDEX.snapshot).toBe(3)
    expect(PHASE_INDEX.done).toBe(4)
  })

  it('POINT_OF_NO_RETURN_PHASE is "snapshot"', () => {
    expect(POINT_OF_NO_RETURN_PHASE).toBe('snapshot')
  })
})

describe('connectKeyboardPhases — isBackDisabled', () => {
  it('back is enabled across welcome / detect / test', () => {
    expect(isBackDisabled('welcome')).toBe(false)
    expect(isBackDisabled('detect')).toBe(false)
    expect(isBackDisabled('test')).toBe(false)
  })

  it('back is disabled at snapshot (point of no return)', () => {
    expect(isBackDisabled('snapshot')).toBe(true)
  })

  it('back is disabled at done', () => {
    expect(isBackDisabled('done')).toBe(true)
  })
})

describe('connectKeyboardPhases — shouldConfirmOnExit', () => {
  it('does not confirm on exit from welcome (phase 1)', () => {
    expect(shouldConfirmOnExit('welcome')).toBe(false)
  })

  it('confirms on exit from any phase past welcome', () => {
    expect(shouldConfirmOnExit('detect')).toBe(true)
    expect(shouldConfirmOnExit('test')).toBe(true)
    expect(shouldConfirmOnExit('snapshot')).toBe(true)
    expect(shouldConfirmOnExit('done')).toBe(true)
  })
})
