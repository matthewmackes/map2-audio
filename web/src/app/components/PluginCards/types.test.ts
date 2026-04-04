import { generateParameterGroups } from './types'

describe('generateParameterGroups', () => {
  it('preserves logical small-group labels when flattening is disabled', () => {
    const parameters = [
      {
        index: 0,
        name: 'Input Gain',
        symbol: 'input_gain',
        default: 0,
        min: -24,
        max: 24,
        is_log: false,
      },
      {
        index: 1,
        name: 'Mix',
        symbol: 'mix',
        default: 50,
        min: 0,
        max: 100,
        is_log: false,
      },
    ] as any

    expect(generateParameterGroups(parameters).map((group) => group.label)).toEqual(['Parameters'])
    expect(
      generateParameterGroups(parameters, { flattenSmallSets: false }).map((group) => group.label),
    ).toEqual(['Input', 'Mix'])
  })
})
