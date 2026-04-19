import { createParameterDescriptor } from '../../data/parameterSchema'
import { formatEditableParameterValue, formatParameterValue, parseParameterValue } from './format'

describe('parameter-control formatting', () => {
  it('formats frequency values in kHz once they cross 1 kHz', () => {
    const descriptor = createParameterDescriptor({
      min: 20,
      max: 20_000,
      step: 1,
      defaultValue: 1000,
      unit: 'Hz',
      profile: 'frequency',
      scale: 'log',
    })

    expect(formatParameterValue(2500, descriptor)).toBe('2.5kHz')
  })

  it('formats signed dB values and clamps parsed input to the descriptor bounds', () => {
    const descriptor = createParameterDescriptor({
      min: -12,
      max: 12,
      step: 0.1,
      defaultValue: 0,
      unit: 'dB',
      precision: 1,
    })

    expect(formatParameterValue(3, descriptor)).toBe('+3 dB')
    expect(formatParameterValue(-2.5, descriptor)).toBe('-2.5 dB')
    expect(parseParameterValue('18 dB', descriptor)).toBe(12)
    expect(parseParameterValue('-18 dB', descriptor)).toBe(-12)
  })

  it('keeps editable values unit-free while still clamping to the legal range', () => {
    const descriptor = createParameterDescriptor({
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      precision: 2,
      unit: '%',
    })

    expect(formatEditableParameterValue(1.5, descriptor)).toBe('1')
  })
})
