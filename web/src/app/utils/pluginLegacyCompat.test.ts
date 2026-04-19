import { getPluginGlyph, PluginType } from './pluginLegacyCompat'

describe('pluginLegacyCompat', () => {
  it('provides deterministic glyph labels for plugin-type fallbacks', () => {
    expect(getPluginGlyph(PluginType.DelayPlugin)).toEqual({
      label: 'DLY',
      tone: '#0f62fe',
    })
    expect(getPluginGlyph(PluginType.Plugin)).toEqual({
      label: 'FX',
      tone: 'var(--cds-icon-primary, #525252)',
    })
  })
})
