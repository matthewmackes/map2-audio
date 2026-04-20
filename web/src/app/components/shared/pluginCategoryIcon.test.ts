import { pluginCategoryIcon } from './pluginCategoryIcon'

describe('pluginCategoryIcon', () => {
  it('maps common LV2 classes to schematic sprite ids', () => {
    expect(pluginCategoryIcon('lv2:DelayPlugin')).toBe('i-delay')
    expect(pluginCategoryIcon('Reverb')).toBe('i-reverb')
    expect(pluginCategoryIcon('Amplifier')).toBe('i-amp')
    expect(pluginCategoryIcon('Pitch Shifter')).toBe('i-pitch')
    expect(pluginCategoryIcon('Compressor')).toBe('i-comp')
  })

  it('falls back to the assign icon for unknown or missing classes', () => {
    expect(pluginCategoryIcon('')).toBe('i-plus')
    expect(pluginCategoryIcon(undefined)).toBe('i-plus')
    expect(pluginCategoryIcon('map2:CustomProcessor')).toBe('i-plus')
  })
})
