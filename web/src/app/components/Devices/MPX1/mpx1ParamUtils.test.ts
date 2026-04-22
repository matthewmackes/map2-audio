import type { MPX1RegistryParam } from '../../../../map2/mpx1Api'
import {
  buildMpx1EnumValues,
  formatMpx1ParamValue,
  getMpx1ParamValue,
  groupMpx1ParamsByPage,
  mpx1AlgorithmKey,
} from './mpx1ParamUtils'

function makeParam(overrides: Partial<MPX1RegistryParam> = {}): MPX1RegistryParam {
  return {
    id: 'reverb.alg_00.mix',
    display_name: 'Mix',
    type: 'linear',
    widget: 'slider',
    block: 'reverb',
    algorithm: 'alg_00',
    units: '',
    default: 0,
    range: { min: 0, max: 100 },
    ...overrides,
  } as MPX1RegistryParam
}

describe('mpx1ParamUtils', () => {
  it('formats MPX1 parameter values consistently across surfaces', () => {
    expect(formatMpx1ParamValue(makeParam({ units: 'Hz' }), 2500)).toBe('2.50 kHz')
    expect(formatMpx1ParamValue(makeParam({ units: 'seconds' }), 0.25)).toBe('250 ms')
    expect(formatMpx1ParamValue(makeParam({ units: 'dB' }), 3)).toBe('+3.0 dB')
    expect(formatMpx1ParamValue(makeParam({ units: 'beat division' }), 0.25)).toBe('1/4')
  })

  it('groups parameters by page and sorts entries by display name', () => {
    const grouped = groupMpx1ParamsByPage([
      makeParam({ id: 'b', display_name: 'B Mix', page: 'Main' }),
      makeParam({ id: 'a', display_name: 'A Mix', page: 'Main' }),
      makeParam({ id: 'c', display_name: 'Depth', page: 'Mod' }),
    ])

    expect(grouped.map((group) => group.page)).toEqual(['Main', 'Mod'])
    expect(grouped[0]?.params.map((param) => param.id)).toEqual(['a', 'b'])
    expect(grouped[1]?.params.map((param) => param.id)).toEqual(['c'])
  })

  it('resolves shadow values, algorithm labels, and enum ranges deterministically', () => {
    const param = makeParam({
      id: 'program.reverb.algorithm',
      default: 7,
      range: { min: 2, max: 4 },
      type: 'enum',
      widget: 'select',
    })

    expect(getMpx1ParamValue(param, {})).toBe(7)
    expect(getMpx1ParamValue(param, { [param.id]: 3 })).toBe(3)
    expect(mpx1AlgorithmKey(4)).toBe('alg_04')
    expect(buildMpx1EnumValues(param)).toEqual([2, 3, 4])
  })
})
