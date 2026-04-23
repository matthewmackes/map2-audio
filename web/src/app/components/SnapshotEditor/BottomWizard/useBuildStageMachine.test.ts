import { renderHook } from '@testing-library/react'
import { useBuildStageMachine, type BuildStageMachineInput } from './useBuildStageMachine'

const baseInput: BuildStageMachineInput = {
  hasSnapshot: false,
  pluginCount: 0,
  hasSelectedBlock: false,
  hasUnsavedChanges: false,
  hasLiveSnapshot: false,
  automationActive: false,
}

describe('useBuildStageMachine', () => {
  it('emits 5 stages in LAYOUT → WIRE → TUNE → SAVE → PUBLISH order', () => {
    const { result } = renderHook(() => useBuildStageMachine(baseInput))
    expect(result.current.stages.map((s) => s.id)).toEqual([
      'layout', 'wire', 'tune', 'save', 'publish',
    ])
  })

  it('starts with LAYOUT active and later stages locked when no snapshot is loaded', () => {
    const { result } = renderHook(() => useBuildStageMachine(baseInput))
    const byId = Object.fromEntries(result.current.stages.map((s) => [s.id, s]))
    expect(byId.layout.status).toBe('active')
    expect(byId.wire.status).toBe('locked')
    expect(byId.tune.status).toBe('locked')
    expect(byId.save.status).toBe('locked')
    expect(byId.publish.status).toBe('locked')
    expect(result.current.recommendedStageId).toBe('layout')
  })

  it('marks LAYOUT complete and opens WIRE/TUNE/SAVE once blocks are placed', () => {
    const { result } = renderHook(() => useBuildStageMachine({
      ...baseInput,
      hasSnapshot: true,
      pluginCount: 2,
    }))
    const byId = Object.fromEntries(result.current.stages.map((s) => [s.id, s]))
    expect(byId.layout.status).toBe('complete')
    expect(byId.wire.status).toBe('ready')
    expect(byId.tune.status).toBe('ready')
    expect(byId.save.status).toBe('complete')
    expect(byId.publish.status).toBe('ready')
  })

  it('recommends WIRE when a block is selected', () => {
    const { result } = renderHook(() => useBuildStageMachine({
      ...baseInput,
      hasSnapshot: true,
      pluginCount: 2,
      hasSelectedBlock: true,
    }))
    expect(result.current.recommendedStageId).toBe('wire')
    const wire = result.current.stages.find((s) => s.id === 'wire')!
    expect(wire.status).toBe('active')
  })

  it('locks PUBLISH while there are unsaved changes and recommends SAVE', () => {
    const { result } = renderHook(() => useBuildStageMachine({
      ...baseInput,
      hasSnapshot: true,
      pluginCount: 1,
      hasUnsavedChanges: true,
    }))
    const byId = Object.fromEntries(result.current.stages.map((s) => [s.id, s]))
    expect(byId.save.status).toBe('active')
    expect(byId.publish.status).toBe('locked')
    expect(result.current.recommendedStageId).toBe('save')
  })
})
