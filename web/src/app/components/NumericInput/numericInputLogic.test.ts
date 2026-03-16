import type { ParameterDescriptor } from '../../data/parameterSchema'
import {
  applyNumericDelta,
  clampNumericValue,
  getAccelerationMultiplier,
  getEffectiveStep,
  getFineStep,
  quantizeToStep,
} from './numericInputLogic'

const DEFAULT_DESCRIPTOR: ParameterDescriptor = {
  min: 0,
  max: 100,
  step: 5,
  unit: '%',
  defaultValue: 50,
  profile: 'default',
}

describe('numericInputLogic', () => {
  it('clamps values to descriptor bounds', () => {
    expect(clampNumericValue(-5, DEFAULT_DESCRIPTOR)).toBe(0)
    expect(clampNumericValue(55, DEFAULT_DESCRIPTOR)).toBe(55)
    expect(clampNumericValue(500, DEFAULT_DESCRIPTOR)).toBe(100)
  })

  it('quantizes values to the nearest descriptor step', () => {
    expect(quantizeToStep(52, DEFAULT_DESCRIPTOR)).toBe(50)
    expect(quantizeToStep(53, DEFAULT_DESCRIPTOR)).toBe(55)
  })

  it('derives fine mode steps from the descriptor profile', () => {
    expect(getFineStep(DEFAULT_DESCRIPTOR)).toBe(0.5)
    expect(getEffectiveStep(DEFAULT_DESCRIPTOR, { fine: true })).toBe(0.5)
    expect(getEffectiveStep(DEFAULT_DESCRIPTOR)).toBe(5)
  })

  it('keeps integer profiles on whole steps even in fine mode', () => {
    const integerDescriptor: ParameterDescriptor = {
      min: 0,
      max: 127,
      step: 1,
      unit: '',
      defaultValue: 0,
      profile: 'integer',
    }

    expect(getFineStep(integerDescriptor)).toBe(1)
    expect(applyNumericDelta({
      value: 64,
      deltaSteps: 1,
      descriptor: integerDescriptor,
      modifiers: { fine: true },
    })).toBe(65)
  })

  it('applies accelerated deltas from velocity when not in fine mode', () => {
    expect(getAccelerationMultiplier(DEFAULT_DESCRIPTOR, 0.1)).toBe(1)
    expect(getAccelerationMultiplier(DEFAULT_DESCRIPTOR, 0.75)).toBe(1.5)
    expect(getAccelerationMultiplier(DEFAULT_DESCRIPTOR, 3.1)).toBe(4)

    expect(applyNumericDelta({
      value: 50,
      deltaSteps: 1,
      descriptor: DEFAULT_DESCRIPTOR,
      velocity: 3.1,
    })).toBe(70)
  })

  it('disables acceleration in fine mode and keeps sub-step precision', () => {
    expect(applyNumericDelta({
      value: 50,
      deltaSteps: 1,
      descriptor: DEFAULT_DESCRIPTOR,
      modifiers: { fine: true },
      velocity: 5,
    })).toBe(50.5)
  })

  it('clamps accelerated values at descriptor max and min', () => {
    expect(applyNumericDelta({
      value: 95,
      deltaSteps: 1,
      descriptor: DEFAULT_DESCRIPTOR,
      velocity: 5,
    })).toBe(100)

    expect(applyNumericDelta({
      value: 5,
      deltaSteps: -1,
      descriptor: DEFAULT_DESCRIPTOR,
      velocity: 5,
    })).toBe(0)
  })

  it('uses descriptor precision when quantizing decimal steps', () => {
    const gainDescriptor: ParameterDescriptor = {
      min: -12,
      max: 12,
      step: 0.1,
      unit: 'dB',
      defaultValue: 0,
      profile: 'gain-db',
      precision: 2,
    }

    expect(applyNumericDelta({
      value: 0,
      deltaSteps: 1,
      descriptor: gainDescriptor,
      modifiers: { fine: true },
    })).toBe(0.01)
  })

  it('uses the normalized profile for finer 0..1 adjustments', () => {
    const normalizedDescriptor: ParameterDescriptor = {
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0.5,
      profile: 'normalized_0_1',
      precision: 3,
    }

    expect(getFineStep(normalizedDescriptor)).toBe(0.0005)
    expect(applyNumericDelta({
      value: 0.5,
      deltaSteps: 2,
      descriptor: normalizedDescriptor,
      modifiers: { fine: true },
    })).toBe(0.501)
  })
})
