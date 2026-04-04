import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

const mockSetPhaserStages = jest.fn()
const mockUsePassionFX = jest.fn()

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../Layouts/MultiEffectCategoryLayout', () => ({
  MultiEffectCategoryLayout: ({ advancedSections }: { advancedSections: Array<{ id: string; title: string; children: React.ReactNode }> }) => (
    <div>
      {advancedSections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          {section.children}
        </section>
      ))}
    </div>
  ),
}))

jest.mock('../../../ParameterControl', () => ({
  ParameterControl: ({
    label,
    descriptor,
    onLiveChange,
    accentColor,
  }: {
    label?: string
    descriptor: { step?: number; largeStep?: number }
    onLiveChange?: (value: number) => void
    accentColor?: string
  }) => (
    <button
      type="button"
      data-step={descriptor.step}
      data-large-step={descriptor.largeStep}
      data-testid="accented-control"
      data-accent={accentColor ?? ''}
      onClick={() => onLiveChange?.(6)}
    >
      {label}
    </button>
  ),
  ParameterKnob: ({
    label,
    accentColor,
  }: {
    label: string
    accentColor?: string
  }) => (
    <div data-testid="accented-control" data-accent={accentColor ?? ''}>
      {label}
    </div>
  ),
}))

jest.mock('../../../../hooks/usePassionFX', () => ({
  usePassionFX: () => mockUsePassionFX(),
  PASSIONFX_PRESETS: [{ id: 'manual', name: 'Manual', track: '' }],
}))

import { PassionFXCard } from './PassionFXCard'

function createHookValue() {
  const setterNames = [
    'setGateEnabled',
    'setGateThreshold',
    'setGateRelease',
    'setCompEnabled',
    'setCompThreshold',
    'setCompRatio',
    'setCompAttack',
    'setCompRelease',
    'setCompGlassy',
    'setWahEnabled',
    'setWahMode',
    'setWahPosition',
    'setWahQ',
    'setPhaserEnabled',
    'setPhaserRate',
    'setPhaserDepth',
    'setPhaserFeedback',
    'setChorusEnabled',
    'setChorusRate',
    'setChorusDepth',
    'setChorusVoices',
    'setChorusMix',
    'setPitchEnabled',
    'setPitchSemitones',
    'setPitchMix',
    'setHarmEnabled',
    'setHarmVoice1Interval',
    'setHarmVoice2Interval',
    'setHarmDetuneCents',
    'setHarmMix',
    'setDelayEnabled',
    'setDelayTimeL',
    'setDelayTimeR',
    'setDelayFeedback',
    'setDelayMix',
    'setDelayFreeze',
    'setDelayPitchShiftL',
    'setDelayPitchShiftR',
    'setReverbEnabled',
    'setReverbType',
    'setReverbDecay',
    'setReverbShimmerAmount',
    'setReverbShimmerInterval',
    'setReverbMix',
    'setReverbFreeze',
    'setEqEnabled',
    'setEqLowGain',
    'setEqMidGain',
    'setEqHighGain',
    'setEqTilt',
    'setExciterEnabled',
    'setExciterWarmth',
    'setExciterPresence',
    'setExciterAir',
    'setTremEnabled',
    'setTremRate',
    'setTremDepth',
    'setTremWaveform',
    'setMix',
    'setOutputLevel',
    'setBypass',
    'setPreset',
  ] as const

  return {
    parameters: {
      gateEnabled: false,
      gateThreshold: -40,
      gateRelease: 50,
      compEnabled: false,
      compThreshold: -20,
      compRatio: 4,
      compAttack: 10,
      compRelease: 100,
      compGlassy: false,
      wahEnabled: false,
      wahMode: 0,
      wahPosition: 50,
      wahQ: 3,
      phaserEnabled: true,
      phaserRate: 0.5,
      phaserDepth: 50,
      phaserStages: 4,
      phaserFeedback: 30,
      chorusEnabled: false,
      chorusRate: 0.8,
      chorusDepth: 40,
      chorusVoices: 2,
      chorusMix: 50,
      pitchEnabled: false,
      pitchSemitones: 0,
      pitchMix: 50,
      harmEnabled: false,
      harmVoice1Interval: 4,
      harmVoice2Interval: 7,
      harmDetuneCents: 0,
      harmMix: 50,
      delayEnabled: false,
      delayTimeL: 375,
      delayTimeR: 375,
      delayFeedback: 35,
      delayMix: 30,
      delayFreeze: false,
      delayPitchShiftL: 0,
      delayPitchShiftR: 0,
      reverbEnabled: false,
      reverbType: 0,
      reverbDecay: 2.5,
      reverbShimmerAmount: 0,
      reverbShimmerInterval: 12,
      reverbMix: 25,
      reverbFreeze: false,
      eqEnabled: false,
      eqLowGain: 0,
      eqMidGain: 0,
      eqHighGain: 0,
      eqTilt: 0,
      exciterEnabled: false,
      exciterWarmth: 25,
      exciterPresence: 25,
      exciterAir: 25,
      tremEnabled: false,
      tremRate: 5,
      tremDepth: 50,
      tremWaveform: 0,
      mix: 100,
      outputLevel: 0,
      preset: 'manual',
      bypass: false,
    },
    metering: {
      inputLevel: -12,
      outputLevel: -10,
      gateGain: 0,
      compGainReduction: 0,
      reverbLevel: -20,
      delayLevel: -20,
    },
    presets: [{ id: 'manual', name: 'Manual', track: '' }],
    currentPreset: 'manual',
    isLoading: false,
    error: null,
    isConnected: true,
    ...Object.fromEntries(setterNames.map((name) => [name, jest.fn()])),
    setPhaserStages: mockSetPhaserStages,
  }
}

describe('PassionFXCard parameter-control migration', () => {
  beforeEach(() => {
    mockSetPhaserStages.mockReset()
    mockUsePassionFX.mockReturnValue(createHookValue())
  })

  it('uses the shared stepped control for phaser stages', () => {
    render(
      <PassionFXCard
        plugin={{ uri: 'map2://juce/multieffect/passionfx', name: 'PassionFX', parameters: [] } as any}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#00c853"
      />,
    )

    const stagesControl = screen.getByRole('button', { name: 'Stages' })
    expect(stagesControl).toHaveAttribute('data-step', '2')
    expect(stagesControl).toHaveAttribute('data-large-step', '4')

    fireEvent.click(stagesControl)

    expect(mockSetPhaserStages).toHaveBeenCalledWith(6)
  })

  it('applies the provided card accent consistently across module controls', () => {
    render(
      <PassionFXCard
        plugin={{ uri: 'map2://juce/multieffect/passionfx', name: 'PassionFX', parameters: [] } as any}
        parameterValues={{}}
        onParameterChange={() => {}}
        accentColor="#00c853"
      />,
    )

    const accentValues = screen
      .getAllByTestId('accented-control')
      .map((node) => node.getAttribute('data-accent'))
      .filter((value): value is string => Boolean(value))

    expect(accentValues.length).toBeGreaterThan(0)
    expect(new Set(accentValues)).toEqual(new Set(['#00c853']))
  })
})
