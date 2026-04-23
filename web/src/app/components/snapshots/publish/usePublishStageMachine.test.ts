import { renderHook } from '@testing-library/react'
import { usePublishStageMachine, type PublishStageMachineInput } from './usePublishStageMachine'

const baseInput: PublishStageMachineInput = {
  readiness: null,
  selectedHostId: null,
  saveStepComplete: false,
  hostStepComplete: false,
  soundStepComplete: false,
  isLive: false,
  isActivating: false,
  publishDisabled: true,
  channelsConfirmed: false,
}

describe('usePublishStageMachine', () => {
  it('starts with STAGE active and GO LIVE locked', () => {
    const { result } = renderHook(() => usePublishStageMachine(baseInput))
    expect(result.current.stages.map((s) => s.id)).toEqual(['stage', 'instruments', 'signal', 'line', 'golive'])
    expect(result.current.overallStatus).toBe('rehearsing')
    const golive = result.current.stages.find((s) => s.id === 'golive')!
    expect(golive.status).toBe('locked')
  })

  it('arms GO LIVE when publishDisabled is false and all prior steps complete', () => {
    const input: PublishStageMachineInput = {
      ...baseInput,
      selectedHostId: 'AUDIO-NODE-1',
      saveStepComplete: true,
      hostStepComplete: true,
      soundStepComplete: true,
      channelsConfirmed: true,
      publishDisabled: false,
    }
    const { result } = renderHook(() => usePublishStageMachine(input))
    expect(result.current.overallStatus).toBe('armed')
    expect(result.current.stages.find((s) => s.id === 'golive')!.status).toBe('armed')
  })

  it('reports LIVE when isLive is true', () => {
    const { result } = renderHook(() => usePublishStageMachine({ ...baseInput, isLive: true, saveStepComplete: true, hostStepComplete: true, soundStepComplete: true, channelsConfirmed: true }))
    expect(result.current.overallStatus).toBe('live')
    expect(result.current.stages.find((s) => s.id === 'golive')!.status).toBe('live')
  })

  it('reports PUBLISHING while activation is in flight', () => {
    const input: PublishStageMachineInput = {
      ...baseInput,
      saveStepComplete: true,
      hostStepComplete: true,
      soundStepComplete: true,
      channelsConfirmed: true,
      publishDisabled: true,
      isActivating: true,
    }
    const { result } = renderHook(() => usePublishStageMachine(input))
    expect(result.current.overallStatus).toBe('publishing')
  })
})
