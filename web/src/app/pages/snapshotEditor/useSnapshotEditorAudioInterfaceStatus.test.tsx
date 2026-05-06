/**
 * T2473 cycle 9 — paired test for the slice-13 audio-interface-status hook.
 * Pure derivation; no QueryClient needed.
 */
import { renderHook } from '@testing-library/react'

import type { Chain } from '../../../map2/types'
import { useSnapshotEditorAudioInterfaceStatus } from './useSnapshotEditorAudioInterfaceStatus'

const baseRouting = { mode: 'series' as const }

const baseArgs = {
  portRouting: undefined,
  portsInfo: undefined,
  jackMetrics: undefined,
  audioStatus: undefined,
  audioLevels: undefined,
  routing: baseRouting,
  activeFlowChain: undefined,
}

describe('useSnapshotEditorAudioInterfaceStatus', () => {
  describe('avbReadinessState', () => {
    it('returns "unknown" when portsInfo has no avb_readiness', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus(baseArgs),
      )
      expect(result.current.avbReadinessState).toBe('unknown')
    })

    it('returns "unknown" when avb_readiness.state is empty/whitespace', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          portsInfo: { avb_readiness: { state: '   ' } } as never,
        }),
      )
      expect(result.current.avbReadinessState).toBe('unknown')
    })

    it('returns the trimmed state string when valid', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          portsInfo: { avb_readiness: { state: 'ready' } } as never,
        }),
      )
      expect(result.current.avbReadinessState).toBe('ready')
    })
  })

  describe('audioInterfaceStatus defaults', () => {
    it('falls back to "JACK Audio" / 48000 / 256 / 2 when nothing supplied', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus(baseArgs),
      )
      const s = result.current.audioInterfaceStatus
      expect(s.deviceName).toBe('JACK Audio')
      expect(s.sampleRate).toBe(48000)
      expect(s.bufferSize).toBe(256)
      expect(s.totalPorts).toBe(2)
      expect(s.isRunning).toBe(true) // default from `?? true`
    })

    it('uses portsInfo.device when present, audioStatus.engine fallback otherwise', () => {
      const r1 = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          portsInfo: { device: 'Edirol UA-1000' } as never,
        }),
      )
      expect(r1.result.current.audioInterfaceStatus.deviceName).toBe('Edirol UA-1000')

      const r2 = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          audioStatus: { engine: 'PipeWire' } as never,
        }),
      )
      expect(r2.result.current.audioInterfaceStatus.deviceName).toBe('PipeWire')
    })

    it('threads jackMetrics into sampleRate + bufferSize', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          jackMetrics: { sample_rate: 96000, buffer_size: 64 } as never,
        }),
      )
      expect(result.current.audioInterfaceStatus.sampleRate).toBe(96000)
      expect(result.current.audioInterfaceStatus.bufferSize).toBe(64)
    })

    it('threads input vs. output port counts independently', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          portsInfo: { input_count: 8, output_count: 16 } as never,
        }),
      )
      expect(result.current.audioInterfaceStatus.totalPorts).toBe(8)
      expect(result.current.audioOutputStatus.totalPorts).toBe(16)
    })

    it('mirrors mode + active chain across input/output', () => {
      const chain = { id: 7, name: 'Lead', is_active: true } as unknown as Chain
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          routing: { mode: 'parallel_blend' } as never,
          activeFlowChain: chain,
        }),
      )
      expect(result.current.audioInterfaceStatus.routingMode).toBe('parallel_blend')
      expect(result.current.audioInterfaceStatus.chainActive).toBe(true)
      expect(result.current.audioInterfaceStatus.chainName).toBe('Lead')
      expect(result.current.audioOutputStatus.routingMode).toBe('parallel_blend')
      expect(result.current.audioOutputStatus.chainActive).toBe(true)
    })

    it('threads input meterLevels into input status, output into output', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          audioLevels: {
            input_left: 0.4,
            input_right: 0.3,
            output_left: 0.7,
            output_right: 0.6,
          } as never,
        }),
      )
      expect(result.current.audioInterfaceStatus.meterLevels).toEqual([0.4, 0.3])
      expect(result.current.audioOutputStatus.meterLevels).toEqual([0.7, 0.6])
    })

    it('reflects isRunning=false from audioStatus.running', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          audioStatus: { running: false } as never,
        }),
      )
      expect(result.current.audioInterfaceStatus.isRunning).toBe(false)
      expect(result.current.audioOutputStatus.isRunning).toBe(false)
    })

    it('threads selected ports + AVB endpoints separately for input/output', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorAudioInterfaceStatus({
          ...baseArgs,
          portRouting: {
            input_ports: [1, 2],
            output_ports: [3, 4, 5],
            input_avb_endpoints: ['talker:01'],
            output_avb_endpoints: ['listener:01', 'listener:02'],
          } as never,
        }),
      )
      expect(result.current.audioInterfaceStatus.selectedPorts).toEqual([1, 2])
      expect(result.current.audioInterfaceStatus.selectedAvbEndpoints).toEqual(['talker:01'])
      expect(result.current.audioOutputStatus.selectedPorts).toEqual([3, 4, 5])
      expect(result.current.audioOutputStatus.selectedAvbEndpoints).toEqual([
        'listener:01',
        'listener:02',
      ])
    })
  })
})
